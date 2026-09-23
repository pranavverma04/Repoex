"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import type { CloneJob, CloneLocation, CloneTarget, RepoReport } from "@ara/shared";
import { api } from "@/lib/api";
import { CopyButton, EASE, Icon } from "./ui";

const NAME_OK = /^[\w.@+-][\w .@+-]*$/;
const LAST_BASE = "ara:clone-base";

function nameProblem(n: string): string | null {
  if (!n.trim()) return "Give the folder a name.";
  if (n.startsWith(".")) return "Don't start the name with a dot.";
  if (!NAME_OK.test(n)) return "Use letters, numbers, spaces, dots, dashes or underscores. No slashes.";
  return null;
}

export function CloneDialog({ report, open, onClose, onSaved }: { report: RepoReport; open: boolean; onClose: () => void; onSaved?: (job: CloneJob) => void }) {
  const r = report;
  const reduce = useReducedMotion();
  const ids = { name: useId(), custom: useId(), branch: useId(), title: useId() };
  const [locations, setLocations] = useState<CloneLocation[] | null>(null);
  const [base, setBase] = useState<string>("");
  const [custom, setCustom] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [name, setName] = useState(r.repo.name);
  const [branch, setBranch] = useState(r.branch);
  const [shallow, setShallow] = useState(false);
  const [target, setTarget] = useState<CloneTarget | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [job, setJob] = useState<CloneJob | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // reset each time it opens
  useEffect(() => {
    if (!open) return;
    setJob(null);
    setStartError(null);
    setName(r.repo.name);
    setBranch(r.branch);
    api
      .cloneLocations()
      .then((l) => {
        setLocations(l);
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(LAST_BASE);
        } catch {}
        const known = l.find((x) => x.path === saved);
        if (saved && !known) {
          setUseCustom(true);
          setCustom(saved);
        } else setBase(known?.path ?? l.find((x) => x.label === "Downloads")?.path ?? l[0]?.path ?? "");
      })
      .catch((e) => setCheckError(e.message));
    setTimeout(() => nameRef.current?.select(), 60);
  }, [open, r.repo.name, r.branch]);

  const chosenBase = useCustom ? custom : base;
  const localProblem = nameProblem(name);

  // live check: where it lands and whether the name is free
  useEffect(() => {
    setTarget(null);
    setCheckError(null);
    if (!open || localProblem || !chosenBase.trim()) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      api
        .cloneCheck(chosenBase, name, ctl.signal)
        .then(setTarget)
        .catch((e) => !ctl.signal.aborted && setCheckError(e.message));
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [open, chosenBase, name, localProblem]);

  useEffect(() => {
    if (job?.status === "done") onSaved?.(job);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  // poll the running clone
  useEffect(() => {
    if (!job || job.status !== "running") return;
    const t = setInterval(() => {
      api
        .cloneJob(job.jobId)
        .then(setJob)
        .catch(() => {});
    }, 400);
    return () => clearInterval(t);
  }, [job]);

  // Esc closes (not while cloning); keep focus inside the dialog
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && job?.status !== "running") onClose();
      if (e.key === "Tab" && panelRef.current) {
        const f = [...panelRef.current.querySelectorAll<HTMLElement>("button, input, select, a[href]")].filter((x) => !x.hasAttribute("disabled"));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, job?.status, onClose]);

  async function start(e?: React.FormEvent) {
    e?.preventDefault();
    if (localProblem || !target || target.exists) return;
    setStarting(true);
    setStartError(null);
    try {
      const j = await api.startClone(r.reportId, { base: chosenBase, name, branch, shallow });
      setJob(j);
      try {
        localStorage.setItem(LAST_BASE, useCustom ? custom : base);
      } catch {}
    } catch (err) {
      setStartError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  const canStart = !localProblem && !!target && !target.exists && !starting;
  const phase = job?.status === "done" ? "done" : job?.status === "failed" ? "failed" : job ? "running" : "form";
  const seconds = job?.finishedAt ? ((job.finishedAt - job.startedAt) / 1000).toFixed(1) : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="dlg-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onMouseDown={(e) => e.target === e.currentTarget && phase !== "running" && onClose()}>
          <motion.div
            ref={panelRef}
            className="dlg"
            role="dialog"
            aria-modal="true"
            aria-labelledby={ids.title}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.97, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98, filter: "blur(4px)" }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <header className="dlg-head">
              <span className="dlg-icon">
                <Icon name="download" size={18} />
              </span>
              <div>
                <h2 id={ids.title}>Save a copy</h2>
                <p className="muted small">
                  Clones <b>{r.repo.fullName}</b> onto this computer with git. Nothing from the repo runs.
                </p>
              </div>
              {phase !== "running" && (
                <button type="button" className="dlg-x" onClick={onClose} aria-label="Close">
                  ×
                </button>
              )}
            </header>

            <AnimatePresence mode="wait" initial={false}>
              {phase === "form" && (
                <motion.form key="form" onSubmit={start} className="dlg-body" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.28, ease: EASE }}>
                  <div className="dlg-field">
                    <label htmlFor={ids.name}>Folder name</label>
                    <div className={`dlg-input${localProblem || target?.exists ? " bad" : target ? " ok" : ""}`}>
                      <Icon name="folder" size={16} />
                      <input ref={nameRef} id={ids.name} value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} autoComplete="off" autoCapitalize="off" />
                    </div>
                    <p className="dlg-hint" aria-live="polite">
                      {localProblem ? (
                        <span className="warn">{localProblem}</span>
                      ) : target?.exists ? (
                        <span className="warn">
                          A folder with this name is already there.{" "}
                          {target.suggestion && (
                            <button type="button" className="linkish" onClick={() => setName(target.suggestion!)}>
                              Use {target.suggestion}
                            </button>
                          )}
                        </span>
                      ) : (
                        "The repo's files go inside a new folder with this name."
                      )}
                    </p>
                  </div>

                  <div className="dlg-field">
                    <span className="dlg-label">Save in</span>
                    <div className="loc-chips" role="radiogroup" aria-label="Save in">
                      {(locations ?? []).map((l) => (
                        <button
                          key={l.path}
                          type="button"
                          role="radio"
                          aria-checked={!useCustom && base === l.path}
                          className={!useCustom && base === l.path ? "on" : ""}
                          onClick={() => {
                            setUseCustom(false);
                            setBase(l.path);
                          }}
                        >
                          {!useCustom && base === l.path && <motion.span layoutId="loc-pill" className="loc-pill" transition={{ type: "spring", stiffness: 480, damping: 36 }} />}
                          <span className="loc-label">{l.label}</span>
                        </button>
                      ))}
                      <button type="button" role="radio" aria-checked={useCustom} className={useCustom ? "on" : ""} onClick={() => setUseCustom(true)}>
                        {useCustom && <motion.span layoutId="loc-pill" className="loc-pill" transition={{ type: "spring", stiffness: 480, damping: 36 }} />}
                        <span className="loc-label">Other folder…</span>
                      </button>
                    </div>
                    <AnimatePresence initial={false}>
                      {useCustom && (
                        <motion.div className="dlg-input custom" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }}>
                          <label htmlFor={ids.custom} className="sr-only">
                            Folder path
                          </label>
                          <input id={ids.custom} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="~/Projects" spellCheck={false} autoComplete="off" autoFocus />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="dlg-row">
                    <div className="dlg-field">
                      <label htmlFor={ids.branch}>Branch</label>
                      <div className="select">
                        <select id={ids.branch} value={branch} onChange={(e) => setBranch(e.target.value)}>
                          {(r.branches.length ? r.branches : [r.branch]).map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                        <Icon name="chevron" size={14} className="select-chev" />
                      </div>
                    </div>
                    <div className="dlg-field">
                      <span className="dlg-label">History</span>
                      <div className="toggle" role="radiogroup" aria-label="History">
                        {(
                          [
                            [false, "Full history"],
                            [true, "Latest only"],
                          ] as const
                        ).map(([v, label]) => (
                          <button key={label} type="button" role="radio" aria-checked={shallow === v} className={shallow === v ? "on" : ""} onClick={() => setShallow(v)}>
                            {shallow === v && <motion.span layoutId="hist-pill" className="toggle-pill" transition={{ type: "spring", stiffness: 480, damping: 36 }} />}
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="dlg-dest" aria-live="polite">
                    <span className="dlg-label">It will be saved at</span>
                    <code>{checkError ? "…" : target?.display ?? (localProblem ? "…" : "checking…")}</code>
                    {checkError && <span className="warn small">{checkError}</span>}
                  </div>

                  {startError && (
                    <p className="error dlg-error" role="alert">
                      {startError}
                    </p>
                  )}

                  <div className="dlg-actions">
                    <button type="button" className="ghost" onClick={onClose}>
                      Cancel
                    </button>
                    <button type="submit" disabled={!canStart}>
                      <Icon name="download" size={16} /> {starting ? "Starting…" : "Clone here"}
                    </button>
                  </div>
                </motion.form>
              )}

              {phase !== "form" && job && (
                <motion.div key="progress" className="dlg-body" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.28, ease: EASE }}>
                  <div className={`clone-status st-${phase}`}>
                    <div className="cs-ring" aria-hidden>
                      <svg viewBox="0 0 64 64" width="64" height="64">
                        <circle cx="32" cy="32" r="27" className="an-ring-bg" />
                        <motion.circle cx="32" cy="32" r="27" className="an-ring-fg" initial={{ pathLength: 0 }} animate={{ pathLength: job.percent / 100 }} transition={{ duration: 0.5, ease: EASE }} />
                      </svg>
                      {phase === "done" ? (
                        <svg viewBox="0 0 24 24" width="24" height="24" className="cs-check">
                          <motion.path d="M5 12.5l4.2 4.2L19 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, ease: EASE }} />
                        </svg>
                      ) : (
                        <span>{job.percent}%</span>
                      )}
                    </div>
                    <div>
                      <h3>{phase === "done" ? "Saved" : phase === "failed" ? "Clone failed" : job.phase}</h3>
                      <p className="muted small">
                        {phase === "done"
                          ? `${job.shallow ? "Latest version" : "Full history"} of ${job.branch}${job.sizeLabel ? `, ${job.sizeLabel}` : ""}, in ${seconds}s`
                          : phase === "failed"
                            ? job.error
                            : `${job.shallow ? "Latest version" : "Full history"} of ${job.branch}${job.sizeLabel ? ` · ${job.sizeLabel}` : ""}`}
                      </p>
                    </div>
                  </div>
                  <div className="cs-bar" aria-hidden>
                    <motion.span animate={{ scaleX: job.percent / 100 }} transition={{ duration: 0.4, ease: EASE }} />
                  </div>
                  <div className="dlg-dest">
                    <span className="dlg-label">{phase === "done" ? "Saved at" : "Saving to"}</span>
                    <code>{job.display}</code>
                  </div>
                  {job.log.length > 0 && (
                    <pre className="cs-log">
                      {job.log.slice(-6).map((l, i) => (
                        <span key={i}>{l}</span>
                      ))}
                    </pre>
                  )}
                  <div className="dlg-actions">
                    {phase === "done" && (
                      <>
                        <CopyButton text={`cd "${job.dest}"`} label="Copy cd command" />
                        <button type="button" className="ghost" onClick={() => api.openTerminal(job.jobId).catch(() => {})}>
                          <Icon name="terminal" size={15} /> Open Terminal here
                        </button>
                        <button type="button" className="ghost" onClick={() => api.revealClone(job.jobId).catch(() => {})}>
                          <Icon name="folder" size={15} /> Show in Finder
                        </button>
                        <button type="button" onClick={onClose}>
                          Done
                        </button>
                      </>
                    )}
                    {phase === "failed" && (
                      <>
                        <button type="button" className="ghost" onClick={onClose}>
                          Close
                        </button>
                        <button type="button" onClick={() => setJob(null)}>
                          Try again
                        </button>
                      </>
                    )}
                    {phase === "running" && <span className="muted small">Keep this open until it finishes.</span>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
