"use client";
import { useEffect, useState } from "react";
import type { ExplainJob } from "@ara/shared";
import { API_URL, api } from "./api";

/** Live explain-job state over SSE, with a REST snapshot first and polling if the stream drops. */
export function useExplainJob(jobId: string | null) {
  const [job, setJob] = useState<ExplainJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let closed = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    setJob(null);
    setError(null);
    api.explainJob(jobId).then((j) => !closed && setJob(j)).catch(() => {});
    const es = new EventSource(`${API_URL}/explain/jobs/${jobId}/stream`);
    es.addEventListener("job-update", (e) => {
      const j = JSON.parse((e as MessageEvent).data) as ExplainJob;
      setJob(j);
      if (j.status !== "running") es.close();
    });
    es.addEventListener("error", (e) => {
      const data = (e as MessageEvent).data;
      if (data) {
        setError(JSON.parse(data).error ?? "Job not found");
        es.close();
        return;
      }
      // connection dropped: fall back to polling until the job settles
      es.close();
      if (closed || poll) return;
      poll = setInterval(() => {
        api
          .explainJob(jobId)
          .then((j) => {
            setJob(j);
            if (j.status !== "running" && poll) clearInterval(poll);
          })
          .catch((err) => setError(err.message));
      }, 800);
    });
    return () => {
      closed = true;
      es.close();
      if (poll) clearInterval(poll);
    };
  }, [jobId]);

  return { job, error };
}
