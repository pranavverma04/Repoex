// Types shared between apps/backend (Hono API) and apps/web (Next.js).

export type JobStatus = "queued" | "cloning" | "parsing" | "indexing" | "done" | "failed";
export type JobType = "index" | "refresh";
export type RepoStatus = "pending" | "indexing" | "ready" | "failed";
export type SymbolKind = "function" | "class" | "method" | "variable" | "import";
export type EdgeType = "calls" | "imports";

export interface Repo {
  repoId: number;
  url: string;
  owner: string;
  name: string;
  defaultBranch: string | null;
  lastCommitSha: string | null;
  sizeKb: number | null;
  status: RepoStatus;
  createdAt: string;
  indexedAt: string | null;
  fileCount?: number;
  symbolCount?: number;
  edgeCount?: number;
  latestJob?: Job | null;
}

export interface Job {
  jobId: string;
  repoId: number;
  type: JobType;
  status: JobStatus;
  progress: number;
  message: string | null;
  error: string | null;
  filesParsed: number;
  filesReparsed: number;
  symbolCount: number;
  edgeCount: number;
  durationMs: number | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface SubmitRepoResponse {
  repoId: number;
  jobId: string | null;
  /** false when a refresh found the latest commit SHA unchanged */
  changed?: boolean;
  message?: string;
}

export interface SourceRef {
  symbolId: number;
  name: string;
  kind: SymbolKind;
  path: string;
  startLine: number;
  endLine: number;
  /** why this symbol ended up in the context */
  reason: "exact" | "partial" | "path" | "content" | "caller" | "callee" | "import";
  /** for graph-expanded symbols: the symbol they were reached from */
  via?: string;
  score: number;
  signature: string | null;
  docstring: string | null;
  snippet: string;
}

export interface AgentTrace {
  plan: { terms: string[]; intent: string };
  attempts: { terms: string[]; candidates: number; sufficient: boolean }[];
  synthesizer: string;
}

export interface ChatResponse {
  answer: string;
  sources: SourceRef[];
  cached: boolean;
  latencyMs: number;
  trace: AgentTrace | null;
}

export interface EvalResult {
  questionId: number;
  question: string;
  expectedSymbols: string[];
  retrieved: string[];
  retrievalPass: boolean;
  answerScore: number;
  passed: boolean;
  latencyMs: number;
}

export interface EvalRunSummary {
  runId: string;
  repoUrl: string;
  total: number;
  passed: number;
  avgLatencyMs: number;
  results: EvalResult[];
}

// ---------------------------------------------------------------------------
// Repo explainer: one report per (repo, branch, commit).

export type ProjectKind = "web" | "api" | "cli" | "library" | "mobile" | "desktop" | "data" | "infra" | "docs" | "other";
export type CommitType = "feature" | "fix" | "refactor" | "docs" | "tests" | "maintenance" | "other";
export type ExplainStageKey = "resolve" | "fetch" | "stack" | "structure" | "history" | "mock" | "write";
export type StageStatus = "pending" | "active" | "done" | "skipped" | "failed";

export interface RepoPreview {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  avatarUrl: string;
  stars: number;
  forks: number;
  language: string | null;
  defaultBranch: string;
  branches: string[];
  pushedAt: string;
  sizeKb: number;
  private: boolean;
  archived: boolean;
  fork: boolean;
  /** a report for the latest commit on the default branch already exists */
  cached: boolean;
}

export interface ExplainStage {
  key: ExplainStageKey;
  label: string;
  status: StageStatus;
  detail: string | null;
}

export interface ExplainJob {
  jobId: string;
  fullName: string;
  branch: string | null;
  status: "running" | "done" | "failed";
  progress: number;
  stages: ExplainStage[];
  log: { at: number; text: string }[];
  error: string | null;
  reportId: number | null;
}

export interface StartExplainResponse {
  jobId: string | null;
  /** set when a cached report was returned without a new run */
  reportId: number | null;
}

export interface LanguageShare {
  name: string;
  bytes: number;
  pct: number;
}

export interface StackItem {
  name: string;
  version: string | null;
  /** manifest the item came from, e.g. package.json */
  source: string;
  /** only used while developing or testing (devDependencies) */
  dev?: boolean;
}

export interface StackGroup {
  category: string;
  items: StackItem[];
}

export interface TreeNode {
  name: string;
  path: string;
  type: "dir" | "file";
  /** total files under a dir */
  files?: number;
  children?: TreeNode[];
  /** children omitted beyond the display limit */
  more?: number;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
  type: CommitType;
  files: number;
}

export interface MonthWork {
  month: string; // YYYY-MM
  count: number;
  byType: Partial<Record<CommitType, number>>;
  highlights: CommitInfo[];
}

export interface Contributor {
  name: string;
  login: string | null;
  avatarUrl: string | null;
  commits: number;
  /** share of the analysed commits */
  share: number;
}

export interface Endpoint {
  method: string;
  path: string;
  file: string;
  line: number;
  framework: string;
  /** a curl line with path params filled in */
  request: string;
  /** body fields the handler reads, if any */
  bodyFields: string[];
  /** response expression copied from the handler, when one was found */
  responseFromCode: string | null;
  /** AI-written example response, only when an LLM is configured */
  exampleResponse: string | null;
}

export interface CliCommand {
  usage: string;
  description: string | null;
  file: string;
  line: number;
}

export interface CliOption {
  flag: string;
  description: string | null;
}

export interface WebPage {
  route: string;
  file: string;
  title: string | null;
  headings: string[];
  buttons: string[];
  links: string[];
  inputs: string[];
  paragraphs: string[];
  /** the page's own images, as raw.githubusercontent.com URLs at the analysed commit */
  images: string[];
}

/** Colours, font and logo read from the repo's CSS / Tailwind config / public folder. */
export interface SiteTheme {
  accent: string | null;
  background: string | null;
  text: string | null;
  font: string | null;
  logo: string | null;
  dark: boolean;
}

/** A deployed copy of the project found on the web (homepage link or GitHub Pages). */
export interface LiveSite {
  url: string;
  source: "homepage" | "github-pages";
  /** false when the site forbids being shown in a frame (X-Frame-Options / CSP) */
  frameable: boolean;
  status: number | null;
}

export interface RepoSuggestion {
  name: string;
  description: string | null;
  stars: number;
  language: string | null;
  pushedAt: string;
  fork: boolean;
}

export interface MockOutput {
  kinds: ProjectKind[];
  web: {
    framework: string;
    siteTitle: string | null;
    pages: WebPage[];
    theme: SiteTheme | null;
    /** plain HTML/CSS site whose real files can be rendered as-is (scripts off) */
    staticSite: boolean;
  } | null;
  api: { framework: string; baseUrl: string; endpoints: Endpoint[] } | null;
  cli: {
    binName: string;
    framework: string;
    commands: CliCommand[];
    options: CliOption[];
    /** aiWritten marks example output an LLM wrote rather than text read from the code */
    session: { command: string; output: string; aiWritten?: boolean }[];
  } | null;
  library: { install: string; usage: string | null; usageSource: string | null; exports: string[] } | null;
}

export interface RunStep {
  title: string;
  commands: string[];
  note: string | null;
}

export interface RepoReport {
  reportId: number;
  generatedAt: string;
  sha: string;
  branch: string;
  branches: string[];
  repo: {
    owner: string;
    name: string;
    fullName: string;
    url: string;
    description: string | null;
    homepage: string | null;
    topics: string[];
    license: string | null;
    stars: number;
    forks: number;
    watchers: number;
    openIssues: number;
    openPulls: number | null;
    totalCommits: number | null;
    createdAt: string;
    pushedAt: string;
    sizeKb: number;
    avatarUrl: string;
    archived: boolean;
    fork: boolean;
  };
  overview: {
    oneLiner: string;
    plain: string;
    technical: string;
    kinds: ProjectKind[];
    highlights: string[];
    audience: string;
  };
  stack: {
    languages: LanguageShare[];
    groups: StackGroup[];
    packageManagers: string[];
    otherDependencies: number;
  };
  structure: {
    totalFiles: number;
    totalDirs: number;
    tree: TreeNode;
    folders: { path: string; purpose: string; files: number; share: number }[];
    keyFiles: { path: string; role: string }[];
    entryPoints: { path: string; why: string }[];
  };
  work: {
    summary: string;
    commitsAnalyzed: number;
    truncated: boolean;
    firstDate: string | null;
    lastDate: string | null;
    byType: { type: CommitType; count: number }[];
    weekly: { week: string; count: number }[];
    months: MonthWork[];
    recent: CommitInfo[];
    contributors: Contributor[];
    /** distinct people in the analysed commits (contributors lists the top 12) */
    contributorCount: number;
    areas: { path: string; commits: number; mainType: CommitType }[];
    hotspots: { path: string; commits: number }[];
    releases: { tag: string; name: string | null; date: string; url: string }[];
  };
  run: {
    steps: RunStep[];
    scripts: { name: string; command: string }[];
    envVars: { name: string; source: string }[];
    ports: number[];
    readmeSnippets: { heading: string; code: string }[];
  };
  mock: MockOutput;
  ai: { provider: string; used: boolean; error: string | null };
}

// ---------------------------------------------------------------------------
// Save a copy (git clone to this computer)

export interface CloneLocation {
  label: string;
  path: string;
  /** path with the home folder shown as ~ */
  display: string;
}

export interface CloneTarget {
  path: string;
  display: string;
  exists: boolean;
  /** a free name to use instead, when the chosen one is taken */
  suggestion: string | null;
}

export interface CloneJob {
  jobId: string;
  fullName: string;
  branch: string;
  shallow: boolean;
  dest: string;
  display: string;
  status: "running" | "done" | "failed";
  phase: string;
  percent: number;
  log: string[];
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
  sizeLabel: string | null;
}
