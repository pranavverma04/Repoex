"use client";
import { useEffect, useState } from "react";
import type { Job } from "@ara/shared";
import { API_URL, api } from "./api";

/**
 * Live job status: REST snapshot first (so a reload never shows an empty bar),
 * then Server-Sent Events until the job reaches done/failed.
 */
export function useJobStream(jobId: string | null | undefined, onFinish?: (job: Job) => void) {
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let source: EventSource | null = null;
    let cancelled = false;

    const finish = (j: Job) => {
      setJob(j);
      if (j.status === "done" || j.status === "failed") {
        source?.close();
        onFinish?.(j);
        return true;
      }
      return false;
    };

    api
      .getJob(jobId)
      .then((snapshot) => {
        if (cancelled || finish(snapshot)) return;
        source = new EventSource(`${API_URL}/jobs/${jobId}/stream`);
        source.addEventListener("job-update", (e) => finish(JSON.parse((e as MessageEvent).data)));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      source?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return job;
}
