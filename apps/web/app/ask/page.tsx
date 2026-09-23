"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Repo } from "@ara/shared";
import { StatusPill } from "@/components/StatusPill";
import { api } from "@/lib/api";

const EXAMPLES = ["pallets/itsdangerous", "sindresorhus/ky", "pallets/click"];

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listRepos().then(setRepos).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  // keep statuses fresh while anything is indexing
  useEffect(() => {
    if (!repos?.some((r) => r.status === "indexing" || r.status === "pending")) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [repos, load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.submitRepo(url.trim());
      router.push(`/repos/${res.repoId}${res.jobId ? `?job=${res.jobId}` : ""}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  async function refresh(repo: Repo) {
    setNotice(null);
    setError(null);
    try {
      const res = await api.refresh(repo.repoId);
      if (res.jobId) router.push(`/repos/${repo.repoId}?job=${res.jobId}`);
      else setNotice(`${repo.owner}/${repo.name}: ${res.message}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="page home">
      <section className="hero">
        <h1>Ask a codebase how it works.</h1>
        <p className="lede">
          Paste a public GitHub repository. It gets parsed into a graph of functions, classes, calls and imports, and
          every answer is built from the real source lines it cites. No embeddings, no guessing.
        </p>
        <form onSubmit={submit} className="submit">
          <label htmlFor="repo-url" className="sr-only">
            GitHub repository URL
          </label>
          <input
            id="repo-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" disabled={submitting || !url.trim()}>
            {submitting ? "Checking…" : "Index repository"}
          </button>
        </form>
        <p className="examples">
          Try{" "}
          {EXAMPLES.map((ex, i) => (
            <span key={ex}>
              <button type="button" className="linkish" onClick={() => setUrl(`https://github.com/${ex}`)}>
                {ex}
              </button>
              {i < EXAMPLES.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
      </section>

      <section className="repo-list">
        <h2>Indexed repositories</h2>
        {repos === null && !error && <p className="muted">Loading…</p>}
        {repos?.length === 0 && <p className="muted">Nothing indexed yet. Submit a repository above to start.</p>}
        <ul>
          {repos?.map((r) => (
            <li key={r.repoId} className="repo-row">
              <div className="repo-main">
                <Link href={`/repos/${r.repoId}`} className="repo-name">
                  {r.owner}/<strong>{r.name}</strong>
                </Link>
                <div className="repo-meta">
                  <StatusPill status={r.status} />
                  <span>{r.fileCount ?? 0} files</span>
                  <span>{r.symbolCount ?? 0} symbols</span>
                  <span>{r.edgeCount ?? 0} edges</span>
                  {r.lastCommitSha && <code>{r.lastCommitSha.slice(0, 7)}</code>}
                </div>
              </div>
              <div className="repo-actions">
                <button className="ghost" onClick={() => refresh(r)} disabled={r.status === "indexing"}>
                  Refresh
                </button>
                <Link className="button" href={`/repos/${r.repoId}`}>
                  Open chat
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
