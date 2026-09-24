import { h } from "../dom.js";

const STEPS = ["queued", "cloning", "parsing", "indexing", "done"];

/** Progress card for an indexing/refresh job. Re-render with a fresh job to update it. */
export function jobProgress(job) {
  const failed = job.status === "failed";
  const current = failed ? -1 : STEPS.indexOf(job.status);
  return h(
    "div",
    { class: `progress ${failed ? "is-failed" : ""}`, role: "status", "aria-live": "polite" },
    h(
      "div",
      { class: "progress-head" },
      h("span", { class: "progress-label" }, job.type === "refresh" ? "Refreshing" : "Indexing"),
      h("span", { class: "progress-pct" }, `${job.progress}%`),
    ),
    h("div", { class: "bar", "aria-hidden": "true" }, h("div", { class: "bar-fill", style: { width: `${failed ? 100 : job.progress}%` } })),
    h(
      "ol",
      { class: "steps" },
      STEPS.map((s, i) => h("li", { class: i < current ? "past" : i === current ? "now" : "" }, s)),
    ),
    h("p", { class: "progress-msg" }, failed ? job.error : job.message),
  );
}
