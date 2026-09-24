// /ask/:id — one indexed repository: stats, refresh, live indexing progress, and the chat panel.
import { api, watchJob } from "../api.js";
import { h, pathId, render } from "../dom.js";
import { mountLayout } from "../layout.js";
import { chat } from "../components/chat.js";
import { jobProgress } from "../components/job-progress.js";
import { statusPill } from "../components/status-pill.js";

mountLayout();
const main = document.getElementById("main");
const repoId = pathId();

let repo = null;
let error = null;
let notice = null;
let job = null;
let watching = null; // jobId currently followed
let stopWatch = () => {};
let chatEl = null; // kept across re-renders so the conversation survives refreshes

const urlJob = () => new URLSearchParams(location.search).get("job");

function load() {
  api
    .getRepo(repoId)
    .then((r) => {
      repo = r;
      follow();
      draw();
    })
    .catch((e) => {
      error = e.message;
      draw();
    });
}

// Follow the job from the URL, or whatever job is still running for this repo.
function follow() {
  const running =
    repo?.latestJob && !["done", "failed"].includes(repo.latestJob.status) ? repo.latestJob.jobId : null;
  const jobId = urlJob() ?? running;
  if (!jobId || jobId === watching) return;
  stopWatch();
  watching = jobId;
  let finished = false;
  stopWatch = watchJob(jobId, (j) => {
    job = j;
    draw();
    if (!finished && (j.status === "done" || j.status === "failed")) {
      finished = true;
      load();
    }
  });
}

async function refresh() {
  notice = null;
  error = null;
  draw();
  try {
    const res = await api.refresh(repoId);
    if (res.jobId) {
      history.replaceState(null, "", `/ask/${repoId}?job=${res.jobId}`);
      follow();
    } else {
      notice = res.message ?? "Already up to date";
    }
  } catch (err) {
    error = err.message;
  }
  draw();
}

function draw() {
  if (error && !repo) {
    render(main, h("div", { class: "page" }, h("p", { class: "error" }, error), h("a", { href: "/ask" }, "← Back to repositories")));
    return;
  }
  if (!repo) {
    render(main, h("div", { class: "page muted" }, "Loading…"));
    return;
  }

  const lastJob = repo.latestJob;
  const canChat = (repo.fileCount ?? 0) > 0;
  const showProgress = job && (job.status !== "done" || urlJob());
  if (canChat) chatEl ??= chat(repoId, repo.name);

  render(
    main,
    h(
      "div",
      { class: "page repo-page" },
      h(
        "aside",
        { class: "repo-side" },
        h("a", { href: "/ask", class: "back" }, "← Repositories"),
        h("h1", { class: "repo-title" }, h("span", { class: "owner" }, `${repo.owner}/`), repo.name),
        h("a", { class: "muted small", href: repo.url, target: "_blank", rel: "noreferrer" }, repo.url.replace("https://", "")),
        h(
          "div",
          { class: "side-row" },
          statusPill(repo.status),
          repo.lastCommitSha && h("code", { title: repo.lastCommitSha }, repo.lastCommitSha.slice(0, 7)),
        ),
        h(
          "dl",
          { class: "stats" },
          stat("Files", repo.fileCount ?? 0),
          stat("Symbols", repo.symbolCount ?? 0),
          stat("Edges", repo.edgeCount ?? 0),
          stat("Last run", lastJob?.durationMs != null ? `${(lastJob.durationMs / 1000).toFixed(1)}s` : "—"),
        ),
        lastJob?.status === "done" && h("p", { class: "muted small" }, lastJob.message),
        h("button", { class: "ghost", onclick: refresh, disabled: repo.status === "indexing" }, "Refresh from GitHub"),
        notice && h("p", { class: "notice small" }, notice),
        error && h("p", { class: "error small", role: "alert" }, error),
        showProgress && jobProgress(job),
      ),
      h(
        "section",
        { class: "chat-col" },
        canChat
          ? chatEl
          : h(
              "div",
              { class: "chat-empty" },
              h("p", null, repo.status === "failed" ? "Indexing failed. Try Refresh." : "Chat opens once indexing finishes."),
            ),
      ),
    ),
  );
}

const stat = (label, value) => h("div", null, h("dt", null, label), h("dd", null, value));

draw();
load();
