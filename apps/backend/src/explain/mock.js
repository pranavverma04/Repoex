// Mock output: a preview of what the project produces when it runs, built by reading its code.
// Nothing here executes the repository. Every page, endpoint and command points back to the
// file and line it came from.

const IMG_EXT = /\.(png|jpe?g|gif|svg|webp|avif|ico)$/i;

/** Turns an <img src> / import path into a raw GitHub URL for a file that exists in the repo. */
function resolveAsset(src, fromFile, s) {
  if (/^https?:\/\//.test(src)) return src;
  if (!IMG_EXT.test(src.split("?")[0])) return null;
  const clean = src.split(/[?#]/)[0];
  let hit;
  if (clean.startsWith("/")) {
    // root-relative: served from public/ or static/ in most frameworks, or the repo root on static sites
    hit =
      s.paths.find((p) => p.endsWith(`public${clean}`) || p.endsWith(`static${clean}`)) ??
      s.paths.find((p) => p === clean.slice(1));
  } else {
    const dir = fromFile.split("/").slice(0, -1);
    const parts = clean.replace(/^[@~]\//, "src/").split("/");
    const out = clean.startsWith(".") ? [...dir] : [];
    for (const seg of parts) {
      if (seg === "..") out.pop();
      else if (seg !== ".") out.push(seg);
    }
    const joined = out.join("/");
    hit = s.paths.find((p) => p === joined) ?? s.paths.find((p) => p.endsWith("/" + joined));
  }
  return hit ? s.rawBase + hit.split("/").map(encodeURIComponent).join("/") : null;
}

function pageImages(file, text, s) {
  const out = [];
  const imported = new Map();
  for (const m of text.matchAll(/import\s+(\w+)\s+from\s+["']([^"']+\.(?:png|jpe?g|gif|svg|webp|avif))["']/gi))
    imported.set(m[1], m[2]);
  for (const m of text.matchAll(
    /<(?:img|Image)\b[^>]*?\bsrc=(?:["']([^"']+)["']|\{\s*["'`]([^"'`]+)["'`]\s*\}|\{\s*(\w+)\s*\})/g,
  )) {
    const src = m[1] ?? m[2] ?? (m[3] ? imported.get(m[3]) : undefined);
    const url = src ? resolveAsset(src, file, s) : null;
    if (url && !out.includes(url)) out.push(url);
    if (out.length >= 4) break;
  }
  return out;
}

function luminance(hex) {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Reads brand colours, the main font and a logo from the repo's own styles and assets. */
function detectTheme(s) {
  const css = [...s.files.entries()].filter(([f]) => /\.(css|scss)$/.test(f) && !isTestPath(f));
  const tw = [...s.files.entries()].filter(([f]) => /(^|\/)tailwind\.config\.\w+$/.test(f));
  // every custom property, so values like var(--smoky-black) can be resolved
  const vars = new Map();
  for (const [, t] of css)
    for (const m of t.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)) if (!vars.has(m[1])) vars.set(m[1], m[2].trim());
  const resolve = (v, depth = 0) => {
    const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/);
    if (!m || depth > 4) return v;
    return resolve(vars.get(m[1]) ?? m[2] ?? v, depth + 1);
  };
  const color = (v) => {
    const t = resolve(
      v
        .trim()
        .replace(/!important/, "")
        .trim(),
    );
    // shadcn style bare HSL channels: "222.2 47.4% 11.2%"
    if (/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/.test(t)) return `hsl(${t})`;
    if (/^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\))$/i.test(t)) return t;
    return null;
  };
  const cssVar = (names) => {
    const re = new RegExp(`--(?:color-)?(?:${names})\\s*:\\s*([^;]+);`, "i");
    for (const [, t] of css) {
      const m = t.match(re);
      const c = m && color(m[1]);
      if (c) return c;
    }
    return null;
  };
  let accent = cssVar("primary|accent|brand|main|theme|highlight|primary-color|color-primary");
  let background = cssVar("background|bg|bg-color|background-color|base|surface");
  let text = cssVar("foreground|text|text-color|fg|ink");
  for (const [, t] of css) {
    for (const body of t
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .matchAll(/(?<=^|\})\s*(?:html|body)\s*(?:,[^{]*)?\{([^}]*)\}/g)) {
      background ??= color(body[1].match(/background(?:-color)?\s*:\s*([^;]+)/)?.[1] ?? "");
      text ??= color(body[1].match(/(?:^|;|\s)color\s*:\s*([^;]+)/)?.[1] ?? "");
    }
  }
  // no conventionally named accent: take the most saturated colour the stylesheet defines
  if (!accent) {
    let best = null;
    for (const v of vars.values()) {
      const c = resolve(v);
      let sat = 0;
      const h = c.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i)?.[1];
      const hsl = c.match(/^hsla?\(\s*[\d.]+(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i);
      if (h) {
        const full =
          h.length === 3
            ? h
                .split("")
                .map((x) => x + x)
                .join("")
            : h;
        const [r, g, b2] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
        sat = Math.max(r, g, b2) - Math.min(r, g, b2);
      } else if (hsl) {
        const l = Number(hsl[2]);
        sat = l > 25 && l < 85 ? (Number(hsl[1]) / 100) * (1 - Math.abs(2 * (l / 100) - 1)) : 0;
      } else continue;
      if (sat > 0.35 && (!best || sat > best[0])) best = [sat, c];
    }
    accent = best?.[1] ?? null;
  }
  for (const [, t] of tw) {
    accent ??=
      t.match(/(?:primary|brand|accent)\s*:\s*(?:\{[^}]*?DEFAULT\s*:\s*)?["'](#[0-9a-f]{3,8})["']/i)?.[1] ?? null;
    background ??= t.match(/(?:background|bg)\s*:\s*["'](#[0-9a-f]{3,8})["']/i)?.[1] ?? null;
  }
  // font: next/font import, else the body font-family
  let font = null;
  for (const [, t] of s.files) {
    const m = t.match(/import\s*\{\s*([A-Z]\w+)[^}]*\}\s*from\s*["']next\/font\/google["']/);
    if (m) {
      font = m[1].replace(/_/g, " ");
      break;
    }
  }
  if (!font) {
    for (const [, t] of css) {
      const m = t.match(/(?:body|html|:root)[^{]*\{[^}]*font-family\s*:\s*([^;}]+)/);
      const fam = m ? resolve(m[1].trim()).split(",")[0].replace(/["']/g, "").trim() : "";
      if (fam && !/var\(|inherit|system-ui|-apple-system|sans-serif|serif/.test(fam)) {
        font = fam;
        break;
      }
    }
  }
  const logoPath =
    s.paths.find(
      (p) =>
        /(^|\/)(public|static|assets|src\/assets|images?|img)\/(?:[\w-]+\/)?[\w.-]*(logo|brand|mark)[\w.-]*\.(svg|png|webp|jpe?g)$/i.test(
          p,
        ) && !isTestPath(p),
    ) ??
    s.paths.find((p) => /(^|\/)(public|static)\/(favicon|icon|apple-touch-icon)[\w.-]*\.(svg|png)$/i.test(p)) ??
    s.paths.find((p) => /(^|\/)app\/(icon|apple-icon)\.(svg|png)$/.test(p));
  const logo = logoPath ? s.rawBase + logoPath.split("/").map(encodeURIComponent).join("/") : null;
  if (!accent && !background && !font && !logo) return null;
  const lum = background?.startsWith("#") ? luminance(background) : null;
  const darkClass = [...s.files.entries()].some(
    ([f, t]) =>
      /layout\.(tsx|jsx)$|index\.html$/.test(f) && /className=["'][^"']*\bdark\b|class=["'][^"']*\bdark\b/.test(t),
  );
  const bareHsl =
    background?.match(/^hsla?\([^,\s]+[\s,]+[\d.]+%[\s,]+(\d+(?:\.\d+)?)%/) ??
    background?.match(/^oklch\(\s*(\d*\.?\d+)/)?.map((x, i) => (i === 1 ? String(Number(x) * 100) : x));
  const dark = lum !== null ? lum < 0.35 : bareHsl ? Number(bareHsl[1]) < 35 : darkClass;
  return { accent, background, text, font, logo, dark };
}

const lineAt = (text, index) => text.slice(0, index).split("\n").length;
const isTestPath = (p) =>
  /(^|\/)(tests?|__tests__|spec|e2e|fixtures|examples?|docs?|benchmarks?)\//i.test(p) || /\.(test|spec)\.\w+$/.test(p);

function decode(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&rarr;/g, "→")
    .replace(/&mdash;/g, "—");
}

/** Visible text of a JSX/HTML fragment. Expressions like {user.name} become "…" when they're all there is. */
function textOf(fragment) {
  let s = fragment.replace(/<br\s*\/?>/gi, " ");
  s = s.replace(/\{\s*["'`]([^"'`{}]*)["'`]\s*\}/g, "$1"); // {"literal"}
  s = s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  s = s.replace(/<[^>]+>/g, " ");
  // a leftover JSX expression fragment means the regex caught part of an attribute; not text
  if (/^[^<]*\}\s*>/.test(s) && !/\{/.test(s.split("}")[0])) s = s.slice(s.indexOf(">") + 1);
  const hadExpr = /\{[^{}]*\}/.test(s);
  s = s.replace(/\{[^{}]*\}/g, " ").replace(/\{[^{}]*\}/g, " ");
  s = decode(s).replace(/\s+/g, " ").trim();
  if (!s && hadExpr) return "…";
  return s.length > 110 ? s.slice(0, 107).trimEnd() + "…" : s;
}

function allText(text, re, limit, min = 1) {
  const out = [];
  for (const m of text.matchAll(re)) {
    const t = textOf(m[m.length - 1]);
    if (/className|\]:|=\s*["{]|=>|[{}]/.test(t)) continue; // markup that leaked through, not visible text
    if (t.length >= min && t !== "…" && !out.includes(t)) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Page files often just render one imported component (`return <AboutPage />`). Follow up to two
 * such imports so the headings and buttons come from the component that has them.
 */
function withImports(file, text, files, depth = 0) {
  if (depth > 1) return text;
  let out = text;
  const dir = file.split("/").slice(0, -1).join("/");
  const rootOf = file.match(/^(.*?\/)?(src\/|app\/|pages\/)/)?.[1] ?? "";
  for (const m of text.matchAll(/import\s+(?:(\w+)|\{([^}]+)\})\s+from\s+["']([^"']+)["']/g)) {
    const names = m[1]
      ? [m[1]]
      : m[2].split(",").map((x) =>
          x
            .trim()
            .split(/\s+as\s+/)
            .pop(),
        );
    if (!names.some((n) => /^[A-Z]/.test(n) && new RegExp(`<${n}\\b`).test(text))) continue;
    const spec = m[3];
    let base = null;
    if (spec.startsWith(".")) {
      const parts = [...dir.split("/").filter(Boolean)];
      for (const seg of spec.split("/")) {
        if (seg === "..") parts.pop();
        else if (seg !== ".") parts.push(seg);
      }
      base = parts.join("/");
    } else if (/^[@~]\//.test(spec)) {
      base = `${rootOf}src/${spec.slice(2)}`;
      if (![...files.keys()].some((f) => f.startsWith(base))) base = `${rootOf}${spec.slice(2)}`;
    }
    if (!base) continue;
    const hit = [".tsx", ".jsx", ".ts", ".js", ".vue", "/index.tsx", "/index.jsx", "/index.ts", "/index.js"]
      .map((e) => base + e)
      .find((f) => files.has(f));
    if (hit) out += "\n" + withImports(hit, files.get(hit), files, depth + 1);
    if (out.length > 200_000) break;
  }
  return out;
}

/** Matches <tag ...>inner</tag>, where attributes may hold JSX expressions like onClick={() => go(1)}. */
function tagRe(names) {
  return new RegExp(
    `<(?:${names})\\b(?:[^>{}"']|"[^"]*"|'[^']*'|\\{(?:[^{}]|\\{[^{}]*\\})*\\})*>([\\s\\S]*?)<\\/(?:${names})>`,
    "g",
  );
}

function pageFromFile(route, file, text, s) {
  const title =
    text.match(/<title>([^<{]+)<\/title>/i)?.[1]?.trim() ??
    text.match(/\btitle:\s*["'`]([^"'`$]{2,80})["'`]/)?.[1] ??
    null;
  return {
    route,
    file,
    title,
    headings: allText(text, tagRe("h1|h2|h3|CardTitle|Heading|Title"), 6),
    buttons: allText(text, tagRe("button|Button"), 6),
    links: allText(text, tagRe("a|Link|NavLink|router-link|RouterLink"), 8),
    inputs: [
      ...text.matchAll(/<(?:input|textarea|Input|Textarea)\b[^>]*?placeholder=["{]\s*["'`]?([^"'`}]+)["'`]?\s*}?/g),
    ]
      .map((m) => decode(m[1]).trim())
      .filter(Boolean)
      .slice(0, 5),
    paragraphs: allText(text, tagRe("p|CardDescription|Text"), 3, 18),
    images: s ? pageImages(file, text, s) : [],
  };
}

function routeFromFs(rel, dropExt = true) {
  let r = rel;
  if (dropExt) r = r.replace(/\.[^/.]+$/, "");
  const segs = r
    .split("/")
    .filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@") && !s.startsWith("_"))
    .map((s) =>
      s
        .replace(/^\[\.\.\.(\w+)\]$/, "*")
        .replace(/^\[\[\.\.\.(\w+)\]\]$/, "*")
        .replace(/^\[(\w+)\]$/, ":$1"),
    );
  if (segs[segs.length - 1] === "index" || segs[segs.length - 1] === "page" || segs[segs.length - 1] === "+page")
    segs.pop();
  return "/" + segs.join("/");
}

/** A pages/ file is a framework page only if it is a component module, not a plain entry script. */
function isPageModule(file, ext, src) {
  if (/^(vue|astro|svelte|md|mdx)$/.test(ext)) return true;
  return /\bexport\s+default\b/.test(src.files.get(file) ?? "");
}

/** Routes a server maps to HTML files: app.get("/r/:id", ... "report.html"), @app.route("/x") ... render_template("x.html"). */
function servedHtmlRoutes(src) {
  const routes = new Map();
  for (const [file, raw] of src.files) {
    if (isTestPath(file) || !/\.(js|mjs|cjs|ts|py)$/.test(file)) continue;
    const text = maskComments(file, raw);
    const found = [
      ...text.matchAll(/\.(?:get|route)\(\s*["'`](\/[^"'`]*)["'`][^\n]{0,160}?["'`]([\w./-]+\.html?)["'`]/g),
      ...text.matchAll(/@\w+\.(?:route|get)\(\s*["'](\/[^"']*)["'][\s\S]{0,240}?render_template\(\s*["']([\w./-]+\.html?)["']/g),
    ];
    for (const m of found) {
      const html = m[2].replace(/^\.?\//, "");
      if (!routes.has(html)) routes.set(html, m[1]);
      if (!routes.has(html.split("/").pop())) routes.set(html.split("/").pop(), m[1]);
    }
  }
  return routes;
}

/** True when the HTML itself shows something: its <body>, minus scripts and styles, has real text. */
function hasStaticContent(html) {
  const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return body.length >= 60 || /<h[1-3]\b[^>]*>[^<]{2,}/i.test(html);
}

/** The page's own scripts (<script src>) plus the modules they import, two levels deep. */
function scriptText(htmlFile, root, html, files) {
  const dir = htmlFile.replace(/[^/]*$/, "");
  const resolve = (from, spec) => {
    if (/^(https?:)?\/\//.test(spec)) return null;
    const base = spec.startsWith("/") ? root : from;
    const parts = base.split("/").filter(Boolean);
    for (const seg of spec.replace(/^\//, "").split("/")) {
      if (seg === "..") parts.pop();
      else if (seg !== ".") parts.push(seg);
    }
    const f = parts.join("/");
    return files.has(f) ? f : null;
  };
  const seen = new Set();
  let out = "";
  const visit = (file, depth) => {
    if (!file || seen.has(file) || depth > 2 || out.length > 300_000) return;
    seen.add(file);
    const text = files.get(file);
    out += "\n" + text;
    const here = file.replace(/[^/]*$/, "");
    for (const m of text.matchAll(/\bimport\s+(?:[\w*{}\s,]+\s+from\s+)?["']([^"']+)["']/g)) visit(resolve(here, m[1]), depth + 1);
  };
  for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) visit(resolve(dir, m[1]), 0);
  return out;
}

/** HTML written inside template literals (el.innerHTML = `<h1>…</h1>`), so the usual tag patterns can read it. */
function templateMarkup(js) {
  return [...js.matchAll(/`([^`]*<[a-z][^`]*)`/gi)].map((m) => m[1].replace(/\$\{[^}]*\}/g, "…")).join("\n");
}

/** UI text from hyperscript-style builders: h("h2", { class: "x" }, "Title"), createElement("button") … */
function scriptUi(js) {
  const props = String.raw`(?:null|undefined|\{(?:[^{}]|\{[^{}]*\})*\})`;
  const texts = (tags, limit, min = 2) => {
    const re = new RegExp(String.raw`\b\w+\(\s*["'](?:${tags})["']\s*,\s*${props}\s*,\s*["'\`]([^"'\`$\n]{${min},140})["'\`]`, "g");
    const out = [];
    for (const m of js.matchAll(re)) {
      const t = decode(m[1]).trim();
      if (t && !out.includes(t)) out.push(t);
      if (out.length >= limit) break;
    }
    return out;
  };
  const placeholders = [...js.matchAll(/\bplaceholder\s*[:=]\s*["'`]([^"'`$\n]{2,80})["'`]/g)].map((m) => decode(m[1]).trim());
  return {
    headings: texts("h1|h2|h3", 6),
    buttons: texts("button", 6),
    links: texts("a", 8),
    inputs: [...new Set(placeholders)].slice(0, 5),
    paragraphs: texts("p", 3, 18),
  };
}

function detectWeb(src) {
  const pages = [];
  let framework = "";
  const add = (route, file) => {
    const text = src.files.get(file);
    if (!text || pages.some((p) => p.route === route && p.file.split("/")[0] === file.split("/")[0])) return;
    pages.push(pageFromFile(route, file, withImports(file, text, src.files), src));
  };
  for (const p of src.paths) {
    if (isTestPath(p) || /node_modules\//.test(p)) continue;
    let m;
    if ((m = p.match(/^(?:.*\/)?(?:src\/)?app\/(.*?)page\.(tsx|jsx|js|ts|mdx)$/)) && !/(^|\/)api\//.test(m[1])) {
      framework ||= "Next.js (App Router)";
      add(routeFromFs(m[1] || "", false).replace(/\/$/, "") || "/", p);
    } else if (
      (m = p.match(/^(?:.*\/)?(?:src\/)?pages\/(.+)\.(tsx|jsx|js|vue|astro|svelte|md|mdx)$/)) &&
      !/^(api\/|_app|_document|_error)/.test(m[1]) &&
      isPageModule(p, m[2], src)
    ) {
      framework ||= m[2] === "vue" ? "Nuxt / Vue" : m[2] === "astro" ? "Astro" : "Next.js (Pages Router)";
      add(routeFromFs(m[1]), p);
    } else if ((m = p.match(/^(?:.*\/)?src\/routes\/(.*?)\+page\.svelte$/))) {
      framework ||= "SvelteKit";
      add(routeFromFs(m[1] || "", false).replace(/\/$/, "") || "/", p);
    }
  }
  // TanStack Router file routes: createFileRoute("/items")
  if (!pages.length) {
    for (const [file, raw] of src.files) {
      // comments masked: a comment that merely mentions createFileRoute("/x") is not a route
      const m = maskComments(file, raw).match(/createFileRoute\(\s*["'`]([^"'`]+)["'`]\s*\)/);
      if (!m || isTestPath(file)) continue;
      framework ||= "TanStack Router";
      const route =
        m[1]
          .replace(/\/_[\w-]+/g, "")
          .replace(/\$(\w+)/g, ":$1")
          .replace(/\/$/, "") || "/";
      if (/^\/?__root/.test(m[1]) || /^\/_[\w-]+$/.test(m[1])) continue; // root and pathless layout routes
      add(route, file);
    }
  }
  // React Router / Vue Router route tables
  if (!pages.length) {
    for (const [file, raw] of src.files) {
      const text = maskComments(file, raw);
      if (isTestPath(file) || !/react-router|vue-router|createBrowserRouter|<Route\b/.test(text)) continue;
      for (const m of text.matchAll(/path[=:]\s*\{?\s*["'`]([^"'`]*)["'`]/g)) {
        const route = m[1].startsWith("/") ? m[1] : "/" + m[1];
        framework ||= /vue-router/.test(text) ? "Vue Router" : "React Router";
        if (!pages.some((p) => p.route === route)) {
          const page = pageFromFile(route, file, "");
          // pick up the component named on the same route, if its file was read
          const comp = text.slice(m.index, m.index + 200).match(/(?:element=\{<|component:\s*)(\w+)/)?.[1];
          const compFile =
            comp && [...src.files.keys()].find((f) => new RegExp(`(^|/)${comp}\\.(tsx|jsx|vue)$`).test(f));
          pages.push(
            compFile ? { ...pageFromFile(route, compFile, src.files.get(compFile), src), route } : { ...page, file },
          );
        }
        if (pages.length >= 12) break;
      }
    }
  }
  // Single-page apps: the root component is the page.
  if (!pages.length) {
    const root = src.paths.find((p) => /^(?:.*\/)?src\/App\.(tsx|jsx|vue|svelte)$/.test(p) && src.files.has(p));
    if (root) {
      framework = /\.vue$/.test(root) ? "Vue" : /\.svelte$/.test(root) ? "Svelte" : "React";
      add("/", root);
    }
  }
  // HTML sites. Pages that are built by their own <script> at runtime get their text from that script.
  let staticSite = false;
  if (!pages.length) {
    const htmlFiles = src.paths.filter(
      (x) => /\.html?$/.test(x) && !isTestPath(x) && !/node_modules\//.test(x) && x.split("/").length <= 4 && src.files.has(x),
    );
    // The web root is the folder of the shallowest index.html (e.g. apps/web/), so routes read "/report.html", not "/apps/web/report.html".
    const index = htmlFiles
      .filter((f) => /(^|\/)index\.html?$/.test(f))
      .sort((a, b) => a.split("/").length - b.split("/").length)[0];
    const root = (index ?? htmlFiles[0] ?? "").replace(/[^/]*$/, "");
    const served = servedHtmlRoutes(src);
    let runtimePages = 0;
    for (const p of htmlFiles.filter((f) => f.startsWith(root)).slice(0, 12)) {
      const rel = p.slice(root.length);
      const route = served.get(rel) ?? served.get(rel.split("/").pop()) ?? "/" + rel.replace(/(^|\/)index\.html?$/, "");
      const html = src.files.get(p);
      // runtime-rendered = nothing to show without JS *and* a script that builds it (an empty stub is still static)
      if (hasStaticContent(html) || !/<script\b/i.test(html)) {
        add(route, p);
      } else {
        runtimePages++;
        const script = scriptText(p, root, html, src.files);
        const page = pageFromFile(route, p, html + "\n" + templateMarkup(script), src);
        const ui = scriptUi(script);
        const limit = { headings: 6, buttons: 6, links: 8, inputs: 5, paragraphs: 3 };
        for (const k of Object.keys(limit)) page[k] = [...new Set([...page[k], ...ui[k]])].slice(0, limit[k]);
        pages.push(page);
      }
    }
    if (pages.length) {
      // the preview shows the repo's own files, so only call it static when most pages render without JS
      staticSite = pages.length - runtimePages >= runtimePages;
      framework ||= staticSite ? "Static HTML" : "HTML + JavaScript";
    }
  }
  if (!pages.length) return null;

  // Layout-level nav and title
  const layout = [...src.files.entries()].find(([f]) =>
    /(^|\/)(src\/)?app\/layout\.(tsx|jsx|js)$|(^|\/)pages\/_app\.(tsx|jsx)$|(^|\/)index\.html$|(^|\/)App\.(tsx|jsx|vue)$/.test(
      f,
    ),
  );
  const siteTitle =
    (layout &&
      (layout[1].match(/\btitle:\s*["'`]([^"'`$]{2,80})["'`]/)?.[1] ??
        layout[1].match(/<title>([^<{]+)<\/title>/i)?.[1]?.trim())) ||
    pages.find((p) => p.title)?.title ||
    null;
  if (layout) {
    const navLinks = allText(withImports(layout[0], layout[1], src.files), tagRe("a|Link|NavLink"), 8);
    for (const p of pages) if (!p.links.length) p.links = navLinks;
  }
  pages.sort((a, b) =>
    a.route === "/"
      ? -1
      : b.route === "/"
        ? 1
        : a.route.split("/").length - b.route.split("/").length || a.route.localeCompare(b.route),
  );
  return {
    framework,
    siteTitle,
    pages: pages.slice(0, 12),
    theme: detectTheme(src),
    staticSite,
  };
}

// --- API endpoints ---------------------------------------------------------

const METHOD_PATTERNS = [
  {
    // Express, Hono, Fastify, Koa-router, Elysia
    re: /\b(?:app|router|server|api|route|routes|r|v1|admin|fastify|instance)\.(get|post|put|patch|delete|all)\(\s*["'`](\/[^"'`]*)["'`]/g,
    framework: "Node.js HTTP",
    method: (m) => m[1].toUpperCase(),
    path: (m) => m[2],
  },
  {
    re: /@\w+\.(get|post|put|patch|delete)\(\s*["'](\/[^"']*)["']/g,
    framework: "FastAPI",
    method: (m) => m[1].toUpperCase(),
    path: (m) => m[2],
  },
  {
    re: /@\w+\.route\(\s*["'](\/[^"']*)["'](?:[^)]*?methods\s*=\s*\[([^\]]+)\])?/g,
    framework: "Flask",
    method: (m) =>
      m[2]
        ? m[2]
            .replace(/["'\s]/g, "")
            .split(",")[0]
            .toUpperCase()
        : "GET",
    path: (m) => m[1],
  },
  {
    re: /@(Get|Post|Put|Patch|Delete|Request)Mapping\(\s*(?:value\s*=\s*|path\s*=\s*)?["']([^"']*)["']/g,
    framework: "Spring",
    method: (m) => (m[1] === "Request" ? "GET" : m[1].toUpperCase()),
    path: (m) => m[2] || "/",
  },
  {
    re: /@(Get|Post|Put|Patch|Delete)\(\s*["']([^"']*)["']\s*\)/g,
    framework: "NestJS",
    method: (m) => m[1].toUpperCase(),
    path: (m) => "/" + m[2].replace(/^\//, ""),
  },
  {
    re: /\.(GET|POST|PUT|PATCH|DELETE)\(\s*"(\/[^"]*)"/g,
    framework: "Go HTTP",
    method: (m) => m[1],
    path: (m) => m[2],
  },
  {
    re: /\b(?:Get|Post|Put|Patch|Delete)\(\s*"(\/[^"]*)"/g,
    framework: "Go (chi/fiber)",
    method: (m) => m[0].match(/^\w+/)[0].toUpperCase(),
    path: (m) => m[1],
  },
  {
    re: /HandleFunc\(\s*"(?:(GET|POST|PUT|PATCH|DELETE)\s+)?(\/[^"]*)"/g,
    framework: "Go net/http",
    method: (m) => m[1] ?? "GET",
    path: (m) => m[2],
  },
  {
    re: /\.route\(\s*"(\/[^"]*)"\s*,\s*(get|post|put|patch|delete)/g,
    framework: "Axum",
    method: (m) => m[2].toUpperCase(),
    path: (m) => m[1],
  },
  {
    re: /#\[(get|post|put|patch|delete)\(\s*"(\/[^"]*)"/g,
    framework: "Actix / Rocket",
    method: (m) => m[1].toUpperCase(),
    path: (m) => m[2],
  },
];

/**
 * Blanks out comments and docstrings, keeping every newline and offset, so examples inside
 * documentation (`@app.route("/")` in a docstring) aren't mistaken for real routes.
 */
function maskComments(file, text) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  if (/\.py$/.test(file)) return text.replace(/("""|\'\'\')[\s\S]*?\1/g, blank).replace(/(^|\s)#[^\n]*/g, blank);
  if (/\.(ts|tsx|js|jsx|mjs|cjs|go|rs|java|kt|php|cs)$/.test(file))
    return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, blank);
  if (/\.rb$/.test(file)) return text.replace(/(^|\s)#[^\n]*/g, blank);
  return text;
}

/** From `start`, returns the balanced {...} / [...] / (...) expression, or null. */
function balanced(text, start, max = 700) {
  const open = text[start];
  const close = open === "{" ? "}" : open === "[" ? "]" : open === "(" ? ")" : null;
  if (!close) return null;
  let depth = 0;
  let quote = null;
  for (let i = start; i < Math.min(text.length, start + max); i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{" || ch === "[" || ch === "(") depth++;
    else if (ch === "}" || ch === "]" || ch === ")") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function dedent(s) {
  const lines = s.split("\n");
  const indents = lines
    .slice(1)
    .filter((l) => l.trim())
    .map((l) => l.match(/^\s*/)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return [lines[0], ...lines.slice(1).map((l) => l.slice(Math.max(0, min - 2)))].join("\n");
}

function responseNear(text, from) {
  const window = text.slice(from, from + 2400);
  const next = window
    .slice(1)
    .search(/\n\s*(?:@\w+\.(?:get|post|put|patch|delete|route)|\b(?:app|router|r)\.(?:get|post|put|patch|delete)\()/);
  const scope = next > 0 ? window.slice(0, next + 1) : window;
  const m = scope.match(
    /(?:\b(?:res|reply|c|ctx|response|w)\.(?:status\(\d+\)\.)?(?:json|send)\s*\(\s*|return\s+(?:jsonify\(\s*|JSONResponse\(\s*(?:content\s*=\s*)?|c\.json\(\s*|Response\.json\(\s*|NextResponse\.json\(\s*)?|ctx\.body\s*=\s*)([{[])/,
  );
  if (!m) return null;
  const idx = from + scope.indexOf(m[0]) + m[0].length - 1;
  const expr = balanced(text, idx);
  if (!expr || expr.length < 3) return null;
  return dedent(expr);
}

function bodyFieldsNear(text, from) {
  const scope = text.slice(from, from + 1600);
  const fields = new Set();
  for (const m of scope.matchAll(/(?:req|request|ctx\.request)\.body\.(\w+)/g)) fields.add(m[1]);
  for (const m of scope.matchAll(
    /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*(?:await\s+)?(?:req\.body|request\.body|c\.req\.json\(\)|request\.json\(\)|await\s+req\.json\(\)|body)/g,
  )) {
    for (const f of m[1].split(",")) {
      const name = f.split(/[:=]/)[0].trim();
      if (/^\w+$/.test(name)) fields.add(name);
    }
  }
  for (const m of scope.matchAll(/\bbody\.(\w+)/g)) if (!["length", "json", "text"].includes(m[1])) fields.add(m[1]);
  for (const m of scope.matchAll(/request\.(?:json|form|get_json\(\))(?:\.get\(\s*|\[\s*)["'](\w+)["']/g))
    fields.add(m[1]);
  return [...fields].slice(0, 8);
}

function detectPort(src, only) {
  const candidates = [
    /\bPORT\s*(?:\?\?|\|\|)\s*(\d{2,5})/,
    /\bport\s*[:=]\s*(?:Number\([^)]*\)\s*(?:\?\?|\|\|)\s*)?(\d{4,5})\b/,
    /\.listen\(\s*(\d{2,5})/,
    /--port[= ](\d{2,5})/,
    /\bEXPOSE\s+(\d{2,5})/,
    /uvicorn\.run\([^)]*port\s*=\s*(\d{2,5})/,
    /\bapp\.run\([^)]*port\s*=\s*(\d{2,5})/,
    /":(\d{4,5})"/,
  ];
  for (const re of candidates) {
    for (const [f, t] of src.files) {
      if (isTestPath(f) || (only && !only.test(f))) continue;
      const m = t.match(re);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

function detectApi(src, port, defaultPort) {
  const endpoints = [];
  const frameworks = new Map();
  const seen = new Set();
  const base = `http://localhost:${port ?? defaultPort}`;

  const push = (method, path, file, text, index, framework) => {
    if (/^\/(?:\*|static|assets|favicon)/.test(path) && path.length < 3) return;
    // Python routers declare their prefix once per file: APIRouter(prefix="/items"), Blueprint(url_prefix="/x")
    const prefix = /\.py$/.test(file)
      ? text.match(/(?:APIRouter|Blueprint)\([^)]*?(?:url_)?prefix\s*=\s*["']([^"']+)["']/)?.[1]
      : undefined;
    if (prefix && !path.startsWith(prefix)) path = prefix.replace(/\/$/, "") + (path === "/" ? "" : path) || "/";
    const key = `${method} ${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    frameworks.set(framework, (frameworks.get(framework) ?? 0) + 1);
    const filled = path
      .replace(/:(\w+)/g, (_, n) => (/id$/i.test(n) ? "1" : n))
      .replace(/\{(\w+)(?::[^}]+)?\}/g, (_, n) => (/id$/i.test(n) ? "1" : n))
      .replace(/<(?:\w+:)?(\w+)>/g, (_, n) => (/id$/i.test(n) ? "1" : n))
      .replace(/\[(\w+)\]/g, "1");
    const bodyFields = ["POST", "PUT", "PATCH"].includes(method) ? bodyFieldsNear(text, index) : [];
    const body = bodyFields.length
      ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(Object.fromEntries(bodyFields.map((f) => [f, "…"])))}'`
      : "";
    endpoints.push({
      method,
      path,
      file,
      line: lineAt(text, index),
      framework,
      request: `curl${method === "GET" ? "" : ` -X ${method}`} ${base}${filled}${body}`,
      bodyFields,
      responseFromCode: responseNear(text, index),
      exampleResponse: null,
    });
  };

  for (const [file, raw] of src.files) {
    if (isTestPath(file) || !/\.(ts|js|mjs|cjs|py|go|java|kt|rs|rb|php)$/.test(file)) continue;
    const text = maskComments(file, raw);
    // Next.js route handlers: the folder path is the URL.
    const next = file.match(/^(?:.*\/)?(?:src\/)?app\/(.*?)\/?route\.(ts|js)$/);
    if (next) {
      for (const m of text.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
        push(
          m[1],
          routeFromFs(next[1], false).replace(/\/$/, "") || "/",
          file,
          text,
          m.index,
          "Next.js route handlers",
        );
      }
      continue;
    }
    const pagesApi = file.match(/^(?:.*\/)?(?:src\/)?pages\/(api\/.+)\.(ts|js)$/);
    if (pagesApi) {
      const methods = [...text.matchAll(/req\.method\s*===?\s*["'](\w+)["']/g)].map((m) => m[1]);
      for (const method of methods.length ? [...new Set(methods)] : ["GET"])
        push(method, routeFromFs(pagesApi[1]), file, text, 0, "Next.js API routes");
      continue;
    }
    if (/(^|\/)urls\.py$/.test(file)) {
      for (const m of text.matchAll(/\b(?:re_)?path\(\s*r?["']([^"']*)["']/g))
        push("GET", "/" + m[1].replace(/^\^|\$$/g, ""), file, text, m.index, "Django");
      continue;
    }
    if (/(^|\/)routes\.rb$/.test(file)) {
      for (const m of text.matchAll(/^\s*(get|post|put|patch|delete)\s+["']([^"']+)["']/gm))
        push(m[1].toUpperCase(), m[2].startsWith("/") ? m[2] : "/" + m[2], file, text, m.index, "Rails");
      for (const m of text.matchAll(/^\s*resources?\s+:(\w+)/gm)) {
        push("GET", `/${m[1]}`, file, text, m.index, "Rails");
        push("POST", `/${m[1]}`, file, text, m.index, "Rails");
        push("GET", `/${m[1]}/:id`, file, text, m.index, "Rails");
      }
      continue;
    }
    for (const pat of METHOD_PATTERNS) {
      if (pat.framework === "FastAPI" && !/\.py$/.test(file)) continue;
      if (pat.framework === "Flask" && !/\.py$/.test(file)) continue;
      if (pat.framework.startsWith("Go") && !/\.go$/.test(file)) continue;
      if (pat.framework === "Spring" && !/\.(java|kt)$/.test(file)) continue;
      if ((pat.framework === "Axum" || pat.framework.startsWith("Actix")) && !/\.rs$/.test(file)) continue;
      if (pat.framework === "Node.js HTTP" && !/\.(ts|js|mjs|cjs)$/.test(file)) continue;
      if (pat.framework === "NestJS" && !/@Controller/.test(text)) continue;
      pat.re.lastIndex = 0;
      for (const m of text.matchAll(pat.re)) {
        let fw = pat.framework;
        if (fw === "Node.js HTTP") {
          fw = src.deps.has("hono")
            ? "Hono"
            : src.deps.has("fastify")
              ? "Fastify"
              : src.deps.has("koa")
                ? "Koa"
                : src.deps.has("elysia")
                  ? "Elysia"
                  : src.deps.has("express")
                    ? "Express"
                    : "Node.js HTTP";
        }
        if (fw === "FastAPI" && !src.deps.has("fastapi") && /flask/i.test(text)) fw = "Flask";
        const prefix = fw === "NestJS" ? (text.match(/@Controller\(\s*["']([^"']*)["']/)?.[1] ?? "") : "";
        const path = (prefix ? "/" + prefix.replace(/^\//, "") : "") + pat.path(m);
        push(pat.method(m), path.replace(/\/\/+/g, "/") || "/", file, text, m.index, fw);
      }
    }
  }
  if (!endpoints.length) return null;
  endpoints.sort((a, b) => a.path.localeCompare(b.path) || methodRank(a.method) - methodRank(b.method));
  const framework = [...frameworks.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return { framework, baseUrl: base, endpoints: endpoints.slice(0, 40) };
}

const methodRank = (m) => ["GET", "POST", "PUT", "PATCH", "DELETE"].indexOf(m);

// --- CLI -------------------------------------------------------------------

function detectCli(src) {
  let binName = null;
  let version = null;
  for (const { json } of src.packageJsons) {
    if (json?.bin) {
      binName =
        typeof json.bin === "string"
          ? String(json.name ?? src.repoName).replace(/^@[^/]+\//, "")
          : Object.keys(json.bin)[0];
      version = json.version ?? null;
      break;
    }
  }
  for (const [f, t] of src.files) {
    if (binName) break;
    if (/(^|\/)pyproject\.toml$/.test(f)) {
      const sec = t.match(/\[(?:project\.scripts|tool\.poetry\.scripts)\]\s*\n\s*["']?([\w.-]+)["']?\s*=/);
      if (sec) binName = sec[1];
      version = t.match(/^version\s*=\s*["']([^"']+)/m)?.[1] ?? null;
    } else if (/(^|\/)setup\.(py|cfg)$/.test(f)) {
      const m = t.match(/console_scripts["']?\s*[:=]\s*\[?\s*["']?\s*([\w.-]+)\s*=/);
      if (m) binName = m[1];
    }
  }
  const goCmd = src.paths.find((p) => /^cmd\/[^/]+\/main\.go$/.test(p));
  if (!binName && goCmd) binName = goCmd.split("/")[1];

  const commands = [];
  const options = [];
  let framework = "";
  let helpText = null;
  const addCmd = (usage, description, file, text, index) => {
    if (commands.some((c) => c.usage === usage) || commands.length >= 24) return;
    commands.push({ usage, description, file, line: lineAt(text, index) });
  };
  const addOpt = (flag, description) => {
    if (options.some((o) => o.flag === flag) || options.length >= 24) return;
    options.push({ flag, description });
  };

  for (const [file, raw] of src.files) {
    if (isTestPath(file) || /(^|\/)(scripts?|\.github|tools|hack|ci|build)\//.test(file)) continue;
    // keep meow's help template literal and Python docstrings used as command help
    const text = /\bmeow\(/.test(raw) || /\.py$/.test(file) ? raw : maskComments(file, raw);
    if (/\.(ts|js|mjs|cjs)$/.test(file)) {
      if (/\bmeow\(/.test(text)) {
        framework ||= "meow";
        const help = text.match(/meow\(\s*`([\s\S]*?)`/);
        if (help) helpText = dedent(help[1].replace(/\$\{[^}]*\}/g, "")).replace(/^\n+|\s+$/g, "");
      }
      if (/\.command\(|\.option\(/.test(text) && /commander|yargs|cac|sade|program\./.test(text)) {
        framework ||= /yargs/.test(text) ? "yargs" : /cac\(/.test(text) ? "cac" : "Commander";
        for (const m of text.matchAll(/\.command\(\s*["'`]([^"'`]+)["'`](?:\s*,\s*["'`]([^"'`]+)["'`])?/g)) {
          const desc =
            m[2] ?? text.slice(m.index, m.index + 300).match(/\.description\(\s*["'`]([^"'`]+)["'`]/)?.[1] ?? null;
          addCmd(m[1], desc, file, text, m.index);
        }
        for (const m of text.matchAll(/\.option\(\s*["'`]([^"'`]+)["'`]\s*,\s*["'`]([^"'`]+)["'`]/g))
          addOpt(m[1], m[2]);
        for (const m of text.matchAll(
          /\.option\(\s*["'](\w[\w-]*)["']\s*,\s*\{[^}]*?(?:describe|description|desc)\s*:\s*["'`]([^"'`]+)/g,
        ))
          addOpt(`--${m[1]}`, m[2]);
      }
    } else if (/\.py$/.test(file)) {
      if (/import click|from click/.test(text)) {
        framework ||= "Click";
        for (const m of text.matchAll(
          /@(\w+)\.(?:command|group)\((?:\s*["']([\w-]+)["'])?[^)]*\)\s*\n(?:\s*@[^\n]+\n)*\s*(?:async\s+)?def\s+(\w+)\([^)]*\)[^:]*:\s*(?:["']{3}([\s\S]*?)["']{3})?/g,
        )) {
          if (m[1] === "click" && !m[2]) continue; // the root command
          addCmd(m[2] ?? m[3].replace(/_/g, "-"), m[4]?.trim().split("\n")[0] ?? null, file, text, m.index);
        }
        for (const m of text.matchAll(
          /@click\.option\(\s*["'](-{1,2}[\w-]+)["'](?:\s*,\s*["'](-{1,2}[\w-]+)["'])?[^)]*?help\s*=\s*["']([^"']+)["']/g,
        ))
          addOpt([m[1], m[2]].filter(Boolean).join(", "), m[3]);
      }
      if (/import typer|from typer/.test(text)) {
        framework ||= "Typer";
        for (const m of text.matchAll(
          /@\w+\.command\((?:\s*["']([\w-]+)["'])?[^)]*\)\s*\n\s*(?:async\s+)?def\s+(\w+)\([^)]*\)[^:]*:\s*(?:["']{3}([\s\S]*?)["']{3})?/g,
        )) {
          addCmd(m[1] ?? m[2].replace(/_/g, "-"), m[3]?.trim().split("\n")[0] ?? null, file, text, m.index);
        }
      }
      if (/argparse/.test(text)) {
        framework ||= "argparse";
        for (const m of text.matchAll(/add_parser\(\s*["']([\w-]+)["'](?:[^)]*?help\s*=\s*["']([^"']+)["'])?/g))
          addCmd(m[1], m[2] ?? null, file, text, m.index);
        for (const m of text.matchAll(
          /add_argument\(\s*["']([^"']+)["'](?:\s*,\s*["'](-{1,2}[\w-]+)["'])?[^)]*?help\s*=\s*["']([^"']+)["']/g,
        ))
          addOpt([m[1], m[2]].filter(Boolean).join(", "), m[3]);
      }
    } else if (/\.go$/.test(file)) {
      if (/cobra\.Command/.test(text)) {
        framework ||= "Cobra";
        for (const m of text.matchAll(/Use:\s*"([^"]+)"[\s\S]{0,300}?Short:\s*"([^"]+)"/g))
          addCmd(m[1], m[2], file, text, m.index);
        for (const m of text.matchAll(
          /Flags\(\)\.\w+?P?\(\s*(?:&[\w.]+\s*,\s*)?"([\w-]+)"\s*,\s*(?:"(\w)"\s*,\s*)?[^,]+,\s*"([^"]+)"\)/g,
        ))
          addOpt(m[2] ? `-${m[2]}, --${m[1]}` : `--${m[1]}`, m[3]);
      }
      for (const m of text.matchAll(/\bflag\.\w+(?:Var)?\(\s*(?:&[\w.]+\s*,\s*)?"([\w-]+)"\s*,[^,]+,\s*"([^"]+)"\)/g)) {
        framework ||= "Go flag";
        addOpt(`-${m[1]}`, m[2]);
      }
    } else if (/\.rs$/.test(file) && /clap/.test(text)) {
      framework ||= "clap";
      for (const m of text.matchAll(/((?:\s*\/\/\/[^\n]*\n)*)\s*#\[arg\(([^)]*)\)\]\s*(?:pub\s+)?(\w+)\s*:/g)) {
        const doc = m[1].replace(/\s*\/\/\/\s?/g, " ").trim() || null;
        const short = /\bshort\b/.test(m[2]) ? `-${m[3][0]}, ` : "";
        addOpt(/\blong\b/.test(m[2]) ? `${short}--${m[3].replace(/_/g, "-")}` : `<${m[3].toUpperCase()}>`, doc);
      }
    }
  }

  const isCli = binName !== null || framework !== "";
  if (!isCli || (!commands.length && !options.length && !helpText && !binName)) return null;
  const bin = binName ?? src.repoName;
  if (!framework) framework = "custom";

  // Cobra/Click root commands are named after the binary: that's the usage line, not a subcommand
  const rootIdx = commands.findIndex((c) => c.usage === bin || c.usage.startsWith(`${bin} `));
  const root = rootIdx >= 0 ? commands.splice(rootIdx, 1)[0] : null;
  let help = helpText;
  if (!help) {
    const lines = [
      ...(root?.description ? [root.description, ""] : []),
      `Usage: ${root && root.usage !== bin ? root.usage : bin}${commands.length ? ` <command>` : ""} [options]`,
    ];
    if (commands.length) {
      lines.push("", "Commands:");
      const w = Math.min(28, Math.max(...commands.map((c) => c.usage.length)) + 2);
      for (const c of commands) lines.push(`  ${c.usage.padEnd(w)}${c.description ?? ""}`);
    }
    const opts = [...options, { flag: "-h, --help", description: "Show help" }];
    if (version) opts.push({ flag: "-v, --version", description: "Show version number" });
    lines.push("", "Options:");
    const w = Math.min(30, Math.max(...opts.map((o) => o.flag.length)) + 2);
    for (const o of opts) lines.push(`  ${o.flag.padEnd(w)}${o.description ?? ""}`);
    help = lines.join("\n");
  }
  const session = [{ command: `${bin} --help`, output: help }];
  if (version) session.push({ command: `${bin} --version`, output: version });
  return { binName: bin, framework, commands, options, session };
}

// --- Library ---------------------------------------------------------------

function readmeUsage(readme, pkgName) {
  if (!readme) return null;
  let lastHeading = "README";
  for (const b of readme.matchAll(/^#{1,4}\s+(.+)$|```(\w*)\n([\s\S]*?)```/gm)) {
    if (b[1]) {
      lastHeading = b[1].replace(/[`*_]/g, "").trim();
      continue;
    }
    const lang = b[2];
    const code = b[3];
    if (/^(sh|bash|shell|console|text|zsh)$/.test(lang)) continue;
    const short = pkgName.split("/").pop().toLowerCase();
    const mentions = code.toLowerCase().includes(short) || code.toLowerCase().includes(short.replace(/-/g, ""));
    if (mentions && /\b(import|require|from|use)\b|\w\(/.test(code)) {
      if (code.split("\n").length <= 40) return { code: code.trimEnd(), heading: lastHeading };
    }
  }
  return null;
}

function detectLibrary(src, kinds) {
  const root = src.packageJsons.find((p) => p.path === "package.json")?.json;
  let install = null;
  let name = src.repoName;
  const exports = [];
  const collect = (text, re) => {
    for (const m of text.matchAll(re)) {
      for (const n of m.slice(1).filter(Boolean).join(",").split(",")) {
        const clean = n
          .trim()
          .split(/\s+as\s+/)
          .pop()
          .trim();
        if (/^[A-Za-z_$][\w$]*$/.test(clean) && !exports.includes(clean) && exports.length < 24) exports.push(clean);
      }
    }
  };
  // published packages: an explicit entry field, or Node's default index.js with a files list
  const publishable =
    root &&
    !root.private &&
    root.name &&
    (root.main ||
      root.exports ||
      root.module ||
      root.types ||
      (src.paths.includes("index.js") && (root.files || root.version)));
  if (publishable && !kinds.has("web")) {
    name = root.name ?? name;
    install = `npm install ${name}`;
    const entry = [...src.files.keys()].find(
      (f) => /^(src|source|lib)?\/?index\.(ts|js|mjs)$/.test(f) || f === "index.ts" || f === "index.js",
    );
    const entryText = entry ? src.files.get(entry) : "";
    if (/export\s+default\b|module\.exports\s*=/.test(entryText)) exports.push("default");
    for (const m of entryText.matchAll(/(?:module\.)?exports\.(\w+)\s*=/g))
      if (!exports.includes(m[1])) exports.push(m[1]);
    // index.js that just re-exports lib/x.js: look one file deeper
    const re = entryText.match(/module\.exports\s*=\s*require\(\s*["']\.\/([^"']+)["']\s*\)/);
    const inner = re ? src.files.get(re[1].endsWith(".js") ? re[1] : `${re[1]}.js`) : undefined;
    if (inner)
      for (const m of inner.matchAll(/(?:module\.)?exports\.(\w+)\s*=/g))
        if (!exports.includes(m[1]) && exports.length < 24) exports.push(m[1]);
    if (entry)
      collect(
        entryText,
        /export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)|export\s*\{([^}]+)\}/g,
      );
  }
  const py = [...src.files.entries()].find(
    ([f]) => /(^|\/)pyproject\.toml$|(^|\/)setup\.py$/.test(f) && f.split("/").length === 1,
  );
  if (!install && py) {
    name = py[1].match(/^name\s*=\s*["']([^"']+)/m)?.[1] ?? py[1].match(/name\s*=\s*["']([^"']+)["']/)?.[1] ?? name;
    install = `pip install ${name}`;
    const init = [...src.files.entries()].find(([f]) => /^(src\/)?[\w-]+\/__init__\.py$/.test(f));
    if (init) {
      const all = init[1].match(/__all__\s*=\s*[[(]([\s\S]*?)[\])]/);
      if (all) collect(all[1].replace(/["']/g, ""), /([\w,\s]+)/g);
      else collect(init[1], /^(?:from\s+[.\w]+\s+import\s+([\w, ]+)|def\s+([a-zA-Z]\w*)|class\s+([A-Za-z]\w*))/gm);
    }
  }
  const cargo = src.files.get("Cargo.toml");
  if (!install && cargo && src.paths.includes("src/lib.rs")) {
    name = cargo.match(/^name\s*=\s*"([^"]+)"/m)?.[1] ?? name;
    install = `cargo add ${name}`;
    const lib = src.files.get("src/lib.rs");
    if (lib) collect(lib, /pub\s+(?:fn|struct|enum|trait|mod)\s+(\w+)/g);
  }
  const gomod = src.files.get("go.mod");
  if (!install && gomod && !src.paths.some((p) => /(^|\/)main\.go$/.test(p))) {
    name = gomod.match(/^module\s+(\S+)/m)?.[1] ?? name;
    install = `go get ${name}`;
    for (const [f, t] of src.files)
      if (/^[^/]+\.go$/.test(f) && !/_test\.go$/.test(f)) collect(t, /^func\s+([A-Z]\w*)/gm);
  }
  if (!install) return null;
  const usage = readmeUsage(src.readme, name);
  return { install, usage: usage?.code ?? null, usageSource: usage ? `README → ${usage.heading}` : null, exports };
}

// --- Kinds -----------------------------------------------------------------

export function detectKinds(src, found) {
  const k = [];
  const d = src.deps;
  const has = (re) => src.paths.some((p) => re.test(p));
  if (d.has("react-native") || d.has("expo") || d.has("flutter") || has(/^android\/app\/|^ios\/.*\.xcodeproj/))
    k.push("mobile");
  if (d.has("electron") || d.has("@tauri-apps/api") || d.has("tauri")) k.push("desktop");
  if (found.web) k.push("web");
  if (found.api) k.push("api");
  // a package that is both (Flask, pytest) is primarily a library with a command attached
  if (found.library) k.push("library");
  if (found.cli) k.push("cli");
  const notebooks = src.paths.filter((p) => p.endsWith(".ipynb")).length;
  if (notebooks >= 2 || (notebooks && (d.has("pandas") || d.has("torch")))) k.push("data");
  if (!k.length && has(/\.tf$|^(k8s|helm|charts)\//)) k.push("infra");
  if (!k.length && src.paths.filter((p) => /\.(md|mdx|rst)$/.test(p)).length > src.paths.length * 0.6) k.push("docs");
  if (!k.length) k.push("other");
  return k;
}

export function buildMock(src) {
  const web = detectWeb(src);
  const port = detectPort(src);
  const defaultPort =
    src.deps.has("next") || src.deps.has("express")
      ? 3000
      : src.deps.has("vite")
        ? 5173
        : src.deps.has("fastapi") || src.deps.has("django")
          ? 8000
          : src.deps.has("flask")
            ? 5000
            : 8080;
  const pyApi = src.deps.has("fastapi") || src.deps.has("flask") || src.deps.has("django");
  const api = pyApi
    ? detectApi(src, detectPort(src, /\.py$/), src.deps.has("flask") && !src.deps.has("fastapi") ? 5000 : 8000)
    : detectApi(src, port, defaultPort);
  // Where the pages are served, for the preview's address bar (the same server when it serves its own HTML).
  if (web) web.baseUrl = `localhost:${port ?? defaultPort}`;
  const cli = detectCli(src);
  const pre = new Set(web ? ["web"] : []);
  // An app with its own API isn't also a library; a CLI package can be both (e.g. Flask).
  const library = api ? null : detectLibrary(src, pre);
  const kinds = detectKinds(src, { web: !!web, api: !!api, cli: !!cli, library: !!library });
  return { kinds, web, api, cli, library };
}

export { detectPort };
