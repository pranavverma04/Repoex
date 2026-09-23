"use client";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { CommitType, RepoReport } from "@ara/shared";
import { CountUp, EASE, Icon, Reveal, TYPE_META, ago, monthLabel } from "./ui";

function Activity({ weekly }: { weekly: RepoReport["work"]["weekly"] }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  // draw at the container's real pixel width so text and bar radii stay crisp
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 210;
  const pad = { l: 30, r: 4, t: 16, b: 24 };
  const max = Math.max(1, ...weekly.map((w) => w.count));
  const n = weekly.length;
  const step = (W - pad.l - pad.r) / Math.max(n, 1);
  const bw = Math.max(2, step - 2); // 2px surface gap between adjacent bars
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const h = hover !== null ? weekly[hover] : null;
  const total = weekly.reduce((a, w) => a + w.count, 0);

  return (
    <div className="activity" ref={box} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="act-svg" role="img" aria-label={`Commits per week over ${n} weeks, ${total} in total, peak ${max}`}>
        <line x1={pad.l} x2={W - pad.r} y1={y(max)} y2={y(max)} className="grid" />
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="axis" />
        <text x={pad.l - 6} y={y(max) + 4} className="tick" textAnchor="end">
          {max}
        </text>
        <text x={pad.l - 6} y={y(0) + 4} className="tick" textAnchor="end">
          0
        </text>
        {weekly.map((w, i) => {
          const x = pad.l + i * step + 1;
          const top = y(w.count);
          const hgt = y(0) - top;
          const r = Math.min(4, bw / 2, hgt);
          return (
            <g key={w.week}>
              {w.count > 0 && (
                <motion.path
                  d={`M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y(0)} Z`}
                  className={`bar${hover === i ? " on" : ""}${hover !== null && hover !== i ? " dim" : ""}`}
                  style={{ transformOrigin: `0px ${y(0)}px` }}
                  initial={reduce ? false : { scaleY: 0 }}
                  whileInView={{ scaleY: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, ease: EASE, delay: 0.1 + (i / n) * 0.6 }}
                />
              )}
              {/* hit target covers the full column, bigger than the mark */}
              <rect x={pad.l + i * step} y={pad.t} width={step} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
            </g>
          );
        })}
        {n > 0 && (
          <>
            <text x={pad.l} y={H - 6} className="tick">
              {fmt(weekly[0].week)}
            </text>
            <text x={W - pad.r} y={H - 6} className="tick" textAnchor="end">
              {fmt(weekly[n - 1].week)}
            </text>
          </>
        )}
      </svg>
      {h && hover !== null && (
        <div className="act-tip" style={{ left: `${((pad.l + hover * step + step / 2) / W) * 100}%` }}>
          <b>{h.count}</b> commit{h.count === 1 ? "" : "s"}
          <span>week of {fmt(h.week)}</span>
        </div>
      )}
    </div>
  );
}

function TypeBar({ byType, total }: { byType: RepoReport["work"]["byType"]; total: number }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<CommitType | null>(null);
  return (
    <div className="typebar-wrap">
      <div className="typebar" role="img" aria-label={byType.map((t) => `${TYPE_META[t.type].label} ${t.count}`).join(", ")} onMouseLeave={() => setHover(null)}>
        {byType.map((t, i) => (
          <motion.span
            key={t.type}
            className={hover && hover !== t.type ? "dim" : ""}
            style={{ background: TYPE_META[t.type].color }}
            initial={reduce ? false : { flexGrow: 0.0001 }}
            whileInView={{ flexGrow: t.count }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease: EASE, delay: 0.1 + i * 0.07 }}
            onMouseEnter={() => setHover(t.type)}
          />
        ))}
      </div>
      <ul className="legend">
        {byType.map((t) => (
          <li key={t.type} className={hover && hover !== t.type ? "dim" : ""} onMouseEnter={() => setHover(t.type)} onMouseLeave={() => setHover(null)}>
            <span className="swatch" style={{ background: TYPE_META[t.type].color }} aria-hidden />
            <span className="lg-name">{TYPE_META[t.type].label}</span>
            <span className="lg-val">
              {t.count} · {Math.round((t.count / Math.max(total, 1)) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TypeBadge({ type }: { type: CommitType }) {
  return (
    <span className="type-badge">
      <span className="swatch" style={{ background: TYPE_META[type].color }} aria-hidden />
      {TYPE_META[type].label}
    </span>
  );
}

function Timeline({ report: r }: { report: RepoReport }) {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 60%"] });
  const scaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const reduce = useReducedMotion();
  const [showAll, setShowAll] = useState(false);
  const months = showAll ? r.work.months : r.work.months.slice(0, 6);
  return (
    <>
      <ol className="timeline" ref={ref}>
        <span className="tl-rail" aria-hidden>
          <motion.span className="tl-rail-fill" style={{ scaleY: reduce ? 1 : scaleY }} />
        </span>
        {months.map((m, i) => (
          <Reveal as="li" key={m.month} className="tl-month" delay={Math.min(i, 3) * 0.04}>
            <span className="tl-node" aria-hidden />
            <div className="tl-head">
              <h4>{monthLabel(m.month)}</h4>
              <span className="tl-count">
                {m.count} commit{m.count === 1 ? "" : "s"}
              </span>
              <span className="tl-mini" aria-hidden>
                {(Object.entries(m.byType) as [CommitType, number][]).map(([t, c]) => (
                  <span key={t} style={{ flexGrow: c, background: TYPE_META[t].color }} />
                ))}
              </span>
            </div>
            <ul className="tl-commits">
              {m.highlights.map((c) => (
                <li key={c.sha}>
                  <TypeBadge type={c.type} />
                  <a href={`${r.repo.url}/commit/${c.sha}`} target="_blank" rel="noreferrer" className="tl-msg">
                    {c.message}
                  </a>
                  <span className="tl-by">
                    {c.author} · {new Date(c.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </ol>
      {r.work.months.length > 6 && (
        <button type="button" className="ghost show-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer months" : `Show all ${r.work.months.length} months`}
        </button>
      )}
    </>
  );
}

export function WorkSection({ report: r }: { report: RepoReport }) {
  const w = r.work;
  const reduce = useReducedMotion();
  const maxC = Math.max(...w.contributors.map((c) => c.commits), 1);
  if (!w.commitsAnalyzed) {
    return (
      <section id="work" className="rp-section">
        <h2>Work done</h2>
        <p className="muted">No commit history was found for this branch.</p>
      </section>
    );
  }
  return (
    <section id="work" className="rp-section" aria-labelledby="work-h">
      <Reveal>
        <div className="sec-head">
          <h2 id="work-h">Work done</h2>
          <p className="sec-note">
            {w.truncated ? `Latest ${w.commitsAnalyzed} of ${r.repo.totalCommits?.toLocaleString()} commits` : `All ${w.commitsAnalyzed} commits`}
          </p>
        </div>
      </Reveal>

      <Reveal className="card work-summary">
        <p>{w.summary}</p>
        <dl className="mini-stats">
          <div>
            <dt>Commits read</dt>
            <dd>
              <CountUp value={w.commitsAnalyzed} />
            </dd>
          </div>
          <div>
            <dt>People</dt>
            <dd>
              <CountUp value={w.contributorCount ?? w.contributors.length} />
            </dd>
          </div>
          <div>
            <dt>First in range</dt>
            <dd className="date">{w.firstDate ? new Date(w.firstDate).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "–"}</dd>
          </div>
          <div>
            <dt>Latest</dt>
            <dd className="date">{ago(w.lastDate)}</dd>
          </div>
        </dl>
      </Reveal>

      <div className="work-grid">
        <Reveal className="card">
          <h3 className="sub-h">Commits per week{w.weekly.length >= 52 ? " · last 12 months" : ""}</h3>
          <Activity weekly={w.weekly} />
        </Reveal>
        <Reveal className="card" delay={0.05}>
          <h3 className="sub-h">What kind of work</h3>
          <TypeBar byType={w.byType} total={w.commitsAnalyzed} />
        </Reveal>
      </div>

      <Reveal>
        <h3 className="sub-h tl-title">Month by month</h3>
      </Reveal>
      <Timeline report={r} />

      <div className="work-grid three">
        {w.contributors.length > 0 && (
          <Reveal className="card">
            <h3 className="sub-h">Who built it</h3>
            <ul className="people">
              {w.contributors.map((c, i) => (
                <li key={c.name}>
                  {c.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.avatarUrl} alt="" width={28} height={28} loading="lazy" />
                  ) : (
                    <span className="initial" aria-hidden>
                      {c.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="pp-name">{c.login ? <a href={`https://github.com/${c.login}`} target="_blank" rel="noreferrer">{c.name}</a> : c.name}</span>
                  <span className="pp-bar" aria-hidden>
                    <motion.span initial={reduce ? false : { scaleX: 0 }} whileInView={{ scaleX: c.commits / maxC }} viewport={{ once: true }} transition={{ duration: 0.8, ease: EASE, delay: 0.1 + i * 0.04 }} />
                  </span>
                  <span className="pp-n">{c.commits}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        )}
        {w.areas.length > 0 && (
          <Reveal className="card" delay={0.05}>
            <h3 className="sub-h">Most-changed areas</h3>
            <ul className="kv-list rank">
              {w.areas.map((a) => (
                <li key={a.path}>
                  <code>{a.path === "(root)" ? "(top level)" : `${a.path}/`}</code>
                  <span>
                    {a.commits} commits · mostly <TypeBadge type={a.mainType} />
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        )}
        {w.hotspots.length > 0 && (
          <Reveal className="card" delay={0.1}>
            <h3 className="sub-h">Most-edited files</h3>
            <ul className="kv-list rank">
              {w.hotspots.map((h) => (
                <li key={h.path}>
                  <code>{h.path}</code>
                  <span>{h.commits} commits</span>
                </li>
              ))}
            </ul>
          </Reveal>
        )}
      </div>

      {w.releases.length > 0 && (
        <Reveal className="card releases">
          <h3 className="sub-h">Releases</h3>
          <ul>
            {w.releases.map((x) => (
              <li key={x.tag}>
                <a href={x.url} target="_blank" rel="noreferrer">
                  <Icon name="tag" size={14} />
                  <b>{x.tag}</b>
                  <span>{new Date(x.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                </a>
              </li>
            ))}
          </ul>
        </Reveal>
      )}
    </section>
  );
}
