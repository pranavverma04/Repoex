"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { Repo } from "@ara/shared";
import { Chat } from "@/components/Chat";
import { JobProgress } from "@/components/JobProgress";
import { StatusPill } from "@/components/StatusPill";
import { api } from "@/lib/api";
import { useJobStream } from "@/lib/useJobStream";

function RepoPage() {
  const { id } = useParams<{ id: string }>();
  const repoId = Number(id);
  const router = useRouter();
  const search = useSearchParams();
  const [repo, setRepo] = useState<Repo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getRepo(repoId).then(setRepo).catch((e) => setError(e.message));
  }, [repoId]);
  useEffect(() => {
    load();
  }, [load]);

  // Follow the job from the URL, or whatever job is still running for this repo.
  const runningJob =
    repo?.latestJob && !["done", "failed"].includes(repo.latestJob.status) ? repo.latestJob.jobId : null;
  const jobId = search.get("job") ?? runningJob;
  const job = useJobStream(jobId, load);
  const showProgress = job && (job.status !== "done" || search.get("job"));

  async function refresh() {
    setNotice(null);
    try {
      const res = await api.refresh(repoId);
      if (res.jobId) router.replace(`/repos/${repoId}?job=${res.jobId}`);
      else setNotice(res.message ?? "Already up to date");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (error && !repo) {
    return (
      <div className="page">
        <p className="error">{error}</p>
        <Link href="/ask">← Back to repositories</Link>
      </div>
    );
  }
  if (!repo) return <div className="page muted">Loading…</div>;

  const lastJob = repo.latestJob;
  const canChat = (repo.fileCount ?? 0) > 0;

  return (
    <div className="page repo-page">
      <aside className="repo-side">
        <Link href="/ask" className="back">
          ← Repositories
        </Link>
        <h1 className="repo-title">
          <span className="owner">{repo.owner}/</span>
          {repo.name}
        </h1>
        <a className="muted small" href={repo.url} target="_blank" rel="noreferrer">
          {repo.url.replace("https://", "")}
        </a>
        <div className="side-row">
          <StatusPill status={repo.status} />
          {repo.lastCommitSha && <code title={repo.lastCommitSha}>{repo.lastCommitSha.slice(0, 7)}</code>}
        </div>

        <dl className="stats">
          <div>
            <dt>Files</dt>
            <dd>{repo.fileCount ?? 0}</dd>
          </div>
          <div>
            <dt>Symbols</dt>
            <dd>{repo.symbolCount ?? 0}</dd>
          </div>
          <div>
            <dt>Edges</dt>
            <dd>{repo.edgeCount ?? 0}</dd>
          </div>
          <div>
            <dt>Last run</dt>
            <dd>{lastJob?.durationMs != null ? `${(lastJob.durationMs / 1000).toFixed(1)}s` : "—"}</dd>
          </div>
        </dl>
        {lastJob?.status === "done" && <p className="muted small">{lastJob.message}</p>}

        <button className="ghost" onClick={refresh} disabled={repo.status === "indexing"}>
          Refresh from GitHub
        </button>
        {notice && <p className="notice small">{notice}</p>}
        {showProgress && job && <JobProgress job={job} />}
      </aside>

      <section className="chat-col">
        {canChat ? (
          <Chat repoId={repoId} repoName={repo.name} />
        ) : (
          <div className="chat-empty">
            <p>{repo.status === "failed" ? "Indexing failed. Try Refresh." : "Chat opens once indexing finishes."}</p>
          </div>
        )}
      </section>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="page muted">Loading…</div>}>
      <RepoPage />
    </Suspense>
  );
}
