"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CloneJob, Endpoint, RepoReport } from "@ara/shared";
import { api, type LocalResponse } from "@/lib/api";
import { CloneDialog } from "./CloneDialog";
import { CopyButton, EASE, Icon } from "./ui";

type Saved = Pick<CloneJob, "jobId" | "dest" | "display">;
type Status = "idle" | "waiting" | "up";

/** The port the dev server will most likely use, from the report's own findings. */
function guessPort(r: RepoReport): number {
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

function prettyBody(res: LocalResponse): string {
  if (/json/.test(res.contentType ?? "")) {
    try {
      return JSON.stringify(JSON.parse(res.body), null, 2);
    } catch {}
  }
  return res.body;
}

function ApiTry({ endpoints, port }: { endpoints: Endpoint[]; port: number }) {
  const [sel, setSel] = useState(0);
  const e = endpoints[sel];
  const fill = (p: string) =>
    p
      .replace(/:(\w+)/g, (_, n) => (/id$/i.test(n) ? "1" : n))
      .replace(/\{(\w+)(?::[^}]+)?\}/g, (_, n) => (/id$/i.test(n) ? "1" : n))
      .replace(/<(?:\w+:)?(\w+)>/g, (_, n) => (/id$/i.test(n) ? "1" : n));
  const [path, setPath] = useState(fill(e?.path ?? "/"));
  const [body, setBody] = useState("");
  const [res, setRes] = useState<LocalResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!e) return;
    setPath(fill(e.path));
    setBody(e.bodyFields.length ? JSON.stringify(Object.fromEntries(e.bodyFields.map((f) => [f, ""])), null, 2) : "");
    setRes(null);
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      setRes(await api.localRequest({ port, method: e.method, path, body }));
    } catch (x) {
      setRes(null);
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!e) return null;
  return (
    <div className="api-try">
      <div className="at-list" role="listbox" aria-label="Endpoints">
        {endpoints.map((x, i) => (
          <button key={`${x.method} ${x.path} ${x.file}`} type="button" role="option" aria-selected={i === sel} className={i === sel ? "on" : ""} onClick={() => setSel(i)}>
            <span className={`method m-${x.method.toLowerCase()}`}>{x.method}</span>
            <code>{x.path}</code>
          </button>
        ))}
      </div>
      <div className="at-main">
        <div className="at-req">
          <span className={`method m-${e.method.toLowerCase()}`}>{e.method}</span>
          <span className="at-host">localhost:{port}</span>
          <input value={path} onChange={(ev) => setPath(ev.target.value)} spellCheck={false} aria-label="Request path" />
          <button type="button" onClick={send} disabled={busy}>
            <Icon name="play" size={12} /> {busy ? "Sending…" : "Send"}
          </button>
        </div>
        {!["GET", "DELETE", "HEAD"].includes(e.method) && (
          <textarea className="at-body" value={body} onChange={(ev) => setBody(ev.target.value)} placeholder='JSON body, e.g. {"name": "test"}' spellCheck={false} rows={4} aria-label="Request body" />
        )}
        <AnimatePresence mode="wait">
          {err && (
            <motion.p key="err" className="error" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {err}
            </motion.p>
          )}
          {res && (
            <motion.div key={res.ms + res.status} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <div className="at-status">
                <span className={res.status < 300 ? "ok" : res.status < 400 ? "mid" : "bad"}>
                  {res.status} {res.statusText}
                </span>
                <span>{res.ms} ms</span>
                {res.contentType && <span>{res.contentType.split(";")[0]}</span>}
                <CopyButton text={res.body} />
              </div>
              <pre className="cmd json at-res">
                <code>{prettyBody(res) || "(empty body)"}</code>
              </pre>
              {res.truncated && <p className="ep-note">Showing the first 200 KB.</p>}
            </motion.div>
          )}
        </AnimatePresence>
        <p className="ep-note">
          A real request to the app you're running, sent through the backend. Defined in {e.file}:{e.line}.
        </p>
      </div>
    </div>
  );
}

export function RunLocally({ report }: { report: RepoReport }) {
  const r = report;
  const reduce = useReducedMotion();
  const key = `ara:clone:${r.reportId}`;
  const [saved, setSaved] = useState<Saved | null>(null);
  const [dialog, setDialog] = useState(false);
  const [port, setPort] = useState(() => guessPort(r));
  const [status, setStatus] = useState<Status>("idle");
  const [route, setRoute] = useState("/");
  const [frameKey, setFrameKey] = useState(0);
  const [view, setView] = useState<"site" | "api">(r.mock.web ? "site" : "api");
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) setSaved(JSON.parse(raw));
    } catch {}
  }, [key]);

  const isServer = !!(r.mock.web || r.mock.api);
  const cli = r.mock.cli;
  const dir = saved ? `"${saved.dest}"` : r.repo.name;

  // setup steps from the report, minus the clone (handled above) and the optional extras
  const steps = useMemo(() => {
    const list = r.run.steps.filter((s) => !/get the code|run the tests|^or run/i.test(s.title));
    return [
      { title: "Open a terminal in the project folder", commands: [`cd ${dir}`], note: saved ? null : "Clone it first (step 1), or run the git clone command shown there." },
      ...list,
    ];
  }, [r.run.steps, dir, saved]);
  const allCommands = [saved ? null : `git clone https://github.com/${r.repo.fullName}.git`, ...steps.flatMap((s) => s.commands)].filter(Boolean).join("\n");

  // Watch the port: an opaque no-cors response means something is listening.
  useEffect(() => {
    if (status === "idle" || !isServer) return;
    let alive = true;
    const probe = async () => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1500);
      try {
        await fetch(`http://localhost:${port}/`, { mode: "no-cors", cache: "no-store", signal: ctl.signal });
        if (alive) setStatus("up");
      } catch {
        if (alive) setStatus((s) => (s === "up" ? "waiting" : s));
      } finally {
        clearTimeout(t);
      }
    };
    probe();
    const iv = setInterval(probe, 2000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [status, port, isServer]);

  useEffect(() => {
    if (status === "up") frameRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [status, reduce]);

  const url = `http://localhost:${port}${route}`;
  const routes = r.mock.web?.pages.map((p) => p.route).filter((x) => !x.includes(":") && !x.includes("*")) ?? [];

  return (
    <div className="run-local">
      <p className="rl-intro">
        Run the real project on this computer, then use it right here. You paste the commands into your own terminal, so you decide what runs. Only run projects you trust: installing packages can run their setup scripts.
      </p>

      <ol className="rl-steps">
        {/* 1 · get the code */}
        <li className={`rl-step${saved ? " done" : ""}`}>
          <span className="step-n" aria-hidden>
            {saved ? <Icon name="check" size={15} /> : 1}
          </span>
          <div className="step-body">
            <div className="step-top">
              <h3>Get the code</h3>
            </div>
            {saved ? (
              <div className="rl-saved">
                <span>
                  Saved at <code>{saved.display}</code>
                </span>
                <div className="rl-btns">
                  <button type="button" className="ghost" onClick={() => api.openTerminal(saved.jobId).catch(() => {})}>
                    <Icon name="terminal" size={15} /> Open Terminal here
                  </button>
                  <button type="button" className="ghost" onClick={() => api.revealClone(saved.jobId).catch(() => {})}>
                    <Icon name="folder" size={15} /> Show in Finder
                  </button>
                  <button type="button" className="mini" onClick={() => setDialog(true)}>
                    Save another copy
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="rl-btns">
                  <button type="button" onClick={() => setDialog(true)}>
                    <Icon name="download" size={15} /> Save a copy to this computer
                  </button>
                </div>
                <p className="step-note">Or clone it yourself:</p>
                <pre className="cmd">
                  <code>
                    <span className="prompt">$</span>git clone https://github.com/{r.repo.fullName}.git
                  </code>
                </pre>
              </>
            )}
          </div>
        </li>

        {steps.map((s, i) => (
          <motion.li key={s.title + i} className="rl-step" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.45, ease: EASE }}>
            <span className="step-n" aria-hidden>
              {i + 2}
            </span>
            <div className="step-body">
              <div className="step-top">
                <h3>{s.title}</h3>
                <CopyButton text={s.commands.join("\n")} />
              </div>
              <pre className="cmd">
                {s.commands.map((c) => (
                  <code key={c}>
                    <span className="prompt" aria-hidden>
                      $
                    </span>
                    {c}
                  </code>
                ))}
              </pre>
              {s.note && <p className="step-note">{s.note}</p>}
            </div>
          </motion.li>
        ))}

        {/* last · open it here */}
        {isServer && (
          <li className={`rl-step${status === "up" ? " done" : ""}`}>
            <span className="step-n" aria-hidden>
              {status === "up" ? <Icon name="check" size={15} /> : steps.length + 2}
            </span>
            <div className="step-body">
              <div className="step-top">
                <h3>Open it here</h3>
              </div>
              <div className="rl-watch">
                <label className="rl-port">
                  <span>localhost:</span>
                  <input
                    type="number"
                    min={1024}
                    max={65535}
                    value={port}
                    onChange={(e) => {
                      setPort(Number(e.target.value) || 0);
                      if (status === "up") setStatus("waiting");
                    }}
                    aria-label="Port the app runs on"
                  />
                </label>
                {status === "idle" ? (
                  <button type="button" onClick={() => setStatus("waiting")}>
                    <Icon name="play" size={12} /> I've started it
                  </button>
                ) : (
                  <span className={`rl-light ${status}`} aria-live="polite">
                    <span className="dot" aria-hidden />
                    {status === "up" ? `Running on localhost:${port}` : `Waiting for the app on localhost:${port}…`}
                  </span>
                )}
              </div>
              <p className="step-note">The port is the one the terminal prints when the app starts (for example "Local: http://localhost:5173"). Stop the app any time with Ctrl+C in its terminal.</p>
            </div>
          </li>
        )}
      </ol>

      <div className="rl-copyall">
        <span className="muted small">All the commands in one go</span>
        <CopyButton text={allCommands} label="Copy all commands" />
      </div>

      {cli && !isServer && (
        <div className="card rl-cli">
          <h3 className="sub-h">Then try it</h3>
          <pre className="cmd">
            {[`${cli.binName} --help`, ...cli.commands.slice(0, 5).map((c) => `${cli.binName} ${c.usage}`)].map((c) => (
              <code key={c}>
                <span className="prompt">$</span>
                {c}
              </code>
            ))}
          </pre>
          <p className="step-note">Run these in the same terminal after installing. The Overview tab shows what the help screen looks like.</p>
        </div>
      )}
      {!isServer && !cli && r.mock.library && (
        <div className="card rl-cli">
          <h3 className="sub-h">Use it in your own project</h3>
          <pre className="cmd">
            <code>
              <span className="prompt">$</span>
              {r.mock.library.install}
            </code>
          </pre>
          {r.mock.library.usage && (
            <pre className="cmd">
              <code>{r.mock.library.usage}</code>
            </pre>
          )}
        </div>
      )}

      <AnimatePresence>
        {status === "up" && isServer && (
          <motion.div ref={frameRef} className="rl-live" initial={{ opacity: 0, y: 24, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: EASE }}>
            {r.mock.web && r.mock.api && (
              <div className="view-switch" role="tablist" aria-label="What to explore">
                {(
                  [
                    ["site", "The site"],
                    ["api", "The API"],
                  ] as const
                ).map(([v, label]) => (
                  <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
                    {view === v && <motion.span layoutId="rl-view-pill" className="view-pill" transition={{ type: "spring", stiffness: 460, damping: 36 }} />}
                    <span className="vs-label">{label}</span>
                  </button>
                ))}
              </div>
            )}
            {view === "site" && r.mock.web ? (
              <div className="browser rl-browser">
                <div className="br-bar">
                  <span className="dots" aria-hidden>
                    <i />
                    <i />
                    <i />
                  </span>
                  <form
                    className="br-url editable"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setFrameKey((k) => k + 1);
                    }}
                  >
                    <span className="live-dot" aria-hidden />
                    <span className="br-host">localhost:{port}</span>
                    <input value={route} onChange={(e) => setRoute(e.target.value.startsWith("/") ? e.target.value : "/" + e.target.value)} spellCheck={false} aria-label="Path" />
                  </form>
                  <button type="button" className="br-open plain" onClick={() => setFrameKey((k) => k + 1)} aria-label="Reload">
                    <Icon name="refresh" size={13} />
                  </button>
                  <a className="br-open" href={url} target="_blank" rel="noreferrer" aria-label="Open in a new tab">
                    <Icon name="arrow" size={13} />
                  </a>
                </div>
                {routes.length > 1 && (
                  <div className="rl-routes">
                    {routes.slice(0, 12).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={route === p ? "on" : ""}
                        onClick={() => {
                          setRoute(p);
                          setFrameKey((k) => k + 1);
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
                <div className="br-live tall">
                  <iframe key={`${frameKey}:${port}`} src={url} title="Your locally running app" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads" />
                </div>
                <div className="br-foot">
                  <span>
                    Your own running copy · click around, sign in, fill forms. If this stays blank, the app blocks being shown inside other pages. Use the open-in-new-tab button.
                  </span>
                </div>
              </div>
            ) : r.mock.api ? (
              <ApiTry endpoints={r.mock.api.endpoints} port={port} />
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      <CloneDialog
        report={r}
        open={dialog}
        onClose={() => setDialog(false)}
        onSaved={(job) => {
          const s = { jobId: job.jobId, dest: job.dest, display: job.display };
          setSaved(s);
          try {
            sessionStorage.setItem(key, JSON.stringify(s));
          } catch {}
        }}
      />
    </div>
  );
}
