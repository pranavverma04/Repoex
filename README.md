# AI-Repo-Assistant — Agentic Codebase Assistant

Paste a public GitHub repository, watch it get indexed into a structural code graph
(symbols + call/import edges), then ask questions about it. Retrieval is **deterministic
lexical search + graph traversal** — no embeddings, no vector database. The LLM only
writes the final answer from source snippets the retriever already selected.

No TypeScript and no frontend framework: the frontend is plain **HTML + CSS + JavaScript**
and the backend is plain **JavaScript** on Node.js. One server serves both on http://localhost:3100.

```
apps/web/         HTML pages (index, report, ask, repo, eval), css/, js/
  js/dom.js         h() element helper used by every component
  js/ui.js          icons, headline/scroll animations, count-up, copy button, formatters
  js/api.js         fetch client + live job watchers (Server-Sent Events)
  js/layout.js      top nav + animated background
  js/pages/*.js     one script per page
  js/components/    report sections, repo input, chat, clone dialog, …
apps/backend/src/ Hono API, indexer, retriever, LangGraph agent, repo explainer (JavaScript ES modules)
```

| Page | URL | File |
|---|---|---|
| Repo explainer | `/` | `index.html` + `js/pages/home.js` |
| Report | `/r/:id` | `report.html` + `js/pages/report.js` |
| Ask the code (repo list) | `/ask` | `ask.html` + `js/pages/ask.js` |
| Ask the code (chat) | `/ask/:id` | `repo.html` + `js/pages/repo.js` |
| Retrieval eval | `/eval` | `eval.html` + `js/pages/eval.js` |

## Run it

Needs Node 22+ (for `--env-file-if-exists`), pnpm 9+, and git. No build step.

```bash
pnpm install
pnpm dev          # node --watch; serves the API and the pages on :3100
```

Open http://localhost:3100 and submit e.g. `https://github.com/pallets/itsdangerous`.

LLM keys are optional. Copy `apps/backend/.env.example` to `apps/backend/.env` and set
`ANTHROPIC_API_KEY`, `GROQ_API_KEY`, or `GEMINI_API_KEY` to get written answers. Without
a key you get an extractive answer: the top symbol, its docstring, its callers and callees,
the code, and the related context.

## Explain a repo

The home page (`/`) explains any public repository. Enter it as a link (any common form:
`https://github.com/o/r`, `github.com/o/r.git`, `o/r`) or as username + repo name. A live preview
shows the repo and its branches before you start. The report (`/r/:id`, shareable) covers:

- **Overview** in plain words or for developers, highlights, who it's for
- **Tech stack** read from manifests (package.json, pyproject, go.mod, Cargo.toml, Dockerfile, CI…), dev-only tools marked
- **Structure**: searchable file tree, what each folder holds, entry points, key files
- **Work done**: commit types, weekly activity, month-by-month timeline, contributors, most-changed areas, releases
- **How to run it**: install/start/test steps, scripts, environment variables the code reads, ports
- **Mock output**: pages sketched from JSX/HTML, API endpoints with curl requests and the response the handler returns,
  CLI help built from Commander/Click/Typer/argparse/Cobra/clap definitions, or library install + usage.
  Nothing from the repo is executed.

The report is split into tabs (one section at a time, `#tab` in the URL, Back button walks the tab
history then returns to the search with the input restored). For web projects the Pages preview shows,
in order of preference: the deployed site (homepage link or GitHub Pages, if it allows framing), the repo's
own HTML/CSS for static sites (`/explain/static/:id/*`, scripts stripped and blocked by CSP), or a sketch in
the repo's own colours, font, logo and images. The username field lists that user's repos (`/explain/users/:owner/repos`).
Nothing from an analysed repo is ever executed on this machine.

**Run it locally** (Mock output → Run it locally) is a guided run the user does in their own terminal:
clone (Save a copy), "Open Terminal here", the install/start commands from the report, then the page watches
the port and embeds the running app (routes, address bar, reload) and sends real requests to its API through
`POST /explain/local-request` (127.0.0.1 only, origin-locked). The app never runs repository code itself.

**Save a copy** (report header) git-clones the repo into a folder you name, in Desktop / Downloads /
Documents / home or any folder under your home directory; branch and full-or-latest history are selectable,
existing folders are never overwritten, and progress is shown live. These endpoints (`/explain/clone/*`,
`POST /explain/reports/:id/clone`) only accept requests from the app's own pages: same-origin browser
requests (`Sec-Fetch-Site: same-origin`, which other sites can't forge) or an Origin on the `WEB_ORIGIN` list
(default `http://localhost:3100`), since the rest of the API allows any origin.

It uses a blobless clone (history ~400 commits deep, only the files the analysers need are downloaded) plus a few
GitHub API calls. The API token comes from `GITHUB_TOKEN`, else the local `gh auth token`, else anonymous.
Reports are cached per commit in SQLite; export as Markdown or print to PDF. With an LLM key set, the overview,
work summary, example API responses and CLI sessions are written by the model (always labelled as such).
Code: `apps/backend/src/explain/`, `apps/web/js/components/`.

The code-graph Q&A still lives at `/ask`, but it's no longer in the nav.

## How it works

**Indexing** (`apps/backend/src/indexer/`)
1. `github.js` checks visibility and size with the GitHub API before cloning. Repos over 200 MB are rejected.
2. `clone.js` runs `git clone --depth 1` into a temp dir and lists files with ripgrep. The clone is deleted as soon as the files have been read.
3. `extract.js` is **pass 1**. tree-sitter (JS/TS/TSX, Python, Go, Rust, Java) collects functions, classes, methods, variables, and imports, plus unresolved call and import references.
4. `resolve.js` is **pass 2**. It resolves references into `calls` and `imports` edges once every symbol exists, so definition order across files doesn't matter.
5. Full file text and a SHA-256 hash are stored per file. **Refresh** compares the latest commit SHA and re-parses only files whose hash changed, then rebuilds edges.

Jobs live in a SQLite table (`queued → cloning → parsing → indexing → done/failed`) and
stream to the browser over SSE (`GET /jobs/:id/stream`), with `GET /jobs/:id` as the reload snapshot.

**Chat** (`apps/backend/src/agent/graph.js`) is a LangGraph agent:
`Plan` (terms + intent) → `Retrieve` (rank: exact name > partial > path > body mention,
then bounded caller/callee traversal, then slice real source lines) → `Reflect` (is the context
sufficient? if not, reformulate, up to 2 retries) → `Synthesize`.

**Cache** (`cache.js`): answers are keyed by normalized question. An answer is served only
if every source file's hash still matches, so it never returns a stale answer.

**Eval** (`src/eval/`): hand-written question → expected-symbol → expected-answer triples for two
sample repos. `pnpm eval` (or the Eval page) runs them through the real pipeline with the cache
off and records pass/fail and latency.

## API

| Method | Path | |
|---|---|---|
| GET | `/explain/preview?url=` or `?owner=&repo=` | repo card + branches |
| POST | `/explain` `{url \| owner+repo, branch?, force?}` | `{jobId}` or `{reportId}` when cached |
| GET | `/explain/jobs/:id`, `/explain/jobs/:id/stream` | job snapshot / SSE |
| GET | `/explain/reports/:id`, `/explain/reports/:id/markdown`, `/explain/recent` | report JSON / Markdown export / recent list |
| POST | `/repos` `{url}` | submit (or refresh if already known) → `{repoId, jobId}` |
| GET | `/repos`, `/repos/:id` | list / detail with file, symbol, edge counts |
| POST | `/repos/:id/refresh` | `{changed:false}` when the commit SHA is unchanged |
| POST | `/repos/:id/chat` `{question}` | `{answer, sources, cached, latencyMs, trace}` |
| GET | `/jobs/:id`, `/jobs/:id/stream` | job snapshot / SSE `job-update` events |
| POST/GET | `/eval/run`, `/eval/latest` | run the eval suite / latest results |

Data lives in `apps/backend/data/ara.db`. Delete it to start fresh.

## v1 limits

- Public repos only. GitHub OAuth, MCP server exposure, Redis/BullMQ jobs, and Kuzu are TBD for v2 (SRS Appendix C).
- Call resolution is static and heuristic. `obj.method()` on an untyped object is linked only when the variable name, an import, or a unique match identifies the class. Otherwise no edge is created instead of a guess.
