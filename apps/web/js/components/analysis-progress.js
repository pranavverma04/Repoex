// Live view of a repo-explainer job: stage checklist, progress ring and a streaming log.
// Plain-JS port of components/explain/AnalysisProgress.tsx.
import { h, reducedMotion, render } from "../dom.js";
import { enter } from "../ui.js";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * @param {{ fullName: string, onRetry: () => void }} opts
 * @returns {{ el: HTMLElement, update: (job: object | null) => void }}
 */
export function analysisProgress({ fullName, onRetry }) {
  const kicker = h("p", { class: "kicker" });
  const titleEl = h("h2", { class: "an-title" });

  // progress ring: pathLength=1 lets the dash offset be the unfinished fraction
  const ringFg = h("circle", {
    cx: 32,
    cy: 32,
    r: 27,
    class: "an-ring-fg",
    pathLength: 1,
    "stroke-dasharray": "1 1",
    "stroke-dashoffset": 1,
    style: reducedMotion() ? null : `transition: stroke-dashoffset 0.8s ${EASE}`,
  });
  const ringPct = h("span");
  const ring = h(
    "div",
    { class: "an-ring" },
    h("svg", { viewBox: "0 0 64 64", width: 64, height: 64 }, h("circle", { cx: 32, cy: 32, r: 27, class: "an-ring-bg" }), ringFg),
    ringPct,
  );

  const stagesEl = h("ol", { class: "stages" });
  const logEl = h("ol");
  const errorSlot = h("div", { style: "display: contents" });

  const el = h(
    "section",
    { class: "analysis", "aria-live": "polite" },
    h("header", { class: "an-head" }, h("div", null, kicker, titleEl), ring),
    h(
      "div",
      { class: "an-body" },
      stagesEl,
      h(
        "div",
        { class: "an-log", "aria-label": "Live log" },
        h("div", { class: "term-bar", "aria-hidden": "true" }, h("i"), h("i"), h("i"), h("span", null, "analysis.log")),
        logEl,
      ),
    ),
    errorSlot,
  );
  enter(el, { y: 30, blur: true });

  let name = fullName;
  const stageEls = new Map(); // stage key -> { li, detail, ... }
  let logCount = 0;
  let cursorLine = null;
  let errorShown = false;

  function placeholderStages() {
    render(
      stagesEl,
      Array.from({ length: 7 }, (_, i) =>
        h(
          "li",
          { class: "stage st-pending" },
          h(
            "span",
            { class: "st-node", "aria-hidden": "true" },
            h("svg", { viewBox: "0 0 28 28", width: 28, height: 28 }, h("circle", { cx: 14, cy: 14, r: 12, class: "st-disc" })),
          ),
          h("span", { class: "sk", style: { width: `${40 + ((i * 37) % 35)}%`, height: "12px" } }),
        ),
      ),
    );
  }

  function stageItem(s, i, last) {
    const svg = h("svg", { viewBox: "0 0 28 28", width: 28, height: 28 }, h("circle", { cx: 14, cy: 14, r: 12, class: "st-disc" }));
    const railFill = h("span", {
      class: "st-rail-fill",
      style: `transform: scaleY(0)${reducedMotion() ? "" : `; transition: transform 0.6s ${EASE}`}`,
    });
    const node = h("span", { class: "st-node", "aria-hidden": "true" }, !last && h("span", { class: "st-rail" }, railFill), svg);
    const detailSlot = h("span", { style: "display: contents" });
    const li = h("li", { class: "stage" }, node, h("div", { class: "st-text" }, h("span", { class: "st-label" }, s.label), detailSlot));
    if (!reducedMotion()) {
      enter(li, { delay: 0.15 + i * 0.07, y: 0 });
      li.style.setProperty("--x", "-14px");
    }
    return { li, svg, railFill, detailSlot, status: null, detail: undefined, last };
  }

  function updateStage(item, s) {
    item.li.className = `stage st-${s.status}${item.li.classList.contains("enter") ? " enter" : ""}`;
    if (item.status !== s.status) {
      item.status = s.status;
      item.railFill.style.transform = `scaleY(${s.status === "done" || s.status === "skipped" ? 1 : 0})`;
      // disc stays; swap the status mark
      while (item.svg.childNodes.length > 1) item.svg.lastChild.remove();
      if (s.status === "active") item.svg.append(h("circle", { cx: 14, cy: 14, r: 12, class: "st-orbit" }));
      if (s.status === "done") {
        const check = h("path", { d: "M8.5 14.5l3.6 3.6L19.5 10", class: "st-check", pathLength: 1, "stroke-dasharray": "1 1" });
        item.svg.append(check);
        if (!reducedMotion()) {
          check.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 450, easing: EASE, fill: "both" });
        }
      }
      if (s.status === "failed") item.svg.append(h("path", { d: "M10 10l8 8M18 10l-8 8", class: "st-x" }));
    }
    if (item.detail !== s.detail) {
      item.detail = s.detail;
      if (s.detail) {
        const d = h("span", { class: "st-detail" }, s.detail);
        if (!reducedMotion()) d.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 300 });
        item.detailSlot.replaceChildren(d);
      } else item.detailSlot.replaceChildren();
    }
  }

  function update(job) {
    const stages = job?.stages ?? [];
    const progress = job?.progress ?? 4;
    const failed = job?.status === "failed";
    const running = !failed && job?.status !== "done";
    if (job?.fullName) name = job.fullName;

    el.className = `analysis${failed ? " failed" : ""}${el.classList.contains("enter") ? " enter blur" : ""}`;
    kicker.textContent = failed ? "Stopped" : job?.status === "done" ? "Done" : "Reading the repository";
    render(titleEl, `${name.split("/")[0]}/`, h("b", null, name.split("/")[1]));
    ring.setAttribute("aria-label", `${progress}% done`);
    ringFg.setAttribute("stroke-dashoffset", String(1 - progress / 100));
    ringPct.textContent = `${progress}%`;

    // stages, keyed so each one animates in once and then only changes state
    if (!stages.length) {
      if (stageEls.size || !stagesEl.childNodes.length) {
        stageEls.clear();
        placeholderStages();
      }
    } else {
      if (stages.some((s) => !stageEls.has(s.key)) || stageEls.size !== stages.length) {
        const next = new Map();
        stages.forEach((s, i) => next.set(s.key, stageEls.get(s.key) ?? stageItem(s, i, i === stages.length - 1)));
        stageEls.clear();
        next.forEach((v, k) => stageEls.set(k, v));
        render(stagesEl, [...stageEls.values()].map((x) => x.li));
      }
      for (const s of stages) updateStage(stageEls.get(s.key), s);
    }

    // log: append only the new lines, then keep the view pinned to the bottom
    const log = job?.log ?? [];
    if (log.length < logCount) {
      logEl.replaceChildren();
      logCount = 0;
      cursorLine = null;
    }
    const added = log.slice(logCount);
    for (const l of added) {
      const li = h(
        "li",
        null,
        h("span", { class: "t" }, new Date(l.at).toLocaleTimeString([], { hour12: false })),
        ` ${l.text}`,
      );
      if (!reducedMotion()) li.animate([{ opacity: 0, transform: "translateX(-6px)" }, { opacity: 1, transform: "none" }], { duration: 300 });
      if (cursorLine) logEl.insertBefore(li, cursorLine);
      else logEl.append(li);
    }
    logCount = log.length;
    if (running && !cursorLine) {
      cursorLine = h("li", { class: "cursor-line", "aria-hidden": "true" }, h("span", { class: "cursor" }));
      logEl.append(cursorLine);
    } else if (!running && cursorLine) {
      cursorLine.remove();
      cursorLine = null;
    }
    if (added.length) logEl.scrollTo({ top: logEl.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });

    if (failed && !errorShown) {
      errorShown = true;
      errorSlot.replaceChildren(
        enter(
          h("div", { class: "an-error", role: "alert" }, h("p", null, job?.error), h("button", { type: "button", onclick: onRetry }, "Try again")),
          { y: 8 },
        ),
      );
    } else if (!failed && errorShown) {
      errorShown = false;
      errorSlot.replaceChildren();
    }
  }

  update(null);
  return { el, update };
}
