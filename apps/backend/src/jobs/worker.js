// Background job runner backed by the SQLite jobs table (no Redis/BullMQ in v1).
// Picks the oldest queued job, one at a time, inside the long-lived API process.

import { db } from "../db.js";
import { runIndexJob } from "../indexer/pipeline.js";

let busy = false;

async function tick() {
  if (busy) return;
  const next = db
    .prepare(`SELECT job_id, repo_id, type FROM jobs WHERE status = 'queued' ORDER BY rowid LIMIT 1`)
    .get();
  if (!next) return;
  busy = true;
  try {
    await runIndexJob(next.job_id, next.repo_id, next.type);
  } finally {
    busy = false;
  }
}

export function startWorker(intervalMs = 300) {
  setInterval(() => void tick(), intervalMs);
}

/** Runs/awaits jobs until none are pending (used by the eval harness). */
export async function drainQueue() {
  for (;;) {
    const pending = db.prepare(`SELECT 1 FROM jobs WHERE status NOT IN ('done','failed') LIMIT 1`).get();
    if (!pending) return;
    // If another loop (the API server's worker) owns the running job, just wait for it.
    if (!busy) await tick();
    await new Promise((r) => setTimeout(r, 200));
  }
}
