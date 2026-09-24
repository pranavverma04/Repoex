// /ask — list of repositories indexed for code-graph Q&A, plus the form to index a new one.
import { api } from "../api.js";
import { h, render } from "../dom.js";
import { mountLayout } from "../layout.js";
import { statusPill } from "../components/status-pill.js";

const EXAMPLES = ["pallets/itsdangerous", "sindresorhus/ky", "pallets/click"];

mountLayout();
const main = document.getElementById("main");

let repos = null;
let error = null;
let notice = null;
let submitting = false;
let pollTimer = 0;

const input = h("input", {
  id: "repo-url",
  placeholder: "https://github.com/owner/repo",
  autocomplete: "off",
  spellcheck: "false",
});
const submitBtn = h("button", { type: "submit", disabled: true }, "Index repository");
const messages = h("div");
const list = h("section", { class: "repo-list" });

const syncSubmit = () => {
  submitBtn.disabled = submitting || !input.value.trim();
  submitBtn.textContent = submitting ? "Checking…" : "Index repository";
};
input.addEventListener("input", syncSubmit);

const form = h(
  "form",
  { class: "submit" },
  h("label", { for: "repo-url", class: "sr-only" }, "GitHub repository URL"),
  input,
  submitBtn,
);
form.addEventListener("submit", submit);

function renderMessages() {
  render(messages, error && h("p", { class: "error" }, error), notice && h("p", { class: "notice" }, notice));
}

function renderList() {
  render(
    list,
    h("h2", null, "Indexed repositories"),
    repos === null && !error && h("p", { class: "muted" }, "Loading…"),
    repos?.length === 0 && h("p", { class: "muted" }, "Nothing indexed yet. Submit a repository above to start."),
    h(
      "ul",
      null,
      (repos ?? []).map((r) =>
        h(
          "li",
          { class: "repo-row" },
          h(
            "div",
            { class: "repo-main" },
            h("a", { href: `/ask/${r.repoId}`, class: "repo-name" }, `${r.owner}/`, h("strong", null, r.name)),
            h(
              "div",
              { class: "repo-meta" },
              statusPill(r.status),
              h("span", null, `${r.fileCount ?? 0} files`),
              h("span", null, `${r.symbolCount ?? 0} symbols`),
              h("span", null, `${r.edgeCount ?? 0} edges`),
              r.lastCommitSha && h("code", null, r.lastCommitSha.slice(0, 7)),
            ),
          ),
          h(
            "div",
            { class: "repo-actions" },
            h("button", { class: "ghost", onclick: () => refresh(r), disabled: r.status === "indexing" }, "Refresh"),
            h("a", { class: "button", href: `/ask/${r.repoId}` }, "Open chat"),
          ),
        ),
      ),
    ),
  );
}

function load() {
  api
    .listRepos()
    .then((data) => {
      repos = data;
      renderList();
      // keep statuses fresh while anything is indexing
      clearTimeout(pollTimer);
      if (repos.some((r) => r.status === "indexing" || r.status === "pending")) pollTimer = setTimeout(load, 2000);
    })
    .catch((e) => {
      error = e.message;
      renderMessages();
      renderList();
    });
}

async function submit(e) {
  e.preventDefault();
  const url = input.value.trim();
  if (!url) return;
  submitting = true;
  error = null;
  notice = null;
  syncSubmit();
  renderMessages();
  try {
    const res = await api.submitRepo(url);
    location.href = `/ask/${res.repoId}${res.jobId ? `?job=${res.jobId}` : ""}`;
  } catch (err) {
    error = err.message;
    submitting = false;
    syncSubmit();
    renderMessages();
  }
}

async function refresh(repo) {
  notice = null;
  error = null;
  renderMessages();
  try {
    const res = await api.refresh(repo.repoId);
    if (res.jobId) location.href = `/ask/${repo.repoId}?job=${res.jobId}`;
    else {
      notice = `${repo.owner}/${repo.name}: ${res.message}`;
      renderMessages();
    }
  } catch (err) {
    error = err.message;
    renderMessages();
  }
}

render(
  main,
  h(
    "div",
    { class: "page home" },
    h(
      "section",
      { class: "hero" },
      h("h1", null, "Ask a codebase how it works."),
      h(
        "p",
        { class: "lede" },
        "Paste a public GitHub repository. It gets parsed into a graph of functions, classes, calls and imports, and " +
          "every answer is built from the real source lines it cites. No embeddings, no guessing.",
      ),
      form,
      h(
        "p",
        { class: "examples" },
        "Try ",
        EXAMPLES.map((ex, i) =>
          h(
            "span",
            null,
            h(
              "button",
              {
                type: "button",
                class: "linkish",
                onclick: () => {
                  input.value = `https://github.com/${ex}`;
                  syncSubmit();
                },
              },
              ex,
            ),
            i < EXAMPLES.length - 1 ? ", " : "",
          ),
        ),
      ),
      messages,
    ),
    list,
  ),
);
renderList();
load();
