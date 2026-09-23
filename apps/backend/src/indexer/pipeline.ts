// One indexing run: clone -> hash -> parse changed files (pass 1) -> resolve edges (pass 2).
// The initial index is just a refresh against an empty database, so both share this code.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { JobType } from "@ara/shared";
import { db } from "../db.js";
import { updateJob } from "../jobs/store.js";
import { listSourceFiles, removeClone, shallowClone } from "./clone.js";
import { extract } from "./extract.js";
import { assertCloneable, fetchLatestSha, fetchRepoMeta, parseRepoUrl } from "./github.js";
import { languageForPath } from "./languages.js";
import { resolveEdges } from "./resolve.js";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

interface RepoRow {
  repo_id: number;
  url: string;
}

export async function runIndexJob(jobId: string, repoId: number, type: JobType) {
  const started = Date.now();
  const repo = db.prepare(`SELECT repo_id, url FROM repos WHERE repo_id = ?`).get(repoId) as RepoRow;
  db.prepare(`UPDATE repos SET status='indexing' WHERE repo_id = ?`).run(repoId);
  let cloneDir: string | null = null;
  try {
    updateJob(jobId, { status: "cloning", progress: 5, message: "Checking repository size", started: true });
    const ref = parseRepoUrl(repo.url);
    const meta = await fetchRepoMeta(ref);
    assertCloneable(meta);
    const sha = await fetchLatestSha(ref, meta.defaultBranch);

    updateJob(jobId, { progress: 10, message: `Shallow-cloning ${meta.owner}/${meta.name}` });
    cloneDir = await shallowClone(repo.url, meta.defaultBranch);
    const paths = await listSourceFiles(cloneDir);

    // Read + hash every file while the clone exists; this is the only filesystem access.
    const current = new Map<string, { content: string; hash: string }>();
    for (const rel of paths) {
      const content = await fs.readFile(path.join(cloneDir, rel), "utf8");
      if (content.includes("\u0000")) continue; // binary masquerading as source
      current.set(rel, { content, hash: sha256(content) });
    }
    await removeClone(cloneDir);
    cloneDir = null;

    const stored = new Map(
      (db.prepare(`SELECT file_id, path, hash FROM files WHERE repo_id = ?`).all(repoId) as {
        file_id: number;
        path: string;
        hash: string;
      }[]).map((r) => [r.path, r]),
    );
    const changed = [...current.keys()].filter((p) => stored.get(p)?.hash !== current.get(p)!.hash);
    const removed = [...stored.keys()].filter((p) => !current.has(p));

    updateJob(jobId, {
      status: "parsing",
      progress: 15,
      message: `Parsing ${changed.length} of ${current.size} files`,
    });

    const upsertFile = db.prepare(
      `INSERT INTO files (repo_id, path, language, content, hash, refs_json) VALUES (@repoId, @path, @language, @content, @hash, @refs)
       ON CONFLICT (repo_id, path) DO UPDATE SET language=excluded.language, content=excluded.content, hash=excluded.hash, refs_json=excluded.refs_json
       RETURNING file_id`,
    );
    const clearSymbols = db.prepare(`DELETE FROM symbols WHERE file_id = ?`);
    const insertSymbol = db.prepare(
      `INSERT INTO symbols (file_id, repo_id, name, kind, parent, start_line, end_line, signature, docstring)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const deleteFile = db.prepare(`DELETE FROM files WHERE repo_id = ? AND path = ?`);

    db.transaction(() => removed.forEach((p) => deleteFile.run(repoId, p)))();

    let done = 0;
    let failedFiles = 0;
    for (const rel of changed) {
      const { content, hash } = current.get(rel)!;
      const language = languageForPath(rel)!;
      let result;
      try {
        result = await extract(language, content);
      } catch {
        failedFiles++;
        result = { symbols: [], refs: { calls: [], imports: [] } };
      }
      db.transaction(() => {
        const { file_id } = upsertFile.get({
          repoId,
          path: rel,
          language,
          content,
          hash,
          refs: JSON.stringify(result.refs),
        }) as { file_id: number };
        clearSymbols.run(file_id);
        for (const s of result.symbols) {
          insertSymbol.run(file_id, repoId, s.name, s.kind, s.parent, s.startLine, s.endLine, s.signature, s.docstring);
        }
      })();
      done++;
      if (done % 10 === 0 || done === changed.length) {
        updateJob(jobId, {
          progress: 15 + Math.round((done / Math.max(changed.length, 1)) * 65),
          message: `Parsed ${done}/${changed.length} files`,
          filesParsed: done,
        });
      }
    }

    updateJob(jobId, { status: "indexing", progress: 85, message: "Resolving call/import edges (pass 2)" });
    const edgeCount = resolveEdges(repoId);
    const symbolCount = (db.prepare(`SELECT COUNT(*) AS n FROM symbols WHERE repo_id = ?`).get(repoId) as { n: number }).n;

    db.prepare(
      `UPDATE repos SET status='ready', last_commit_sha=?, size_kb=?, default_branch=?, indexed_at=datetime('now') WHERE repo_id=?`,
    ).run(sha, meta.sizeKb, meta.defaultBranch, repoId);

    const summary =
      type === "refresh"
        ? `Re-parsed ${changed.length} changed file(s), removed ${removed.length}, ${current.size - changed.length} unchanged`
        : `Indexed ${current.size} files`;
    updateJob(jobId, {
      status: "done",
      progress: 100,
      message: failedFiles ? `${summary} (${failedFiles} failed to parse)` : summary,
      filesParsed: current.size,
      filesReparsed: changed.length,
      symbolCount,
      edgeCount,
      durationMs: Date.now() - started,
      finished: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hasData = db.prepare(`SELECT 1 FROM files WHERE repo_id = ? LIMIT 1`).get(repoId);
    db.prepare(`UPDATE repos SET status=? WHERE repo_id=?`).run(hasData ? "ready" : "failed", repoId);
    updateJob(jobId, { status: "failed", error: message, message: "Failed", durationMs: Date.now() - started, finished: true });
  } finally {
    if (cloneDir) await removeClone(cloneDir);
  }
}
