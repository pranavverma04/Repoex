// Eval harness: runs hand-written questions through the real retrieval + agent pipeline
// (cache bypassed) and records whether the expected symbols were retrieved, plus latency.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "../db.js";
import { parseRepoUrl } from "../indexer/github.js";
import { drainQueue } from "../jobs/worker.js";
import { ask, submitRepo } from "../service.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const loadDataset = () => JSON.parse(fs.readFileSync(path.join(here, "dataset.json"), "utf8"));

const WORD_STOP = new Set([
  "that",
  "this",
  "with",
  "from",
  "into",
  "then",
  "than",
  "they",
  "their",
  "which",
  "when",
  "uses",
  "used",
]);

/** Share of the expected answer's key words that show up in the produced answer. */
function answerScore(expected, answer) {
  const words = [...new Set(expected.toLowerCase().match(/[a-z_][a-z0-9_]{3,}/g) ?? [])].filter(
    (w) => !WORD_STOP.has(w),
  );
  if (!words.length) return 1;
  const a = answer.toLowerCase();
  return words.filter((w) => a.includes(w)).length / words.length;
}

async function ensureIndexed(repoUrl) {
  const url = parseRepoUrl(repoUrl).url;
  let row = db.prepare(`SELECT repo_id, status FROM repos WHERE url = ?`).get(url);
  if (!row || row.status === "failed") {
    await submitRepo(repoUrl);
  }
  // Works both inside the API process (worker already running) and from the CLI.
  await drainQueue();
  row = db.prepare(`SELECT repo_id, status FROM repos WHERE url = ?`).get(url);
  if (row.status !== "ready") throw new Error(`Could not index ${repoUrl}`);
  return row.repo_id;
}

export async function runEval() {
  const runId = crypto.randomUUID();
  const summaries = [];
  for (const ds of loadDataset()) {
    const repoId = await ensureIndexed(ds.repoUrl);
    const results = [];
    for (const q of ds.questions) {
      const { question_id } = db
        .prepare(
          `INSERT INTO eval_questions (repo_id, question, expected_symbols, expected_answer) VALUES (?, ?, ?, ?)
           ON CONFLICT (repo_id, question) DO UPDATE SET expected_symbols=excluded.expected_symbols, expected_answer=excluded.expected_answer
           RETURNING question_id`,
        )
        .get(repoId, q.question, JSON.stringify(q.expectedSymbols), q.expectedAnswer);

      const res = await ask(repoId, q.question, { useCache: false });
      const retrieved = res.sources.map((s) => s.name);
      const bare = retrieved.map((n) => n.split(".").pop().toLowerCase());
      const retrievalPass = q.expectedSymbols.every((e) => {
        const want = e.toLowerCase();
        return retrieved.some((r) => r.toLowerCase() === want) || bare.includes(want);
      });
      const score = answerScore(q.expectedAnswer, res.answer);
      const result = {
        questionId: question_id,
        question: q.question,
        expectedSymbols: q.expectedSymbols,
        retrieved,
        retrievalPass,
        answerScore: Math.round(score * 100) / 100,
        passed: retrievalPass,
        latencyMs: res.latencyMs,
      };
      results.push(result);
      db.prepare(
        `INSERT INTO eval_results (question_id, run_id, retrieval_pass, answer_score, passed, latency_ms, retrieved)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        question_id,
        runId,
        +retrievalPass,
        result.answerScore,
        +result.passed,
        result.latencyMs,
        JSON.stringify(retrieved),
      );
    }
    summaries.push(summarize(runId, ds.repoUrl, results));
  }
  return summaries;
}

function summarize(runId, repoUrl, results) {
  return {
    runId,
    repoUrl,
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    avgLatencyMs: Math.round(results.reduce((a, r) => a + r.latencyMs, 0) / Math.max(results.length, 1)),
    results,
  };
}

/** Most recent run, grouped per repository. */
export function latestEvalRun() {
  const last = db.prepare(`SELECT run_id FROM eval_results ORDER BY result_id DESC LIMIT 1`).get();
  if (!last) return [];
  const rows = db
    .prepare(
      `SELECT r.*, q.question, q.expected_symbols, repos.url FROM eval_results r
       JOIN eval_questions q USING (question_id) JOIN repos USING (repo_id)
       WHERE r.run_id = ? ORDER BY r.result_id`,
    )
    .all(last.run_id);
  const byRepo = new Map();
  for (const r of rows) {
    const list = byRepo.get(r.url) ?? byRepo.set(r.url, []).get(r.url);
    list.push({
      questionId: r.question_id,
      question: r.question,
      expectedSymbols: JSON.parse(r.expected_symbols),
      retrieved: JSON.parse(r.retrieved),
      retrievalPass: !!r.retrieval_pass,
      answerScore: r.answer_score,
      passed: !!r.passed,
      latencyMs: r.latency_ms,
    });
  }
  return [...byRepo].map(([url, results]) => summarize(last.run_id, url, results));
}
