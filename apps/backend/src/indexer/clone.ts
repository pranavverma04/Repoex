import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { rgPath } from "@vscode/ripgrep";
import { config } from "../config.js";
import { languageForPath } from "./languages.js";

const run = promisify(execFile);

/** Shallow, single-branch clone into a fresh temp dir. Caller must call removeClone(). */
export async function shallowClone(url: string, branch: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ara-clone-"));
  await run("git", ["clone", "--depth", "1", "--single-branch", "--branch", branch, `${url}.git`, dir], {
    timeout: 5 * 60_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return dir;
}

export async function removeClone(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}

const IGNORE_GLOBS = [
  "!**/node_modules/**", "!**/vendor/**", "!**/dist/**", "!**/build/**", "!**/out/**",
  "!**/.next/**", "!**/target/**", "!**/__pycache__/**", "!**/*.min.js", "!**/*.bundle.js",
  "!**/*.d.ts",
];

/** Lists parseable source files with ripgrep (honours .gitignore). Only place the clone is walked. */
export async function listSourceFiles(dir: string): Promise<string[]> {
  const args = ["--files", ...IGNORE_GLOBS.flatMap((g) => ["-g", g])];
  const { stdout } = await run(rgPath, args, { cwd: dir, maxBuffer: 64 * 1024 * 1024 });
  const files = stdout
    .split("\n")
    .filter(Boolean)
    .filter((p) => languageForPath(p) !== null)
    .sort();
  const kept: string[] = [];
  for (const rel of files) {
    const stat = await fs.stat(path.join(dir, rel));
    if (stat.size > config.maxFileBytes) continue;
    kept.push(rel);
    if (kept.length >= config.maxFiles) break;
  }
  return kept;
}
