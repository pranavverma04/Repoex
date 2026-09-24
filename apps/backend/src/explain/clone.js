// "Save a copy": git-clones an explained public repo into a folder the user names.
// git clone only downloads files; nothing from the repository is executed.
import { spawn, execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { UserFacingError } from "../indexer/github.js";

const HOME = os.homedir();
const jobs = new Map();

/** The usual places to put a project, keeping only the ones that exist. */
export async function cloneLocations() {
  const candidates = [
    ["Desktop", path.join(HOME, "Desktop")],
    ["Downloads", path.join(HOME, "Downloads")],
    ["Documents", path.join(HOME, "Documents")],
    ["Home", HOME],
  ];
  const out = [];
  for (const [label, dir] of candidates) {
    try {
      if ((await fs.stat(dir)).isDirectory()) out.push({ label, path: dir, display: tilde(dir) });
    } catch {}
  }
  return out;
}

const tilde = (p) => (p === HOME ? "~" : p.startsWith(HOME + path.sep) ? "~" + p.slice(HOME.length) : p);

/** Resolves a folder the user typed (absolute or ~/...) and keeps it inside their home folder. */
async function resolveBase(input) {
  let raw = input.trim();
  if (!raw) throw new UserFacingError("Choose where to save it.");
  if (raw === "~") raw = HOME;
  else if (raw.startsWith("~/")) raw = path.join(HOME, raw.slice(2));
  if (!path.isAbsolute(raw)) throw new UserFacingError("Use a full path like ~/Projects or /Users/you/Projects.");
  const base = path.resolve(raw);
  let real;
  try {
    real = await fs.realpath(base);
  } catch {
    throw new UserFacingError(`The folder ${tilde(base)} doesn't exist.`);
  }
  if (real !== HOME && !real.startsWith(HOME + path.sep))
    throw new UserFacingError("Pick a folder inside your home folder.");
  if (!(await fs.stat(real)).isDirectory()) throw new UserFacingError(`${tilde(base)} isn't a folder.`);
  const hidden = path
    .relative(HOME, real)
    .split(path.sep)
    .some((seg) => seg.startsWith("."));
  if (hidden || /^Library(\/|$)/.test(path.relative(HOME, real)))
    throw new UserFacingError("Pick a regular folder, not a hidden or system one.");
  return real;
}

function checkName(name) {
  const n = name.trim();
  if (!n) throw new UserFacingError("Give the folder a name.");
  if (n.length > 100) throw new UserFacingError("That name is too long.");
  if (!/^[\w.@+-][\w .@+-]*$/.test(n) || n === "." || n === ".." || n.startsWith(".")) {
    throw new UserFacingError(
      "Use letters, numbers, spaces, dots, dashes or underscores (no slashes, not starting with a dot).",
    );
  }
  return n;
}

async function exists(p) {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

/** Where a clone would land, whether that's free, and a free alternative name if not. */
export async function checkTarget(base, name) {
  const dir = await resolveBase(base);
  const n = checkName(name);
  const dest = path.join(dir, n);
  const taken = await exists(dest);
  let suggestion = null;
  if (taken) {
    for (let i = 2; i < 100; i++) {
      if (!(await exists(path.join(dir, `${n}-${i}`)))) {
        suggestion = `${n}-${i}`;
        break;
      }
    }
  }
  return { path: dest, display: tilde(dest), exists: taken, suggestion };
}

export async function startClone(report, opts) {
  const t = await checkTarget(opts.base, opts.name);
  if (t.exists)
    throw new UserFacingError(
      `${t.display} already exists. Pick another name${t.suggestion ? `, like ${t.suggestion}` : ""}.`,
      409,
    );
  const branch = opts.branch && report.branches.includes(opts.branch) ? opts.branch : report.branch;
  const job = {
    jobId: crypto.randomUUID(),
    fullName: report.repo.fullName,
    branch,
    shallow: !!opts.shallow,
    dest: t.path,
    display: t.display,
    status: "running",
    phase: "Connecting to GitHub",
    percent: 0,
    log: [],
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
    sizeLabel: null,
  };
  jobs.set(job.jobId, job);

  const args = [
    "clone",
    "--progress",
    "--branch",
    branch,
    ...(opts.shallow ? ["--depth", "1"] : []),
    `https://github.com/${report.repo.owner}/${report.repo.name}.git`,
    t.path,
  ];
  const child = spawn("git", args, {
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME, GIT_TERMINAL_PROMPT: "0", LANG: "C" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  // git writes progress to stderr, with \r between updates of the same line
  const weights = {
    "Counting objects": [0, 5],
    "Compressing objects": [5, 10],
    "Receiving objects": [10, 85],
    "Resolving deltas": [85, 97],
    "Updating files": [97, 100],
  };
  let buf = "";
  child.stderr.on("data", (chunk) => {
    buf += chunk.toString();
    const parts = buf.split(/[\r\n]/);
    buf = parts.pop() ?? "";
    for (const line of parts.map((l) => l.replace(/^remote:\s*/, "").trim()).filter(Boolean)) {
      const m = line.match(/^([A-Z][a-z]+ [a-z]+):\s+(\d+)%/);
      if (m && weights[m[1]]) {
        const [from, to] = weights[m[1]];
        job.phase = m[1];
        job.percent = Math.max(job.percent, Math.round(from + ((to - from) * Number(m[2])) / 100));
        const size = line.match(/,\s*([\d.]+ [KMG]iB)/);
        if (size) job.sizeLabel = size[1];
        if (m[2] === "100" && !job.log.includes(line)) job.log.push(line);
      } else if (!/^\d+%/.test(line) && job.log.length < 40) {
        job.log.push(line);
      }
    }
  });
  const timer = setTimeout(() => child.kill("SIGTERM"), 30 * 60_000);
  child.on("close", async (code) => {
    clearTimeout(timer);
    job.finishedAt = Date.now();
    if (code === 0) {
      job.status = "done";
      job.percent = 100;
      job.phase = "Done";
    } else {
      job.status = "failed";
      job.error = job.log.filter((l) => /fatal|error/i.test(l)).pop() ?? `git exited with code ${code}`;
      // leave nothing half-written behind
      await fs.rm(t.path, { recursive: true, force: true }).catch(() => {});
    }
    setTimeout(() => jobs.delete(job.jobId), 60 * 60_000);
  });
  child.on("error", (err) => {
    job.status = "failed";
    job.error = `Couldn't start git: ${err.message}`;
  });
  return job;
}

export function getCloneJob(id) {
  return jobs.get(id) ?? null;
}

/** Shows a finished clone in Finder. Only paths this server just cloned can be revealed. */
export async function revealClone(id) {
  const job = jobs.get(id);
  if (!job || job.status !== "done") throw new UserFacingError("That clone isn't finished.", 404);
  await new Promise((resolve, reject) => execFile("open", [job.dest], (err) => (err ? reject(err) : resolve())));
}

/** Opens Terminal.app in a finished clone's folder, so the user can run it themselves. */
export async function openTerminal(id) {
  const job = jobs.get(id);
  if (!job || job.status !== "done") throw new UserFacingError("That clone isn't finished.", 404);
  await new Promise((resolve, reject) =>
    execFile("open", ["-a", "Terminal", job.dest], (err) => (err ? reject(err) : resolve())),
  );
}
