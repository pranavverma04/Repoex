// Real-looking previews without running anything from the repo:
//  - finds a deployed copy of the project (homepage link or GitHub Pages) and checks it can be framed
//  - serves a static HTML site's own files, with scripts blocked, so the browser renders its real markup
//  - lists a user's repositories for the username + repo form
import type { LiveSite, RepoReport, RepoSuggestion } from "@ara/shared";
import { UserFacingError } from "../indexer/github.js";
import { fetchMeta, fetchUserRepos, searchUserRepos, type Ref } from "./source.js";

const liveCache = new Map<number, { at: number; sites: LiveSite[] }>();

async function probe(url: string, source: LiveSite["source"]): Promise<LiveSite | null> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 ai-repo-assistant" } });
    if (res.status >= 400) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html/.test(type)) return null;
    const xfo = (res.headers.get("x-frame-options") ?? "").toLowerCase();
    const csp = (res.headers.get("content-security-policy") ?? "").toLowerCase();
    const fa = csp.match(/frame-ancestors([^;]*)/)?.[1]?.trim();
    const blocked = xfo === "deny" || xfo === "sameorigin" || (fa !== undefined && !/\*|localhost/.test(fa));
    await res.body?.cancel();
    return { url: res.url || url, source, frameable: !blocked, status: res.status };
  } catch {
    return null;
  }
}

export async function findLiveSites(report: RepoReport): Promise<LiveSite[]> {
  const hit = liveCache.get(report.reportId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.sites;
  const candidates: [string, LiveSite["source"]][] = [];
  const home = report.repo.homepage?.trim();
  if (home && /^https?:\/\//.test(home) && !/github\.com\/[^/]+\/[^/]+\/?$/.test(home)) candidates.push([home, "homepage"]);
  try {
    const meta = await fetchMeta({ owner: report.repo.owner, name: report.repo.name });
    if (meta.hasPages) {
      const owner = report.repo.owner.toLowerCase();
      const pages = report.repo.name.toLowerCase() === `${owner}.github.io` ? `https://${owner}.github.io/` : `https://${owner}.github.io/${report.repo.name}/`;
      if (!candidates.some(([u]) => u.replace(/\/$/, "") === pages.replace(/\/$/, ""))) candidates.push([pages, "github-pages"]);
    }
  } catch {
    // metadata is a nice-to-have here
  }
  const sites = (await Promise.all(candidates.map(([u, s]) => probe(u, s)))).filter((x): x is LiveSite => x !== null);
  liveCache.set(report.reportId, { at: Date.now(), sites });
  return sites;
}

// --- static site files -----------------------------------------------------

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2",
  ttf: "font/ttf", otf: "font/otf", json: "application/json", txt: "text/plain; charset=utf-8",
  mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg",
};
const fileCache = new Map<string, { body: ArrayBuffer; type: string }>();
let cacheBytes = 0;

/**
 * Returns a file of a static HTML site at the analysed commit. HTML and CSS get their
 * root-relative URLs pointed back at this endpoint. Scripts are never served, and the
 * response CSP blocks any inline script, so nothing from the repo executes.
 */
export async function staticFile(report: RepoReport, rawPath: string): Promise<{ body: ArrayBuffer | string; type: string }> {
  if (!report.mock.web?.staticSite) throw new UserFacingError("This repo isn't a static HTML site.", 404);
  let path = decodeURIComponent(rawPath).replace(/^\/+/, "");
  if (path.split("/").some((s) => s === ".." || s === ".")) throw new UserFacingError("Bad path", 400);
  if (!path || path.endsWith("/")) path += "index.html";
  const ext = path.split(".").pop()!.toLowerCase();
  if (/^(js|mjs|cjs|ts|jsx|tsx|wasm)$/.test(ext)) return { body: "", type: "text/javascript" }; // scripts are not served
  const type = MIME[ext];
  if (!type) throw new UserFacingError("Unsupported file type", 415);
  const key = `${report.reportId}:${path}`;
  let hit = fileCache.get(key);
  if (!hit) {
    const url = `https://raw.githubusercontent.com/${report.repo.owner}/${report.repo.name}/${report.sha}/${path.split("/").map(encodeURIComponent).join("/")}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (res.status === 404 && !/\.html?$/.test(path)) throw new UserFacingError("Not found", 404);
    if (res.status === 404) {
      // clean URLs: /about -> about.html or about/index.html
      const alt = await fetch(url.replace(/\.html?$/, "") + "/index.html", { signal: AbortSignal.timeout(15_000) });
      if (!alt.ok) throw new UserFacingError("Not found", 404);
      hit = { body: await alt.arrayBuffer(), type };
    } else {
      if (!res.ok) throw new UserFacingError(`GitHub returned ${res.status}`, 502);
      hit = { body: await res.arrayBuffer(), type };
    }
    if (hit.body.byteLength < 8_000_000) {
      fileCache.set(key, hit);
      cacheBytes += hit.body.byteLength;
      if (cacheBytes > 120_000_000) {
        fileCache.clear();
        cacheBytes = 0;
      }
    }
  }
  if (/^(html|htm|css)$/.test(ext)) {
    const base = `/explain/static/${report.reportId}/`;
    let text = new TextDecoder().decode(hit.body);
    text = text
      .replace(/(\s(?:src|href|poster|action)=["'])\/(?!\/)/gi, `$1${base}`)
      .replace(/url\(\s*(["']?)\/(?!\/)/gi, `url($1${base}`);
    if (ext !== "css") text = text.replace(/<script\b[\s\S]*?<\/script>/gi, "<!-- script removed in preview -->");
    return { body: text, type: hit.type };
  }
  return hit;
}

export async function userRepos(owner: string, q?: string): Promise<RepoSuggestion[]> {
  if (!/^[\w.-]+$/.test(owner)) throw new UserFacingError("Enter a GitHub username.");
  if (q && /^[\w.-]+$/.test(q)) return searchUserRepos(owner, q);
  return fetchUserRepos({ owner, name: "" } as Ref);
}
