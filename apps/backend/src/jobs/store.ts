import crypto from "node:crypto";
import type { Job, JobStatus, JobType } from "@ara/shared";
import { db } from "../db.js";

interface JobRow {
  job_id: string;
  repo_id: number;
  type: JobType;
  status: JobStatus;
  progress: number;
  message: string | null;
  error: string | null;
  files_parsed: number;
  files_reparsed: number;
  symbol_count: number;
  edge_count: number;
  duration_ms: number | null;
  created_at: string;
  finished_at: string | null;
}

export const toJob = (r: JobRow): Job => ({
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

export function getJob(jobId: string): Job | null {
  const row = db.prepare(`SELECT * FROM jobs WHERE job_id = ?`).get(jobId) as JobRow | undefined;
  return row ? toJob(row) : null;
}

export function latestJobForRepo(repoId: number): Job | null {
  const row = db
    .prepare(`SELECT * FROM jobs WHERE repo_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`)
    .get(repoId) as JobRow | undefined;
  return row ? toJob(row) : null;
}

export function activeJobForRepo(repoId: number): Job | null {
  const row = db
    .prepare(`SELECT * FROM jobs WHERE repo_id = ? AND status NOT IN ('done','failed') ORDER BY rowid DESC LIMIT 1`)
    .get(repoId) as JobRow | undefined;
  return row ? toJob(row) : null;
}

export function createJob(repoId: number, type: JobType): string {
  const jobId = crypto.randomUUID();
  db.prepare(`INSERT INTO jobs (job_id, repo_id, type) VALUES (?, ?, ?)`).run(jobId, repoId, type);
  db.prepare(`UPDATE repos SET status='indexing' WHERE repo_id = ?`).run(repoId);
  return jobId;
}

export interface JobPatch {
  status?: JobStatus;
  progress?: number;
  message?: string;
  error?: string;
  filesParsed?: number;
  filesReparsed?: number;
  symbolCount?: number;
  edgeCount?: number;
  durationMs?: number;
  started?: boolean;
  finished?: boolean;
}

const COLUMNS: Record<string, string> = {
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

export function updateJob(jobId: string, patch: JobPatch) {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [k, col] of Object.entries(COLUMNS)) {
    const v = patch[k as keyof JobPatch];
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
