// "Mock output" tab: a look at what the project produces without running it (live site,
// the repo's own static files, a themed sketch, API endpoints, a CLI session, library
// usage), plus the "Run it locally" guide. Port of components/explain/Mock.tsx.
import { api } from "../api.js";
import { h, render, reducedMotion } from "../dom.js";
import { copyButton, enter, icon, reveal } from "../ui.js";
import { runLocally } from "./run-locally.js";

const TAB_LABEL = { web: "Pages", api: "API", cli: "Terminal", library: "Library usage" };

/** Restarts an element's CSS entrance animation. */
function replay(el) {
  el.classList.remove("enter");
  void el.offsetWidth;
  el.classList.add("enter");
  return el;
}

/** Replaces `host`'s content with `el`, playing the standard swap entrance. */
function swap(host, el, { y = 12, dur = ".35s" } = {}) {
  render(host, enter(el, { y }));
  el.style.setProperty("--dur", dur);
  return el;
}

// --- Web -------------------------------------------------------------------

const lines = (n, widths = [92, 78, 85, 60]) =>
  Array.from({ length: n }, (_, i) => h("span", { class: "wf-line shimmer", style: { width: `${widths[i % widths.length]}%` } }));

/** Loads the repo's Google font for the sketch, when it names one. */
function loadGoogleFont(font) {
  if (!font || !/^[A-Z][\w ]+$/.test(font)) return;
  const id = `gf-${font.replace(/\s+/g, "-")}`;
  if (document.getElementById(id)) return;
  document.head.append(
    h("link", {
      id,
      rel: "stylesheet",
      href: `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;600;700&display=swap`,
    }),
  );
}

function pageView(page, site, theme) {
  const [h1, ...rest] = page.headings;
  const empty =
    !page.headings.length && !page.buttons.length && !page.paragraphs.length && !page.inputs.length && !page.images.length;
  const [hero, ...more] = page.images;
  const style = {
    "--wf-accent": theme?.accent || null,
    "--wf-bg": theme?.background || null,
    "--wf-text": theme?.text || null,
    "--wf-font": theme?.font ? `"${theme.font}", var(--font-sans), sans-serif` : null,
  };
  return h(
    "div",
    { class: `wf${theme?.dark ? " wf-dark" : ""}`, style },
    h(
      "div",
      { class: "wf-nav" },
      h(
        "span",
        { class: "wf-logo" },
        theme?.logo ? h("img", { src: theme.logo, alt: "", class: "wf-logo-img" }) : h("span", { class: "wf-logo-mark", "aria-hidden": "true" }),
        site,
      ),
      h(
        "span",
        { class: "wf-links" },
        (page.links.length ? page.links : ["Home", "About", "Contact"])
          .slice(0, 5)
          .map((l) => h("span", { class: page.links.length ? "" : "ghost-text" }, l)),
      ),
    ),
    h(
      "div",
      { class: `wf-hero${hero ? " with-img" : ""}` },
      h(
        "div",
        { class: "wf-hero-text" },
        h1 ? h("h5", { class: "wf-h1" }, h1) : h("span", { class: "wf-h1-sk shimmer" }),
        page.paragraphs[0] ? h("p", { class: "wf-p" }, page.paragraphs[0]) : lines(2),
        page.inputs.length > 0 &&
          h(
            "div",
            { class: "wf-inputs" },
            page.inputs.slice(0, 3).map((p) => h("span", { class: "wf-input" }, p)),
          ),
        page.buttons.length > 0 &&
          h(
            "div",
            { class: "wf-btns" },
            page.buttons.slice(0, 3).map((b, i) => h("span", { class: i === 0 ? "wf-btn primary" : "wf-btn" }, b)),
          ),
      ),
      hero && h("img", { src: hero, alt: "", class: "wf-hero-img", loading: "lazy" }),
    ),
    h(
      "div",
      { class: "wf-sections" },
      (rest.length ? rest : ["", ""]).slice(0, 4).map((hd, i) =>
        h(
          "div",
          { class: "wf-card" },
          more[i] && h("img", { src: more[i], alt: "", class: "wf-card-img", loading: "lazy" }),
          hd ? h("span", { class: "wf-h2" }, hd) : h("span", { class: "wf-h2-sk shimmer" }),
          page.paragraphs[i + 1] ? h("p", { class: "wf-p small" }, page.paragraphs[i + 1]) : lines(2, [88, 64]),
        ),
      ),
    ),
    empty && h("p", { class: "wf-empty" }, "This page builds its content at runtime, so only its layout could be sketched."),
  );
}

function framedPage(src, sandbox, title) {
  const loading = h("div", { class: "br-loading" }, h("span", { class: "br-spinner", "aria-hidden": "true" }), `Loading ${title}…`);
  const frame = h("iframe", { src, title, sandbox, referrerpolicy: "no-referrer", loading: "lazy" });
  frame.addEventListener("load", () => {
    loading.style.transition = "opacity .4s";
    loading.style.opacity = "0";
    setTimeout(() => loading.remove(), 400);
  });
  return h("div", { class: "br-live" }, loading, frame);
}

function webMock(web, repo, reportId) {
  let i = 0;
  let sites = null;
  let view = null;
  loadGoogleFont(web.theme?.font);

  const switchHost = h("div", { class: "view-switch", role: "tablist", "aria-label": "Preview type" });
  const routeList = h("ul", { class: "route-list", role: "tablist", "aria-label": "Pages" });
  const urlText = h("span");
  const urlHost = h("span", { class: "br-url" }, icon("link", 12), urlText);
  const openHost = h("span", { style: "display: contents" });
  const viewHost = h("div", { class: "br-view" });
  const footHost = h("span");
  let viewKey = "";

  const views = () => {
    const live = sites?.find((s) => s.frameable) ?? null;
    return [
      ...(live ? [{ id: "live", label: "Live site", note: `The deployed site at ${live.url.replace(/^https?:\/\//, "")}` }] : []),
      ...(web.staticSite ? [{ id: "files", label: "Repo files", note: "The repo's own HTML, CSS and images, rendered with scripts turned off" }] : []),
      { id: "sketch", label: "Sketch from code", note: "Drawn from the page's markup, in the site's own colours and images" },
    ];
  };

  function draw() {
    const live = sites?.find((s) => s.frameable) ?? null;
    const blockedLive = !live ? (sites?.[0] ?? null) : null;
    const vs = views();
    const current = view ?? (sites === null ? null : vs[0].id);
    const page = web.pages[i];
    const route = page.route === "/" ? "" : page.route;
    const liveBase = live?.url.replace(/\/$/, "") ?? "";
    const url =
      current === "live"
        ? `${liveBase}${route}`
        : current === "files"
          ? api.staticUrl(reportId, page.file)
          : `${repo.homepage?.replace(/^https?:\/\//, "").replace(/\/$/, "") || web.baseUrl || "localhost:3000"}${route}`;

    render(
      switchHost,
      sites === null
        ? h("span", { class: "vs-checking" }, h("span", { class: "br-spinner small", "aria-hidden": "true" }), " Looking for a deployed copy…")
        : vs.map((v) =>
            h(
              "button",
              {
                type: "button",
                role: "tab",
                "aria-selected": String(current === v.id),
                class: current === v.id ? "on" : "",
                onclick: () => {
                  view = v.id;
                  draw();
                },
              },
              current === v.id && h("span", { class: "view-pill" }),
              h("span", { class: "vs-label" }, v.id === "live" && h("span", { class: "live-dot", "aria-hidden": "true" }), v.label),
            ),
          ),
      blockedLive &&
        h(
          "a",
          { class: "vs-external", href: blockedLive.url, target: "_blank", rel: "noreferrer" },
          "Deployed site blocks embedding · open it ",
          icon("arrow", 13),
        ),
    );

    render(
      routeList,
      web.pages.map((p, k) =>
        h(
          "li",
          null,
          h(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": String(k === i),
              class: k === i ? "on" : "",
              onclick: () => {
                i = k;
                draw();
              },
            },
            k === i && h("span", { class: "route-pill" }),
            h("span", { class: "route-path" }, p.route),
          ),
        ),
      ),
    );

    const shownUrl = url.replace(/^https?:\/\//, "");
    if (urlText.textContent !== shownUrl) {
      urlText.textContent = shownUrl;
      replay(enter(urlText, { y: 6 }));
      urlText.style.setProperty("--dur", ".22s");
    }

    render(
      openHost,
      (current === "live" || current === "files") &&
        h(
          "a",
          {
            class: "br-open",
            href: current === "live" ? url : api.staticUrl(reportId, page.file),
            target: "_blank",
            rel: "noreferrer",
            "aria-label": "Open in a new tab",
          },
          icon("arrow", 13),
        ),
    );

    const key = `${current}:${page.route}:${page.file}`;
    if (key !== viewKey) {
      viewKey = key;
      const body =
        current === "live"
          ? framedPage(url, "allow-scripts allow-same-origin allow-forms allow-popups", "the live site")
          : current === "files"
            ? framedPage(api.staticUrl(reportId, page.file), "", page.file)
            : current === "sketch"
              ? pageView(page, web.siteTitle ?? repo.name, web.theme)
              : h("div", { class: "br-loading static" }, h("span", { class: "br-spinner", "aria-hidden": "true" }));
      swap(viewHost, h("div", null, body), { y: 14, dur: ".4s" }).classList.add("blur");
    }

    render(
      footHost,
      `${vs.find((v) => v.id === current)?.note ?? "…"} · ${web.framework} · `,
      h("code", null, page.file),
    );
  }

  api
    .liveSites(reportId)
    .then((s) => (sites = s))
    .catch(() => (sites = []))
    .finally(() => {
      // open on the most real view available once the live-site check finishes
      if (view === null) view = views()[0].id;
      draw();
    });

  const root = h(
    "div",
    { class: "mock-web-wrap" },
    switchHost,
    h(
      "div",
      { class: "mock-web" },
      routeList,
      h(
        "div",
        { class: "browser" },
        h(
          "div",
          { class: "br-bar" },
          h("span", { class: "dots", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
          urlHost,
          openHost,
        ),
        viewHost,
        h("div", { class: "br-foot" }, footHost),
      ),
    ),
  );
  draw();
  return root;
}

// --- API -------------------------------------------------------------------

const methodClass = (m) => `m-${m.toLowerCase()}`;

function endpointRow(e, isOpen, onToggle) {
  let state = "idle"; // idle | sending | done
  let timer = 0;
  const body = e.exampleResponse ?? e.responseFromCode;
  const li = h("li", { class: `ep${isOpen ? " open" : ""}` });
  const sendBtn = h("button", { type: "button", class: "send" });
  const label = h("div", { class: "ep-label" });
  const resHost = h("div");

  const response = () =>
    h(
      "div",
      null,
      body
        ? [
            h("pre", { class: "cmd json" }, h("code", null, body)),
            h(
              "p",
              { class: "ep-note" },
              e.exampleResponse ? "Example written by the AI from the handler code." : `Copied from the handler in ${e.file}:${e.line}.`,
            ),
          ]
        : h("p", { class: "ep-note" }, "The handler doesn't return a literal value, so the response shape isn't visible without running it."),
      e.bodyFields.length > 0 &&
        h(
          "p",
          { class: "ep-note" },
          "Reads from the request body: ",
          e.bodyFields.map((f) => h("code", null, f)),
        ),
    );

  function drawState() {
    sendBtn.disabled = state === "sending";
    render(sendBtn, icon("play", 12), ` ${state === "idle" ? "Send (simulated)" : state === "sending" ? "Sending…" : "Send again"}`);
    render(label, "Response", state === "done" && h("span", { class: "status-ok" }, "200 OK · simulated"));
    if (state === "sending") {
      const dots = h("div", { class: "sending" }, h("span"), h("span"), h("span"));
      render(resHost, enter(dots, { kind: "fade" }));
    } else swap(resHost, response(), { y: 6, dur: ".3s" });
  }

  sendBtn.addEventListener("click", () => {
    state = "sending";
    drawState();
    clearTimeout(timer);
    timer = setTimeout(() => {
      state = "done";
      drawState();
    }, 850);
  });

  const chev = h(
    "span",
    { class: "ep-chev", style: { transform: `rotate(${isOpen ? 90 : 0}deg)`, transition: "transform .3s var(--ease-out)" } },
    icon("chevron", 14),
  );
  li.append(
    h(
      "button",
      { type: "button", class: "ep-head", onclick: onToggle, "aria-expanded": String(isOpen) },
      h("span", { class: `method ${methodClass(e.method)}` }, e.method),
      h("code", { class: "ep-path" }, e.path),
      h("span", { class: "ep-src" }, `${e.file}:${e.line}`),
      chev,
    ),
  );
  if (isOpen) {
    li.append(
      enter(
        h(
          "div",
          { class: "ep-body", style: "--dur: .35s" },
          h(
            "div",
            { class: "ep-inner" },
            h(
              "div",
              { class: "ep-block" },
              h("div", { class: "ep-label" }, "Request ", copyButton(e.request)),
              h("pre", { class: "cmd" }, h("code", null, e.request)),
              sendBtn,
            ),
            h("div", { class: "ep-block" }, label, resHost),
          ),
        ),
        { y: -6 },
      ),
    );
    drawState();
  }
  return li;
}

function apiMock(apiOut) {
  let open = (() => {
    const k = apiOut.endpoints.findIndex((e) => e.responseFromCode || e.exampleResponse);
    return k === -1 ? 0 : k;
  })();
  let filter = "ALL";
  const methods = ["ALL", ...new Set(apiOut.endpoints.map((e) => e.method))];
  const filterHost = h("div", { class: "method-filter", role: "tablist", "aria-label": "Filter by method" });
  const listHost = h("ul", { class: "endpoints" });

  function draw() {
    render(
      filterHost,
      methods.map((m) =>
        h(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": String(filter === m),
            class: filter === m ? "on" : "",
            onclick: () => {
              filter = m;
              draw();
            },
          },
          m,
        ),
      ),
    );
    render(
      listHost,
      apiOut.endpoints
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => filter === "ALL" || e.method === filter)
        .map(({ e, i }) =>
          endpointRow(e, open === i, () => {
            open = open === i ? null : i;
            draw();
          }),
        ),
    );
  }
  draw();
  return h(
    "div",
    { class: "mock-api" },
    h(
      "div",
      { class: "api-top" },
      h(
        "span",
        null,
        h("b", null, apiOut.framework),
        ` · ${apiOut.endpoints.length} endpoint${apiOut.endpoints.length === 1 ? "" : "s"} · `,
        h("code", null, apiOut.baseUrl),
      ),
      filterHost,
    ),
    listHost,
  );
}

// --- CLI -------------------------------------------------------------------

function cliMock(cli) {
  const body = h("div", { class: "term-body" });
  const terminal = h(
    "div",
    { class: "terminal" },
    h(
      "div",
      { class: "term-bar" },
      h("i"),
      h("i"),
      h("i"),
      h("span", null, `${cli.binName} · simulated`),
      h("button", { type: "button", class: "mini replay", onclick: () => inView && play() }, icon("refresh", 12), " Replay"),
    ),
    body,
  );
  let run = 0;
  let inView = false;

  /** Types each command, then shows its output, one session item after another. */
  function play() {
    const id = ++run;
    render(body);
    const reduce = reducedMotion();
    const next = (i) => {
      if (id !== run) return;
      if (i >= cli.session.length) {
        body.append(h("div", { class: "term-cmd" }, h("span", { class: "prompt" }, "$"), " ", h("span", { class: "cursor" })));
        return;
      }
      const s = cli.session[i];
      const typed = document.createTextNode("");
      const cursor = h("span", { class: "cursor" });
      const item = h("div", { class: "term-item" }, h("div", { class: "term-cmd" }, h("span", { class: "prompt" }, "$"), " ", typed, cursor));
      body.append(item);
      const done = () => {
        if (id !== run) return;
        cursor.remove();
        item.append(
          enter(
            h("pre", { class: "term-out", style: "--dur: .35s" }, s.output, s.aiWritten && h("span", { class: "ai-tag" }, "example output written by AI")),
            { y: 4 },
          ),
        );
        setTimeout(() => next(i + 1), reduce ? 0 : 500);
      };
      if (reduce) {
        typed.data = s.command;
        done();
        return;
      }
      let n = 0;
      const t = setInterval(() => {
        if (id !== run || !terminal.isConnected) return clearInterval(t);
        n++;
        typed.data = s.command.slice(0, n);
        if (n >= s.command.length) {
          clearInterval(t);
          done();
        }
      }, 28);
    };
    next(0);
  }

  // start typing the first time the terminal is on screen
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      inView = true;
      play();
    },
    { rootMargin: "-15% 0px" },
  );
  io.observe(terminal);
  if (cli.session.length) {
    // until it is seen, show the first prompt with a blinking cursor
    body.append(h("div", { class: "term-item" }, h("div", { class: "term-cmd" }, h("span", { class: "prompt" }, "$"), " ", h("span", { class: "cursor" }))));
  }

  return h(
    "div",
    { class: "mock-cli" },
    terminal,
    cli.commands.length > 0 &&
      h(
        "div",
        { class: "cli-cmds" },
        h("h4", { class: "sub-h" }, "Commands found in the code"),
        h(
          "ul",
          { class: "kv-list" },
          cli.commands.map((c) =>
            h(
              "li",
              null,
              h("code", null, `${cli.binName} ${c.usage === cli.binName ? "" : c.usage}`),
              h("span", null, `${c.description ?? "No description"} · `, h("span", { class: "muted" }, `${c.file}:${c.line}`)),
            ),
          ),
        ),
      ),
  );
}

// --- Library ---------------------------------------------------------------

function libMock(lib) {
  return h(
    "div",
    { class: "mock-lib" },
    h(
      "div",
      { class: "terminal small" },
      h("div", { class: "term-bar" }, h("i"), h("i"), h("i"), h("span", null, "install"), copyButton(lib.install)),
      h("div", { class: "term-body" }, h("div", { class: "term-cmd" }, h("span", { class: "prompt" }, "$"), ` ${lib.install}`)),
    ),
    lib.usage
      ? h(
          "div",
          { class: "code-card" },
          h("div", { class: "code-top" }, h("span", null, `Usage · from the ${lib.usageSource}`), copyButton(lib.usage)),
          h("pre", null, h("code", null, lib.usage)),
        )
      : h("p", { class: "muted small" }, "The README has no usage example that imports the package."),
    lib.exports.length > 0 &&
      h(
        "div",
        null,
        h("h4", { class: "sub-h" }, "What it exports"),
        h(
          "ul",
          { class: "chips" },
          lib.exports.map((x) => h("li", null, h("code", { class: "chip-name" }, x))),
        ),
      ),
  );
}

export function mockSection(report) {
  const r = report;
  const m = r.mock;
  const tabs = ["web", "api", "cli", "library"].filter((t) => m[t]);
  let tab = tabs[0] ?? null;
  let mode = "overview";

  const modeToggle = h("div", { class: "toggle mode-toggle", role: "tablist", "aria-label": "Preview or run" });
  const modeHost = h("div");

  function drawToggle() {
    render(
      modeToggle,
      [
        ["overview", "Overview", "browser"],
        ["local", "Run it locally", "terminal"],
      ].map(([k, label, ic]) =>
        h(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": String(mode === k),
            class: mode === k ? "on" : "",
            onclick: () => {
              if (mode === k) return;
              mode = k;
              drawToggle();
              drawMode();
            },
          },
          mode === k && h("span", { class: "toggle-pill" }),
          h("span", { class: "mode-label" }, icon(ic, 14), ` ${label}`),
        ),
      ),
    );
  }

  function overview() {
    const tabHost = h("div");
    const tabsBar =
      tabs.length > 1 && h("div", { class: "tabs", role: "tablist", "aria-label": "Output type" });
    const drawTabs = () => {
      if (!tabsBar) return;
      render(
        tabsBar,
        tabs.map((t) =>
          h(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": String(tab === t),
              class: tab === t ? "on" : "",
              onclick: () => {
                if (tab === t) return;
                tab = t;
                drawTabs();
                drawTab();
              },
            },
            TAB_LABEL[t],
            tab === t && h("span", { class: "tab-line" }),
          ),
        ),
      );
    };
    const drawTab = () =>
      swap(
        tabHost,
        h(
          "div",
          null,
          tab === "web" && m.web && webMock(m.web, r.repo, r.reportId),
          tab === "api" && m.api && apiMock(m.api),
          tab === "cli" && m.cli && cliMock(m.cli),
          tab === "library" && m.library && libMock(m.library),
        ),
      );
    const out = h(
      "div",
      null,
      h(
        "div",
        { class: "mock-banner" },
        icon("spark", 15),
        h(
          "span",
          null,
          "A quick look without running anything: the deployed site when there is one, the repo's own files for plain HTML sites, or a sketch drawn from the code. To click through the real thing, switch to ",
          h("b", null, "Run it locally"),
          ".",
        ),
      ),
      !tab
        ? h(
            "div",
            { class: "card" },
            h(
              "p",
              { class: "muted" },
              "No pages, API routes, commands or library exports were found, so there's nothing to preview. This is common for config, docs, data or firmware repos.",
            ),
          )
        : h("div", { class: "card mock-card" }, tabsBar, tabHost),
    );
    if (tab) {
      drawTabs();
      drawTab();
    }
    return out;
  }

  // Each switch builds the view fresh, like the React version remounting it.
  const drawMode = () => swap(modeHost, mode === "local" ? runLocally(r) : overview(), { y: 12, dur: ".32s" });

  drawToggle();
  drawMode();
  return h(
    "section",
    { id: "mock", class: "rp-section", "aria-labelledby": "mock-h" },
    reveal(h("div", null, h("div", { class: "sec-head" }, h("h2", { id: "mock-h" }, "Mock output"), modeToggle))),
    modeHost,
  );
}
