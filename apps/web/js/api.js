// Client for the backend API. The pages are served by the same server, so every
// path is same-origin (set window.ARA_API_URL before this loads to point elsewhere).
export const API_URL = window.ARA_API_URL ?? "";

async function call(path, init = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
      cache: "no-store",
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new Error("Can't reach the server. Is it running? (pnpm dev)");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

const post = (path, body) => call(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  // code-graph Q&A
  listRepos: () => call("/repos"),
  getRepo: (id) => call(`/repos/${id}`),
  submitRepo: (url) => post("/repos", { url }),
  refresh: (id) => post(`/repos/${id}/refresh`),
  ask: (id, question) => post(`/repos/${id}/chat`, { question }),
  getJob: (jobId) => call(`/jobs/${jobId}`),
  health: () => call("/health"),
  runEval: () => post("/eval/run"),
  latestEval: () => call("/eval/latest"),

  // repo explainer. `input` is { url } or { owner, repo }.
  previewRepo: (input, signal) => call(`/explain/preview?${new URLSearchParams(input)}`, { signal }),
  startExplain: (input) => post("/explain", input),
  explainJob: (jobId) => call(`/explain/jobs/${jobId}`),
  report: (id) => call(`/explain/reports/${id}`),
  recentReports: () => call("/explain/recent"),
  markdownUrl: (id) => `${API_URL}/explain/reports/${id}/markdown`,
  userRepos: (owner, q) =>
    call(`/explain/users/${encodeURIComponent(owner)}/repos${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  liveSites: (id) => call(`/explain/reports/${id}/live-sites`),
  cloneLocations: () => call("/explain/clone/locations"),
  cloneCheck: (base, name, signal) => call(`/explain/clone/check?${new URLSearchParams({ base, name })}`, { signal }),
  startClone: (reportId, body) => post(`/explain/reports/${reportId}/clone`, body),
  cloneJob: (jobId) => call(`/explain/clone/${jobId}`),
  openTerminal: (jobId) => post(`/explain/clone/${jobId}/terminal`),
  localRequest: (body) => post("/explain/local-request", body),
  revealClone: (jobId) => post(`/explain/clone/${jobId}/reveal`),
  /** the repo's own static files, served with scripts blocked */
  staticUrl: (id, path) => `${API_URL}/explain/static/${id}/${path.replace(/^\//, "")}`,
};

/**
 * Follows an indexing job: REST snapshot first (so a reload never shows an empty bar),
 * then Server-Sent Events until it is done/failed. Returns a function that stops watching.
 */
export function watchJob(jobId, onUpdate) {
  let source = null;
  let stopped = false;
  const settle = (job) => {
    onUpdate(job);
    if (job.status === "done" || job.status === "failed") {
      source?.close();
      return true;
    }
    return false;
  };
  api
    .getJob(jobId)
    .then((snapshot) => {
      if (stopped || settle(snapshot)) return;
      source = new EventSource(`${API_URL}/jobs/${jobId}/stream`);
      source.addEventListener("job-update", (e) => settle(JSON.parse(e.data)));
    })
    .catch(() => {});
  return () => {
    stopped = true;
    source?.close();
  };
}

/**
 * Follows a repo-explainer job over SSE, with a REST snapshot first and polling if the
 * stream drops. Calls onUpdate(job) / onError(message). Returns a stop function.
 */
export function watchExplainJob(jobId, onUpdate, onError = () => {}) {
  let closed = false;
  let poll = null;
  api
    .explainJob(jobId)
    .then((j) => !closed && onUpdate(j))
    .catch(() => {});
  const es = new EventSource(`${API_URL}/explain/jobs/${jobId}/stream`);
  es.addEventListener("job-update", (e) => {
    const j = JSON.parse(e.data);
    if (!closed) onUpdate(j);
    if (j.status !== "running") es.close();
  });
  es.addEventListener("error", (e) => {
    if (e.data) {
      onError(JSON.parse(e.data).error ?? "Job not found");
      es.close();
      return;
    }
    // connection dropped: fall back to polling until the job settles
    es.close();
    if (closed || poll) return;
    poll = setInterval(() => {
      api
        .explainJob(jobId)
        .then((j) => {
          if (!closed) onUpdate(j);
          if (j.status !== "running") clearInterval(poll);
        })
        .catch((err) => onError(err.message));
    }, 800);
  });
  return () => {
    closed = true;
    es.close();
    if (poll) clearInterval(poll);
  };
}
