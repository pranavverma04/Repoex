// "Run it locally": guided steps the user runs in their own terminal, then a port watch
// that embeds the running app (or sends real API requests to it). Port of RunLocally.tsx.
import { api } from "../api.js";
import { append, h, render, reducedMotion } from "../dom.js";
import { copyButton, enter, icon } from "../ui.js";
import { openCloneDialog } from "./clone-dialog.js";

/** The port this app itself is served on: a copy of a repo can't use it, and probing it would find this app. */
const OWN_PORT = Number(location.port) || (location.protocol === "https:" ? 443 : 80);

/** The port the dev server will most likely use, from the report's own findings. */
function guessPort(r) {
  if (r.run.ports[0]) return r.run.ports[0];
  const names = new Set(r.stack.groups.flatMap((g) => g.items.map((i) => i.name)));
  const start = r.run.steps.find((s) => /start|try/i.test(s.title))?.commands.join(" ") ?? "";
  if (/streamlit/.test(start)) return 8501;
  if (/manage\.py runserver|uvicorn|http\.server/.test(start)) return 8000;
  if (/flask/.test(start)) return 5000;
  if (names.has("Astro")) return 4321;
  if (names.has("Angular")) return 4200;
  if (names.has("Vite") || names.has("SvelteKit")) return 5173;
  if (names.has("Gatsby")) return 8000;
  if (names.has("Laravel") || names.has("Django") || names.has("FastAPI")) return 8000;
  if (names.has("Flask")) return 5000;
  return 3000;
}

function prettyBody(res) {
  if (/json/.test(res.contentType ?? "")) {
    try {
      return JSON.stringify(JSON.parse(res.body), null, 2);
    } catch {}
  }
  return res.body;
}

const cmdLine = (c, hidePrompt = false) =>
  h("code", null, h("span", { class: "prompt", "aria-hidden": hidePrompt ? "true" : null }, "$"), c);

/** Endpoint picker + request editor that sends real requests to the app on localhost. */
function apiTry(endpoints, getPort) {
  const root = h("div", { class: "api-try" });
  if (!endpoints.length) return root;
  const fill = (p) =>
    p
      .replace(/:(\w+)/g, (_, n) => (/id$/i.test(n) ? "1" : n))
      .replace(/\{(\w+)(?::[^}]+)?\}/g, (_, n) => (/id$/i.test(n) ? "1" : n))
      .replace(/<(?:\w+:)?(\w+)>/g, (_, n) => (/id$/i.test(n) ? "1" : n));
  let sel = 0;
  let busy = false;
  const list = h("div", { class: "at-list", role: "listbox", "aria-label": "Endpoints" });
  const main = h("div", { class: "at-main" });
  root.append(list, main);

  const drawList = () =>
    render(
      list,
      endpoints.map((x, i) =>
        h(
          "button",
          {
            type: "button",
            role: "option",
            "aria-selected": String(i === sel),
            class: i === sel ? "on" : "",
            onclick: () => {
              sel = i;
              drawList();
              drawMain();
            },
          },
          h("span", { class: `method m-${x.method.toLowerCase()}` }, x.method),
          h("code", null, x.path),
        ),
      ),
    );

  function drawMain() {
    const e = endpoints[sel];
    const pathInput = h("input", { value: fill(e.path), spellcheck: "false", "aria-label": "Request path" });
    const bodyInput = !["GET", "DELETE", "HEAD"].includes(e.method)
      ? h("textarea", {
          class: "at-body",
          value: e.bodyFields.length ? JSON.stringify(Object.fromEntries(e.bodyFields.map((f) => [f, ""])), null, 2) : "",
          placeholder: 'JSON body, e.g. {"name": "test"}',
          spellcheck: "false",
          rows: 4,
          "aria-label": "Request body",
        })
      : null;
    const result = h("div");
    const sendBtn = h("button", { type: "button" });
    const drawSend = () => {
      sendBtn.disabled = busy;
      render(sendBtn, icon("play", 12), ` ${busy ? "Sending…" : "Send"}`);
    };
    const port = getPort();
    sendBtn.addEventListener("click", async () => {
      busy = true;
      drawSend();
      try {
        const res = await api.localRequest({ port: getPort(), method: e.method, path: pathInput.value, body: bodyInput?.value ?? "" });
        render(
          result,
          enter(
            h(
              "div",
              { style: "--dur: .3s" },
              h(
                "div",
                { class: "at-status" },
                h("span", { class: res.status < 300 ? "ok" : res.status < 400 ? "mid" : "bad" }, `${res.status} ${res.statusText}`),
                h("span", null, `${res.ms} ms`),
                res.contentType && h("span", null, res.contentType.split(";")[0]),
                copyButton(res.body),
              ),
              h("pre", { class: "cmd json at-res" }, h("code", null, prettyBody(res) || "(empty body)")),
              res.truncated && h("p", { class: "ep-note" }, "Showing the first 200 KB."),
            ),
            { y: 6 },
          ),
        );
      } catch (x) {
        render(result, enter(h("p", { class: "error" }, x.message), { y: 6 }));
      } finally {
        busy = false;
        drawSend();
      }
    });
    drawSend();
    render(
      main,
      h(
        "div",
        { class: "at-req" },
        h("span", { class: `method m-${e.method.toLowerCase()}` }, e.method),
        h("span", { class: "at-host" }, `localhost:${port}`),
        pathInput,
        sendBtn,
      ),
      bodyInput,
      result,
      h("p", { class: "ep-note" }, `A real request to the app you're running, sent through the backend. Defined in ${e.file}:${e.line}.`),
    );
  }

  drawList();
  drawMain();
  return root;
}

export function runLocally(report) {
  const r = report;
  const key = `ara:clone:${r.reportId}`;
  let saved = null;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) saved = JSON.parse(raw);
  } catch {}
  // The repo's usual port may be taken: by this app itself (e.g. when analysing this very project) or by
  // another app on this computer. Then suggest a port that is actually free (checked by the server).
  const wanted = guessPort(r);
  let clash = wanted === OWN_PORT ? "own" : null; // "own" | "busy" | null
  let port = clash === "own" ? OWN_PORT + 100 : wanted; // refined once the server says which port is free
  let portEdited = false;
  const readsPortEnv = r.run.envVars.some((v) => v.name === "PORT");
  const startCmd = r.run.steps.find((st) => /start/i.test(st.title))?.commands[0] ?? null;
  let status = "idle"; // idle | waiting | up
  let route = "/";
  let view = r.mock.web ? "site" : "api";
  let probeTimer = 0;
  let probeGen = 0;

  const isServer = !!(r.mock.web || r.mock.api);
  const cli = r.mock.cli;
  const root = h("div", { class: "run-local" });
  const stepsHost = h("ol", { class: "rl-steps" });
  const copyAllHost = h("div", { class: "rl-copyall" });
  const liveHost = h("div");

  const openDialog = () =>
    openCloneDialog(r, {
      onSaved: (job) => {
        saved = { jobId: job.jobId, dest: job.dest, display: job.display };
        try {
          sessionStorage.setItem(key, JSON.stringify(saved));
        } catch {}
        draw();
      },
    });

  // setup steps from the report, minus the clone (handled above) and the optional extras
  const stepList = () => {
    const dir = saved ? `"${saved.dest}"` : r.repo.name;
    const list = r.run.steps.filter((s) => !/get the code|run the tests|^or run/i.test(s.title));
    return [
      {
        title: "Open a terminal in the project folder",
        commands: [`cd ${dir}`],
        note: saved ? null : "Clone it first (step 1), or run the git clone command shown there.",
      },
      ...list,
    ];
  };

  // the port input keeps its focus across redraws of the status light
  const portInput = h("input", {
    type: "number",
    min: 1024,
    max: 65535,
    value: port,
    "aria-label": "Port the app runs on",
    oninput: (e) => {
      portEdited = true;
      port = Number(e.target.value) || 0;
      if (status === "up") status = "waiting";
      restartProbe();
      drawWatch();
      drawLive();
    },
  });
  const watchHost = h("div", { class: "rl-watch" });
  const watchStepN = h("span", { class: "step-n", "aria-hidden": "true" });
  const watchStep = h(
    "li",
    { class: "rl-step" },
    watchStepN,
    h(
      "div",
      { class: "step-body" },
      h("div", { class: "step-top" }, h("h3", null, "Open it here")),
      watchHost,
      h(
        "p",
        { class: "step-note" },
        'The port is the one the terminal prints when the app starts (for example "Local: http://localhost:5173"). Stop the app any time with Ctrl+C in its terminal.',
      ),
    ),
  );

  /** Why the suggested port differs from the repo's, or why the typed one can't work. */
  function portNote() {
    if (port === OWN_PORT)
      return h(
        "p",
        { class: "step-note rl-warn", role: "alert" },
        `localhost:${OWN_PORT} is this app itself. Start the copy on another port and enter that port here.`,
      );
    if (!clash || port === wanted) return null;
    const how =
      readsPortEnv && startCmd
        ? ["Start it with ", h("code", null, `PORT=${port} ${startCmd}`), " so it doesn't collide."]
        : [`Start it on localhost:${port} instead (see its README or config for how to change the port).`];
    const why =
      clash === "own"
        ? `This project normally runs on localhost:${wanted}, which is where this app is running now. `
        : `Something else on this computer is already using localhost:${wanted}. If that isn't this project, `;
    return h("p", { class: "step-note rl-warn" }, why, how);
  }

  function drawWatch() {
    const n = stepList().length + 2;
    watchStep.className = `rl-step${status === "up" ? " done" : ""}`;
    render(watchStepN, status === "up" ? icon("check", 15) : n);
    render(
      watchHost,
      h("label", { class: "rl-port" }, h("span", null, "localhost:"), portInput),
      portNote(),
      status === "idle"
        ? h(
            "button",
            {
              type: "button",
              onclick: () => {
                status = "waiting";
                restartProbe();
                drawWatch();
              },
            },
            icon("play", 12),
            " I've started it",
          )
        : h(
            "span",
            { class: `rl-light ${status}`, "aria-live": "polite" },
            h("span", { class: "dot", "aria-hidden": "true" }),
            status === "up" ? `Running on localhost:${port}` : `Waiting for the app on localhost:${port}…`,
          ),
    );
  }

  function drawSteps() {
    const steps = stepList();
    const get = saved
      ? h(
          "div",
          { class: "rl-saved" },
          h("span", null, "Saved at ", h("code", null, saved.display)),
          h(
            "div",
            { class: "rl-btns" },
            h(
              "button",
              { type: "button", class: "ghost", onclick: () => api.openTerminal(saved.jobId).catch(() => {}) },
              icon("terminal", 15),
              " Open Terminal here",
            ),
            h(
              "button",
              { type: "button", class: "ghost", onclick: () => api.revealClone(saved.jobId).catch(() => {}) },
              icon("folder", 15),
              " Show in Finder",
            ),
            h("button", { type: "button", class: "mini", onclick: openDialog }, "Save another copy"),
          ),
        )
      : [
          h(
            "div",
            { class: "rl-btns" },
            h("button", { type: "button", onclick: openDialog }, icon("download", 15), " Save a copy to this computer"),
          ),
          h("p", { class: "step-note" }, "Or clone it yourself:"),
          h("pre", { class: "cmd" }, cmdLine(`git clone https://github.com/${r.repo.fullName}.git`)),
        ];
    render(
      stepsHost,
      // 1 · get the code
      h(
        "li",
        { class: `rl-step${saved ? " done" : ""}` },
        h("span", { class: "step-n", "aria-hidden": "true" }, saved ? icon("check", 15) : 1),
        h("div", { class: "step-body" }, h("div", { class: "step-top" }, h("h3", null, "Get the code")), get),
      ),
      steps.map((s, i) =>
        enter(
          h(
            "li",
            { class: "rl-step", style: "--dur: .45s" },
            h("span", { class: "step-n", "aria-hidden": "true" }, i + 2),
            h(
              "div",
              { class: "step-body" },
              h("div", { class: "step-top" }, h("h3", null, s.title), copyButton(s.commands.join("\n"))),
              h(
                "pre",
                { class: "cmd" },
                s.commands.map((c) => cmdLine(c, true)),
              ),
              s.note && h("p", { class: "step-note" }, s.note),
            ),
          ),
          { delay: 0.05 * i, y: 12 },
        ),
      ),
      // last · open it here
      isServer && watchStep,
    );
    if (isServer) drawWatch();

    const allCommands = [saved ? null : `git clone https://github.com/${r.repo.fullName}.git`, ...steps.flatMap((s) => s.commands)]
      .filter(Boolean)
      .join("\n");
    render(copyAllHost, h("span", { class: "muted small" }, "All the commands in one go"), copyButton(allCommands, "Copy all commands"));
  }

  function drawLive() {
    if (!(status === "up" && isServer)) {
      render(liveHost);
      return;
    }
    const url = `http://localhost:${port}${route}`;
    const routes = r.mock.web?.pages.map((p) => p.route).filter((x) => !x.includes(":") && !x.includes("*")) ?? [];
    const iframeHost = h("div", { class: "br-live tall" });
    const reload = () =>
      render(
        iframeHost,
        h("iframe", {
          src: `http://localhost:${port}${route}`,
          title: "Your locally running app",
          sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads",
        }),
      );
    const openLink = h(
      "a",
      { class: "br-open", href: url, target: "_blank", rel: "noreferrer", "aria-label": "Open in a new tab" },
      icon("arrow", 13),
    );
    const routeInput = h("input", {
      value: route,
      spellcheck: "false",
      "aria-label": "Path",
      oninput: (e) => {
        route = e.target.value.startsWith("/") ? e.target.value : "/" + e.target.value;
        if (e.target.value !== route) e.target.value = route;
        openLink.href = `http://localhost:${port}${route}`;
      },
    });
    const live = h(
      "div",
      { class: "rl-live" },
      r.mock.web &&
        r.mock.api &&
        h(
          "div",
          { class: "view-switch", role: "tablist", "aria-label": "What to explore" },
          [
            ["site", "The site"],
            ["api", "The API"],
          ].map(([v, label]) =>
            h(
              "button",
              {
                type: "button",
                role: "tab",
                "aria-selected": String(view === v),
                class: view === v ? "on" : "",
                onclick: () => {
                  if (view === v) return;
                  view = v;
                  drawLive();
                },
              },
              view === v && h("span", { class: "view-pill" }),
              h("span", { class: "vs-label" }, label),
            ),
          ),
        ),
      view === "site" && r.mock.web
        ? h(
            "div",
            { class: "browser rl-browser" },
            h(
              "div",
              { class: "br-bar" },
              h("span", { class: "dots", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
              h(
                "form",
                {
                  class: "br-url editable",
                  onsubmit: (e) => {
                    e.preventDefault();
                    reload();
                  },
                },
                h("span", { class: "live-dot", "aria-hidden": "true" }),
                h("span", { class: "br-host" }, `localhost:${port}`),
                routeInput,
              ),
              h("button", { type: "button", class: "br-open plain", onclick: reload, "aria-label": "Reload" }, icon("refresh", 13)),
              openLink,
            ),
            routes.length > 1 &&
              h(
                "div",
                { class: "rl-routes" },
                routes.slice(0, 12).map((p) =>
                  h(
                    "button",
                    {
                      type: "button",
                      class: route === p ? "on" : "",
                      onclick: () => {
                        route = p;
                        drawLive();
                      },
                    },
                    p,
                  ),
                ),
              ),
            iframeHost,
            h(
              "div",
              { class: "br-foot" },
              h(
                "span",
                null,
                "Your own running copy · click around, sign in, fill forms. If this stays blank, the app blocks being shown inside other pages. Use the open-in-new-tab button.",
              ),
            ),
          )
        : r.mock.api
          ? apiTry(r.mock.api.endpoints, () => port)
          : null,
    );
    const first = !liveHost.firstChild;
    render(liveHost, first ? enter(live, { y: 24, blur: true }) : live);
    live.style.setProperty("--dur", ".6s");
    if (view === "site" && r.mock.web) reload();
    if (first) live.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  }

  // Watch the port: an opaque no-cors response means something is listening.
  function restartProbe() {
    clearInterval(probeTimer);
    const gen = ++probeGen;
    // never probe our own port: it always answers, and the "running app" would be this one
    if (status === "idle" || !isServer || port === OWN_PORT) return;
    const probe = async () => {
      if (!root.isConnected && root.dataset.mounted) return clearInterval(probeTimer);
      if (root.isConnected) root.dataset.mounted = "1";
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1500);
      let next = status;
      try {
        await fetch(`http://localhost:${port}/`, { mode: "no-cors", cache: "no-store", signal: ctl.signal });
        next = "up";
      } catch {
        next = status === "up" ? "waiting" : status;
      } finally {
        clearTimeout(t);
      }
      if (gen !== probeGen || next === status) return;
      status = next;
      drawWatch();
      drawLive();
    };
    probe();
    probeTimer = setInterval(probe, 2000);
  }

  function draw() {
    drawSteps();
  }

  // append() from dom.js skips null/false; the native root.append() would print them as text
  append(root, [
    h(
      "p",
      { class: "rl-intro" },
      "Run the real project on this computer, then use it right here. You paste the commands into your own terminal, so you decide what runs. Only run projects you trust: installing packages can run their setup scripts.",
    ),
    stepsHost,
    copyAllHost,
    cli &&
      !isServer &&
      h(
        "div",
        { class: "card rl-cli" },
        h("h3", { class: "sub-h" }, "Then try it"),
        h(
          "pre",
          { class: "cmd" },
          [`${cli.binName} --help`, ...cli.commands.slice(0, 5).map((c) => `${cli.binName} ${c.usage}`)].map((c) => cmdLine(c)),
        ),
        h(
          "p",
          { class: "step-note" },
          "Run these in the same terminal after installing. The Overview tab shows what the help screen looks like.",
        ),
      ),
    !isServer &&
      !cli &&
      r.mock.library &&
      h(
        "div",
        { class: "card rl-cli" },
        h("h3", { class: "sub-h" }, "Use it in your own project"),
        h("pre", { class: "cmd" }, cmdLine(r.mock.library.install)),
        r.mock.library.usage && h("pre", { class: "cmd" }, h("code", null, r.mock.library.usage)),
      ),
    liveHost,
  ]);
  draw();
  if (isServer) {
    api
      .freePort(clash === "own" ? OWN_PORT + 100 : wanted)
      .then(({ port: free }) => {
        if (free === wanted || portEdited) return;
        clash ??= "busy";
        port = free;
        portInput.value = String(free);
        drawWatch();
      })
      .catch(() => {
        if (clash === "own" && !portEdited) {
          port = OWN_PORT + 100;
          portInput.value = String(port);
          drawWatch();
        }
      });
  }
  return root;
}
