// "Save a copy" dialog: clones the repo onto this computer with git, into a folder the
// user names. Port of components/explain/CloneDialog.tsx.
import { api } from "../api.js";
import { h, render, reducedMotion } from "../dom.js";
import { copyButton, enter, icon } from "../ui.js";

const NAME_OK = /^[\w.@+-][\w .@+-]*$/;
const LAST_BASE = "ara:clone-base";
let uid = 0;

function nameProblem(n) {
  if (!n.trim()) return "Give the folder a name.";
  if (n.startsWith(".")) return "Don't start the name with a dot.";
  if (!NAME_OK.test(n)) return "Use letters, numbers, spaces, dots, dashes or underscores. No slashes.";
  return null;
}

/** Opens the dialog for `report`. `onSaved(job)` fires once a clone finishes. Returns close(). */
export function openCloneDialog(report, { onSaved } = {}) {
  const r = report;
  const n = ++uid;
  const ids = { name: `cd-name-${n}`, custom: `cd-custom-${n}`, branch: `cd-branch-${n}`, title: `cd-title-${n}` };
  const state = {
    locations: null,
    base: "",
    custom: "",
    useCustom: false,
    name: r.repo.name,
    branch: r.branch,
    shallow: false,
    target: null,
    checkError: null,
    job: null,
    startError: null,
    starting: false,
  };
  const opener = document.activeElement;
  let pollTimer = 0;
  let checkTimer = 0;
  let checkCtl = null;
  let closed = false;

  const phase = () =>
    state.job?.status === "done" ? "done" : state.job?.status === "failed" ? "failed" : state.job ? "running" : "form";
  const chosenBase = () => (state.useCustom ? state.custom : state.base);

  // --- form (built once so inputs keep focus; dynamic bits are updated in place) ---
  const nameInput = h("input", {
    id: ids.name,
    value: state.name,
    spellcheck: "false",
    autocomplete: "off",
    autocapitalize: "off",
    oninput: (e) => {
      state.name = e.target.value;
      scheduleCheck();
    },
  });
  const nameBox = h("div", { class: "dlg-input" }, icon("folder", 16), nameInput);
  const nameHint = h("p", { class: "dlg-hint", "aria-live": "polite" });
  const chips = h("div", { class: "loc-chips", role: "radiogroup", "aria-label": "Save in" });
  const customInput = h("input", {
    id: ids.custom,
    value: "",
    placeholder: "~/Projects",
    spellcheck: "false",
    autocomplete: "off",
    oninput: (e) => {
      state.custom = e.target.value;
      scheduleCheck();
    },
  });
  const customBox = h(
    "div",
    { class: "dlg-input custom", hidden: true },
    h("label", { for: ids.custom, class: "sr-only" }, "Folder path"),
    customInput,
  );
  const branchSelect = h(
    "select",
    { id: ids.branch, onchange: (e) => (state.branch = e.target.value) },
    (r.branches.length ? r.branches : [r.branch]).map((b) => h("option", { value: b, selected: b === state.branch }, b)),
  );
  const history = h("div", { class: "toggle", role: "radiogroup", "aria-label": "History" });
  const destCode = h("code");
  const destWarn = h("span", { class: "warn small" });
  const startErrorEl = h("p", { class: "error dlg-error", role: "alert", hidden: true });
  const submitBtn = h("button", { type: "submit" });

  const form = h(
    "form",
    { class: "dlg-body", onsubmit: start },
    h("div", { class: "dlg-field" }, h("label", { for: ids.name }, "Folder name"), nameBox, nameHint),
    h("div", { class: "dlg-field" }, h("span", { class: "dlg-label" }, "Save in"), chips, customBox),
    h(
      "div",
      { class: "dlg-row" },
      h(
        "div",
        { class: "dlg-field" },
        h("label", { for: ids.branch }, "Branch"),
        h("div", { class: "select" }, branchSelect, icon("chevron", 14, "select-chev")),
      ),
      h("div", { class: "dlg-field" }, h("span", { class: "dlg-label" }, "History"), history),
    ),
    h("div", { class: "dlg-dest", "aria-live": "polite" }, h("span", { class: "dlg-label" }, "It will be saved at"), destCode, destWarn),
    startErrorEl,
    h(
      "div",
      { class: "dlg-actions" },
      h("button", { type: "button", class: "ghost", onclick: close }, "Cancel"),
      submitBtn,
    ),
  );

  function updateForm() {
    const problem = nameProblem(state.name);
    const t = state.target;
    nameBox.className = `dlg-input${problem || t?.exists ? " bad" : t ? " ok" : ""}`;
    if (problem) render(nameHint, h("span", { class: "warn" }, problem));
    else if (t?.exists)
      render(
        nameHint,
        h(
          "span",
          { class: "warn" },
          "A folder with this name is already there. ",
          t.suggestion &&
            h(
              "button",
              {
                type: "button",
                class: "linkish",
                onclick: () => {
                  state.name = t.suggestion;
                  nameInput.value = t.suggestion;
                  scheduleCheck();
                },
              },
              `Use ${t.suggestion}`,
            ),
        ),
      );
    else render(nameHint, "The repo's files go inside a new folder with this name.");

    const chip = (label, on, onclick) =>
      h(
        "button",
        { type: "button", role: "radio", "aria-checked": String(on), class: on ? "on" : "", onclick },
        on && h("span", { class: "loc-pill" }),
        h("span", { class: "loc-label" }, label),
      );
    render(
      chips,
      (state.locations ?? []).map((l) =>
        chip(l.label, !state.useCustom && state.base === l.path, () => {
          state.useCustom = false;
          state.base = l.path;
          scheduleCheck();
        }),
      ),
      chip("Other folder…", state.useCustom, () => {
        const was = state.useCustom;
        state.useCustom = true;
        scheduleCheck();
        if (!was) setTimeout(() => customInput.focus(), 0);
      }),
    );
    customBox.hidden = !state.useCustom;

    render(
      history,
      [
        [false, "Full history"],
        [true, "Latest only"],
      ].map(([v, label]) =>
        h(
          "button",
          {
            type: "button",
            role: "radio",
            "aria-checked": String(state.shallow === v),
            class: state.shallow === v ? "on" : "",
            onclick: () => {
              state.shallow = v;
              updateForm();
            },
          },
          state.shallow === v && h("span", { class: "toggle-pill" }),
          h("span", null, label),
        ),
      ),
    );

    destCode.textContent = state.checkError ? "…" : (t?.display ?? (problem ? "…" : "checking…"));
    destWarn.textContent = state.checkError ?? "";
    destWarn.hidden = !state.checkError;
    startErrorEl.textContent = state.startError ?? "";
    startErrorEl.hidden = !state.startError;
    submitBtn.disabled = !(!problem && !!t && !t.exists && !state.starting);
    render(submitBtn, icon("download", 16), ` ${state.starting ? "Starting…" : "Clone here"}`);
  }

  // live check: where it lands and whether the name is free
  function scheduleCheck() {
    clearTimeout(checkTimer);
    checkCtl?.abort();
    state.target = null;
    state.checkError = null;
    updateForm();
    const base = chosenBase();
    if (closed || nameProblem(state.name) || !base.trim()) return;
    const ctl = (checkCtl = new AbortController());
    const name = state.name;
    checkTimer = setTimeout(() => {
      api
        .cloneCheck(base, name, ctl.signal)
        .then((t) => {
          if (ctl.signal.aborted) return;
          state.target = t;
          updateForm();
        })
        .catch((e) => {
          if (ctl.signal.aborted) return;
          state.checkError = e.message;
          updateForm();
        });
    }, 250);
  }

  async function start(e) {
    e?.preventDefault();
    if (nameProblem(state.name) || !state.target || state.target.exists) return;
    state.starting = true;
    state.startError = null;
    updateForm();
    try {
      const j = await api.startClone(r.reportId, {
        base: chosenBase(),
        name: state.name,
        branch: state.branch,
        shallow: state.shallow,
      });
      try {
        localStorage.setItem(LAST_BASE, chosenBase());
      } catch {}
      state.starting = false;
      setJob(j);
    } catch (err) {
      state.starting = false;
      state.startError = err.message;
      updateForm();
    }
  }

  // --- progress view ---
  const progressHost = h("div", { class: "dlg-body" });

  function setJob(job) {
    const before = state.job?.status;
    state.job = job;
    clearInterval(pollTimer);
    if (job?.status === "running")
      pollTimer = setInterval(() => {
        if (closed || !state.job) return clearInterval(pollTimer);
        api
          .cloneJob(state.job.jobId)
          .then((j) => !closed && setJob(j))
          .catch(() => {});
      }, 400);
    if (job?.status === "done" && before !== "done") onSaved?.(job);
    showBody();
  }

  function renderProgress() {
    const job = state.job;
    const p = phase();
    const seconds = job.finishedAt ? ((job.finishedAt - job.startedAt) / 1000).toFixed(1) : null;
    const kind = job.shallow ? "Latest version" : "Full history";
    render(
      progressHost,
      h(
        "div",
        { class: `clone-status st-${p}` },
        h(
          "div",
          { class: "cs-ring", "aria-hidden": "true" },
          h(
            "svg",
            { viewBox: "0 0 64 64", width: 64, height: 64 },
            h("circle", { cx: 32, cy: 32, r: 27, class: "an-ring-bg" }),
            h("circle", {
              cx: 32,
              cy: 32,
              r: 27,
              class: "an-ring-fg",
              pathLength: 1,
              style: `stroke-dasharray: ${job.percent / 100} 1; transition: stroke-dasharray .5s var(--ease-out)`,
            }),
          ),
          p === "done"
            ? h(
                "svg",
                { viewBox: "0 0 24 24", width: 24, height: 24, class: "cs-check" },
                h("path", { d: "M5 12.5l4.2 4.2L19 7", class: "draw", style: "stroke-dasharray: 22; animation: draw-stroke .45s var(--ease-out) both" }),
              )
            : h("span", null, `${job.percent}%`),
        ),
        h(
          "div",
          null,
          h("h3", null, p === "done" ? "Saved" : p === "failed" ? "Clone failed" : job.phase),
          h(
            "p",
            { class: "muted small" },
            p === "done"
              ? `${kind} of ${job.branch}${job.sizeLabel ? `, ${job.sizeLabel}` : ""}, in ${seconds}s`
              : p === "failed"
                ? job.error
                : `${kind} of ${job.branch}${job.sizeLabel ? ` · ${job.sizeLabel}` : ""}`,
          ),
        ),
      ),
      h(
        "div",
        { class: "cs-bar", "aria-hidden": "true" },
        h("span", { style: `transform: scaleX(${job.percent / 100}); transition: transform .4s var(--ease-out)` }),
      ),
      h(
        "div",
        { class: "dlg-dest" },
        h("span", { class: "dlg-label" }, p === "done" ? "Saved at" : "Saving to"),
        h("code", null, job.display),
      ),
      job.log.length > 0 &&
        h(
          "pre",
          { class: "cs-log" },
          job.log.slice(-6).map((l) => h("span", null, l)),
        ),
      h(
        "div",
        { class: "dlg-actions" },
        p === "done" && [
          copyButton(`cd "${job.dest}"`, "Copy cd command"),
          h(
            "button",
            { type: "button", class: "ghost", onclick: () => api.openTerminal(job.jobId).catch(() => {}) },
            icon("terminal", 15),
            " Open Terminal here",
          ),
          h(
            "button",
            { type: "button", class: "ghost", onclick: () => api.revealClone(job.jobId).catch(() => {}) },
            icon("folder", 15),
            " Show in Finder",
          ),
          h("button", { type: "button", onclick: close }, "Done"),
        ],
        p === "failed" && [
          h("button", { type: "button", class: "ghost", onclick: close }, "Close"),
          h("button", { type: "button", onclick: () => setJob(null) }, "Try again"),
        ],
        p === "running" && h("span", { class: "muted small" }, "Keep this open until it finishes."),
      ),
    );
  }

  // --- shell ---
  const closeX = h("button", { type: "button", class: "dlg-x", onclick: close, "aria-label": "Close" }, "×");
  const bodyHost = h("div");
  const panel = h(
    "div",
    { class: "dlg", role: "dialog", "aria-modal": "true", "aria-labelledby": ids.title },
    h(
      "header",
      { class: "dlg-head" },
      h("span", { class: "dlg-icon" }, icon("download", 18)),
      h(
        "div",
        null,
        h("h2", { id: ids.title }, "Save a copy"),
        h("p", { class: "muted small" }, "Clones ", h("b", null, r.repo.fullName), " onto this computer with git. Nothing from the repo runs."),
      ),
      closeX,
    ),
    bodyHost,
  );
  const backdrop = h(
    "div",
    {
      class: "dlg-backdrop enter fade",
      style: "--dur: .25s",
      onmousedown: (e) => {
        if (e.target === backdrop && phase() !== "running") close();
      },
    },
    panel,
  );
  if (!reducedMotion()) enter(panel, { y: 28, blur: true, delay: 0 }).style.setProperty("--dur", ".4s");

  let shown = null;
  function showBody() {
    const p = phase();
    closeX.hidden = p === "running";
    const want = p === "form" ? form : progressHost;
    if (p === "form") updateForm();
    else renderProgress();
    if (shown !== want) {
      shown = want;
      render(bodyHost, want);
      enter(want, { y: 0 }).style.setProperty("--x", "16px");
      want.style.setProperty("--dur", ".28s");
      // restart the entrance animation when switching between form and progress
      want.classList.remove("enter");
      void want.offsetWidth;
      want.classList.add("enter");
    }
  }

  // Esc closes (not while cloning); keep focus inside the dialog
  function onKey(e) {
    if (e.key === "Escape" && phase() !== "running") close();
    if (e.key === "Tab") {
      const f = [...panel.querySelectorAll("button, input, select, a[href]")].filter(
        (x) => !x.hasAttribute("disabled") && !x.closest("[hidden]"),
      );
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    clearInterval(pollTimer);
    clearTimeout(checkTimer);
    checkCtl?.abort();
    window.removeEventListener("keydown", onKey);
    backdrop.style.transition = "opacity .25s";
    backdrop.style.opacity = "0";
    backdrop.style.pointerEvents = "none";
    setTimeout(() => backdrop.remove(), reducedMotion() ? 0 : 250);
    if (opener && typeof opener.focus === "function" && opener.isConnected) opener.focus();
  }

  window.addEventListener("keydown", onKey);
  document.body.append(backdrop);
  showBody();

  api
    .cloneLocations()
    .then((l) => {
      if (closed) return;
      state.locations = l;
      let saved = null;
      try {
        saved = localStorage.getItem(LAST_BASE);
      } catch {}
      const known = l.find((x) => x.path === saved);
      if (saved && !known) {
        state.useCustom = true;
        state.custom = saved;
        customInput.value = saved;
      } else state.base = known?.path ?? l.find((x) => x.label === "Downloads")?.path ?? l[0]?.path ?? "";
      scheduleCheck();
    })
    .catch((e) => {
      state.checkError = e.message;
      updateForm();
    });
  setTimeout(() => nameInput.select(), 60);

  return close;
}
