// Operations shared by the HTTP routes and the eval CLI.

import { runAgent } from "./agent/graph.js";
import { lookupCache, writeCache } from "./cache.js";
import { db } from "./db.js";
import { assertCloneable, fetchLatestSha, fetchRepoMeta, parseRepoUrl, UserFacingError } from "./indexer/github.js";
import { activeJobForRepo, createJob, latestJobForRepo } from "./jobs/store.js";

function toRepo(r, withStats = false) {
  const repo = {
    repoId: r.repo_id,
    url: r.url,
    owner: r.owner,
    name: r.name,
    defaultBranch: r.default_branch,
    lastCommitSha: r.last_commit_sha,
    sizeKb: r.size_kb,
    status: r.status,
    createdAt: r.created_at,
    indexedAt: r.indexed_at,
    latestJob: latestJobForRepo(r.repo_id),
  };
  if (withStats) {
    const count = (sql) => db.prepare(sql).get(r.repo_id).n;
    repo.fileCount = count(`SELECT COUNT(*) AS n FROM files WHERE repo_id = ?`);
    repo.symbolCount = count(`SELECT COUNT(*) AS n FROM symbols WHERE repo_id = ? AND kind != 'import'`);
    repo.edgeCount = count(`SELECT COUNT(*) AS n FROM edges WHERE repo_id = ?`);
  }
  return repo;
}

export function listRepos() {
  return db
    .prepare(`SELECT * FROM repos ORDER BY created_at DESC, repo_id DESC`)
    .all()
    .map((r) => toRepo(r, true));
}

export function getRepo(repoId) {
  const row = db.prepare(`SELECT * FROM repos WHERE repo_id = ?`).get(repoId);
  return row ? toRepo(row, true) : null;
}

export async function submitRepo(input) {
  const ref = parseRepoUrl(input);
  const existing = db.prepare(`SELECT repo_id FROM repos WHERE url = ?`).get(ref.url);
  if (existing) return refreshRepo(existing.repo_id);

  // Size/visibility check happens before any clone; rejections come back as clear errors.
  const meta = await fetchRepoMeta(ref);
  assertCloneable(meta);
  const { repo_id } = db
    .prepare(`INSERT INTO repos (url, owner, name, default_branch, size_kb) VALUES (?, ?, ?, ?, ?) RETURNING repo_id`)
    .get(ref.url, meta.owner, meta.name, meta.defaultBranch, meta.sizeKb);
  const jobId = createJob(repo_id, "index");
  return { repoId: repo_id, jobId };
}

export async function refreshRepo(repoId) {
  const row = db.prepare(`SELECT * FROM repos WHERE repo_id = ?`).get(repoId);
  if (!row) throw new UserFacingError("Repository not found", 404);
  const active = activeJobForRepo(repoId);
  if (active) return { repoId, jobId: active.jobId, changed: true, message: "Indexing already in progress" };

  if (row.last_commit_sha && row.status === "ready") {
    const meta = await fetchRepoMeta(parseRepoUrl(row.url));
    const sha = await fetchLatestSha(parseRepoUrl(row.url), meta.defaultBranch);
    if (sha === row.last_commit_sha) {
      return { repoId, jobId: null, changed: false, message: `Already up to date at ${sha.slice(0, 7)}` };
    }
  }
  const jobId = createJob(repoId, row.last_commit_sha ? "refresh" : "index");
  return { repoId, jobId, changed: true };
}

export async function ask(repoId, question, opts = {}) {
  const started = Date.now();
  const repo = db.prepare(`SELECT status FROM repos WHERE repo_id = ?`).get(repoId);
  if (!repo) throw new UserFacingError("Repository not found", 404);
  const hasFiles = db.prepare(`SELECT 1 FROM files WHERE repo_id = ? LIMIT 1`).get(repoId);
  if (!hasFiles) throw new UserFacingError("This repository hasn't finished indexing yet.", 409);

  if (opts.useCache !== false) {
    const hit = lookupCache(repoId, question);
    if (hit) return { ...hit, cached: true, latencyMs: Date.now() - started };
  }
  const { answer, sources, trace } = await runAgent(repoId, question);
  if (sources.length && !trace.synthesizer.includes("error")) writeCache(repoId, question, answer, sources, trace);
  return { answer, sources, trace, cached: false, latencyMs: Date.now() - started };
}
