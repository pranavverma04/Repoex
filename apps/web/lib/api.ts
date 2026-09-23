import type {
  ChatResponse,
  CloneJob,
  CloneLocation,
  CloneTarget,
  EvalRunSummary,
  ExplainJob,
  Job,
  LiveSite,
  Repo,
  RepoPreview,
  RepoReport,
  RepoSuggestion,
  StartExplainResponse,
  SubmitRepoResponse,
} from "@ara/shared";

export interface LocalResponse {
  status: number;
  statusText: string;
  ms: number;
  contentType: string | null;
  body: string;
  truncated: boolean;
}

export type RepoInput = { url: string } | { owner: string; repo: string };
export interface RecentReport {
  reportId: number;
  fullName: string;
  avatarUrl: string;
  oneLiner: string;
  language: string | null;
  generatedAt: string;
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new Error(`Can't reach the API at ${API_URL}. Is the backend running?`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  listRepos: () => call<Repo[]>("/repos"),
  getRepo: (id: number) => call<Repo>(`/repos/${id}`),
  submitRepo: (url: string) => call<SubmitRepoResponse>("/repos", { method: "POST", body: JSON.stringify({ url }) }),
  refresh: (id: number) => call<SubmitRepoResponse>(`/repos/${id}/refresh`, { method: "POST" }),
  ask: (id: number, question: string) =>
    call<ChatResponse>(`/repos/${id}/chat`, { method: "POST", body: JSON.stringify({ question }) }),
  getJob: (jobId: string) => call<Job>(`/jobs/${jobId}`),
  health: () => call<{ ok: boolean; llm: string }>("/health"),
  runEval: () => call<EvalRunSummary[]>("/eval/run", { method: "POST" }),
  latestEval: () => call<EvalRunSummary[]>("/eval/latest"),

  previewRepo: (input: RepoInput, signal?: AbortSignal) =>
    call<RepoPreview>(`/explain/preview?${new URLSearchParams(input as Record<string, string>)}`, { signal }),
  startExplain: (input: RepoInput & { branch?: string; force?: boolean }) =>
    call<StartExplainResponse>("/explain", { method: "POST", body: JSON.stringify(input) }),
  explainJob: (jobId: string) => call<ExplainJob>(`/explain/jobs/${jobId}`),
  report: (id: number) => call<RepoReport>(`/explain/reports/${id}`),
  recentReports: () => call<RecentReport[]>("/explain/recent"),
  markdownUrl: (id: number) => `${API_URL}/explain/reports/${id}/markdown`,
  userRepos: (owner: string, q?: string) =>
    call<RepoSuggestion[]>(`/explain/users/${encodeURIComponent(owner)}/repos${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  liveSites: (id: number) => call<LiveSite[]>(`/explain/reports/${id}/live-sites`),
  cloneLocations: () => call<CloneLocation[]>("/explain/clone/locations"),
  cloneCheck: (base: string, name: string, signal?: AbortSignal) =>
    call<CloneTarget>(`/explain/clone/check?${new URLSearchParams({ base, name })}`, { signal }),
  startClone: (reportId: number, body: { base: string; name: string; branch?: string; shallow?: boolean }) =>
    call<CloneJob>(`/explain/reports/${reportId}/clone`, { method: "POST", body: JSON.stringify(body) }),
  cloneJob: (jobId: string) => call<CloneJob>(`/explain/clone/${jobId}`),
  openTerminal: (jobId: string) => call<{ ok: boolean }>(`/explain/clone/${jobId}/terminal`, { method: "POST" }),
  localRequest: (body: { port: number; method: string; path: string; body?: string }) =>
    call<LocalResponse>("/explain/local-request", { method: "POST", body: JSON.stringify(body) }),
  revealClone: (jobId: string) => call<{ ok: boolean }>(`/explain/clone/${jobId}/reveal`, { method: "POST" }),
  /** the repo's own static files, served with scripts blocked */
  staticUrl: (id: number, path: string) => `${API_URL}/explain/static/${id}/${path.replace(/^\//, "")}`,
};
