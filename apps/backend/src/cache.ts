// Hash-validated query cache. An entry is only served if every file it was built from
// still has the same SHA-256 hash; otherwise it's a miss and gets overwritten.
import type { AgentTrace, SourceRef } from "@ara/shared";
import { db } from "./db.js";

export const normalizeQuery = (q: string) =>
  q.toLowerCase().replace(/[^\w\s.]/g, " ").replace(/\s+/g, " ").trim();

interface CacheRow {
  answer: string;
  sources_json: string;
  trace_json: string | null;
  source_file_hashes: string;
}

export function lookupCache(repoId: number, question: string) {
  const row = db
    .prepare(`SELECT answer, sources_json, trace_json, source_file_hashes FROM cache_entries WHERE repo_id = ? AND query_norm = ?`)
    .get(repoId, normalizeQuery(question)) as CacheRow | undefined;
  if (!row) return null;
  const recorded = JSON.parse(row.source_file_hashes) as Record<string, string>;
  const hashQ = db.prepare(`SELECT hash FROM files WHERE repo_id = ? AND path = ?`);
  for (const [path, hash] of Object.entries(recorded)) {
    const current = hashQ.get(repoId, path) as { hash: string } | undefined;
    if (current?.hash !== hash) return null; // a source file changed or disappeared
  }
  db.prepare(`UPDATE cache_entries SET hits = hits + 1 WHERE repo_id = ? AND query_norm = ?`).run(repoId, normalizeQuery(question));
  return {
    answer: row.answer,
    sources: JSON.parse(row.sources_json) as SourceRef[],
    trace: row.trace_json ? (JSON.parse(row.trace_json) as AgentTrace) : null,
  };
}

/** Write-through after synthesis. */
export function writeCache(repoId: number, question: string, answer: string, sources: SourceRef[], trace: AgentTrace) {
  const paths = [...new Set(sources.map((s) => s.path))];
  const hashQ = db.prepare(`SELECT hash FROM files WHERE repo_id = ? AND path = ?`);
  const hashes: Record<string, string> = {};
  for (const p of paths) hashes[p] = (hashQ.get(repoId, p) as { hash: string }).hash;
  db.prepare(
    `INSERT INTO cache_entries (repo_id, query_norm, answer, sources_json, trace_json, source_symbol_ids, source_file_hashes)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (repo_id, query_norm) DO UPDATE SET answer=excluded.answer, sources_json=excluded.sources_json,
       trace_json=excluded.trace_json, source_symbol_ids=excluded.source_symbol_ids,
       source_file_hashes=excluded.source_file_hashes, hits=0, created_at=datetime('now')`,
  ).run(
    repoId,
    normalizeQuery(question),
    answer,
    JSON.stringify(sources),
    JSON.stringify(trace),
    JSON.stringify(sources.map((s) => s.symbolId)),
    JSON.stringify(hashes),
  );
}
