import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";

import { activeProvider } from "./agent/llm.js";
import { config } from "./config.js";
import { db } from "./db.js";
import { latestEvalRun, runEval } from "./eval/runner.js";
import { getExplainJob, getReport, previewRepo, recentReports, startExplain } from "./explain/index.js";
import { reportToMarkdown } from "./explain/markdown.js";
import { findLiveSites, staticFile, userRepos } from "./explain/site.js";
import { checkTarget, cloneLocations, getCloneJob, openTerminal, revealClone, startClone } from "./explain/clone.js";
import { freePort, localRequest } from "./explain/local.js";
import { UserFacingError } from "./indexer/github.js";
import { getJob } from "./jobs/store.js";
import { startWorker } from "./jobs/worker.js";
import { ask, getRepo, listRepos, refreshRepo, submitRepo } from "./service.js";

const app = new Hono();
app.use("*", cors());

app.onError((err, c) => {
  if (err instanceof UserFacingError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

app.get("/health", (c) => c.json({ ok: true, llm: activeProvider() }));

app.get("/repos", (c) => c.json(listRepos()));

app.post("/repos", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.url !== "string") throw new UserFacingError("Body must be { url: string }");
  return c.json(await submitRepo(body.url), 202);
});

app.get("/repos/:id", (c) => {
  const repo = getRepo(Number(c.req.param("id")));
  return repo ? c.json(repo) : c.json({ error: "Repository not found" }, 404);
});

app.post("/repos/:id/refresh", async (c) => c.json(await refreshRepo(Number(c.req.param("id")))));

app.post("/repos/:id/chat", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) throw new UserFacingError("Body must be { question: string }");
  return c.json(await ask(Number(c.req.param("id")), question));
});

app.get("/repos/:id/symbols", (c) => {
  const q = `%${c.req.query("q") ?? ""}%`;
  const rows = db
    .prepare(
      `SELECT s.name, s.kind, s.parent, f.path, s.start_line AS startLine, s.end_line AS endLine
       FROM symbols s JOIN files f USING (file_id) WHERE s.repo_id = ? AND s.kind != 'import' AND s.name LIKE ?
       ORDER BY length(s.name), f.path LIMIT 50`,
    )
    .all(Number(c.req.param("id")), q);
  return c.json(rows);
});

/** REST snapshot, used on page reload before the SSE stream reconnects. */
app.get("/jobs/:jobId", (c) => {
  const job = getJob(c.req.param("jobId"));
  return job ? c.json(job) : c.json({ error: "Job not found" }, 404);
});

/** Live job status over Server-Sent Events; polls the jobs table every 250 ms. */
app.get("/jobs/:jobId/stream", (c) => {
  const jobId = c.req.param("jobId");
  return streamSSE(c, async (stream) => {
    let last = "";
    let closed = false;
    stream.onAbort(() => {
      closed = true;
    });
    let idle = 0;
    while (!closed) {
      const job = getJob(jobId);
      if (!job) {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ error: "Job not found" }) });
        return;
      }
      const snapshot = JSON.stringify(job);
      if (snapshot !== last) {
        last = snapshot;
        idle = 0;
        await stream.writeSSE({ event: "job-update", data: snapshot, id: String(Date.now()) });
      } else if (++idle % 60 === 0) {
        await stream.writeSSE({ event: "ping", data: "{}" }); // keep proxies from timing out
      }
      if (job.status === "done" || job.status === "failed") return;
      await stream.sleep(config.ssePollMs);
    }
  });
});

// --- Repo explainer --------------------------------------------------------

const explainInput = (q) => ({ url: q.url, owner: q.owner, repo: q.repo });

app.get("/explain/preview", async (c) => c.json(await previewRepo(explainInput(c.req.query()))));

app.post("/explain", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(await startExplain({ ...explainInput(body), branch: body.branch, force: body.force === true }), 202);
});

app.get("/explain/recent", (c) => c.json(recentReports()));

app.get("/explain/users/:owner/repos", async (c) => c.json(await userRepos(c.req.param("owner"), c.req.query("q"))));

// --- Save a copy -----------------------------------------------------------
// These touch the local disk, so only the app's own pages may call them: CORS is open
// for the read-only API, and without this any website could ask for a clone.
// The pages are served by this same server, so browsers send `Sec-Fetch-Site: same-origin`
// (a header other sites cannot forge); cross-origin callers must be on the WEB_ORIGIN list.
const WEB_ORIGINS = (
  process.env.WEB_ORIGIN ?? `http://localhost:${config.port},http://127.0.0.1:${config.port}`
).split(",");
function assertLocalApp(c) {
  const origin = c.req.header("origin");
  const sameOrigin = c.req.header("sec-fetch-site") === "same-origin";
  if (origin ? !WEB_ORIGINS.includes(origin) : !sameOrigin)
    throw new UserFacingError("This action is only allowed from the app itself.", 403);
}

app.get("/explain/clone/locations", async (c) => {
  assertLocalApp(c);
  return c.json(await cloneLocations());
});

app.get("/explain/clone/check", async (c) => {
  assertLocalApp(c);
  return c.json(await checkTarget(c.req.query("base") ?? "", c.req.query("name") ?? ""));
});

app.post("/explain/reports/:id/clone", async (c) => {
  assertLocalApp(c);
  const r = getReport(Number(c.req.param("id")));
  if (!r) return c.json({ error: "Report not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  return c.json(
    await startClone(r, {
      base: String(body.base ?? ""),
      name: String(body.name ?? ""),
      branch: body.branch,
      shallow: body.shallow === true,
    }),
    202,
  );
});

app.get("/explain/clone/:jobId", (c) => {
  assertLocalApp(c);
  const job = getCloneJob(c.req.param("jobId"));
  return job ? c.json(job) : c.json({ error: "Clone not found" }, 404);
});

app.post("/explain/clone/:jobId/reveal", async (c) => {
  assertLocalApp(c);
  await revealClone(c.req.param("jobId"));
  return c.json({ ok: true });
});

app.post("/explain/clone/:jobId/terminal", async (c) => {
  assertLocalApp(c);
  await openTerminal(c.req.param("jobId"));
  return c.json({ ok: true });
});

// A free port for a copy the user is about to start (their project's usual port may be taken)
app.get("/explain/free-port", async (c) => {
  assertLocalApp(c);
  return c.json(await freePort(c.req.query("from")));
});

// Real requests to an app the user started themselves on localhost
app.post("/explain/local-request", async (c) => {
  assertLocalApp(c);
  return c.json(await localRequest(await c.req.json().catch(() => ({}))));
});

app.get("/explain/reports/:id/live-sites", async (c) => {
  const r = getReport(Number(c.req.param("id")));
  return r ? c.json(await findLiveSites(r)) : c.json({ error: "Report not found" }, 404);
});

// The repo's own static files for the in-app preview. Scripts are stripped and blocked by CSP.
app.get("/explain/static/:id/*", async (c) => {
  const r = getReport(Number(c.req.param("id")));
  if (!r) return c.json({ error: "Report not found" }, 404);
  const rest = c.req.path.replace(new RegExp(`^/explain/static/${r.reportId}/?`), "");
  const f = await staticFile(r, rest);
  c.header("Content-Type", f.type);
  c.header("Content-Security-Policy", "script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(f.body);
});

app.get("/explain/reports/:id", (c) => {
  const r = getReport(Number(c.req.param("id")));
  return r ? c.json(r) : c.json({ error: "Report not found" }, 404);
});

app.get("/explain/reports/:id/markdown", (c) => {
  const r = getReport(Number(c.req.param("id")));
  if (!r) return c.json({ error: "Report not found" }, 404);
  c.header("Content-Type", "text/markdown; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${r.repo.fullName.replace("/", "-")}-explained.md"`);
  return c.body(reportToMarkdown(r));
});

app.get("/explain/jobs/:id", (c) => {
  const job = getExplainJob(c.req.param("id"));
  return job ? c.json(job) : c.json({ error: "Job not found" }, 404);
});

app.get("/explain/jobs/:id/stream", (c) => {
  const id = c.req.param("id");
  return streamSSE(c, async (stream) => {
    let last = "";
    let closed = false;
    stream.onAbort(() => {
      closed = true;
    });
    while (!closed) {
      const job = getExplainJob(id);
      if (!job) {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ error: "Job not found" }) });
        return;
      }
      const snap = JSON.stringify(job);
      if (snap !== last) {
        last = snap;
        await stream.writeSSE({ event: "job-update", data: snap });
      }
      if (job.status !== "running") return;
      await stream.sleep(200);
    }
  });
});

app.post("/eval/run", async (c) => c.json(await runEval()));
app.get("/eval/latest", (c) => c.json(latestEvalRun()));

// --- Web pages (plain HTML/CSS/JS in apps/web) ----------------------------
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web");
// `no-cache` = always revalidate (a cheap 304 when unchanged), so an edited page or script is never served stale.
const page = (file) => (c) => {
  c.header("Cache-Control", "no-cache");
  return c.html(fs.readFileSync(path.join(webDir, file), "utf8"));
};
app.get("/", page("index.html"));
app.get("/r/:id", page("report.html"));
app.get("/ask", page("ask.html"));
app.get("/ask/:id", page("repo.html"));
app.get("/eval", page("eval.html"));
app.use(
  "/*",
  serveStatic({
    root: path.relative(process.cwd(), webDir) || ".",
    onFound: (_path, c) => c.header("Cache-Control", "no-cache"),
  }),
);

startWorker();
serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`AI-Repo-Assistant on http://localhost:${info.port} (LLM: ${activeProvider()})`);
});
