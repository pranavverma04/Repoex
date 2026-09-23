// Everything the explainer reads from GitHub: a handful of REST calls plus one blobless,
// history-deep clone. Only the files the analysers need are ever checked out.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";
import { UserFacingError } from "../indexer/github.js";

const run = promisify(execFile);

export const HISTORY_DEPTH = 400;
const MAX_CHECKOUT_FILES = 700;
const MAX_READ_BYTES = 300_000;

export interface Ref {
  owner: string;
  name: string;
}

/** Accepts owner + repo, or any common way of writing a GitHub repo link. */
export function parseRepoInput(input: { url?: string; owner?: string; repo?: string }): Ref {
  if (input.owner || input.repo) {
    const owner = (input.owner ?? "").trim().replace(/^@/, "");
    const name = (input.repo ?? "").trim().replace(/\.git$/, "");
    if (!/^[\w.-]+$/.test(owner)) throw new UserFacingError("Enter a GitHub username or organisation.");
    if (!/^[\w.-]+$/.test(name)) throw new UserFacingError("Enter a repository name.");
    return { owner, name };
  }
  const raw = (input.url ?? "").trim().replace(/\/+$/, "").replace(/#.*$/, "").replace(/\?.*$/, "");
  const m =
    raw.match(/^(?:git\+)?(?:https?:\/\/)?(?:www\.)?github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i) ??
    raw.match(/^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/i) ??
    raw.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (!m) throw new UserFacingError("That doesn't look like a GitHub repo link. Try github.com/owner/repo.");
  return { owner: m[1], name: m[2] };
}

// --- GitHub REST -----------------------------------------------------------

let ghToken: string | undefined | null = null;

/** GITHUB_TOKEN, else the local `gh` CLI login, else anonymous (60 requests/hour). */
async function token(): Promise<string | undefined> {
  if (ghToken !== null) return ghToken;
  ghToken = config.githubToken;
  if (!ghToken) {
    try {
      const { stdout } = await run("gh", ["auth", "token"], { timeout: 4000 });
      ghToken = stdout.trim() || undefined;
    } catch {
      ghToken = undefined;
    }
  }
  return ghToken;
}

export async function tokenSource(): Promise<"env" | "gh" | "none"> {
  const t = await token();
  if (!t) return "none";
  return config.githubToken ? "env" : "gh";
}

interface GhResult<T> {
  data: T;
  headers: Headers;
}

async function gh<T = any>(p: string, opts: { allow404?: boolean } = {}): Promise<GhResult<T> | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ai-repo-assistant",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const t = await token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(`https://api.github.com${p}`, { headers, signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) {
    if (opts.allow404) return null;
    throw new UserFacingError("Couldn't find that repository. Check the spelling, and note that only public repos work.", 404);
  }
  if (res.status === 403 || res.status === 429) {
    if (res.headers.get("x-ratelimit-remaining") === "0") {
      throw new UserFacingError("GitHub's rate limit was hit. Set GITHUB_TOKEN in apps/backend/.env or wait a few minutes.", 429);
    }
    if (opts.allow404) return null;
  }
  if (res.status === 409 && opts.allow404) return null; // empty repository
  if (!res.ok) {
    if (opts.allow404) return null;
    throw new UserFacingError(`GitHub API error ${res.status}`, 502);
  }
  return { data: (await res.json()) as T, headers: res.headers };
}

export interface RepoMeta {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  homepage: string | null;
  topics: string[];
  license: string | null;
  stars: number;
  forks: number;
  watchers: number;
  openIssuesAndPulls: number;
  createdAt: string;
  pushedAt: string;
  sizeKb: number;
  avatarUrl: string;
  defaultBranch: string;
  language: string | null;
  private: boolean;
  archived: boolean;
  fork: boolean;
  hasPages: boolean;
}

export async function fetchMeta(ref: Ref): Promise<RepoMeta> {
  const { data: d } = (await gh(`/repos/${ref.owner}/${ref.name}`))!;
  return {
    owner: d.owner.login,
    name: d.name,
    fullName: d.full_name,
    description: d.description,
    homepage: d.homepage || null,
    topics: d.topics ?? [],
    license: d.license?.spdx_id && d.license.spdx_id !== "NOASSERTION" ? d.license.spdx_id : d.license?.name ?? null,
    stars: d.stargazers_count,
    forks: d.forks_count,
    watchers: d.subscribers_count ?? d.watchers_count,
    openIssuesAndPulls: d.open_issues_count,
    createdAt: d.created_at,
    pushedAt: d.pushed_at,
    sizeKb: d.size,
    avatarUrl: d.owner.avatar_url,
    defaultBranch: d.default_branch,
    language: d.language,
    private: d.private,
    archived: d.archived,
    fork: d.fork,
    hasPages: !!d.has_pages,
  };
}

/** Repos of a user or organisation whose name contains `q`, most starred first (GitHub search). */
export async function searchUserRepos(owner: string, q: string) {
  const query = encodeURIComponent(`${q} in:name user:${owner} fork:true`);
  const r = await gh<{ items: any[] }>(`/search/repositories?q=${query}&sort=stars&per_page=20`, { allow404: true });
  return (r?.data.items ?? []).map((x) => ({ name: x.name as string, description: (x.description as string) || null, stars: x.stargazers_count as number, language: (x.language as string) || null, pushedAt: x.pushed_at as string, fork: !!x.fork }));
}

/** Public repos of a user or organisation, most recently pushed first. */
export async function fetchUserRepos(ref: Ref) {
  const r = await gh<any[]>(`/users/${ref.owner}/repos?sort=pushed&per_page=100&type=owner`, { allow404: true });
  if (!r) throw new UserFacingError(`There's no GitHub user or organisation called "${ref.owner}".`, 404);
  return r.data
    .filter((x) => !x.private)
    .map((x) => ({ name: x.name as string, description: (x.description as string) || null, stars: x.stargazers_count as number, language: (x.language as string) || null, pushedAt: x.pushed_at as string, fork: !!x.fork }));
}

export async function fetchBranches(ref: Ref): Promise<string[]> {
  const r = await gh<{ name: string }[]>(`/repos/${ref.owner}/${ref.name}/branches?per_page=100`, { allow404: true });
  return r?.data.map((b) => b.name) ?? [];
}

export async function fetchHeadSha(ref: Ref, branch: string): Promise<string> {
  const r = await gh<{ sha: string }>(`/repos/${ref.owner}/${ref.name}/commits/${encodeURIComponent(branch)}`, { allow404: true });
  if (!r) throw new UserFacingError(`Branch "${branch}" wasn't found, or the repository is empty.`, 404);
  return r.data.sha;
}

export async function fetchLanguages(ref: Ref): Promise<Record<string, number>> {
  return (await gh<Record<string, number>>(`/repos/${ref.owner}/${ref.name}/languages`, { allow404: true }))?.data ?? {};
}

/** Total commit count on a branch, read off the pagination header of a 1-per-page listing. */
export async function fetchCommitCount(ref: Ref, branch: string): Promise<number | null> {
  const r = await gh<unknown[]>(`/repos/${ref.owner}/${ref.name}/commits?sha=${encodeURIComponent(branch)}&per_page=1`, {
    allow404: true,
  });
  if (!r) return null;
  const link = r.headers.get("link");
  const last = link?.match(/[?&]page=(\d+)>; rel="last"/);
  return last ? Number(last[1]) : r.data.length;
}

export interface GhContributor {
  login: string;
  avatarUrl: string;
  contributions: number;
}

export async function fetchContributors(ref: Ref): Promise<GhContributor[]> {
  const r = await gh<any[]>(`/repos/${ref.owner}/${ref.name}/contributors?per_page=30`, { allow404: true });
  if (!Array.isArray(r?.data)) return [];
  return r.data
    .filter((c) => c.type !== "Bot" && !/\[bot\]$/.test(c.login ?? ""))
    .map((c) => ({ login: c.login, avatarUrl: c.avatar_url, contributions: c.contributions }));
}

export async function fetchReleases(ref: Ref) {
  const r = await gh<any[]>(`/repos/${ref.owner}/${ref.name}/releases?per_page=8`, { allow404: true });
  return (r?.data ?? [])
    .filter((x) => !x.draft)
    .map((x) => ({ tag: x.tag_name as string, name: (x.name as string) || null, date: (x.published_at ?? x.created_at) as string, url: x.html_url as string }));
}

export async function fetchOpenPullCount(ref: Ref): Promise<number | null> {
  const q = encodeURIComponent(`repo:${ref.owner}/${ref.name} type:pr state:open`);
  const r = await gh<{ total_count: number }>(`/search/issues?q=${q}&per_page=1`, { allow404: true });
  return r?.data.total_count ?? null;
}

// --- Clone -----------------------------------------------------------------

export interface RawCommit {
  sha: string;
  author: string;
  email: string;
  date: string;
  subject: string;
  files: string[];
}

export interface Checkout {
  dir: string;
  /** every tracked path at HEAD */
  paths: string[];
  commits: RawCommit[];
  shallow: boolean;
  read(rel: string): Promise<string | null>;
  cleanup(): Promise<void>;
}

async function git(dir: string, args: string[], input?: string): Promise<string> {
  const child = run("git", args, {
    cwd: dir,
    maxBuffer: 256 * 1024 * 1024,
    timeout: 4 * 60_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (input !== undefined) {
    child.child.stdin?.end(input);
  }
  const { stdout } = await child;
  return stdout;
}

/**
 * Blobless clone with HISTORY_DEPTH commits of history. Trees come down with the clone,
 * so the file list and per-commit touched files cost nothing extra; file contents are
 * fetched in one batch for just the paths `pick` selects.
 */
export async function checkout(
  ref: Ref,
  branch: string,
  pick: (paths: string[]) => string[],
  onStep: (text: string) => void,
): Promise<Checkout> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ara-explain-"));
  const cleanup = () => fs.rm(dir, { recursive: true, force: true });
  try {
    onStep(`Cloning recent history, ${HISTORY_DEPTH} commits deep (file contents skipped)`);
    await git(os.tmpdir(), [
      "clone",
      "--filter=blob:none",
      "--no-checkout",
      "--single-branch",
      "--no-tags",
      "--depth",
      String(HISTORY_DEPTH),
      "--branch",
      branch,
      `https://github.com/${ref.owner}/${ref.name}.git`,
      dir,
    ]);

    const paths = (await git(dir, ["ls-tree", "-r", "--name-only", "-z", "HEAD"])).split("\0").filter(Boolean);
    onStep(`Found ${paths.length.toLocaleString()} files at HEAD`);

    const log = await git(dir, [
      "log",
      "--no-renames",
      "--name-only",
      "-z",
      "--format=%x1e%H%x1f%an%x1f%ae%x1f%aI%x1f%s",
      "HEAD",
    ]);
    const commits: RawCommit[] = [];
    for (const rec of log.split("\x1e").slice(1)) {
      const [head, ...rest] = rec.split("\n");
      const [sha, author, email, date, subject] = head.split("\x1f");
      const files = rest.join("\n").split("\0").map((s) => s.trim()).filter(Boolean);
      commits.push({ sha, author, email, date, subject: subject ?? "", files });
    }
    const shallow = (await git(dir, ["rev-parse", "--is-shallow-repository"])).trim() === "true";
    // The shallow boundary commit diffs against nothing, so it "touches" every file. Drop its list.
    if (shallow && commits.length) commits[commits.length - 1].files = [];
    onStep(`Read ${commits.length} commits of history`);

    const wanted = pick(paths).slice(0, MAX_CHECKOUT_FILES);
    if (wanted.length) {
      onStep(`Downloading ${wanted.length} files the analysis needs`);
      await git(dir, ["sparse-checkout", "set", "--no-cone", "--stdin"], wanted.map((p) => "/" + p.replace(/([*?[\]!\\])/g, "\\$1")).join("\n") + "\n");
      await git(dir, ["checkout", "-q", "HEAD"]);
    }
    const wantedSet = new Set(wanted);
    return {
      dir,
      paths,
      commits,
      shallow,
      async read(rel) {
        if (!wantedSet.has(rel)) return null;
        try {
          const full = path.join(dir, rel);
          const stat = await fs.stat(full);
          if (!stat.isFile() || stat.size > MAX_READ_BYTES) return null;
          const text = await fs.readFile(full, "utf8");
          return text.includes("\u0000") ? null : text;
        } catch {
          return null;
        }
      },
      cleanup,
    };
  } catch (err) {
    await cleanup();
    const msg = err instanceof Error ? err.message : String(err);
    if (/Remote branch .* not found/i.test(msg)) throw new UserFacingError(`Branch "${branch}" doesn't exist.`, 404);
    if (/could not read Username|Authentication failed|not found/i.test(msg)) {
      throw new UserFacingError("Git couldn't clone this repository. Only public repos are supported.", 404);
    }
    throw err;
  }
}
