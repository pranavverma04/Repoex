// The repo picker on the home page: "username + repo" boxes (with the user's repositories to pick
// from) or a pasted link, a live preview of the repo with a branch picker, and the Explain button.
// Plain-JS port of components/explain/RepoInput.tsx.
import { api } from "../api.js";
import { h, reducedMotion, render } from "../dom.js";
import { ago, compact, enter, icon } from "../ui.js";

/** Mirrors the backend parser so the UI can show what a link reads as before asking the server. */
export function parseLink(raw) {
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

function loadSaved() {
  try {
    const raw = sessionStorage.getItem(LAST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let uid = 0;

/**
 * @param {{ onStart: (input: object, branch?: string) => void, initial?: string }} opts
 * @returns {{ el: HTMLFormElement, setBusy: (busy: boolean) => void }}
 */
export function repoInput({ onStart, initial }) {
  const n = ++uid;
  const ids = { owner: `ri-owner-${n}`, repo: `ri-repo-${n}`, link: `ri-link-${n}`, branch: `ri-branch-${n}`, list: `ri-list-${n}` };

  const s = {
    mode: "fields",
    owner: "",
    repo: "",
    link: "",
    preview: null,
    previewError: null,
    loading: false,
    branch: "",
    avatarOk: false,
    repos: null,
    reposError: null,
    menuOpen: false,
    active: 0,
    found: [],
    busy: false,
  };

  // Restore the last thing typed (so Back returns to it), or a ?repo= prefill.
  const fromUrl = initial ? parseLink(initial) : null;
  const saved = loadSaved();
  if (fromUrl && (!saved || `${saved.owner}/${saved.repo}`.toLowerCase() !== `${fromUrl.owner}/${fromUrl.repo}`.toLowerCase())) {
    s.owner = fromUrl.owner;
    s.repo = fromUrl.repo;
    s.link = `https://github.com/${fromUrl.owner}/${fromUrl.repo}`;
  } else if (saved) {
    s.mode = saved.mode === "link" ? "link" : "fields";
    s.owner = saved.owner ?? "";
    s.repo = saved.repo ?? "";
    s.link = saved.link ?? "";
  }

  // ---- derived values ----
  const parsed = () =>
    s.mode === "fields" ? (NAME.test(s.owner) && NAME.test(s.repo) ? { owner: s.owner, repo: s.repo } : null) : parseLink(s.link);
  const keyOf = () => {
    const p = parsed();
    return p ? `${p.owner}/${p.repo}`.toLowerCase() : "";
  };
  const matches = () => {
    if (!s.repos) return [];
    const q = s.repo.toLowerCase();
    const all = [...s.repos, ...s.found.filter((f) => !s.repos.some((r) => r.name === f.name))];
    const list = q ? all.filter((r) => r.name.toLowerCase().includes(q)) : s.repos;
    const rank = (r) => (r.name.toLowerCase() === q ? 2 : r.name.toLowerCase().startsWith(q) ? 1 : 0);
    return list
      .slice()
      .sort((a, b) => rank(b) - rank(a) || (q ? a.name.length - b.name.length : 0))
      .slice(0, 8);
  };
  const exact = () =>
    !!s.repos?.some((r) => r.name.toLowerCase() === s.repo.toLowerCase()) ||
    s.found.some((r) => r.name.toLowerCase() === s.repo.toLowerCase());
  const showMenu = () => {
    const m = matches();
    return s.menuOpen && m.length > 0 && !(exact() && m.length === 1);
  };

  // ---- side effects (what the React effects did) ----
  // The user's repositories, for the repository box (owner debounced 450 ms).
  let ownerDeb = s.owner;
  let ownerTimer = 0;
  let reposToken = 0;
  function reposEffect() {
    s.repos = null;
    s.reposError = null;
    s.found = [];
    const token = ++reposToken;
    if (s.mode === "fields" && NAME.test(ownerDeb)) {
      api
        .userRepos(ownerDeb)
        .then((r) => {
          if (token !== reposToken) return;
          s.repos = r;
          foundEffect();
          update();
        })
        .catch((e) => {
          if (token !== reposToken) return;
          s.reposError = e.message;
          update();
        });
    }
  }

  // Only the 100 most recently pushed repos come back up front; search the rest by name.
  let repoDeb = s.repo;
  let repoTimer = 0;
  let foundToken = 0;
  function foundEffect() {
    s.found = [];
    const token = ++foundToken;
    if (!s.repos || s.repos.length < 100 || !NAME.test(repoDeb)) return;
    api
      .userRepos(ownerDeb, repoDeb)
      .then((r) => {
        if (token !== foundToken) return;
        s.found = r;
        update();
      })
      .catch(() => {});
  }

  // Debounced preview lookup, re-run whenever the parsed owner/repo changes.
  let lastKey = null;
  let previewCtl = null;
  let previewTimer = 0;
  function previewEffect() {
    const key = keyOf();
    if (key === lastKey) return;
    lastKey = key;
    clearTimeout(previewTimer);
    previewCtl?.abort();
    s.previewError = null;
    const p = parsed();
    if (!p) {
      s.preview = null;
      s.loading = false;
      return;
    }
    if (s.preview && s.preview.fullName.toLowerCase() === key) return;
    const ctl = new AbortController();
    previewCtl = ctl;
    s.loading = true;
    previewTimer = setTimeout(() => {
      api
        .previewRepo({ owner: p.owner, repo: p.repo }, ctl.signal)
        .then((pv) => {
          s.preview = pv;
          s.branch = pv.defaultBranch;
        })
        .catch((e) => {
          if (ctl.signal.aborted) return;
          s.preview = null;
          s.previewError = e.message;
        })
        .finally(() => {
          if (ctl.signal.aborted) return;
          s.loading = false;
          update();
        });
    }, 550);
  }

  /** Applies a state change and runs whichever effects its fields feed. */
  function set(patch) {
    const prev = { mode: s.mode, owner: s.owner, repo: s.repo };
    Object.assign(s, patch);
    if (s.owner !== prev.owner) {
      s.avatarOk = false;
      clearTimeout(ownerTimer);
      ownerTimer = setTimeout(() => {
        if (ownerDeb === s.owner) return;
        ownerDeb = s.owner;
        reposEffect();
        update();
      }, 450);
    }
    if (s.repo !== prev.repo) {
      clearTimeout(repoTimer);
      repoTimer = setTimeout(() => {
        if (repoDeb === s.repo) return;
        repoDeb = s.repo;
        foundEffect();
        update();
      }, 300);
    }
    if (s.mode !== prev.mode) reposEffect();
    previewEffect();
    update();
  }

  // ---- elements ----
  const form = h("form", { class: "repo-input", novalidate: true });
  const seg = h("div", { class: "seg", role: "tablist", "aria-label": "How to enter the repository" });
  const modeArea = h("div");
  const previewSlot = h("div");
  const goLabel = h("span", { class: "go-label" });
  const goBtn = h("button", { type: "submit", class: "go go-wide" }, h("span", { class: "go-shine", "aria-hidden": "true" }), goLabel, icon("arrow", 18));

  // Username + repo boxes
  let ownerCard, ownerInput, avatarSlot, avatarImg, avatarFor, avatarIcon, ownerHelp;
  let repoCard, repoInput_, repoHelp, menuSlot;
  // Link box
  let linkShell, linkInput, linkFoot;

  function switchMode(next) {
    if (next === s.mode) return;
    const patch = { mode: next };
    if (next === "fields") {
      const p = parseLink(s.link);
      if (p) {
        patch.owner = p.owner;
        patch.repo = p.repo;
      }
    } else if (NAME.test(s.owner) && NAME.test(s.repo)) {
      patch.link = `https://github.com/${s.owner}/${s.repo}`;
    }
    set(patch);
    buildMode(true);
  }

  function renderSeg() {
    render(
      seg,
      [
        ["fields", "Username + repo"],
        ["link", "Paste a link"],
      ].map(([m, label]) =>
        h(
          "button",
          { type: "button", role: "tab", "aria-selected": String(s.mode === m), class: s.mode === m ? "on" : "", onclick: () => switchMode(m) },
          s.mode === m && h("span", { class: "seg-pill" }),
          h("span", { class: "seg-label" }, label),
        ),
      ),
    );
  }

  function pick(name) {
    set({ repo: name, menuOpen: false });
  }

  function buildFields() {
    ownerInput = h("input", {
      id: ids.owner,
      value: s.owner,
      placeholder: "e.g. sindresorhus",
      autocomplete: "off",
      spellcheck: "false",
      autocapitalize: "off",
      oninput: (e) => {
        const v = e.target.value;
        // "owner/repo" typed or pasted here gets split across both boxes
        const p = v.includes("/") ? parseLink(v) : null;
        if (p) {
          set({ owner: p.owner, repo: p.repo });
          repoInput_.focus();
          return;
        }
        set({ owner: v.replace(/[\s/]/g, "").replace(/^@/, "") });
      },
      onkeydown: (e) => {
        if (e.key === "Enter" && NAME.test(s.owner) && !s.repo) {
          e.preventDefault();
          repoInput_.focus();
          set({ menuOpen: true });
        }
      },
    });
    avatarIcon = icon("github", 18, "field-icon");
    avatarSlot = h("span", { class: "avatar-slot", "aria-hidden": "true" });
    avatarImg = null;
    avatarFor = null;
    ownerHelp = h("p", { class: "fc-help", "aria-live": "polite" });
    ownerCard = h(
      "div",
      { class: "field-card" },
      h("label", { for: ids.owner, class: "fc-label" }, h("span", { class: "fc-step" }, "1"), " GitHub username"),
      h("div", { class: "fc-row" }, avatarSlot, ownerInput),
      ownerHelp,
    );

    repoInput_ = h("input", {
      id: ids.repo,
      value: s.repo,
      autocomplete: "off",
      spellcheck: "false",
      autocapitalize: "off",
      role: "combobox",
      "aria-controls": ids.list,
      "aria-autocomplete": "list",
      oninput: (e) => set({ repo: e.target.value.trim(), menuOpen: true, active: 0 }),
      onfocus: () => set({ menuOpen: true }),
      onblur: () => setTimeout(() => set({ menuOpen: false }), 150),
      onkeydown: (e) => {
        if (e.key === "Backspace" && !s.repo) ownerInput.focus();
        if (!showMenu()) return;
        const m = matches();
        if (e.key === "ArrowDown") {
          e.preventDefault();
          set({ active: (s.active + 1) % m.length });
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          set({ active: (s.active - 1 + m.length) % m.length });
        } else if (e.key === "Enter") {
          e.preventDefault();
          pick(m[s.active].name);
        } else if (e.key === "Escape") set({ menuOpen: false });
      },
    });
    repoHelp = h("p", { class: "fc-help" });
    menuSlot = h("div", { style: "display: contents" });
    repoCard = h(
      "div",
      { class: "field-card combo" },
      h("label", { for: ids.repo, class: "fc-label" }, h("span", { class: "fc-step" }, "2"), " Repository name"),
      h("div", { class: "fc-row" }, icon("folder", 17, "field-icon"), repoInput_),
      repoHelp,
      menuSlot,
    );

    return h("div", { class: "two-fields" }, ownerCard, h("span", { class: "fields-join", "aria-hidden": "true" }, "/"), repoCard);
  }

  function buildLink() {
    linkInput = h("input", {
      id: ids.link,
      value: s.link,
      placeholder: "https://github.com/owner/repo",
      autocomplete: "off",
      spellcheck: "false",
      autocapitalize: "off",
      inputmode: "url",
      oninput: (e) => set({ link: e.target.value }),
    });
    linkShell = h(
      "div",
      { class: "field-shell" },
      h(
        "div",
        { class: "field-row" },
        icon("link", 18, "field-icon"),
        h("label", { for: ids.link, class: "sr-only" }, "GitHub repository link"),
        linkInput,
      ),
    );
    linkFoot = h("div", { class: "input-foot", "aria-live": "polite" });
    return h("div", null, linkShell, linkFoot);
  }

  /** (Re)builds the fields/link area; `focus` mirrors autoFocus on the new input. */
  function buildMode(focus) {
    ownerCard = repoCard = linkShell = null;
    const view = s.mode === "fields" ? buildFields() : buildLink();
    enter(view, { y: 10 });
    view.style.setProperty("--dur", "0.3s");
    render(modeArea, view);
    renderSeg();
    lastMenuSig = null;
    update();
    if (focus) setTimeout(() => (s.mode === "fields" ? ownerInput : linkInput)?.focus(), 0);
  }

  // ---- rendering the parts that change as you type ----
  let lastMenuSig = null;
  let lastPreviewSig = null;

  function updateAvatar() {
    const valid = NAME.test(s.owner);
    if (!valid) {
      avatarImg = null;
      avatarFor = null;
    } else if (avatarFor !== s.owner) {
      avatarFor = s.owner;
      const owner = s.owner;
      avatarImg = h("img", {
        src: `https://github.com/${owner}.png?size=80`,
        alt: "",
        style: "opacity: 0; transform: scale(0.6); transition: opacity 0.35s var(--ease-out), transform 0.35s var(--ease-out)",
        onload: () => {
          if (avatarFor !== owner) return;
          s.avatarOk = true;
          update();
        },
        onerror: () => {
          if (avatarFor !== owner) return;
          s.avatarOk = false;
          update();
        },
      });
    }
    if (avatarImg) {
      avatarImg.style.opacity = s.avatarOk ? "1" : "0";
      avatarImg.style.transform = s.avatarOk ? "scale(1)" : "scale(0.6)";
    }
    const want = [avatarImg, !s.avatarOk && avatarIcon].filter(Boolean);
    if (want.length !== avatarSlot.childNodes.length || want.some((n, i) => avatarSlot.childNodes[i] !== n)) {
      avatarSlot.replaceChildren(...want);
    }
  }

  function updateMenu() {
    const open = showMenu();
    const m = matches();
    const sig = open ? `${s.active}|${m.map((r) => r.name).join(",")}` : "";
    repoInput_.setAttribute("aria-expanded", String(open));
    if (sig === lastMenuSig) return;
    const wasOpen = !!lastMenuSig;
    lastMenuSig = sig;
    if (!open) {
      menuSlot.replaceChildren();
      return;
    }
    const ul = h(
      "ul",
      { id: ids.list, role: "listbox", class: "combo-menu" },
      m.map((r, i) =>
        h(
          "li",
          {
            role: "option",
            "aria-selected": String(i === s.active),
            class: i === s.active ? "on" : "",
            onmouseenter: () => {
              if (s.active !== i) set({ active: i });
            },
            onmousedown: (e) => {
              e.preventDefault();
              pick(r.name);
            },
          },
          h("span", { class: "cm-name" }, r.name, r.fork && h("span", { class: "badge" }, "fork")),
          r.description && h("span", { class: "cm-desc" }, r.description),
          h(
            "span",
            { class: "cm-meta" },
            r.language && h("span", null, r.language),
            h("span", null, icon("star", 12), " ", compact(r.stars)),
            h("span", null, ago(r.pushedAt)),
          ),
        ),
      ),
    );
    if (!wasOpen && !reducedMotion()) {
      ul.animate(
        [
          { opacity: 0, transform: "translateY(-6px) scale(0.98)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    }
    menuSlot.replaceChildren(ul);
  }

  function updatePreview() {
    const p = parsed();
    const open = showMenu();
    const visible = s.preview || (s.previewError && !open) || (p && s.loading && !open);
    const kind = !visible ? "none" : s.previewError ? "error" : s.preview && !s.loading ? "preview" : "skeleton";
    const sig = `${kind}|${kind === "error" ? s.previewError : kind === "preview" ? s.preview.fullName : ""}`;
    if (sig === lastPreviewSig) return;
    const wasNone = !lastPreviewSig || lastPreviewSig.startsWith("none");
    lastPreviewSig = sig;
    if (kind === "none") {
      previewSlot.replaceChildren();
      return;
    }
    let inner;
    if (kind === "error") {
      inner = h("div", { class: "preview error-card", role: "alert" }, h("span", { class: "err-dot", "aria-hidden": "true" }), s.previewError);
    } else if (kind === "preview") {
      const pv = s.preview;
      inner = h(
        "div",
        { class: "preview" },
        h("img", { class: "pv-avatar", src: pv.avatarUrl, alt: "", width: 48, height: 48 }),
        h(
          "div",
          { class: "pv-main" },
          h(
            "div",
            { class: "pv-name" },
            h("span", null, h("span", { class: "muted" }, `${pv.owner}/`), h("b", null, pv.name)),
            pv.cached && h("span", { class: "badge ok" }, "Explained before · opens instantly"),
            pv.archived && h("span", { class: "badge" }, "Archived"),
            pv.fork && h("span", { class: "badge" }, "Fork"),
          ),
          pv.description && h("p", { class: "pv-desc" }, pv.description),
          h(
            "div",
            { class: "pv-meta" },
            h("span", null, icon("star", 14), " ", compact(pv.stars)),
            h("span", null, icon("fork", 14), " ", compact(pv.forks)),
            pv.language && h("span", null, pv.language),
            h("span", null, icon("clock", 14), " updated ", ago(pv.pushedAt)),
          ),
        ),
        pv.branches.length > 0 &&
          h(
            "div",
            { class: "pv-branch" },
            h("label", { for: ids.branch }, "Branch"),
            h(
              "div",
              { class: "select" },
              h(
                "select",
                { id: ids.branch, onchange: (e) => (s.branch = e.target.value) },
                pv.branches.map((b) =>
                  h("option", { value: b, selected: b === s.branch }, b, b === pv.defaultBranch ? " (default)" : ""),
                ),
              ),
              icon("chevron", 14, "select-chev"),
            ),
          ),
      );
      enter(inner, { y: 10 });
      inner.style.setProperty("--dur", "0.5s");
    } else {
      inner = h(
        "div",
        { class: "preview skeleton", "aria-label": "Looking up the repository" },
        h("span", { class: "sk sk-avatar" }),
        h("span", { class: "sk-lines" }, h("span", { class: "sk sk-l1" }), h("span", { class: "sk sk-l2" })),
      );
    }
    const wrap = h("div", { class: "preview-wrap" }, inner);
    if (wasNone && !reducedMotion()) {
      wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    }
    previewSlot.replaceChildren(wrap);
  }

  function update() {
    const p = parsed();
    if (s.mode === "fields" && ownerCard) {
      ownerCard.className = `field-card${s.repos ? " ok" : s.reposError ? " bad" : ""}`;
      if (ownerInput.value !== s.owner) ownerInput.value = s.owner;
      updateAvatar();
      render(
        ownerHelp,
        s.reposError
          ? h("span", { class: "warn" }, s.reposError)
          : s.repos
            ? s.repos.length >= 100
              ? "100+ public repos. Type to search them"
              : `${s.repos.length} public repo${s.repos.length === 1 ? "" : "s"} found`
            : NAME.test(s.owner)
              ? "Looking up repositories…"
              : "The person or organisation that owns the repo",
      );
      const ex = exact();
      repoCard.className = `field-card combo${ex ? " ok" : ""}`;
      if (repoInput_.value !== s.repo) repoInput_.value = s.repo;
      repoInput_.placeholder = s.repos?.[0] ? `e.g. ${s.repos[0].name}` : "e.g. ky";
      repoHelp.textContent = ex ? "Found in their repos" : s.repos && !s.repo ? "Pick one below or type its name" : "The repository's name on GitHub";
      updateMenu();
    } else if (s.mode === "link" && linkShell) {
      const status = s.loading ? "checking" : s.previewError ? "error" : s.preview ? "ok" : p ? "checking" : "idle";
      linkShell.className = `field-shell status-${status}`;
      if (linkInput.value !== s.link) linkInput.value = s.link;
      render(
        linkFoot,
        s.link.trim() &&
          h(
            "span",
            { class: `reads-as ${p ? "" : "warn"}` },
            p ? ["Reads as ", h("b", null, p.owner), "/", h("b", null, p.repo)] : "That isn't a GitHub repo link yet. Try github.com/owner/repo",
          ),
      );
    }
    updatePreview();
    goBtn.disabled = s.busy;
    goLabel.textContent = s.busy ? "Starting…" : p ? `Explain ${p.owner}/${p.repo}` : "Explain this repo";
    try {
      sessionStorage.setItem(LAST_KEY, JSON.stringify({ mode: s.mode, owner: s.owner, repo: s.repo, link: s.link }));
    } catch {}
  }

  function shake() {
    if (reducedMotion()) return;
    form.animate(
      [0, -9, 8, -5, 3, 0].map((x) => ({ transform: `translateX(${x}px)` })),
      { duration: 420 },
    );
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const p = parsed();
    if (!p || s.busy || s.previewError) {
      shake();
      if (s.mode === "fields" && !NAME.test(s.owner)) ownerInput?.focus();
      else if (s.mode === "fields" && !NAME.test(s.repo)) repoInput_?.focus();
      return;
    }
    const input = s.mode === "fields" ? { owner: p.owner, repo: p.repo } : { url: s.link.trim() };
    onStart(input, s.branch && s.preview && s.branch !== s.preview.defaultBranch ? s.branch : undefined);
  });

  const examples = h(
    "div",
    { class: "examples-row" },
    h("span", { class: "muted" }, "Try one:"),
    EXAMPLES.map((ex, i) =>
      enter(
        h(
          "button",
          {
            type: "button",
            class: "ex-chip",
            onclick: () => {
              const [o, r] = ex.label.split("/");
              set({ owner: o, repo: r, link: `https://github.com/${ex.label}` });
            },
          },
          ex.label,
          h("span", { class: "ex-note" }, ex.note),
        ),
        { delay: 0.9 + i * 0.07, y: 8 },
      ),
    ),
  );

  form.append(seg, modeArea, previewSlot, goBtn, examples);
  buildMode(true);
  reposEffect();
  previewEffect();
  update();

  return {
    el: form,
    setBusy(busy) {
      s.busy = busy;
      update();
    },
  };
}
