"use client";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Endpoint, LiveSite, MockOutput, RepoReport, SiteTheme, WebPage } from "@ara/shared";
import { api } from "@/lib/api";
import { RunLocally } from "./RunLocally";
import { CopyButton, EASE, Icon, Reveal } from "./ui";

type Tab = "web" | "api" | "cli" | "library";
const TAB_LABEL: Record<Tab, string> = { web: "Pages", api: "API", cli: "Terminal", library: "Library usage" };

// --- Web -------------------------------------------------------------------

type WebView = "live" | "files" | "sketch";

function Lines({ n, widths = [92, 78, 85, 60] }: { n: number; widths?: number[] }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="wf-line shimmer" style={{ width: `${widths[i % widths.length]}%` }} />
      ))}
    </>
  );
}

/** Loads the repo's Google font for the sketch, when it names one. */
function useGoogleFont(font: string | null | undefined) {
  useEffect(() => {
    if (!font || !/^[A-Z][\w ]+$/.test(font)) return;
    const id = `gf-${font.replace(/\s+/g, "-")}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;600;700&display=swap`;
    document.head.appendChild(link);
  }, [font]);
}

function PageView({ page, site, theme }: { page: WebPage; site: string; theme: SiteTheme | null }) {
  const [h1, ...rest] = page.headings;
  const empty = !page.headings.length && !page.buttons.length && !page.paragraphs.length && !page.inputs.length && !page.images.length;
  const [hero, ...more] = page.images;
  const style = {
    ...(theme?.accent ? { "--wf-accent": theme.accent } : {}),
    ...(theme?.background ? { "--wf-bg": theme.background } : {}),
    ...(theme?.text ? { "--wf-text": theme.text } : {}),
    ...(theme?.font ? { "--wf-font": `"${theme.font}", var(--font-sans), sans-serif` } : {}),
  } as React.CSSProperties;
  return (
    <div className={`wf${theme?.dark ? " wf-dark" : ""}`} style={style}>
      <div className="wf-nav">
        <span className="wf-logo">
          {theme?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logo} alt="" className="wf-logo-img" />
          ) : (
            <span className="wf-logo-mark" aria-hidden />
          )}
          {site}
        </span>
        <span className="wf-links">
          {(page.links.length ? page.links : ["Home", "About", "Contact"]).slice(0, 5).map((l, i) => (
            <span key={i} className={page.links.length ? "" : "ghost-text"}>
              {l}
            </span>
          ))}
        </span>
      </div>
      <div className={`wf-hero${hero ? " with-img" : ""}`}>
        <div className="wf-hero-text">
          {h1 ? <h5 className="wf-h1">{h1}</h5> : <span className="wf-h1-sk shimmer" />}
          {page.paragraphs[0] ? <p className="wf-p">{page.paragraphs[0]}</p> : <Lines n={2} />}
          {page.inputs.length > 0 && (
            <div className="wf-inputs">
              {page.inputs.slice(0, 3).map((p) => (
                <span key={p} className="wf-input">
                  {p}
                </span>
              ))}
            </div>
          )}
          {page.buttons.length > 0 && (
            <div className="wf-btns">
              {page.buttons.slice(0, 3).map((b, i) => (
                <span key={b} className={i === 0 ? "wf-btn primary" : "wf-btn"}>
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
        {hero && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt="" className="wf-hero-img" loading="lazy" />
        )}
      </div>
      <div className="wf-sections">
        {(rest.length ? rest : ["", ""]).slice(0, 4).map((h, i) => (
          <div key={i} className="wf-card">
            {more[i] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={more[i]} alt="" className="wf-card-img" loading="lazy" />
            )}
            {h ? <span className="wf-h2">{h}</span> : <span className="wf-h2-sk shimmer" />}
            {page.paragraphs[i + 1] ? <p className="wf-p small">{page.paragraphs[i + 1]}</p> : <Lines n={2} widths={[88, 64]} />}
          </div>
        ))}
      </div>
      {empty && <p className="wf-empty">This page builds its content at runtime, so only its layout could be sketched.</p>}
    </div>
  );
}

function FramedPage({ src, sandbox, title }: { src: string; sandbox: string; title: string }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [src]);
  return (
    <div className="br-live">
      <AnimatePresence>
        {!loaded && (
          <motion.div className="br-loading" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            <span className="br-spinner" aria-hidden />
            Loading {title}…
          </motion.div>
        )}
      </AnimatePresence>
      <iframe key={src} src={src} title={title} sandbox={sandbox} referrerPolicy="no-referrer" loading="lazy" onLoad={() => setLoaded(true)} />
    </div>
  );
}

function WebMock({ web, repo, reportId }: { web: NonNullable<MockOutput["web"]>; repo: RepoReport["repo"]; reportId: number }) {
  const [i, setI] = useState(0);
  const [sites, setSites] = useState<LiveSite[] | null>(null);
  const [view, setView] = useState<WebView | null>(null);
  useGoogleFont(web.theme?.font);

  useEffect(() => {
    api
      .liveSites(reportId)
      .then(setSites)
      .catch(() => setSites([]));
  }, [reportId]);

  const live = sites?.find((s) => s.frameable) ?? null;
  const blockedLive = !live ? sites?.[0] ?? null : null;
  const views: { id: WebView; label: string; note: string }[] = [
    ...(live ? [{ id: "live" as const, label: "Live site", note: `The deployed site at ${live.url.replace(/^https?:\/\//, "")}` }] : []),
    ...(web.staticSite ? [{ id: "files" as const, label: "Repo files", note: "The repo's own HTML, CSS and images, rendered with scripts turned off" }] : []),
    { id: "sketch" as const, label: "Sketch from code", note: "Drawn from the page's markup, in the site's own colours and images" },
  ];
  // open on the most real view available once the live-site check finishes
  useEffect(() => {
    if (sites !== null && view === null) setView(views[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites]);
  const current = view ?? (sites === null ? null : views[0].id);
  const page = web.pages[i];
  const route = page.route === "/" ? "" : page.route;
  const liveBase = live?.url.replace(/\/$/, "") ?? "";
  const url =
    current === "live"
      ? `${liveBase}${route}`
      : current === "files"
        ? api.staticUrl(reportId, page.file)
        : `${repo.homepage?.replace(/^https?:\/\//, "").replace(/\/$/, "") || "localhost:3000"}${route}`;

  return (
    <div className="mock-web-wrap">
      <div className="view-switch" role="tablist" aria-label="Preview type">
        {sites === null ? (
          <span className="vs-checking">
            <span className="br-spinner small" aria-hidden /> Looking for a deployed copy…
          </span>
        ) : (
          views.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={current === v.id} className={current === v.id ? "on" : ""} onClick={() => setView(v.id)}>
              {current === v.id && <motion.span layoutId="view-pill" className="view-pill" transition={{ type: "spring", stiffness: 460, damping: 36 }} />}
              <span className="vs-label">
                {v.id === "live" && <span className="live-dot" aria-hidden />}
                {v.label}
              </span>
            </button>
          ))
        )}
        {blockedLive && (
          <a className="vs-external" href={blockedLive.url} target="_blank" rel="noreferrer">
            Deployed site blocks embedding · open it <Icon name="arrow" size={13} />
          </a>
        )}
      </div>

      <div className="mock-web">
        <ul className="route-list" role="tablist" aria-label="Pages">
          {web.pages.map((p, k) => (
            <li key={p.route + p.file}>
              <button type="button" role="tab" aria-selected={k === i} className={k === i ? "on" : ""} onClick={() => setI(k)}>
                {k === i && <motion.span layoutId="route-on" className="route-pill" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                <span className="route-path">{p.route}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="browser">
          <div className="br-bar">
            <span className="dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <span className="br-url">
              <Icon name="link" size={12} />
              <AnimatePresence mode="wait">
                <motion.span key={url} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
                  {url.replace(/^https?:\/\//, "")}
                </motion.span>
              </AnimatePresence>
            </span>
            {(current === "live" || current === "files") && (
              <a className="br-open" href={current === "live" ? url : api.staticUrl(reportId, page.file)} target="_blank" rel="noreferrer" aria-label="Open in a new tab">
                <Icon name="arrow" size={13} />
              </a>
            )}
          </div>
          <div className="br-view">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${current}:${page.route}:${page.file}`}
                initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
                transition={{ duration: 0.4, ease: EASE }}
              >
                {current === "live" && <FramedPage src={url} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" title="the live site" />}
                {current === "files" && <FramedPage src={api.staticUrl(reportId, page.file)} sandbox="" title={page.file} />}
                {current === "sketch" && <PageView page={page} site={web.siteTitle ?? repo.name} theme={web.theme} />}
                {current === null && <div className="br-loading static"><span className="br-spinner" aria-hidden /></div>}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="br-foot">
            <span>
              {views.find((v) => v.id === current)?.note ?? "…"} · {web.framework} · <code>{page.file}</code>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- API -------------------------------------------------------------------

function methodClass(m: string) {
  return `m-${m.toLowerCase()}`;
}

function EndpointRow({ e, open, onToggle }: { e: Endpoint; open: boolean; onToggle: () => void }) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const body = e.exampleResponse ?? e.responseFromCode;
  useEffect(() => {
    if (!open) setState("idle");
  }, [open]);
  useEffect(() => {
    if (state !== "sending") return;
    const t = setTimeout(() => setState("done"), 850);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <li className={`ep${open ? " open" : ""}`}>
      <button type="button" className="ep-head" onClick={onToggle} aria-expanded={open}>
        <span className={`method ${methodClass(e.method)}`}>{e.method}</span>
        <code className="ep-path">{e.path}</code>
        <span className="ep-src">
          {e.file}:{e.line}
        </span>
        <motion.span className="ep-chev" animate={{ rotate: open ? 90 : 0 }}>
          <Icon name="chevron" size={14} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="ep-body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}>
            <div className="ep-inner">
              <div className="ep-block">
                <div className="ep-label">
                  Request <CopyButton text={e.request} />
                </div>
                <pre className="cmd">
                  <code>{e.request}</code>
                </pre>
                <button type="button" className="send" onClick={() => setState("sending")} disabled={state === "sending"}>
                  <Icon name="play" size={12} /> {state === "idle" ? "Send (simulated)" : state === "sending" ? "Sending…" : "Send again"}
                </button>
              </div>
              <div className="ep-block">
                <div className="ep-label">
                  Response
                  {state === "done" && <span className="status-ok">200 OK · simulated</span>}
                </div>
                <AnimatePresence mode="wait">
                  {state === "sending" ? (
                    <motion.div key="s" className="sending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <span />
                      <span />
                      <span />
                    </motion.div>
                  ) : state === "done" || state === "idle" ? (
                    <motion.div key={state} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                      {body ? (
                        <>
                          <pre className="cmd json">
                            <code>{body}</code>
                          </pre>
                          <p className="ep-note">{e.exampleResponse ? "Example written by the AI from the handler code." : `Copied from the handler in ${e.file}:${e.line}.`}</p>
                        </>
                      ) : (
                        <p className="ep-note">The handler doesn't return a literal value, so the response shape isn't visible without running it.</p>
                      )}
                      {e.bodyFields.length > 0 && (
                        <p className="ep-note">
                          Reads from the request body: {e.bodyFields.map((f) => <code key={f}>{f}</code>)}
                        </p>
                      )}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function ApiMock({ api }: { api: NonNullable<MockOutput["api"]> }) {
  const [open, setOpen] = useState<number | null>(() => {
    const k = api.endpoints.findIndex((e) => e.responseFromCode || e.exampleResponse);
    return k === -1 ? 0 : k;
  });
  const [filter, setFilter] = useState("ALL");
  const methods = ["ALL", ...new Set(api.endpoints.map((e) => e.method))];
  const list = api.endpoints.map((e, i) => ({ e, i })).filter(({ e }) => filter === "ALL" || e.method === filter);
  return (
    <div className="mock-api">
      <div className="api-top">
        <span>
          <b>{api.framework}</b> · {api.endpoints.length} endpoint{api.endpoints.length === 1 ? "" : "s"} · <code>{api.baseUrl}</code>
        </span>
        <div className="method-filter" role="tablist" aria-label="Filter by method">
          {methods.map((m) => (
            <button key={m} type="button" role="tab" aria-selected={filter === m} className={filter === m ? "on" : ""} onClick={() => setFilter(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <ul className="endpoints">
        {list.map(({ e, i }) => (
          <EndpointRow key={`${e.method} ${e.path} ${e.file}`} e={e} open={open === i} onToggle={() => setOpen(open === i ? null : i)} />
        ))}
      </ul>
    </div>
  );
}

// --- CLI -------------------------------------------------------------------

function Typed({ text, start, speed = 28, onDone }: { text: string; start: boolean; speed?: number; onDone?: () => void }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? text.length : 0);
  useEffect(() => {
    if (!start) return;
    if (reduce) {
      setN(text.length);
      onDone?.();
      return;
    }
    setN(0);
    let i = 0;
    const t = setInterval(() => {
      i++;
      setN(i);
      if (i >= text.length) {
        clearInterval(t);
        onDone?.();
      }
    }, speed);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, text]);
  return <>{text.slice(0, n)}</>;
}

function CliMock({ cli }: { cli: NonNullable<MockOutput["cli"]> }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });
  const [runId, setRunId] = useState(0);
  const [step, setStep] = useState(0); // index of the session item being typed
  const [shown, setShown] = useState<number[]>([]);
  const reduce = useReducedMotion();

  useEffect(() => {
    setStep(0);
    setShown([]);
  }, [runId]);

  return (
    <div className="mock-cli">
      <div className="terminal" ref={ref}>
        <div className="term-bar">
          <i />
          <i />
          <i />
          <span>{cli.binName} · simulated</span>
          <button type="button" className="mini replay" onClick={() => setRunId((n) => n + 1)}>
            <Icon name="refresh" size={12} /> Replay
          </button>
        </div>
        <div className="term-body" key={runId}>
          {cli.session.map((s, i) =>
            i > step ? null : (
              <div key={i} className="term-item">
                <div className="term-cmd">
                  <span className="prompt">$</span>{" "}
                  <Typed
                    text={s.command}
                    start={inView && i === step}
                    onDone={() => {
                      setShown((cur) => [...cur, i]);
                      setTimeout(() => setStep((cur) => Math.max(cur, i + 1)), reduce ? 0 : 500);
                    }}
                  />
                  {i === step && !shown.includes(i) && <span className="cursor" />}
                </div>
                {shown.includes(i) && (
                  <motion.pre className="term-out" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                    {s.output}
                    {s.aiWritten && <span className="ai-tag">example output written by AI</span>}
                  </motion.pre>
                )}
              </div>
            ),
          )}
          {step >= cli.session.length && (
            <div className="term-cmd">
              <span className="prompt">$</span> <span className="cursor" />
            </div>
          )}
        </div>
      </div>
      {cli.commands.length > 0 && (
        <div className="cli-cmds">
          <h4 className="sub-h">Commands found in the code</h4>
          <ul className="kv-list">
            {cli.commands.map((c) => (
              <li key={c.usage}>
                <code>
                  {cli.binName} {c.usage === cli.binName ? "" : c.usage}
                </code>
                <span>
                  {c.description ?? "No description"} · <span className="muted">{c.file}:{c.line}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// --- Library ---------------------------------------------------------------

function LibMock({ lib }: { lib: NonNullable<MockOutput["library"]> }) {
  return (
    <div className="mock-lib">
      <div className="terminal small">
        <div className="term-bar">
          <i />
          <i />
          <i />
          <span>install</span>
          <CopyButton text={lib.install} />
        </div>
        <div className="term-body">
          <div className="term-cmd">
            <span className="prompt">$</span> {lib.install}
          </div>
        </div>
      </div>
      {lib.usage ? (
        <div className="code-card">
          <div className="code-top">
            <span>Usage · from the {lib.usageSource}</span>
            <CopyButton text={lib.usage} />
          </div>
          <pre>
            <code>{lib.usage}</code>
          </pre>
        </div>
      ) : (
        <p className="muted small">The README has no usage example that imports the package.</p>
      )}
      {lib.exports.length > 0 && (
        <div>
          <h4 className="sub-h">What it exports</h4>
          <ul className="chips">
            {lib.exports.map((x) => (
              <li key={x}>
                <code className="chip-name">{x}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function MockSection({ report: r }: { report: RepoReport }) {
  const m = r.mock;
  const tabs = (["web", "api", "cli", "library"] as Tab[]).filter((t) => m[t]);
  const [tab, setTab] = useState<Tab | null>(tabs[0] ?? null);
  const [mode, setMode] = useState<"overview" | "local">("overview");

  return (
    <section id="mock" className="rp-section" aria-labelledby="mock-h">
      <Reveal>
        <div className="sec-head">
          <h2 id="mock-h">Mock output</h2>
          <div className="toggle mode-toggle" role="tablist" aria-label="Preview or run">
            {(
              [
                ["overview", "Overview", "browser"],
                ["local", "Run it locally", "terminal"],
              ] as const
            ).map(([k, label, icon]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>
                {mode === k && <motion.span layoutId="mock-mode-pill" className="toggle-pill" transition={{ type: "spring", stiffness: 480, damping: 36 }} />}
                <span className="mode-label">
                  <Icon name={icon} size={14} /> {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </Reveal>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={mode} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.32, ease: EASE }}>
          {mode === "local" ? (
            <RunLocally report={r} />
          ) : (
            <>
              <div className="mock-banner">
                <Icon name="spark" size={15} />
                <span>
                  A quick look without running anything: the deployed site when there is one, the repo's own files for plain HTML sites, or a sketch drawn from the code. To click through the real thing, switch to <b>Run it locally</b>.
                </span>
              </div>
              {!tab ? (
                <div className="card">
                  <p className="muted">No pages, API routes, commands or library exports were found, so there's nothing to preview. This is common for config, docs, data or firmware repos.</p>
                </div>
              ) : (
                <div className="card mock-card">
                  {tabs.length > 1 && (
                    <div className="tabs" role="tablist" aria-label="Output type">
                      {tabs.map((t) => (
                        <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                          {TAB_LABEL[t]}
                          {tab === t && <motion.span layoutId="mock-tab-line" className="tab-line" transition={{ type: "spring", stiffness: 480, damping: 38 }} />}
                        </button>
                      ))}
                    </div>
                  )}
                  <AnimatePresence mode="wait">
                    <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
                      {tab === "web" && m.web && <WebMock web={m.web} repo={r.repo} reportId={r.reportId} />}
                      {tab === "api" && m.api && <ApiMock api={m.api} />}
                      {tab === "cli" && m.cli && <CliMock cli={m.cli} />}
                      {tab === "library" && m.library && <LibMock lib={m.library} />}
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
