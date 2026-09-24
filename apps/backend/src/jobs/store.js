import crypto from "node:crypto";

import { db } from "../db.js";

export const toJob = (r) => ({
  jobId: r.job_id,
  repoId: r.repo_id,
  type: r.type,
  status: r.status,
  progress: r.progress,
  message: r.message,
  error: r.error,
  filesParsed: r.files_parsed,
  filesReparsed: r.files_reparsed,
  symbolCount: r.symbol_count,
  edgeCount: r.edge_count,
  durationMs: r.duration_ms,
  createdAt: r.created_at,
  finishedAt: r.finished_at,
});

export function getJob(jobId) {
  const row = db.prepare(`SELECT * FROM jobs WHERE job_id = ?`).get(jobId);
  return row ? toJob(row) : null;
}

export function latestJobForRepo(repoId) {
  const row = db
    .prepare(`SELECT * FROM jobs WHERE repo_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`)
    .get(repoId);
  return row ? toJob(row) : null;
}

export function activeJobForRepo(repoId) {
  const row = db
    .prepare(`SELECT * FROM jobs WHERE repo_id = ? AND status NOT IN ('done','failed') ORDER BY rowid DESC LIMIT 1`)
    .get(repoId);
  return row ? toJob(row) : null;
}

export function createJob(repoId, type) {
  const jobId = crypto.randomUUID();
  db.prepare(`INSERT INTO jobs (job_id, repo_id, type) VALUES (?, ?, ?)`).run(jobId, repoId, type);
  db.prepare(`UPDATE repos SET status='indexing' WHERE repo_id = ?`).run(repoId);
  return jobId;
}

const COLUMNS = {
  status: "status",
  progress: "progress",
  message: "message",
  error: "error",
  filesParsed: "files_parsed",
  filesReparsed: "files_reparsed",
  symbolCount: "symbol_count",
  edgeCount: "edge_count",
  durationMs: "duration_ms",
};

export function updateJob(jobId, patch) {
  const sets = [];
  const values = [];
  for (const [k, col] of Object.entries(COLUMNS)) {
    const v = patch[k];
    if (v !== undefined) {
      sets.push(`${col} = ?`);
      values.push(v);
    }
  }
  if (patch.started) sets.push(`started_at = datetime('now')`);
  if (patch.finished) sets.push(`finished_at = datetime('now')`);
  if (!sets.length) return;
  db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE job_id = ?`).run(...values, jobId);
}
