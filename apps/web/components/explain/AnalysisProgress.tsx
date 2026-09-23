"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import type { ExplainJob } from "@ara/shared";
import { EASE } from "./ui";

export function AnalysisProgress({ job, fullName, onRetry }: { job: ExplainJob | null; fullName: string; onRetry: () => void }) {
  const reduce = useReducedMotion();
  const logRef = useRef<HTMLOListElement>(null);
  const stages = job?.stages ?? [];
  const progress = job?.progress ?? 4;
  const failed = job?.status === "failed";

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [job?.log.length, reduce]);

  return (
    <motion.section
      className={`analysis${failed ? " failed" : ""}`}
      initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -24, filter: "blur(8px)" }}
      transition={{ duration: 0.7, ease: EASE }}
      aria-live="polite"
    >
      <header className="an-head">
        <div>
          <p className="kicker">{failed ? "Stopped" : job?.status === "done" ? "Done" : "Reading the repository"}</p>
          <h2 className="an-title">
            {fullName.split("/")[0]}/<b>{fullName.split("/")[1]}</b>
          </h2>
        </div>
        <div className="an-ring" aria-label={`${progress}% done`}>
          <svg viewBox="0 0 64 64" width="64" height="64">
            <circle cx="32" cy="32" r="27" className="an-ring-bg" />
            <motion.circle
              cx="32"
              cy="32"
              r="27"
              className="an-ring-fg"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: progress / 100 }}
              transition={{ duration: 0.8, ease: EASE }}
            />
          </svg>
          <span>{progress}%</span>
        </div>
      </header>

      <div className="an-body">
        <ol className="stages">
          {stages.map((s, i) => (
            <motion.li
              key={s.key}
              className={`stage st-${s.status}`}
              initial={reduce ? false : { opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.07, duration: 0.5, ease: EASE }}
            >
              <span className="st-node" aria-hidden>
                {i < stages.length - 1 && (
                  <span className="st-rail">
                    <motion.span className="st-rail-fill" initial={{ scaleY: 0 }} animate={{ scaleY: s.status === "done" || s.status === "skipped" ? 1 : 0 }} transition={{ duration: 0.6, ease: EASE }} />
                  </span>
                )}
                <svg viewBox="0 0 28 28" width="28" height="28">
                  <circle cx="14" cy="14" r="12" className="st-disc" />
                  {s.status === "active" && <circle cx="14" cy="14" r="12" className="st-orbit" />}
                  {s.status === "done" && (
                    <motion.path d="M8.5 14.5l3.6 3.6L19.5 10" className="st-check" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, ease: EASE }} />
                  )}
                  {s.status === "failed" && <path d="M10 10l8 8M18 10l-8 8" className="st-x" />}
                </svg>
              </span>
              <div className="st-text">
                <span className="st-label">{s.label}</span>
                <AnimatePresence mode="wait">
                  {s.detail && (
                    <motion.span key={s.detail} className="st-detail" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                      {s.detail}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </motion.li>
          ))}
          {!stages.length &&
            Array.from({ length: 7 }, (_, i) => (
              <li key={i} className="stage st-pending">
                <span className="st-node" aria-hidden>
                  <svg viewBox="0 0 28 28" width="28" height="28">
                    <circle cx="14" cy="14" r="12" className="st-disc" />
                  </svg>
                </span>
                <span className="sk" style={{ width: `${40 + ((i * 37) % 35)}%`, height: 12 }} />
              </li>
            ))}
        </ol>

        <div className="an-log" aria-label="Live log">
          <div className="term-bar" aria-hidden>
            <i />
            <i />
            <i />
            <span>analysis.log</span>
          </div>
          <ol ref={logRef}>
            <AnimatePresence initial={false}>
              {(job?.log ?? []).map((l) => (
                <motion.li key={l.at + l.text} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
                  <span className="t">{new Date(l.at).toLocaleTimeString([], { hour12: false })}</span> {l.text}
                </motion.li>
              ))}
            </AnimatePresence>
            {!failed && job?.status !== "done" && (
              <li className="cursor-line" aria-hidden>
                <span className="cursor" />
              </li>
            )}
          </ol>
        </div>
      </div>

      {failed && (
        <motion.div className="an-error" role="alert" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <p>{job?.error}</p>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </motion.div>
      )}
    </motion.section>
  );
}
