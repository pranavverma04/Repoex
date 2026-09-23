import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT ?? 8787),
  dbPath: process.env.DB_PATH ?? path.resolve(here, "../data/ara.db"),
  /** Repos larger than this (per GitHub's reported size) are rejected before cloning. */
  maxRepoSizeMb: Number(process.env.MAX_REPO_SIZE_MB ?? 200),
  maxFiles: Number(process.env.MAX_FILES ?? 4000),
  maxFileBytes: Number(process.env.MAX_FILE_BYTES ?? 400_000),
  githubToken: process.env.GITHUB_TOKEN || undefined,
  /** How often the SSE stream re-reads the jobs table. */
  ssePollMs: 250,
  retrieval: {
    topCandidates: 6,
    maxHops: 2,
    maxContextSymbols: 18,
    maxSnippetLines: 80,
    maxContextChars: 28_000,
    maxRetries: 2,
  },
};
