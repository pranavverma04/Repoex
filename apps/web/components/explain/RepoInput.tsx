"use client";
import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { RepoPreview, RepoSuggestion } from "@ara/shared";
import { api, type RepoInput as Input } from "@/lib/api";
import { EASE, Icon, ago, compact } from "./ui";

type Mode = "fields" | "link";

/** Mirrors the backend parser so the UI can show what a link reads as before asking the server. */
export function parseLink(raw: string): { owner: string; repo: string } | null {
  const s = raw.trim().replace(/\/+$/, "").replace(/[#?].*$/, "");
  const m =
    s.match(/^(?:git\+)?(?:https?:\/\/)?(?:www\.)?github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i) ??
    s.match(/^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/i) ??
    s.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

const NAME = /^[\w.-]+$/;
const LAST_KEY = "ara:last-input";
const EXAMPLES = [
  { label: "sindresorhus/ky", note: "library" },
  { label: "charmbracelet/glow", note: "CLI" },
  { label: "fastapi/full-stack-fastapi-template", note: "web + API" },
  { label: "codewithsadee/vcard-personal-portfolio", note: "website" },
];

interface Saved {
  mode: Mode;
  owner: string;
  repo: string;
  link: string;
}

function loadSaved(): Saved | null {
  try {
    const raw = sessionStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function RepoInput({ onStart, busy, initial }: { onStart: (input: Input, branch?: string) => void; busy: boolean; initial?: string }) {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<Mode>("fields");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [link, setLink] = useState("");
  const [preview, setPreview] = useState<RepoPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [branch, setBranch] = useState<string>("");
  const [scope, animateEl] = useAnimate<HTMLFormElement>();
  const [avatarOk, setAvatarOk] = useState(false);
  const [repos, setRepos] = useState<RepoSuggestion[] | null>(null);
  const [reposError, setReposError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ids = { owner: useId(), repo: useId(), link: useId(), branch: useId(), list: useId() };
  const repoRef = useRef<HTMLInputElement>(null);
  const ownerRef = useRef<HTMLInputElement>(null);

  // Restore the last thing typed (so Back returns to it), or a ?repo= prefill.
  useEffect(() => {
    const fromUrl = initial ? parseLink(initial) : null;
    const saved = loadSaved();
    if (fromUrl && (!saved || `${saved.owner}/${saved.repo}`.toLowerCase() !== `${fromUrl.owner}/${fromUrl.repo}`.toLowerCase())) {
      setMode("fields");
      setOwner(fromUrl.owner);
      setRepo(fromUrl.repo);
      setLink(`https://github.com/${fromUrl.owner}/${fromUrl.repo}`);
    } else if (saved) {
      setMode(saved.mode);
      setOwner(saved.owner);
      setRepo(saved.repo);
      setLink(saved.link);
    }
  }, [initial]);

  useEffect(() => {
    try {
      sessionStorage.setItem(LAST_KEY, JSON.stringify({ mode, owner, repo, link } satisfies Saved));
    } catch {}
  }, [mode, owner, repo, link]);

  const parsed = mode === "fields" ? (NAME.test(owner) && NAME.test(repo) ? { owner, repo } : null) : parseLink(link);
  const key = parsed ? `${parsed.owner}/${parsed.repo}`.toLowerCase() : "";

  // The user's repositories, for the repository box
  const ownerDebounced = useDebounced(owner, 450);
  useEffect(() => {
    setRepos(null);
    setReposError(null);
    if (mode !== "fields" || !NAME.test(ownerDebounced)) return;
    let live = true;
    api
      .userRepos(ownerDebounced)
      .then((r) => live && setRepos(r))
      .catch((e) => live && setReposError(e.message));
    return () => {
      live = false;
    };
  }, [ownerDebounced, mode]);

  // Only the 100 most recently pushed repos come back up front; search the rest by name.
  const repoDebounced = useDebounced(repo, 300);
  const [found, setFound] = useState<RepoSuggestion[]>([]);
  useEffect(() => {
    setFound([]);
    if (!repos || repos.length < 100 || !NAME.test(repoDebounced)) return;
    let live = true;
    api
      .userRepos(ownerDebounced, repoDebounced)
      .then((r) => live && setFound(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [repoDebounced, repos, ownerDebounced]);

  const matches = useMemo(() => {
    if (!repos) return [];
    const q = repo.toLowerCase();
    const all = [...repos, ...found.filter((f) => !repos.some((r) => r.name === f.name))];
    const list = q ? all.filter((r) => r.name.toLowerCase().includes(q)) : repos;
    return list
      .slice()
      .sort((a, b) => {
        const rank = (r: RepoSuggestion) => (r.name.toLowerCase() === q ? 2 : r.name.toLowerCase().startsWith(q) ? 1 : 0);
        return rank(b) - rank(a) || (q ? a.name.length - b.name.length : 0);
      })
      .slice(0, 8);
  }, [repos, repo, found]);
  const exact = !!repos?.some((r) => r.name.toLowerCase() === repo.toLowerCase()) || found.some((r) => r.name.toLowerCase() === repo.toLowerCase());

  // Debounced preview lookup
  useEffect(() => {
    setPreviewError(null);
    if (!parsed) {
      setPreview(null);
      setLoading(false);
      return;
    }
    if (preview && preview.fullName.toLowerCase() === key) return;
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      api
        .previewRepo({ owner: parsed.owner, repo: parsed.repo }, ctl.signal)
        .then((p) => {
          setPreview(p);
          setBranch(p.defaultBranch);
        })
        .catch((e) => {
          if (ctl.signal.aborted) return;
          setPreview(null);
          setPreviewError(e.message);
        })
        .finally(() => !ctl.signal.aborted && setLoading(false));
    }, 550);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => setAvatarOk(false), [owner]);

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (next === "fields") {
      const p = parseLink(link);
      if (p) {
        setOwner(p.owner);
        setRepo(p.repo);
      }
    } else if (NAME.test(owner) && NAME.test(repo)) {
      setLink(`https://github.com/${owner}/${repo}`);
    }
    setMode(next);
  }

  function shake() {
    if (!reduce && scope.current) animateEl(scope.current, { x: [0, -9, 8, -5, 3, 0] }, { duration: 0.42 });
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!parsed || busy || previewError) {
      shake();
      if (mode === "fields" && !NAME.test(owner)) ownerRef.current?.focus();
      else if (mode === "fields" && !NAME.test(repo)) repoRef.current?.focus();
      return;
    }
    const input: Input = mode === "fields" ? { owner: parsed.owner, repo: parsed.repo } : { url: link.trim() };
    onStart(input, branch && preview && branch !== preview.defaultBranch ? branch : undefined);
  }

  function pick(name: string) {
    setRepo(name);
    setMenuOpen(false);
  }

  const status = loading ? "checking" : previewError ? "error" : preview ? "ok" : parsed ? "checking" : "idle";
  const showMenu = menuOpen && matches.length > 0 && !(exact && matches.length === 1);

  return (
    <form className="repo-input" ref={scope} onSubmit={submit} noValidate>
      <div className="seg" role="tablist" aria-label="How to enter the repository">
        {(
          [
            ["fields", "Username + repo"],
            ["link", "Paste a link"],
          ] as const
        ).map(([m, label]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => switchMode(m)}>
            {mode === m && <motion.span layoutId="seg-pill" className="seg-pill" transition={{ type: "spring", stiffness: 480, damping: 36 }} />}
            <span className="seg-label">{label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {mode === "fields" ? (
          <motion.div key="fields" className="two-fields" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: EASE }}>
            {/* 1 · username */}
            <div className={`field-card${repos ? " ok" : reposError ? " bad" : ""}`}>
              <label htmlFor={ids.owner} className="fc-label">
                <span className="fc-step">1</span> GitHub username
              </label>
              <div className="fc-row">
                <span className="avatar-slot" aria-hidden>
                  <AnimatePresence>
                    {NAME.test(owner) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <motion.img
                        key={owner}
                        src={`https://github.com/${owner}.png?size=80`}
                        alt=""
                        onLoad={() => setAvatarOk(true)}
                        onError={() => setAvatarOk(false)}
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: avatarOk ? 1 : 0, scale: avatarOk ? 1 : 0.6 }}
                        exit={{ opacity: 0, scale: 0.6 }}
                        transition={{ duration: 0.35, ease: EASE }}
                      />
                    )}
                  </AnimatePresence>
                  {!avatarOk && <Icon name="github" size={18} className="field-icon" />}
                </span>
                <input
                  id={ids.owner}
                  ref={ownerRef}
                  value={owner}
                  onChange={(e) => {
                    const v = e.target.value;
                    // "owner/repo" typed or pasted here gets split across both boxes
                    const p = v.includes("/") ? parseLink(v) : null;
                    if (p) {
                      setOwner(p.owner);
                      setRepo(p.repo);
                      repoRef.current?.focus();
                      return;
                    }
                    setOwner(v.replace(/[\s/]/g, "").replace(/^@/, ""));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && NAME.test(owner) && !repo) {
                      e.preventDefault();
                      repoRef.current?.focus();
                      setMenuOpen(true);
                    }
                  }}
                  placeholder="e.g. sindresorhus"
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoFocus
                />
              </div>
              <p className="fc-help" aria-live="polite">
                {reposError ? (
                  <span className="warn">{reposError}</span>
                ) : repos ? (
                  repos.length >= 100 ? "100+ public repos. Type to search them" : `${repos.length} public repo${repos.length === 1 ? "" : "s"} found`
                ) : NAME.test(owner) ? (
                  "Looking up repositories…"
                ) : (
                  "The person or organisation that owns the repo"
                )}
              </p>
            </div>

            <span className="fields-join" aria-hidden>
              /
            </span>

            {/* 2 · repository, with the user's repos to pick from */}
            <div className={`field-card combo${exact ? " ok" : ""}`}>
              <label htmlFor={ids.repo} className="fc-label">
                <span className="fc-step">2</span> Repository name
              </label>
              <div className="fc-row">
                <Icon name="folder" size={17} className="field-icon" />
                <input
                  id={ids.repo}
                  ref={repoRef}
                  value={repo}
                  onChange={(e) => {
                    setRepo(e.target.value.trim());
                    setMenuOpen(true);
                    setActive(0);
                  }}
                  onFocus={() => setMenuOpen(true)}
                  onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !repo) ownerRef.current?.focus();
                    if (!showMenu) return;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActive((a) => (a + 1) % matches.length);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActive((a) => (a - 1 + matches.length) % matches.length);
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      pick(matches[active].name);
                    } else if (e.key === "Escape") setMenuOpen(false);
                  }}
                  placeholder={repos?.[0] ? `e.g. ${repos[0].name}` : "e.g. ky"}
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="off"
                  role="combobox"
                  aria-expanded={showMenu}
                  aria-controls={ids.list}
                  aria-autocomplete="list"
                />
              </div>
              <p className="fc-help">{exact ? "Found in their repos" : repos && !repo ? "Pick one below or type its name" : "The repository's name on GitHub"}</p>
              <AnimatePresence>
                {showMenu && (
                  <motion.ul
                    id={ids.list}
                    role="listbox"
                    className="combo-menu"
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.2, ease: EASE }}
                  >
                    {matches.map((r, i) => (
                      <li
                        key={r.name}
                        role="option"
                        aria-selected={i === active}
                        className={i === active ? "on" : ""}
                        onMouseEnter={() => setActive(i)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pick(r.name);
                        }}
                      >
                        <span className="cm-name">
                          {r.name}
                          {r.fork && <span className="badge">fork</span>}
                        </span>
                        {r.description && <span className="cm-desc">{r.description}</span>}
                        <span className="cm-meta">
                          {r.language && <span>{r.language}</span>}
                          <span>
                            <Icon name="star" size={12} /> {compact(r.stars)}
                          </span>
                          <span>{ago(r.pushedAt)}</span>
                        </span>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          <motion.div key="link" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: EASE }}>
            <div className={`field-shell status-${status}`}>
              <div className="field-row">
                <Icon name="link" size={18} className="field-icon" />
                <label htmlFor={ids.link} className="sr-only">
                  GitHub repository link
                </label>
                <input
                  id={ids.link}
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="off"
                  inputMode="url"
                  autoFocus
                />
              </div>
            </div>
            <div className="input-foot" aria-live="polite">
              {link.trim() && (
                <span className={`reads-as ${parsed ? "" : "warn"}`}>
                  {parsed ? (
                    <>
                      Reads as <b>{parsed.owner}</b>/<b>{parsed.repo}</b>
                    </>
                  ) : (
                    "That isn't a GitHub repo link yet. Try github.com/owner/repo"
                  )}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {(preview || (previewError && !showMenu) || (parsed && loading && !showMenu)) && (
          <motion.div className="preview-wrap" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.45, ease: EASE }}>
            {previewError ? (
              <div className="preview error-card" role="alert">
                <span className="err-dot" aria-hidden />
                {previewError}
              </div>
            ) : preview && !loading ? (
              <motion.div className="preview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="pv-avatar" src={preview.avatarUrl} alt="" width={48} height={48} />
                <div className="pv-main">
                  <div className="pv-name">
                    <span>
                      <span className="muted">{preview.owner}/</span>
                      <b>{preview.name}</b>
                    </span>
                    {preview.cached && <span className="badge ok">Explained before · opens instantly</span>}
                    {preview.archived && <span className="badge">Archived</span>}
                    {preview.fork && <span className="badge">Fork</span>}
                  </div>
                  {preview.description && <p className="pv-desc">{preview.description}</p>}
                  <div className="pv-meta">
                    <span>
                      <Icon name="star" size={14} /> {compact(preview.stars)}
                    </span>
                    <span>
                      <Icon name="fork" size={14} /> {compact(preview.forks)}
                    </span>
                    {preview.language && <span>{preview.language}</span>}
                    <span>
                      <Icon name="clock" size={14} /> updated {ago(preview.pushedAt)}
                    </span>
                  </div>
                </div>
                {preview.branches.length > 0 && (
                  <div className="pv-branch">
                    <label htmlFor={ids.branch}>Branch</label>
                    <div className="select">
                      <select id={ids.branch} value={branch} onChange={(e) => setBranch(e.target.value)}>
                        {preview.branches.map((b) => (
                          <option key={b} value={b}>
                            {b}
                            {b === preview.defaultBranch ? " (default)" : ""}
                          </option>
                        ))}
                      </select>
                      <Icon name="chevron" size={14} className="select-chev" />
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="preview skeleton" aria-label="Looking up the repository">
                <span className="sk sk-avatar" />
                <span className="sk-lines">
                  <span className="sk sk-l1" />
                  <span className="sk sk-l2" />
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button type="submit" className="go go-wide" disabled={busy}>
        <span className="go-shine" aria-hidden />
        <span className="go-label">{busy ? "Starting…" : parsed ? `Explain ${parsed.owner}/${parsed.repo}` : "Explain this repo"}</span>
        <Icon name="arrow" size={18} />
      </button>

      <div className="examples-row">
        <span className="muted">Try one:</span>
        {EXAMPLES.map((ex, i) => (
          <motion.button
            key={ex.label}
            type="button"
            className="ex-chip"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 + i * 0.07, duration: 0.5, ease: EASE }}
            onClick={() => {
              const [o, r] = ex.label.split("/");
              setOwner(o);
              setRepo(r);
              setLink(`https://github.com/${ex.label}`);
            }}
          >
            {ex.label}
            <span className="ex-note">{ex.note}</span>
          </motion.button>
        ))}
      </div>
    </form>
  );
}
