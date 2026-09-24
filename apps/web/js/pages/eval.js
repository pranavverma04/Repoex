// /eval — retrieval eval results, and a button to run the suite again.
import { api } from "../api.js";
import { h, render } from "../dom.js";
import { mountLayout } from "../layout.js";

mountLayout();
const main = document.getElementById("main");

let runs = null;
let running = false;
let error = null;

const runBtn = h("button", { onclick: run }, "Run eval suite");
const body = h("div");

async function run() {
  running = true;
  error = null;
  draw();
  try {
    runs = await api.runEval();
  } catch (err) {
    error = err.message;
  } finally {
    running = false;
    draw();
  }
}

function repoSection(r) {
  return h(
    "section",
    { class: "eval-repo" },
    h(
      "h2",
      null,
      r.repoUrl.replace("https://github.com/", ""),
      h("span", { class: `score ${r.passed === r.total ? "ok" : "warn"}` }, `${r.passed}/${r.total} passed`),
      h("span", { class: "muted small" }, `avg ${r.avgLatencyMs} ms`),
    ),
    h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        null,
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, "Result"),
            h("th", null, "Question"),
            h("th", null, "Expected"),
            h("th", null, "Top retrieved"),
            h("th", { class: "num" }, "Answer overlap"),
            h("th", { class: "num" }, "Latency"),
          ),
        ),
        h(
          "tbody",
          null,
          r.results.map((q) =>
            h(
              "tr",
              null,
              h("td", null, h("span", { class: `pill ${q.passed ? "pill-ready" : "pill-failed"}` }, q.passed ? "Pass" : "Fail")),
              h("td", null, q.question),
              h("td", null, h("code", null, q.expectedSymbols.join(", "))),
              h("td", { class: "small" }, q.retrieved.slice(0, 4).join(", ")),
              h("td", { class: "num" }, `${Math.round(q.answerScore * 100)}%`),
              h("td", { class: "num" }, `${q.latencyMs} ms`),
            ),
          ),
        ),
      ),
    ),
  );
}

function draw() {
  runBtn.disabled = running;
  runBtn.textContent = running ? "Running… (indexes sample repos first)" : "Run eval suite";
  render(
    body,
    error && h("p", { class: "error" }, error),
    runs?.length === 0 && h("p", { class: "muted" }, "No eval runs yet."),
    (runs ?? []).map(repoSection),
  );
}

render(
  main,
  h(
    "div",
    { class: "page eval-page" },
    h(
      "div",
      { class: "eval-head" },
      h(
        "div",
        null,
        h("h1", null, "Retrieval eval"),
        h(
          "p",
          { class: "muted" },
          "Hand-written questions per sample repository, run through the real retrieval and agent pipeline with the " +
            "cache bypassed. A question passes when every expected symbol shows up in the retrieved context.",
        ),
      ),
      runBtn,
    ),
    body,
  ),
);
draw();
api
  .latestEval()
  .then((data) => {
    runs = data;
    draw();
  })
  .catch((e) => {
    error = e.message;
    draw();
  });
