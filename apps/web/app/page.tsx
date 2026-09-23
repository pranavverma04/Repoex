"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnalysisProgress } from "@/components/explain/AnalysisProgress";
import { RepoInput, parseLink } from "@/components/explain/RepoInput";
import { EASE, Icon, SplitText, ago } from "@/components/explain/ui";
import { api, type RecentReport, type RepoInput as Input } from "@/lib/api";
import { useExplainJob } from "@/lib/useExplainJob";

const COVERS = [
  { icon: "spark", title: "What it is", body: "A plain-words summary, plus a developer version." },
  { icon: "tag", title: "Tech stack", body: "Languages, frameworks and tools, read from its manifests." },
  { icon: "folder", title: "Structure", body: "An interactive file tree and what each folder holds." },
  { icon: "commit", title: "Work done", body: "Commit timeline, who built it, and what changed most." },
  { icon: "play", title: "How to run it", body: "Setup steps, scripts and the environment variables it reads." },
  { icon: "chat", title: "Mock output", body: "A preview of its pages, API responses or terminal output." },
];

export default function ExplainHome() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [jobId, setJobId] = useState<string | null>(null);
  const [target, setTarget] = useState<{ input: Input; branch?: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentReport[]>([]);
  const [initial, setInitial] = useState<string | undefined>(undefined);
  const { job } = useExplainJob(jobId);

  useEffect(() => {
    api.recentReports().then(setRecent).catch(() => {});
    const params = new URLSearchParams(window.location.search);
    const q = params.get("repo");
    if (q) setInitial(q.includes("github.com") ? q : `https://github.com/${q}`);
    const j = params.get("job");
    if (j && q) {
      const [owner, repo] = q.replace(/^https?:\/\/github\.com\//, "").split("/");
      setTarget({ input: { owner, repo }, name: `${owner}/${repo}` });
      setJobId(j);
    }
  }, []);

  // When the report is ready, give the last check mark a beat, then open it.
  useEffect(() => {
    if (job?.status === "done" && job.reportId) {
      const t = setTimeout(() => router.push(`/r/${job.reportId}`), reduce ? 0 : 900);
      return () => clearTimeout(t);
    }
  }, [job?.status, job?.reportId, router, reduce]);

  async function start(input: Input, branch?: string) {
    setBusy(true);
    setError(null);
    const p = "url" in input ? parseLink(input.url) : input;
    const name = p ? `${p.owner}/${p.repo}` : "repository";
    try {
      const res = await api.startExplain({ ...input, branch });
      if (res.reportId) {
        router.push(`/r/${res.reportId}`);
        return;
      }
      setTarget({ input, branch, name });
      setJobId(res.jobId);
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const running = !!jobId;

  return (
    <div className="explain-home">
      <AnimatePresence mode="wait">
        {!running ? (
          <motion.div key="intro" className="home-intro" exit={{ opacity: 0, y: -30, filter: "blur(10px)" }} transition={{ duration: 0.5, ease: EASE }}>
            <section className="home-hero">
              <motion.p className="kicker" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
                <span className="kicker-dot" aria-hidden /> Repo explainer
              </motion.p>
              <SplitText as="h1" className="display" text="Understand *any GitHub repo* in a minute." delay={0.1} />
              <motion.p className="home-sub" initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.55 }}>
                Paste a link, or type a username and repo name. You get what it does, the tech behind it, the work that went into it, and a preview of what it produces. All of it is read from the code itself.
              </motion.p>
              <motion.div initial={reduce ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.7 }}>
                <RepoInput key={initial ?? "blank"} onStart={start} busy={busy} initial={initial} />
              </motion.div>
              <AnimatePresence>
                {error && (
                  <motion.p className="error home-error" role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>
            </section>

            <section className="covers" aria-labelledby="covers-h">
              <h2 id="covers-h" className="section-kicker">
                What the report covers
              </h2>
              <ul>
                {COVERS.map((c, i) => (
                  <motion.li
                    key={c.title}
                    initial={reduce ? false : { opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "0px 0px -10% 0px" }}
                    transition={{ duration: 0.7, ease: EASE, delay: i * 0.06 }}
                  >
                    <span className="cover-icon">
                      <Icon name={c.icon} size={18} />
                    </span>
                    <h3>{c.title}</h3>
                    <p>{c.body}</p>
                  </motion.li>
                ))}
              </ul>
            </section>

            {recent.length > 0 && (
              <section className="recent" aria-labelledby="recent-h">
                <h2 id="recent-h" className="section-kicker">
                  Recently explained
                </h2>
                <ul>
                  {recent.map((r, i) => (
                    <motion.li key={r.reportId} initial={reduce ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, ease: EASE, delay: i * 0.05 }}>
                      <Link href={`/r/${r.reportId}`} className="recent-card">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.avatarUrl} alt="" width={36} height={36} />
                        <span className="rc-main">
                          <span className="rc-name">{r.fullName}</span>
                          <span className="rc-line">{r.oneLiner}</span>
                        </span>
                        <span className="rc-meta">
                          {r.language && <span>{r.language}</span>}
                          <span>{ago(r.generatedAt)}</span>
                        </span>
                        <Icon name="arrow" size={16} className="rc-arrow" />
                      </Link>
                    </motion.li>
                  ))}
                </ul>
              </section>
            )}
          </motion.div>
        ) : (
          <motion.div key="run" className="home-run">
            <AnalysisProgress
              job={job}
              fullName={job?.fullName ?? target?.name ?? "repository"}
              onRetry={() => {
                const t = target;
                setJobId(null);
                if (t) void start(t.input, t.branch);
              }}
            />
            <button type="button" className="ghost back-btn" onClick={() => setJobId(null)}>
              ← Back
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
