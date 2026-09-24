// Report page (/r/:id): header with repo facts and actions, then one tab per section.
// Tabs live in the URL hash (#stack) so back/forward and shared links open the right one.
import { api } from "../api.js";
import { h, pathId, render, reducedMotion } from "../dom.js";
import { mountLayout } from "../layout.js";
import { ago, compact, copyButton, countUp, enter, icon, reveal, splitText, toast } from "../ui.js";
import { openCloneDialog } from "../components/clone-dialog.js";
import { mockSection } from "../components/mock.js";
import { runSection } from "../components/run.js";
import { stackSection } from "../components/stack.js";
import { structureSection } from "../components/structure.js";
import { workSection } from "../components/work.js";

const KIND_LABEL = {
  web: "Web app",
  api: "API",
  cli: "CLI tool",
  library: "Library",
  mobile: "Mobile app",
  desktop: "Desktop app",
  data: "Data / ML",
  infra: "Infrastructure",
  docs: "Documentation",
  other: "Project",
};

const TAB_IDS = ["overview", "stack", "structure", "work", "run", "mock"];
const isTab = (s) => TAB_IDS.includes(s);

function tabsFor(r) {
  const tools = r.stack.groups.reduce((n, g) => n + g.items.length, 0);
  const mockCount = [r.mock.web, r.mock.api, r.mock.cli, r.mock.library].filter(Boolean).length;
  return [
    { id: "overview", label: "Overview", icon: "spark", count: null },
    { id: "stack", label: "Tech stack", icon: "tag", count: tools ? String(tools) : null },
    { id: "structure", label: "Structure", icon: "folder", count: compact(r.structure.totalFiles) },
    { id: "work", label: "Work done", icon: "commit", count: compact(r.work.commitsAnalyzed) },
    { id: "run", label: "How to run", icon: "play", count: String(r.run.steps.length) },
    { id: "mock", label: "Mock output", icon: "browser", count: mockCount ? String(mockCount) : null },
  ];
}

function overview(r) {
  let level = "plain";
  const card = h("div", { class: "card overview-card" });
  const text = () =>
    enter(h("p", { class: "overview-text", style: { "--dur": "0.35s" } }, level === "plain" ? r.overview.plain : r.overview.technical), {
      y: 10,
      blur: true,
    });
  let current = h("p", { class: "overview-text" }, r.overview.plain);

  const buttons = [
    ["plain", "In plain words"],
    ["technical", "For developers"],
  ].map(([k, label]) =>
    h(
      "button",
      {
        type: "button",
        role: "tab",
        "aria-selected": String(level === k),
        class: level === k ? "on" : "",
        onclick: () => {
          if (level === k) return;
          level = k;
          for (const b of buttons) {
            const on = b.dataset.level === level;
            b.classList.toggle("on", on);
            b.setAttribute("aria-selected", String(on));
            b.querySelector(".toggle-pill")?.remove();
            if (on) b.prepend(h("span", { class: "toggle-pill" }));
          }
          const next = text();
          current.replaceWith(next);
          current = next;
        },
        dataset: { level: k },
      },
      level === k && h("span", { class: "toggle-pill" }),
      h("span", null, label),
    ),
  );

  card.append(
    current,
    h("div", { class: "audience" }, h("span", { class: "aud-label" }, "Who it's for"), h("span", null, r.overview.audience)),
    !r.ai.used &&
      h(
        "p",
        { class: "ai-note" },
        icon("spark", 13),
        " Built from the repo's own data. Add an Anthropic, Groq or Gemini key in ",
        h("code", null, "apps/backend/.env"),
        " for a written explanation",
        r.ai.error ? ` (last attempt failed: ${r.ai.error})` : "",
        ".",
      ),
  );

  return h(
    "section",
    { class: "rp-section", "aria-labelledby": "overview-h" },
    h(
      "div",
      { class: "sec-head" },
      h("h2", { id: "overview-h" }, "Overview"),
      h("div", { class: "toggle", role: "tablist", "aria-label": "Explanation level" }, buttons),
    ),
    card,
    r.overview.highlights.length > 0 &&
      h(
        "div",
        { class: "hl-wrap" },
        h("h3", { class: "sub-h" }, "Highlights"),
        h(
          "ul",
          { class: "highlights" },
          r.overview.highlights.map((hl, i) =>
            reveal(h("li", null, h("span", { class: "hl-mark", "aria-hidden": "true" }), hl), { delay: i * 0.05, y: 12 }),
          ),
        ),
      ),
  );
}

const SECTIONS = {
  overview,
  stack: stackSection,
  structure: structureSection,
  work: workSection,
  run: runSection,
  mock: mockSection,
};

function report(r) {
  const tabs = tabsFor(r);
  let tab = "overview";
  let trail = ["overview"];
  let rerun = false;

  // --- back link: "Back to <previous tab>" or "Back to search"
  const backLabel = h("span");
  const setBackLabel = () => {
    const prev = trail.length > 1 ? tabs.find((t) => t.id === trail[trail.length - 2]) : null;
    const next = enter(h("span", { style: { "--dur": "0.2s", "--y": "4px" } }, prev ? `Back to ${prev.label}` : "Back to search"));
    backLabel.replaceChildren(next);
  };
  const back = () => {
    if (trail.length > 1) history.back();
    else location.href = `/?repo=${encodeURIComponent(r.repo.fullName)}`;
  };
  const backBtn = h("button", { type: "button", class: "back-link", onclick: back }, icon("arrow", 16, "flip"), backLabel);
  if (!reducedMotion()) {
    backBtn.style.transition = "transform 0.3s var(--ease-out)";
    backBtn.addEventListener("mouseenter", () => (backBtn.style.transform = "translateX(-3px)"));
    backBtn.addEventListener("mouseleave", () => (backBtn.style.transform = ""));
  }

  // --- header
  const stats = [
    { icon: "star", label: "Stars", value: r.repo.stars },
    { icon: "fork", label: "Forks", value: r.repo.forks },
    { icon: "commit", label: "Commits", value: r.repo.totalCommits ?? r.work.commitsAnalyzed },
    { icon: "people", label: "Contributors", value: r.work.contributorCount ?? r.work.contributors.length },
    { icon: "issue", label: "Open issues", value: r.repo.openIssues },
    ...(r.repo.openPulls !== null ? [{ icon: "pr", label: "Open PRs", value: r.repo.openPulls }] : []),
  ];
  const shareUrl = location.href.split("#")[0];
  const rerunIcon = icon("refresh", 16);
  const rerunText = h("span", null, "Regenerate");
  const rerunBtn = h(
    "button",
    {
      type: "button",
      class: "ghost",
      onclick: async () => {
        if (rerun) return;
        rerun = true;
        rerunBtn.disabled = true;
        rerunIcon.classList.add("spin");
        rerunText.textContent = "Starting…";
        try {
          const res = await api.startExplain({ owner: r.repo.owner, repo: r.repo.name, branch: r.branch, force: true });
          if (res.reportId) location.reload();
          else location.href = `/?repo=${encodeURIComponent(r.repo.fullName)}&job=${res.jobId}`;
        } catch (e) {
          toast(e.message);
          rerun = false;
          rerunBtn.disabled = false;
          rerunIcon.classList.remove("spin");
          rerunText.textContent = "Regenerate";
        }
      },
    },
    rerunIcon,
    " ",
    rerunText,
  );

  const header = h(
    "header",
    { class: "rp-head" },
    enter(
      h(
        "div",
        { class: "rp-id" },
        h("img", { src: r.repo.avatarUrl, alt: "", width: 56, height: 56, class: "rp-avatar" }),
        h(
          "div",
          null,
          h(
            "p",
            { class: "kicker" },
            r.overview.kinds.map((k) => KIND_LABEL[k]).join(" · "),
            h("span", { class: "kicker-sep" }, "·"),
            h("code", null, r.branch),
            " @ ",
            h("code", null, r.sha.slice(0, 7)),
          ),
          h("h1", { class: "rp-name" }, h("span", { class: "muted" }, `${r.repo.owner}/`), r.repo.name),
        ),
      ),
      { y: 16 },
    ),
    splitText(r.overview.oneLiner, { tag: "p", className: "rp-oneliner", delay: 0.15 }),
    r.repo.topics.length > 0 &&
      h(
        "ul",
        { class: "topics", "aria-label": "Topics" },
        r.repo.topics.slice(0, 10).map((t, i) => enter(h("li", null, t), { kind: "pop", delay: 0.4 + i * 0.04 })),
      ),
    h(
      "dl",
      { class: "rp-stats" },
      stats.map((s, i) =>
        enter(
          h(
            "div",
            { style: { "--dur": "0.6s" } },
            h("dt", null, icon(s.icon, 14), ` ${s.label}`),
            h("dd", null, countUp(s.value, { format: compact })),
          ),
          { y: 14, delay: 0.35 + i * 0.06 },
        ),
      ),
    ),
    enter(
      h(
        "div",
        { class: "rp-actions", style: { "--dur": "0.6s" } },
        h("button", { type: "button", class: "primary-cta", onclick: () => openCloneDialog(r) }, icon("download", 16), " Save a copy"),
        h("a", { class: "button ghost", href: r.repo.url, target: "_blank", rel: "noreferrer" }, icon("github", 16), " Open on GitHub"),
        copyButton(shareUrl, "Copy share link"),
        h("a", { class: "button ghost", href: api.markdownUrl(r.reportId), download: true }, icon("download", 16), " Markdown"),
        h("button", { type: "button", class: "ghost", onclick: () => window.print() }, icon("print", 16), " Save as PDF"),
        rerunBtn,
      ),
      { kind: "fade", delay: 0.6 },
    ),
    h(
      "p",
      { class: "rp-foot muted small" },
      r.repo.license && [icon("scale", 13), ` ${r.repo.license} · `],
      `Created ${ago(r.repo.createdAt)} · last push ${ago(r.repo.pushedAt)} · report made ${ago(r.generatedAt)}`,
      r.ai.used ? ` · written with ${r.ai.provider}` : " · written from repo data",
    ),
  );

  // --- tabs
  const tabButtons = tabs.map((t, i) =>
    enter(
      h(
        "button",
        {
          type: "button",
          role: "tab",
          id: `tab-${t.id}`,
          "aria-selected": String(tab === t.id),
          "aria-controls": "rp-panel",
          class: tab === t.id ? "on" : "",
          style: { "--dur": "0.5s" },
          onclick: () => select(t.id),
        },
        tab === t.id && h("span", { class: "rp-tab-pill" }),
        icon(t.icon, 15),
        h("span", { class: "rp-tab-label" }, t.label),
        t.count && h("span", { class: "rp-tab-count" }, t.count),
      ),
      { y: 10, delay: 0.5 + i * 0.05 },
    ),
  );
  const nav = h(
    "nav",
    { class: "rp-tabs", "aria-label": "Report sections" },
    h("div", { class: "rp-tabs-inner", role: "tablist" }, tabButtons),
  );

  const panel = h("div", { id: "rp-panel", role: "tabpanel", class: "rp-panel" });

  function paintTabs() {
    tabButtons.forEach((b, i) => {
      const on = tabs[i].id === tab;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
      b.querySelector(".rp-tab-pill")?.remove();
      if (on) b.prepend(h("span", { class: "rp-tab-pill" }));
    });
    panel.setAttribute("aria-labelledby", `tab-${tab}`);
  }

  function paintPanel(dir, animate = true) {
    const idx = tabs.findIndex((t) => t.id === tab);
    const content = h("div", null, SECTIONS[tab](r));
    if (animate) {
      content.classList.add("swap-in");
      if (!reducedMotion()) content.style.setProperty("--x", `${dir * 36}px`);
    }
    const prev = idx > 0 ? tabs[idx - 1] : null;
    const next = idx < tabs.length - 1 ? tabs[idx + 1] : null;
    render(
      panel,
      content,
      h(
        "div",
        { class: "pager" },
        prev
          ? h("button", { type: "button", class: "ghost", onclick: () => select(prev.id) }, icon("arrow", 15, "flip"), ` ${prev.label}`)
          : h("span"),
        next && h("button", { type: "button", onclick: () => select(next.id) }, `Next: ${next.label} `, icon("arrow", 15)),
      ),
    );
  }

  const order = (id) => tabs.findIndex((x) => x.id === id);

  function select(id) {
    if (id === tab) return;
    const dir = order(id) > order(tab) ? 1 : -1;
    history.pushState({ tab: id }, "", `#${id}`);
    trail = [...trail, id];
    tab = id;
    paintTabs();
    paintPanel(dir);
    setBackLabel();
    nav.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "nearest" });
  }

  // Open the tab named in the URL (#stack), and follow the browser's back/forward buttons.
  const initial = location.hash.slice(1);
  if (isTab(initial)) {
    tab = initial;
    trail = [initial];
    history.replaceState({ tab: initial }, "", `#${initial}`);
  } else history.replaceState({ tab: "overview" }, "", location.pathname);

  window.addEventListener("popstate", () => {
    const t = location.hash.slice(1);
    const next = isTab(t) ? t : "overview";
    const dir = order(next) >= order(tab) ? 1 : -1;
    trail = trail.length > 1 ? trail.slice(0, -1) : [next];
    if (next !== tab) {
      tab = next;
      paintTabs();
      paintPanel(dir);
    }
    setBackLabel();
  });

  // the PDF should hold every section, not just the open tab
  let printAll = null;
  window.addEventListener("beforeprint", () => {
    printAll?.remove();
    printAll = h("div", { class: "print-all" }, TAB_IDS.map((id) => SECTIONS[id](r)));
    panel.before(printAll);
    panel.hidden = true;
  });
  window.addEventListener("afterprint", () => {
    printAll?.remove();
    printAll = null;
    panel.hidden = false;
  });

  paintTabs();
  paintPanel(1, false);
  setBackLabel();

  return h("div", { class: "report" }, h("div", { class: "rp-backrow" }, backBtn), header, nav, panel);
}

function skeleton() {
  return h(
    "div",
    { class: "report loading", "aria-busy": "true", "aria-label": "Loading report" },
    h(
      "div",
      { class: "rp-head" },
      enter(
        h(
          "div",
          { class: "sk-row" },
          h("span", { class: "sk sk-avatar lg" }),
          h("span", { class: "sk-lines" }, h("span", { class: "sk sk-l1" }), h("span", { class: "sk sk-l2" })),
        ),
        { kind: "fade" },
      ),
      h("span", { class: "sk", style: { width: "70%", height: "34px", marginTop: "24px" } }),
    ),
  );
}

function notFound(message) {
  return h(
    "div",
    { class: "page center-msg" },
    h("h1", null, "Report not found"),
    h("p", { class: "muted" }, message),
    h("a", { href: "/", class: "button" }, "Explain a repo"),
  );
}

mountLayout();
const main = document.getElementById("main");
render(main, skeleton());
api
  .report(pathId())
  .then((r) => {
    document.title = `${r.repo.fullName} explained · AI-Repo-Assistant`;
    render(main, report(r));
  })
  .catch((e) => render(main, notFound(e.message)));
