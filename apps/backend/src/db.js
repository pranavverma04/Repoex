import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS repos (
  repo_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  url             TEXT NOT NULL UNIQUE,
  owner           TEXT NOT NULL,
  name            TEXT NOT NULL,
  default_branch  TEXT,
  last_commit_sha TEXT,
  size_kb         INTEGER,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  indexed_at      TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  job_id         TEXT PRIMARY KEY,
  repo_id        INTEGER NOT NULL REFERENCES repos(repo_id) ON DELETE CASCADE,
  type           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'queued',
  progress       INTEGER NOT NULL DEFAULT 0,
  message        TEXT,
  error          TEXT,
  files_parsed   INTEGER NOT NULL DEFAULT 0,
  files_reparsed INTEGER NOT NULL DEFAULT 0,
  symbol_count   INTEGER NOT NULL DEFAULT 0,
  edge_count     INTEGER NOT NULL DEFAULT 0,
  duration_ms    INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  started_at     TEXT,
  finished_at    TEXT
);

CREATE TABLE IF NOT EXISTS files (
  file_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id   INTEGER NOT NULL REFERENCES repos(repo_id) ON DELETE CASCADE,
  path      TEXT NOT NULL,
  language  TEXT NOT NULL,
  content   TEXT NOT NULL,
  hash      TEXT NOT NULL,
  -- unresolved call/import references from pass 1, re-used by pass 2 on refresh
  refs_json TEXT NOT NULL DEFAULT '{"calls":[],"imports":[]}',
  UNIQUE (repo_id, path)
);

CREATE TABLE IF NOT EXISTS symbols (
  symbol_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id    INTEGER NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
  repo_id    INTEGER NOT NULL REFERENCES repos(repo_id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL,
  parent     TEXT,
  start_line INTEGER NOT NULL,
  end_line   INTEGER NOT NULL,
  signature  TEXT,
  docstring  TEXT
);
CREATE INDEX IF NOT EXISTS idx_symbols_repo_name ON symbols(repo_id, name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);

CREATE TABLE IF NOT EXISTS edges (
  edge_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id        INTEGER NOT NULL REFERENCES repos(repo_id) ON DELETE CASCADE,
  from_symbol_id INTEGER NOT NULL REFERENCES symbols(symbol_id) ON DELETE CASCADE,
  to_symbol_id   INTEGER NOT NULL REFERENCES symbols(symbol_id) ON DELETE CASCADE,
  edge_type      TEXT NOT NULL,
  UNIQUE (from_symbol_id, to_symbol_id, edge_type)
);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_symbol_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_symbol_id);

CREATE TABLE IF NOT EXISTS cache_entries (
  cache_id           INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id            INTEGER NOT NULL REFERENCES repos(repo_id) ON DELETE CASCADE,
  query_norm         TEXT NOT NULL,
  answer             TEXT NOT NULL,
  sources_json       TEXT NOT NULL,
  trace_json         TEXT,
  source_symbol_ids  TEXT NOT NULL,
  source_file_hashes TEXT NOT NULL,
  hits               INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (repo_id, query_norm)
);

CREATE TABLE IF NOT EXISTS eval_questions (
  question_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id          INTEGER NOT NULL REFERENCES repos(repo_id) ON DELETE CASCADE,
  question         TEXT NOT NULL,
  expected_symbols TEXT NOT NULL,
  expected_answer  TEXT NOT NULL,
  UNIQUE (repo_id, question)
);

CREATE TABLE IF NOT EXISTS eval_results (
  result_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id     INTEGER NOT NULL REFERENCES eval_questions(question_id) ON DELETE CASCADE,
  run_id          TEXT NOT NULL,
  retrieval_pass  INTEGER NOT NULL,
  answer_score    REAL NOT NULL,
  passed          INTEGER NOT NULL,
  latency_ms      INTEGER NOT NULL,
  retrieved       TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

/** Jobs left mid-flight by a previous process can never finish; mark them failed. */
db.prepare(
  `UPDATE jobs SET status='failed', error='Server restarted while job was running', finished_at=datetime('now')
   WHERE status IN ('cloning','parsing','indexing')`,
).run();
db.prepare(
  `UPDATE repos SET status='failed' WHERE status='indexing'
            AND repo_id NOT IN (SELECT repo_id FROM jobs WHERE status='queued')`,
).run();
