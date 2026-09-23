import type { RepoStatus } from "@ara/shared";

const LABEL: Record<RepoStatus, string> = {
  pending: "Queued",
  indexing: "Indexing",
  ready: "Ready",
  failed: "Failed",
};

export function StatusPill({ status }: { status: RepoStatus }) {
  return <span className={`pill pill-${status}`}>{LABEL[status]}</span>;
}
