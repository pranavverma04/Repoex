// Home page (/): the repo explainer. Pick a repo, watch the analysis run, then open its report.
// Plain-JS port of app/page.tsx.
import { api, watchExplainJob } from "../api.js";
import { analysisProgress } from "../components/analysis-progress.js";
import { parseLink, repoInput } from "../components/repo-input.js";
import { h, reducedMotion, render } from "../dom.js";
import { mountLayout } from "../layout.js";
import { ago, enter, icon, reveal, splitText } from "../ui.js";

const COVERS = [
  { icon: "spark", title: "What it is", body: "A plain-words summary, plus a developer version." },
  { icon: "tag", title: "Tech stack", body: "Languages, frameworks and tools, read from its manifests." },
  { icon: "folder", title: "Structure", body: "An interactive file tree and what each folder holds." },
  { icon: "commit", title: "Work done", body: "Commit timeline, who built it, and what changed most." },
  { icon: "play", title: "How to run it", body: "Setup steps, scripts and the environment variables it reads." },
  { icon: "chat", title: "Mock output", body: "A preview of its pages, API responses or terminal output." },
];

mountLayout();

const main = document.getElementById("main");
const root = h("div", { class: "explain-home" });
main.append(root);

const openReport = (id) => (location.href = `/r/${id}`);

let jobId = null;
let target = null; // { input, branch, name } of the run in progress, for Try again
let stopWatching = null;
let openTimer = 0;
let recent = [];
let initial;

// ---- intro view: hero, input, what the report covers, recent reports ----
const errorSlot = h("div", { style: "display: contents" });
let input = null;
let introEl = null;
let recentSlot = null;

function showError(message) {
  if (!message) {
    errorSlot.replaceChildren();
    return;
  }
  errorSlot.replaceChildren(enter(h("p", { class: "error home-error", role: "alert" }, message), { y: 6, kind: "fade" }));
}

function renderRecent() {
  if (!recentSlot) return;
  if (!recent.length) {
    recentSlot.replaceChildren();
    return;
  }
  recentSlot.replaceChildren(
    h(
      "section",
      { class: "recent", "aria-labelledby": "recent-h" },
      h("h2", { id: "recent-h", class: "section-kicker" }, "Recently explained"),
      h(
        "ul",
        null,
        recent.map((r, i) =>
          reveal(
            h(
              "li",
              null,
              h(
                "a",
                { href: `/r/${r.reportId}`, class: "recent-card" },
                h("img", { src: r.avatarUrl, alt: "", width: 36, height: 36 }),
                h("span", { class: "rc-main" }, h("span", { class: "rc-name" }, r.fullName), h("span", { class: "rc-line" }, r.oneLiner)),
                h("span", { class: "rc-meta" }, r.language && h("span", null, r.language), h("span", null, ago(r.generatedAt))),
                icon("arrow", 16, "rc-arrow"),
              ),
            ),
            { delay: i * 0.05, y: 16 },
          ),
        ),
      ),
    ),
  );
}

function intro() {
  input = repoInput({ onStart: start, initial });
  recentSlot = h("div", { style: "display: contents" });
  const el = h(
    "div",
    { class: "home-intro" },
    h(
      "section",
      { class: "home-hero" },
      enter(h("p", { class: "kicker" }, h("span", { class: "kicker-dot", "aria-hidden": "true" }), " Repo explainer"), { y: 10 }),
      splitText("Understand *any GitHub repo* in a minute.", { tag: "h1", className: "display", delay: 0.1 }),
      enter(
        h(
          "p",
          { class: "home-sub" },
          "Paste a link, or type a username and repo name. You get what it does, the tech behind it, the work that went into it, and a preview of what it produces. All of it is read from the code itself.",
        ),
        { y: 14, delay: 0.55 },
      ),
      enter(h("div", null, input.el), { y: 18, delay: 0.7 }),
      errorSlot,
    ),
    h(
      "section",
      { class: "covers", "aria-labelledby": "covers-h" },
      h("h2", { id: "covers-h", class: "section-kicker" }, "What the report covers"),
      h(
        "ul",
        null,
        COVERS.map((c, i) =>
          reveal(
            h(
              "li",
              null,
              h("span", { class: "cover-icon" }, icon(c.icon, 18)),
              h("h3", null, c.title),
              h("p", null, c.body),
            ),
            { delay: i * 0.06, y: 24 },
          ),
        ),
      ),
    ),
    recentSlot,
  );
  renderRecent();
  return el;
}

// ---- run view: live analysis progress ----
function runView(name) {
  const progress = analysisProgress({
    fullName: name,
    onRetry: () => {
      const t = target;
      showIntro();
      if (t) void start(t.input, t.branch);
    },
  });
  stopWatching?.();
  stopWatching = watchExplainJob(jobId, (job) => {
    progress.update(job);
    // When the report is ready, give the last check mark a beat, then open it.
    if (job.status === "done" && job.reportId) {
      clearTimeout(openTimer);
      openTimer = setTimeout(() => openReport(job.reportId), reducedMotion() ? 0 : 900);
    }
  });
  return h(
    "div",
    { class: "home-run" },
    progress.el,
    h("button", { type: "button", class: "ghost back-btn", onclick: showIntro }, "← Back"),
  );
}

/** Swaps the intro for the run view, letting the intro fade out first (AnimatePresence mode="wait"). */
function showRun(name) {
  const swap = () => render(root, runView(name));
  if (introEl && !reducedMotion()) {
    introEl.classList.add("leave");
    setTimeout(swap, 500);
  } else swap();
  introEl = null;
}

function showIntro() {
  jobId = null;
  stopWatching?.();
  stopWatching = null;
  clearTimeout(openTimer);
  introEl = intro();
  render(root, introEl);
}

async function start(inp, branch) {
  input?.setBusy(true);
  showError(null);
  const p = "url" in inp ? parseLink(inp.url) : inp;
  const name = p ? `${p.owner}/${p.repo}` : "repository";
  try {
    const res = await api.startExplain({ ...inp, branch });
    if (res.reportId) {
      openReport(res.reportId);
      return;
    }
    target = { input: inp, branch, name };
    jobId = res.jobId;
    window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
    showRun(name);
  } catch (e) {
    showError(e.message);
  } finally {
    input?.setBusy(false);
  }
}

// ---- boot: ?repo= prefills the input, ?repo=&job= resumes a running analysis ----
const params = new URLSearchParams(location.search);
const q = params.get("repo");
if (q) initial = q.includes("github.com") ? q : `https://github.com/${q}`;
const j = params.get("job");
if (j && q) {
  const [owner, repo] = q.replace(/^https?:\/\/github\.com\//, "").split("/");
  target = { input: { owner, repo }, name: `${owner}/${repo}` };
  jobId = j;
  render(root, runView(target.name));
} else {
  showIntro();
}

api
  .recentReports()
  .then((r) => {
    recent = r;
    renderRecent();
  })
  .catch(() => {});
