// Explain-a-repo pipeline: resolve -> fetch -> stack -> structure -> history -> mock -> write.
// Jobs live in memory (they take seconds); finished reports are cached in SQLite per commit.
import crypto from "node:crypto";
import type { ExplainJob, ExplainStageKey, RepoPreview, RepoReport, StartExplainResponse } from "@ara/shared";
import { db } from "../db.js";
import { UserFacingError } from "../indexer/github.js";
import { analyzeHistory } from "./history.js";
import { buildMock, detectPort } from "./mock.js";
import { enrich, templateOverview } from "./narrative.js";
import { buildRun } from "./run.js";
import {
  checkout,
  fetchBranches,
  fetchCommitCount,
  fetchContributors,
  fetchHeadSha,
  fetchLanguages,
  fetchMeta,
  fetchOpenPullCount,
  fetchReleases,
  parseRepoInput,
  type Ref,
  type RepoMeta,
} from "./source.js";
import { detectStack } from "./stack.js";
import { describeStructure } from "./structure.js";

db.exec(`
CREATE TABLE IF NOT EXISTS explain_reports (
  report_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name   TEXT NOT NULL,
  branch      TEXT NOT NULL,
  sha         TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (full_name, branch, sha)
);
`);

const STAGES: { key: ExplainStageKey; label: string }[] = [
  { key: "resolve", label: "Finding the repository" },
  { key: "fetch", label: "Reading files and history" },
  { key: "stack", label: "Working out the tech stack" },
  { key: "structure", label: "Mapping the folder layout" },
  { key: "history", label: "Reviewing the work done" },
  { key: "mock", label: "Building the mock output" },
  { key: "write", label: "Writing the explanation" },
];

const jobs = new Map<string, ExplainJob>();

function setStage(job: ExplainJob, key: ExplainStageKey, status: ExplainJob["stages"][number]["status"], detail?: string) {
  const s = job.stages.find((x) => x.key === key)!;
  s.status = status;
  if (detail !== undefined) s.detail = detail;
  const done = job.stages.filter((x) => x.status === "done" || x.status === "skipped").length;
  job.progress = Math.round((done / job.stages.length) * 100);
}
function log(job: ExplainJob, text: string) {
  job.log.push({ at: Date.now(), text });
  if (job.log.length > 60) job.log.shift();
}

export function getExplainJob(id: string) {
  return jobs.get(id) ?? null;
}

// --- preview ---------------------------------------------------------------

const previewCache = new Map<string, { at: number; value: RepoPreview }>();

function cachedReportId(fullName: string, branch: string, sha: string): number | null {
  const row = db
    .prepare(`SELECT report_id FROM explain_reports WHERE full_name = ? AND branch = ? AND sha = ?`)
    .get(fullName.toLowerCase(), branch, sha) as { report_id: number } | undefined;
  return row?.report_id ?? null;
}

export async function previewRepo(input: { url?: string; owner?: string; repo?: string }): Promise<RepoPreview> {
  const ref = parseRepoInput(input);
  const key = `${ref.owner}/${ref.name}`.toLowerCase();
  const hit = previewCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const meta = await fetchMeta(ref);
  const [branches, sha] = await Promise.all([fetchBranches(ref), fetchHeadSha(ref, meta.defaultBranch).catch(() => null)]);
  const value: RepoPreview = {
    owner: meta.owner,
    name: meta.name,
    fullName: meta.fullName,
    url: `https://github.com/${meta.fullName}`,
    description: meta.description,
    avatarUrl: meta.avatarUrl,
    stars: meta.stars,
    forks: meta.forks,
    language: meta.language,
    defaultBranch: meta.defaultBranch,
    branches: [meta.defaultBranch, ...branches.filter((b) => b !== meta.defaultBranch)],
    pushedAt: meta.pushedAt,
    sizeKb: meta.sizeKb,
    private: meta.private,
    archived: meta.archived,
    fork: meta.fork,
    cached: sha ? cachedReportId(meta.fullName, meta.defaultBranch, sha) !== null : false,
  };
  previewCache.set(key, { at: Date.now(), value });
  return value;
}

// --- start -----------------------------------------------------------------

const running = new Map<string, string>(); // fullName@branch -> jobId

export async function startExplain(input: { url?: string; owner?: string; repo?: string; branch?: string; force?: boolean }): Promise<StartExplainResponse> {
  const ref = parseRepoInput(input);
  const meta = await fetchMeta(ref);
  if (meta.private) throw new UserFacingError("Private repositories aren't supported.", 403);
  if (meta.sizeKb / 1024 > 1500) throw new UserFacingError(`This repository is ${(meta.sizeKb / 1024).toFixed(0)} MB, which is too big to explain here.`, 413);
  const branch = input.branch?.trim() || meta.defaultBranch;
  const sha = await fetchHeadSha(ref, branch);
  if (!input.force) {
    const cached = cachedReportId(meta.fullName, branch, sha);
    if (cached) return { jobId: null, reportId: cached };
  }
  const runKey = `${meta.fullName.toLowerCase()}@${branch}`;
  const existing = running.get(runKey);
  if (existing && jobs.get(existing)?.status === "running") return { jobId: existing, reportId: null };

  const jobId = crypto.randomUUID();
  const job: ExplainJob = {
    jobId,
    fullName: meta.fullName,
    branch,
    status: "running",
    progress: 0,
    stages: STAGES.map((s) => ({ ...s, status: "pending", detail: null })),
    log: [],
    error: null,
    reportId: null,
  };
  jobs.set(jobId, job);
  running.set(runKey, jobId);
  setStage(job, "resolve", "done", `${meta.fullName} · ${branch} @ ${sha.slice(0, 7)}`);
  log(job, `Found ${meta.fullName} (${meta.stars.toLocaleString()} stars), branch ${branch}`);
  void runJob(job, { owner: meta.owner, name: meta.name }, meta, branch, sha).finally(() => {
    running.delete(runKey);
    setTimeout(() => jobs.delete(jobId), 30 * 60_000);
  });
  return { jobId, reportId: null };
}

// --- file selection --------------------------------------------------------

const MANIFEST =
  /(^|\/)(package\.json|requirements[\w.-]*\.txt|pyproject\.toml|setup\.py|setup\.cfg|Pipfile|go\.mod|Cargo\.toml|Gemfile|composer\.json|pom\.xml|build\.gradle(\.kts)?|pubspec\.yaml|Dockerfile|(docker-)?compose(\.[\w-]+)?\.ya?ml|docker-compose(\.[\w-]+)?\.ya?ml|Makefile|Procfile|\.env\.(example|sample|template|local\.example)|urls\.py|routes\.rb|platformio\.ini)$/;
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|vue|svelte|astro|html|cs|dart|swift)$/;
// stylesheets and theme config, read for the mock's colours and fonts
const STYLE = /(^|\/)((globals?|index|main|app|style|styles|theme|variables|tokens|base|site)\.(css|scss)|tailwind\.config\.\w+)$/;
const SKIP = /(^|\/)(node_modules|vendor|dist|build|out|\.next|target|coverage|__pycache__|\.venv|venv|third_party|external|deps)\//;

function pickFiles(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    if (SKIP.test(p)) continue;
    const depth = p.split("/").length;
    // manifests inside examples/tests/docs describe demo projects, not this repo's stack
    if (MANIFEST.test(p) && depth <= 4 && !/(^|\/)(examples?|samples?|demos?|tests?|docs?|fixtures|templates?|benchmarks?)\//i.test(p)) out.push(p);
    else if (/^readme(\.\w+)?$/i.test(p) || (/^(apps|packages)\/[^/]+\/readme\.md$/i.test(p))) out.push(p);
    else if (STYLE.test(p) && depth <= 5 && out.filter((x) => STYLE.test(x)).length < 12) out.push(p);
  }
  const scored = paths
    .filter((p) => SOURCE.test(p) && !SKIP.test(p) && !/\.d\.ts$|\.min\.js$|\.bundle\.js$/.test(p) && !out.includes(p))
    .map((p) => {
      const depth = p.split("/").length;
      let score = -depth;
      if (/(route|router|api|server|app|main|index|cli|cmd|command|controller|view|page|layout|urls|handler|endpoint|__init__|__main__|lib\.rs|program)/i.test(p)) score += 6;
      if (/(^|\/)(tests?|__tests__|spec|e2e|fixtures|examples?|docs?|benchmarks?|scripts)\//i.test(p) || /\.(test|spec)\./.test(p)) score -= 8;
      if (/\.html$/.test(p) && depth <= 2) score += 3;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 700 - out.length)
    .map((x) => x.p);
  return [...out, ...scored];
}

function languagesFromPaths(paths: string[]): Record<string, number> {
  const map: Record<string, string> = { ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", py: "Python", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", rb: "Ruby", php: "PHP", cs: "C#", c: "C", cpp: "C++", h: "C", swift: "Swift", dart: "Dart", vue: "Vue", svelte: "Svelte", html: "HTML", css: "CSS", scss: "SCSS", sh: "Shell" };
  const out: Record<string, number> = {};
  for (const p of paths) {
    const lang = map[p.split(".").pop()!.toLowerCase()];
    if (lang) out[lang] = (out[lang] ?? 0) + 1;
  }
  return out;
}

// --- the run ---------------------------------------------------------------

async function runJob(job: ExplainJob, ref: Ref, meta: RepoMeta, branch: string, sha: string) {
  let co: Awaited<ReturnType<typeof checkout>> | null = null;
  const stage = async <T>(key: ExplainStageKey, fn: () => Promise<T> | T, detail: (v: T) => string): Promise<T> => {
    setStage(job, key, "active");
    const v = await fn();
    setStage(job, key, "done", detail(v));
    return v;
  };
  try {
    const fetched = await stage(
      "fetch",
      async () => {
        const api = Promise.all([
          fetchLanguages(ref),
          fetchContributors(ref),
          fetchReleases(ref),
          fetchCommitCount(ref, branch),
          fetchOpenPullCount(ref),
        ]);
        co = await checkout(ref, branch, pickFiles, (t) => log(job, t));
        const [languages, contributors, releases, totalCommits, openPulls] = await api;
        const files = new Map<string, string>();
        for (const p of pickFiles(co.paths)) {
          const t = await co.read(p);
          if (t !== null) files.set(p, t);
        }
        log(job, `Read ${files.size} files for analysis`);
        return { languages, contributors, releases, totalCommits, openPulls, files };
      },
      (v) => `${co!.paths.length.toLocaleString()} files, ${co!.commits.length} commits, ${v.files.size} read`,
    );
    const c = co!;
    const files = fetched.files;
    const readmePath = c.paths.find((p) => /^readme(\.(md|markdown|rst|txt))?$/i.test(p));
    const readme = readmePath ? files.get(readmePath) ?? null : null;
    const packageJsons = [...files.entries()]
      .filter(([p]) => /(^|\/)package\.json$/.test(p))
      .flatMap(([p, t]) => {
        try {
          return [{ path: p, json: JSON.parse(t) }];
        } catch {
          return [];
        }
      });

    const stack = await stage(
      "stack",
      () => {
        const s = detectStack({ packageJsons, files, paths: c.paths });
        let langs = fetched.languages;
        if (!Object.keys(langs).length) langs = languagesFromPaths(c.paths);
        const total = Object.values(langs).reduce((a, b) => a + b, 0) || 1;
        const languages = Object.entries(langs)
          .map(([name, bytes]) => ({ name, bytes, pct: (bytes / total) * 100 }))
          .sort((a, b) => b.bytes - a.bytes);
        return { ...s, languages };
      },
      (s) => `${s.languages[0]?.name ?? "No code"}${s.groups.length ? ` · ${s.groups.reduce((n, g) => n + g.items.length, 0)} tools recognised` : ""}`,
    );
    for (const g of stack.groups) log(job, `${g.category}: ${g.items.map((i) => i.name).join(", ")}`);

    const structure = await stage(
      "structure",
      () => {
        const mains: { path: string; field: string; value: string }[] = [];
        for (const { path, json } of packageJsons) {
          for (const field of ["main", "module"]) if (typeof json[field] === "string") mains.push({ path, field, value: json[field] });
          if (typeof json.bin === "string") mains.push({ path, field: "bin", value: json.bin });
          else if (json.bin && typeof json.bin === "object") for (const v of Object.values(json.bin).slice(0, 2)) mains.push({ path, field: "bin", value: String(v) });
        }
        return describeStructure(c.paths, mains);
      },
      (s) => `${s.folders.length} areas · ${s.entryPoints.length} entry points`,
    );

    const work = await stage(
      "history",
      () => analyzeHistory(c.commits, c.shallow, fetched.contributors, fetched.releases, fetched.totalCommits),
      (w) => `${w.commitsAnalyzed} commits · ${w.contributors.length} contributors`,
    );
    log(job, work.summary.split(". ")[0] + ".");

    const src = {
      paths: c.paths,
      files,
      packageJsons,
      deps: stack.deps,
      repoName: meta.name,
      readme,
      rawBase: `https://raw.githubusercontent.com/${meta.owner}/${meta.name}/${sha}/`,
    };
    const mock = await stage(
      "mock",
      () => buildMock(src),
      (m) =>
        [
          m.web && `${m.web.pages.length} page${m.web.pages.length === 1 ? "" : "s"}`,
          m.api && `${m.api.endpoints.length} endpoint${m.api.endpoints.length === 1 ? "" : "s"}`,
          m.cli && `${m.cli.commands.length || m.cli.options.length} command${(m.cli.commands.length || m.cli.options.length) === 1 ? "" : "s"}/flags`,
          m.library && "library usage",
        ]
          .filter(Boolean)
          .join(" · ") || "No runnable surface found",
    );

    const run = buildRun({
      fullName: meta.fullName,
      name: meta.name,
      paths: c.paths,
      files,
      packageJsons,
      packageManagers: stack.packageManagers,
      deps: stack.deps,
      port: detectPort(src),
      readme,
      mock,
    });

    const base: Omit<RepoReport, "ai" | "reportId" | "overview"> = {
      generatedAt: new Date().toISOString(),
      sha,
      branch,
      branches: [],
      repo: {
        owner: meta.owner,
        name: meta.name,
        fullName: meta.fullName,
        url: `https://github.com/${meta.fullName}`,
        description: meta.description,
        homepage: meta.homepage,
        topics: meta.topics,
        license: meta.license,
        stars: meta.stars,
        forks: meta.forks,
        watchers: meta.watchers,
        openIssues: fetched.openPulls !== null ? Math.max(0, meta.openIssuesAndPulls - fetched.openPulls) : meta.openIssuesAndPulls,
        openPulls: fetched.openPulls,
        totalCommits: fetched.totalCommits,
        createdAt: meta.createdAt,
        pushedAt: meta.pushedAt,
        sizeKb: meta.sizeKb,
        avatarUrl: meta.avatarUrl,
        archived: meta.archived,
        fork: meta.fork,
      },
      stack: { languages: stack.languages.slice(0, 12), groups: stack.groups, packageManagers: stack.packageManagers, otherDependencies: stack.otherDependencies },
      structure: { totalFiles: c.paths.length, totalDirs: structure.totalDirs, tree: structure.tree, folders: structure.folders, keyFiles: structure.keyFiles, entryPoints: structure.entryPoints },
      work,
      run,
      mock,
    };

    const report = await stage(
      "write",
      async () => {
        const r = { ...base, overview: templateOverview(base, readme) } as Omit<RepoReport, "ai" | "reportId">;
        const ai = await enrich(r, readme);
        if (ai?.error) log(job, `AI write-up failed (${ai.provider}): ${ai.error}. Using the data-only version.`);
        return { ...r, ai: { provider: ai?.provider ?? "none", used: !!ai && !ai.error, error: ai?.error ?? null } };
      },
      (r) => (r.ai.used ? `Written by ${r.ai.provider}` : "Written from repo data (no AI key set)"),
    );

    const branches = await fetchBranches(ref).catch(() => []);
    report.branches = [meta.defaultBranch, ...branches.filter((b) => b !== meta.defaultBranch)].slice(0, 100);

    const row = db
      .prepare(
        `INSERT INTO explain_reports (full_name, branch, sha, report_json) VALUES (?, ?, ?, ?)
         ON CONFLICT (full_name, branch, sha) DO UPDATE SET report_json = excluded.report_json, created_at = datetime('now')
         RETURNING report_id`,
      )
      .get(meta.fullName.toLowerCase(), branch, sha, "{}") as { report_id: number };
    const full: RepoReport = { ...report, reportId: row.report_id };
    db.prepare(`UPDATE explain_reports SET report_json = ? WHERE report_id = ?`).run(JSON.stringify(full), row.report_id);
    job.reportId = row.report_id;
    job.status = "done";
    job.progress = 100;
    log(job, "Report ready");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("explain failed", job.fullName, err);
    const active = job.stages.find((s) => s.status === "active");
    if (active) setStage(job, active.key, "failed", message.slice(0, 200));
    job.status = "failed";
    job.error = err instanceof UserFacingError ? message : `Something went wrong while explaining this repo: ${message.slice(0, 300)}`;
  } finally {
    const done = co as Awaited<ReturnType<typeof checkout>> | null;
    if (done) await done.cleanup();
  }
}

// --- reads -----------------------------------------------------------------

export function getReport(id: number): RepoReport | null {
  const row = db.prepare(`SELECT report_json FROM explain_reports WHERE report_id = ?`).get(id) as { report_json: string } | undefined;
  return row ? (JSON.parse(row.report_json) as RepoReport) : null;
}

export function recentReports() {
  const rows = db
    .prepare(
      `SELECT report_id, report_json FROM explain_reports
       WHERE report_id IN (SELECT MAX(report_id) FROM explain_reports GROUP BY full_name)
       ORDER BY created_at DESC LIMIT 8`,
    )
    .all() as { report_id: number; report_json: string }[];
  return rows.map((r) => {
    const rep = JSON.parse(r.report_json) as RepoReport;
    return {
      reportId: r.report_id,
      fullName: rep.repo.fullName,
      avatarUrl: rep.repo.avatarUrl,
      oneLiner: rep.overview.oneLiner,
      language: rep.stack.languages[0]?.name ?? null,
      generatedAt: rep.generatedAt,
    };
  });
}
