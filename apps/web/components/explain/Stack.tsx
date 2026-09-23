"use client";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { RepoReport } from "@ara/shared";
import { EASE, LANG_COLORS, Reveal } from "./ui";

export function StackSection({ report: r }: { report: RepoReport }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const langs = r.stack.languages;
  const top = langs.slice(0, 5);
  const rest = langs.slice(5).reduce((a, l) => a + l.pct, 0);
  const segs = [...top.map((l, i) => ({ name: l.name, pct: l.pct, color: LANG_COLORS[i] })), ...(rest > 0.05 ? [{ name: "Other", pct: rest, color: "var(--s-other)" }] : [])];
  const tools = r.stack.groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <section id="stack" className="rp-section" aria-labelledby="stack-h">
      <Reveal>
        <div className="sec-head">
          <h2 id="stack-h">Tech stack</h2>
          <p className="sec-note">
            {tools} tools recognised
            {r.stack.otherDependencies ? `, plus ${r.stack.otherDependencies} other dependencies` : ""}. Each one names the file it was found in.
          </p>
        </div>
      </Reveal>

      {segs.length > 0 && (
        <Reveal className="card lang-card">
          <h3 className="sub-h">Languages</h3>
          <div className="lang-bar" role="img" aria-label={segs.map((s) => `${s.name} ${s.pct.toFixed(1)}%`).join(", ")} onMouseLeave={() => setHover(null)}>
            {segs.map((s, i) => (
              <motion.span
                key={s.name}
                className={`lang-seg${hover !== null && hover !== i ? " dim" : ""}`}
                style={{ background: s.color }}
                initial={reduce ? false : { flexGrow: 0.0001 }}
                whileInView={{ flexGrow: Math.max(s.pct, 0.6) }}
                viewport={{ once: true }}
                transition={{ duration: 1.1, ease: EASE, delay: 0.1 + i * 0.08 }}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                tabIndex={0}
                aria-label={`${s.name} ${s.pct.toFixed(1)}%`}
              >
                {hover === i && (
                  <motion.span className="tip" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                    <b>{s.name}</b> {s.pct.toFixed(1)}%
                  </motion.span>
                )}
              </motion.span>
            ))}
          </div>
          <ul className="legend">
            {segs.map((s, i) => (
              <li key={s.name} className={hover !== null && hover !== i ? "dim" : ""} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <span className="swatch" style={{ background: s.color }} aria-hidden />
                <span className="lg-name">{s.name}</span>
                <span className="lg-val">{s.pct < 0.1 ? "<0.1" : s.pct.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </Reveal>
      )}

      <div className="stack-grid">
        {r.stack.groups.map((g, gi) => (
          <Reveal key={g.category} className="card stack-card" delay={(gi % 3) * 0.06}>
            <h3 className="sub-h">{g.category}</h3>
            <ul className="chips">
              {g.items.map((it, i) => (
                <motion.li
                  key={it.name}
                  className={it.dev ? "chip-dev" : ""}
                  title={`Found in ${it.source}${it.dev ? " (development only)" : ""}`}
                  initial={reduce ? false : { opacity: 0, scale: 0.9, y: 6 }}
                  whileInView={{ opacity: 1, scale: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, ease: EASE, delay: 0.15 + i * 0.035 }}
                >
                  <span className="chip-name">{it.name}</span>
                  {it.version && <span className="chip-ver">{it.version}</span>}
                  {it.dev && <span className="chip-flag">dev</span>}
                </motion.li>
              ))}
            </ul>
          </Reveal>
        ))}
        {r.stack.packageManagers.length > 0 && (
          <Reveal className="card stack-card pm-card">
            <h3 className="sub-h">Package managers</h3>
            <ul className="chips">
              {r.stack.packageManagers.map((p) => (
                <li key={p}>
                  <span className="chip-name">{p}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        )}
      </div>
    </section>
  );
}
