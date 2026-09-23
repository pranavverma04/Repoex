"use client";
import type { Job } from "@ara/shared";

const STEPS = ["queued", "cloning", "parsing", "indexing", "done"] as const;

export function JobProgress({ job }: { job: Job }) {
  const failed = job.status === "failed";
  const current = failed ? -1 : STEPS.indexOf(job.status as (typeof STEPS)[number]);
  return (
    <div className={`progress ${failed ? "is-failed" : ""}`} role="status" aria-live="polite">
      <div className="progress-head">
        <span className="progress-label">{job.type === "refresh" ? "Refreshing" : "Indexing"}</span>
        <span className="progress-pct">{job.progress}%</span>
      </div>
      <div className="bar" aria-hidden>
        <div className="bar-fill" style={{ width: `${failed ? 100 : job.progress}%` }} />
      </div>
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i < current ? "past" : i === current ? "now" : ""}>
            {s}
          </li>
        ))}
      </ol>
      <p className="progress-msg">{failed ? job.error : job.message}</p>
    </div>
  );
}
