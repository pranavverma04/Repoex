import { config } from "../config.js";

export class UserFacingError extends Error {
  status;
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Accepts https://github.com/o/r(.git)(/tree/...), github.com/o/r, or o/r. */
export function parseRepoUrl(input) {
  const raw = input.trim().replace(/\/+$/, "");
  const m =
    raw.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i) ??
    raw.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (!m) {
    throw new UserFacingError("Enter a public GitHub repository URL, e.g. https://github.com/pallets/itsdangerous");
  }
  const [, owner, name] = m;
  return { owner, name, url: `https://github.com/${owner}/${name}`.toLowerCase() };
}

async function gh(path) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ai-repo-assistant",
  };
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (res.status === 404) {
    throw new UserFacingError("Repository not found. Only public repositories are supported in v1.", 404);
  }
  if (res.status === 403 || res.status === 429) {
    throw new UserFacingError(
      "GitHub API rate limit reached. Wait a bit or set GITHUB_TOKEN in apps/backend/.env.",
      429,
    );
  }
  if (!res.ok) throw new UserFacingError(`GitHub API error ${res.status}`, 502);
  return res.json();
}

export async function fetchRepoMeta(ref) {
  const data = await gh(`/repos/${ref.owner}/${ref.name}`);
  return {
    owner: data.owner.login,
    name: data.name,
    defaultBranch: data.default_branch,
    sizeKb: data.size,
    private: data.private,
  };
}

export async function fetchLatestSha(ref, branch) {
  const data = await gh(`/repos/${ref.owner}/${ref.name}/commits/${encodeURIComponent(branch)}`);
  return data.sha;
}

/** Rejects private or oversized repositories before anything is cloned. */
export function assertCloneable(meta) {
  if (meta.private) {
    throw new UserFacingError("Private repositories are not supported in v1.", 403);
  }
  const sizeMb = meta.sizeKb / 1024;
  if (sizeMb > config.maxRepoSizeMb) {
    throw new UserFacingError(
      `Repository is ${sizeMb.toFixed(0)} MB, which exceeds the ${config.maxRepoSizeMb} MB limit.`,
      413,
    );
  }
}
