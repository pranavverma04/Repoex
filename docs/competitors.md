# Similar products (researched 2026-09-24)

## Closest matches

| Product | What it does | Missing compared with AI-Repo-Assistant |
|---|---|---|
| [DeepWiki](https://deepwiki.com/) (Cognition, makers of Devin) | Swap `github.com` for `deepwiki.com` in any repo link: wiki-style docs with summary, tech stack, architecture diagrams, Q&A. Free; 50,000+ popular repos pre-indexed. | No commit history / work timeline, no preview of the running product, no clone or run-locally flow |
| [Repoly](https://www.repoly.pro/) | Paste a repo link: plain summary, tech stack, architecture & folders, how to run, code-quality score, AI chat, in ~30 s. Handles private repos via GitHub sign-in. | No commit history, no mock output or preview. Paid credits after a free allowance |
| [GitGrok](https://github.com/dhanvithshetty-in/gitgrok) (open source) | Stats, tech stack, file tree, auto Mermaid architecture diagram, A–F code-health grade, AI chat (Groq llama-3.3-70b via n8n). | Stack guessed only from file extensions; needs an LLM backend; no work history or preview |
| [Repo Explainer](https://repex.thienbao.dev/), [ExplainGitHub](https://explaingithub.com/), [AI-Codebase-Explainer](https://github.com/Shahidshaik999/AI-Codebase-Explainer-Understand-Any-GitHub-Repo-Instantly_by_shahid), [ai-github-repo-explainer](https://github.com/bhardwaj2-6/ai-github-repo-explainer) | Paste a link, get an explanation; mostly chat-first (RAG over the code). | None listed a work timeline or running preview |

## Related, different job

- **Run a repo in the browser:** [StackBlitz](https://dev.to/chilupa/import-github-repos-to-stackblitz-codesandbox-in-seconds-48g2) (`stackblitz.com/github/owner/repo`, WebContainers) and [GitHub Codespaces](https://github.blog/changelog/2022-10-20-introducing-the-codespaces-simple-browser/). These really run the code, sandboxed on their servers. [CodeSandbox stopped new repo imports](https://codesandbox.io/docs/learn/repositories/overview) (April 2026; full support ends July 2026).
- **Pack a repo for an AI chatbot:** [Repomix](https://github.com/yamadashy/repomix), [Gitingest](https://github.com/coderamp-labs/gitingest) (swap `hub` for `ingest` in the URL).
- **Chat with a repo:** [TalkToGitHub](https://www.scriptbyai.com/chat-with-github-repository/), [RepoChat](https://github.com/pnkvalavala/repochat), [GitChat](https://github.com/kpolley/GitChat).

## Where AI-Repo-Assistant is different

- **Work done:** commit timeline, work types, contributors, most-changed areas and files, releases
- **Mock output:** pages sketched in the site's own colours/logo, the deployed site or the repo's own HTML when available, API explorer, CLI help, library usage
- **Run it locally:** guided steps, localhost detection, the running app embedded in the report, real API requests
- **Save a copy:** git clone into a named folder
- Works with **no AI key**; stack read from real manifests (package.json, pyproject, go.mod, Cargo.toml, Dockerfile, CI), dev-only tools flagged

## Gaps to consider

1. AI chat inside the report (the code-graph Q&A exists at `/ask` but is out of the nav)
2. Architecture diagram (Mermaid or SVG from folder layout + imports)
3. Private repos (GitHub sign-in)
4. Code-health score
5. AI-written summaries (needs an Anthropic / Groq / Gemini key)
