"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ProjectKind, RepoReport } from "@ara/shared";
import { api } from "@/lib/api";
import { CloneDialog } from "./CloneDialog";
import { MockSection } from "./Mock";
import { RunSection } from "./Run";
import { StackSection } from "./Stack";
import { StructureSection } from "./Structure";
import { CopyButton, CountUp, EASE, Icon, Reveal, SplitText, ago, compact } from "./ui";
import { WorkSection } from "./Work";

type TabId = "overview" | "stack" | "structure" | "work" | "run" | "mock";

const KIND_LABEL: Record<ProjectKind, string> = {
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

function tabsFor(r: RepoReport): { id: TabId; label: string; icon: string; count: string | null }[] {
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

const isTab = (s: string): s is TabId => ["overview", "stack", "structure", "work", "run", "mock"].includes(s);

function Overview({ r }: { r: RepoReport }) {
  const [level, setLevel] = useState<"plain" | "technical">("plain");
  return (
    <section className="rp-section" aria-labelledby="overview-h">
      <div className="sec-head">
        <h2 id="overview-h">Overview</h2>
        <div className="toggle" role="tablist" aria-label="Explanation level">
          {(
            [
              ["plain", "In plain words"],
              ["technical", "For developers"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={level === k} className={level === k ? "on" : ""} onClick={() => setLevel(k)}>
              {level === k && <motion.span layoutId="lvl-pill" className="toggle-pill" transition={{ type: "spring", stiffness: 480, damping: 36 }} />}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="card overview-card">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={level}
            className="overview-text"
            initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            {level === "plain" ? r.overview.plain : r.overview.technical}
          </motion.p>
        </AnimatePresence>
        <div className="audience">
          <span className="aud-label">Who it's for</span>
          <span>{r.overview.audience}</span>
        </div>
        {!r.ai.used && (
          <p className="ai-note">
            <Icon name="spark" size={13} /> Built from the repo's own data. Add an Anthropic, Groq or Gemini key in <code>apps/backend/.env</code> for a written explanation
            {r.ai.error ? ` (last attempt failed: ${r.ai.error})` : ""}.
          </p>
        )}
      </div>
      {r.overview.highlights.length > 0 && (
        <div className="hl-wrap">
          <h3 className="sub-h">Highlights</h3>
          <ul className="highlights">
            {r.overview.highlights.map((h, i) => (
              <Reveal as="li" key={h} delay={i * 0.05} y={12}>
                <span className="hl-mark" aria-hidden />
                {h}
              </Reveal>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function Report({ report }: { report: RepoReport }) {
  const r = report;
  const router = useRouter();
  const reduce = useReducedMotion();
  const tabs = tabsFor(r);
  const [tab, setTab] = useState<TabId>("overview");
  const [trail, setTrail] = useState<TabId[]>(["overview"]);
  const [dir, setDir] = useState(1);
  const [rerun, setRerun] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [printing, setPrinting] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);

  // the PDF should hold every section, not just the open tab
  useEffect(() => {
    const on = () => setPrinting(true);
    const off = () => setPrinting(false);
    window.addEventListener("beforeprint", on);
    window.addEventListener("afterprint", off);
    return () => {
      window.removeEventListener("beforeprint", on);
      window.removeEventListener("afterprint", off);
    };
  }, []);

  // Open the tab named in the URL (#stack), and follow the browser's back/forward buttons.
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (isTab(h)) {
      setTab(h);
      setTrail([h]);
      history.replaceState({ tab: h }, "", `#${h}`);
    } else history.replaceState({ tab: "overview" }, "", window.location.pathname);
    setShareUrl(window.location.href.split("#")[0]);
    const onPop = () => {
      const t = window.location.hash.slice(1);
      const next: TabId = isTab(t) ? t : "overview";
      setTab((cur) => {
        setDir(tabs.findIndex((x) => x.id === next) >= tabs.findIndex((x) => x.id === cur) ? 1 : -1);
        return next;
      });
      setTrail((tr) => (tr.length > 1 ? tr.slice(0, -1) : [next]));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = useCallback(
    (id: TabId) => {
      if (id === tab) return;
      setDir(tabs.findIndex((x) => x.id === id) > tabs.findIndex((x) => x.id === tab) ? 1 : -1);
      history.pushState({ tab: id }, "", `#${id}`);
      setTrail((t) => [...t, id]);
      setTab(id);
      document.querySelector(".rp-tabs")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
    },
    [tab, tabs, reduce],
  );

  function back() {
    if (trail.length > 1) history.back();
    else router.push(`/?repo=${encodeURIComponent(r.repo.fullName)}`);
  }

  async function regenerate() {
    setRerun(true);
    try {
      const res = await api.startExplain({ owner: r.repo.owner, repo: r.repo.name, branch: r.branch, force: true });
      if (res.reportId) window.location.reload();
      else router.push(`/?repo=${encodeURIComponent(r.repo.fullName)}&job=${res.jobId}`);
    } catch (e) {
      setToast((e as Error).message);
      setRerun(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const idx = tabs.findIndex((t) => t.id === tab);
  const prevTab = trail.length > 1 ? tabs.find((t) => t.id === trail[trail.length - 2]) : null;
  const stats = [
    { icon: "star", label: "Stars", value: r.repo.stars },
    { icon: "fork", label: "Forks", value: r.repo.forks },
    { icon: "commit", label: "Commits", value: r.repo.totalCommits ?? r.work.commitsAnalyzed },
    { icon: "people", label: "Contributors", value: r.work.contributorCount ?? r.work.contributors.length },
    { icon: "issue", label: "Open issues", value: r.repo.openIssues },
    ...(r.repo.openPulls !== null ? [{ icon: "pr", label: "Open PRs", value: r.repo.openPulls }] : []),
  ];

  return (
    <div className="report">
      <div className="rp-backrow">
        <motion.button type="button" className="back-link" onClick={back} whileHover={reduce ? undefined : { x: -3 }} transition={{ duration: 0.3 }}>
          <Icon name="arrow" size={16} className="flip" />
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={prevTab?.id ?? "search"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
              {prevTab ? `Back to ${prevTab.label}` : "Back to search"}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>

      <header className="rp-head">
        <motion.div className="rp-id" initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.repo.avatarUrl} alt="" width={56} height={56} className="rp-avatar" />
          <div>
            <p className="kicker">
              {r.overview.kinds.map((k) => KIND_LABEL[k]).join(" · ")}
              <span className="kicker-sep">·</span>
              <code>{r.branch}</code> @ <code>{r.sha.slice(0, 7)}</code>
            </p>
            <h1 className="rp-name">
              <span className="muted">{r.repo.owner}/</span>
              {r.repo.name}
            </h1>
          </div>
        </motion.div>
        <SplitText as="p" className="rp-oneliner" text={r.overview.oneLiner} delay={0.15} />
        {r.repo.topics.length > 0 && (
          <ul className="topics" aria-label="Topics">
            {r.repo.topics.slice(0, 10).map((t, i) => (
              <motion.li key={t} initial={reduce ? false : { opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 + i * 0.04, duration: 0.4, ease: EASE }}>
                {t}
              </motion.li>
            ))}
          </ul>
        )}
        <dl className="rp-stats">
          {stats.map((s, i) => (
            <motion.div key={s.label} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + i * 0.06, duration: 0.6, ease: EASE }}>
              <dt>
                <Icon name={s.icon} size={14} /> {s.label}
              </dt>
              <dd>
                <CountUp value={s.value} format={compact} />
              </dd>
            </motion.div>
          ))}
        </dl>
        <motion.div className="rp-actions" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.6 }}>
          <button type="button" className="primary-cta" onClick={() => setCloneOpen(true)}>
            <Icon name="download" size={16} /> Save a copy
          </button>
          <a className="button ghost" href={r.repo.url} target="_blank" rel="noreferrer">
            <Icon name="github" size={16} /> Open on GitHub
          </a>
          <CopyButton text={shareUrl} label="Copy share link" />
          <a className="button ghost" href={api.markdownUrl(r.reportId)} download>
            <Icon name="download" size={16} /> Markdown
          </a>
          <button type="button" className="ghost" onClick={() => window.print()}>
            <Icon name="print" size={16} /> Save as PDF
          </button>
          <button type="button" className="ghost" onClick={regenerate} disabled={rerun}>
            <Icon name="refresh" size={16} className={rerun ? "spin" : ""} /> {rerun ? "Starting…" : "Regenerate"}
          </button>
        </motion.div>
        <p className="rp-foot muted small">
          {r.repo.license && (
            <>
              <Icon name="scale" size={13} /> {r.repo.license} ·{" "}
            </>
          )}
          Created {ago(r.repo.createdAt)} · last push {ago(r.repo.pushedAt)} · report made {ago(r.generatedAt)}
          {r.ai.used ? ` · written with ${r.ai.provider}` : " · written from repo data"}
        </p>
      </header>

      <nav className="rp-tabs" aria-label="Report sections">
        <div className="rp-tabs-inner" role="tablist">
          {tabs.map((t, i) => (
            <motion.button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="rp-panel"
              className={tab === t.id ? "on" : ""}
              onClick={() => select(t.id)}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.05, duration: 0.5, ease: EASE }}
            >
              {tab === t.id && <motion.span layoutId="rp-tab-pill" className="rp-tab-pill" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
              <Icon name={t.icon} size={15} />
              <span className="rp-tab-label">{t.label}</span>
              {t.count && <span className="rp-tab-count">{t.count}</span>}
            </motion.button>
          ))}
        </div>
      </nav>

      {printing && (
        <div className="print-all">
          <Overview r={r} />
          <StackSection report={r} />
          <StructureSection report={r} />
          <WorkSection report={r} />
          <RunSection report={r} />
          <MockSection report={r} />
        </div>
      )}
      <div id="rp-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="rp-panel" hidden={printing}>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={tab}
            custom={dir}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 36, filter: "blur(6px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -28, filter: "blur(6px)" }}
            transition={{ duration: 0.38, ease: EASE }}
          >
            {tab === "overview" && <Overview r={r} />}
            {tab === "stack" && <StackSection report={r} />}
            {tab === "structure" && <StructureSection report={r} />}
            {tab === "work" && <WorkSection report={r} />}
            {tab === "run" && <RunSection report={r} />}
            {tab === "mock" && <MockSection report={r} />}
          </motion.div>
        </AnimatePresence>

        <div className="pager">
          {idx > 0 ? (
            <button type="button" className="ghost" onClick={() => select(tabs[idx - 1].id)}>
              <Icon name="arrow" size={15} className="flip" /> {tabs[idx - 1].label}
            </button>
          ) : (
            <span />
          )}
          {idx < tabs.length - 1 && (
            <button type="button" onClick={() => select(tabs[idx + 1].id)}>
              Next: {tabs[idx + 1].label} <Icon name="arrow" size={15} />
            </button>
          )}
        </div>
      </div>

      <CloneDialog report={r} open={cloneOpen} onClose={() => setCloneOpen(false)} />

      <AnimatePresence>
        {toast && (
          <motion.div className="toast" role="status" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
