// Folder layout, what each top-level folder is for, key files and entry points.
import type { TreeNode } from "@ara/shared";

const FOLDER_PURPOSE: Record<string, string> = {
  src: "Main source code",
  source: "Main source code",
  lib: "Library code shared across the project",
  app: "Application code (in Next.js, the App Router pages and layouts)",
  apps: "Separate applications in this monorepo",
  packages: "Shared packages in this monorepo",
  pages: "Page components, one per route",
  components: "Reusable UI components",
  ui: "UI building blocks",
  hooks: "React hooks",
  utils: "Small helper functions",
  helpers: "Small helper functions",
  services: "Service layer that talks to APIs or databases",
  api: "API routes or client code for an API",
  server: "Server-side code",
  backend: "Backend service",
  frontend: "Frontend app",
  client: "Client-side code",
  web: "Web frontend",
  public: "Static files served as-is (images, icons, fonts)",
  static: "Static files served as-is",
  assets: "Images, fonts and other media",
  styles: "Stylesheets",
  css: "Stylesheets",
  test: "Automated tests",
  tests: "Automated tests",
  __tests__: "Automated tests",
  spec: "Automated tests",
  e2e: "End-to-end tests",
  docs: "Documentation",
  doc: "Documentation",
  examples: "Example usage",
  example: "Example usage",
  scripts: "Helper scripts for building, releasing or maintenance",
  bin: "Executable entry scripts",
  cmd: "Command entry points (Go convention: one folder per binary)",
  pkg: "Go packages meant for reuse",
  internal: "Internal code not meant to be imported by others",
  config: "Configuration",
  configs: "Configuration",
  ".github": "GitHub settings: CI workflows, issue templates",
  ".vscode": "Editor settings",
  models: "Data models",
  routes: "Route definitions",
  controllers: "Request handlers",
  middleware: "Request middleware",
  migrations: "Database migrations",
  prisma: "Prisma schema and migrations",
  db: "Database code",
  database: "Database code",
  store: "State management",
  types: "Type definitions",
  i18n: "Translations",
  locales: "Translations",
  templates: "Templates",
  views: "View templates",
  include: "C/C++ headers",
  firmware: "Device firmware",
  android: "Android app project",
  ios: "iOS app project",
  notebooks: "Jupyter notebooks",
  data: "Data files",
  deploy: "Deployment configuration",
  infra: "Infrastructure configuration",
  k8s: "Kubernetes manifests",
  docker: "Docker configuration",
  benchmark: "Performance benchmarks",
  benchmarks: "Performance benchmarks",
  fixtures: "Test fixtures",
  vendor: "Third-party code copied into the repo",
};

const KEY_FILES: [RegExp, string][] = [
  [/^readme(\.\w+)?$/i, "Project introduction"],
  [/^license(\.\w+)?$|^licence(\.\w+)?$/i, "License"],
  [/^contributing(\.\w+)?$/i, "How to contribute"],
  [/^changelog(\.\w+)?$|^history\.md$/i, "Change history"],
  [/^package\.json$/, "Node.js manifest: dependencies and scripts"],
  [/^pnpm-workspace\.yaml$/, "pnpm monorepo workspace list"],
  [/^turbo\.json$/, "Turborepo task pipeline"],
  [/^tsconfig\.json$/, "TypeScript settings"],
  [/^requirements\.txt$/, "Python dependencies"],
  [/^pyproject\.toml$/, "Python project manifest"],
  [/^setup\.py$/, "Python package setup"],
  [/^go\.mod$/, "Go module definition"],
  [/^Cargo\.toml$/, "Rust crate manifest"],
  [/^Gemfile$/, "Ruby dependencies"],
  [/^composer\.json$/, "PHP dependencies"],
  [/^pom\.xml$/, "Maven build file"],
  [/^build\.gradle(\.kts)?$/, "Gradle build file"],
  [/^pubspec\.yaml$/, "Flutter/Dart manifest"],
  [/^Dockerfile$/, "Container image recipe"],
  [/^(docker-)?compose\.ya?ml$/, "Runs several services together"],
  [/^Makefile$/, "Shortcut commands (make ...)"],
  [/^\.env\.(example|sample|template)$|^\.env\.local\.example$/, "Environment variables to set"],
  [/^next\.config\.\w+$/, "Next.js settings"],
  [/^vite\.config\.\w+$/, "Vite build settings"],
  [/^tailwind\.config\.\w+$/, "Tailwind theme"],
  [/^vercel\.json$/, "Vercel deploy settings"],
  [/^netlify\.toml$/, "Netlify deploy settings"],
  [/^Procfile$/, "Process list for Heroku-style hosts"],
  [/^manage\.py$/, "Django command runner"],
  [/^index\.html$/, "Web page entry"],
];

const ENTRY_CANDIDATES: [RegExp, string][] = [
  [/^(src\/)?main\.(ts|tsx|js|jsx|mjs)$/, "Starts the app"],
  [/^(src\/)?index\.(ts|tsx|js|jsx|mjs)$/, "Package or app entry"],
  [/^(src\/)?(server|app)\.(ts|js|mjs)$/, "Starts the server"],
  [/^(src\/)?app\/(page|layout)\.(tsx|jsx|js)$/, "Next.js home page and root layout"],
  [/^(src\/)?pages\/(index|_app)\.(tsx|jsx|js)$/, "Next.js home page"],
  [/^(src\/)?App\.(tsx|jsx|vue|svelte)$/, "Root UI component"],
  [/^src\/routes\/\+page\.svelte$/, "SvelteKit home page"],
  [/^main\.go$/, "Go program entry"],
  [/^cmd\/[^/]+\/main\.go$/, "Go binary entry"],
  [/^(src\/)?main\.rs$/, "Rust binary entry"],
  [/^src\/lib\.rs$/, "Rust library root"],
  [/^(src\/|app\/)?(main|app|run|server|bot|cli|wsgi|asgi)\.py$/, "Python entry script"],
  [/^manage\.py$/, "Django entry"],
  [/^[\w-]+\/__main__\.py$|^src\/[\w-]+\/__main__\.py$/, "Runs with python -m"],
  [/^[\w-]+\/__init__\.py$|^src\/[\w-]+\/__init__\.py$/, "Python package root"],
  [/^index\.html$/, "Web page entry"],
  [/^Program\.cs$/, ".NET entry"],
  [/^src\/main\/java\/.+\/\w*Application\.java$/, "Spring Boot entry"],
  [/^lib\/main\.dart$/, "Flutter app entry"],
  [/^(src\/)?main\.(c|cpp|ino)$|\.ino$/, "Firmware / C entry"],
];

function extOf(p: string) {
  const m = p.match(/\.([A-Za-z0-9]+)$/);
  return m ? m[1].toLowerCase() : "";
}

export function buildTree(paths: string[], maxChildren = 60, maxDepth = 6): { tree: TreeNode; dirs: number } {
  type Mut = { name: string; path: string; dirs: Map<string, Mut>; files: string[]; count: number };
  const root: Mut = { name: "", path: "", dirs: new Map(), files: [], count: 0 };
  let dirs = 0;
  for (const p of paths) {
    const parts = p.split("/");
    let node = root;
    node.count++;
    for (let i = 0; i < parts.length - 1; i++) {
      let next = node.dirs.get(parts[i]);
      if (!next) {
        next = { name: parts[i], path: parts.slice(0, i + 1).join("/"), dirs: new Map(), files: [], count: 0 };
        node.dirs.set(parts[i], next);
        dirs++;
      }
      next.count++;
      node = next;
    }
    node.files.push(parts[parts.length - 1]);
  }
  // Keeps the payload bounded on huge repos; folders past the budget show only their file count.
  let budget = 3000;
  const toNode = (m: Mut, depth: number): TreeNode => {
    const sortedDirs = [...m.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
    const sortedFiles = m.files.sort((a, b) => a.localeCompare(b));
    const total = sortedDirs.length + sortedFiles.length;
    const kids: TreeNode[] = [];
    if (depth < maxDepth && budget > 0) {
      const room = Math.min(maxChildren, total, budget);
      budget -= room;
      for (const d of sortedDirs.slice(0, room)) kids.push(toNode(d, depth + 1));
      for (const f of sortedFiles.slice(0, room - kids.length)) kids.push({ name: f, path: m.path ? `${m.path}/${f}` : f, type: "file" });
    }
    return { name: m.name, path: m.path, type: "dir", files: m.count, children: kids, more: total - kids.length || undefined };
  };
  return { tree: toNode(root, 0), dirs };
}

const EXT_LABEL: Record<string, string> = {
  ts: "TypeScript", tsx: "React (TSX)", js: "JavaScript", jsx: "React (JSX)", mjs: "JavaScript", py: "Python",
  go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", rb: "Ruby", php: "PHP", cs: "C#", c: "C", h: "C headers",
  cpp: "C++", hpp: "C++ headers", swift: "Swift", dart: "Dart", vue: "Vue", svelte: "Svelte", md: "Markdown",
  mdx: "MDX", json: "JSON", yml: "YAML", yaml: "YAML", css: "CSS", scss: "SCSS", html: "HTML", png: "PNG images",
  jpg: "JPEG images", svg: "SVG", sh: "shell scripts", sql: "SQL", ipynb: "notebooks", ino: "Arduino",
};

function folderPurpose(name: string, files: string[]): string {
  const known = FOLDER_PURPOSE[name] ?? FOLDER_PURPOSE[name.toLowerCase()];
  if (known) return known;
  const counts = new Map<string, number>();
  for (const f of files) {
    const e = extOf(f);
    if (e) counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return "Project files";
  return `Mostly ${EXT_LABEL[top[0]] ?? `.${top[0]}`} files`;
}

export function describeStructure(paths: string[], pkgMain: { path: string; field: string; value: string }[]) {
  const { tree, dirs } = buildTree(paths);
  const byTop = new Map<string, string[]>();
  let rootFiles = 0;
  for (const p of paths) {
    const i = p.indexOf("/");
    if (i === -1) {
      rootFiles++;
      continue;
    }
    const top = p.slice(0, i);
    if (!byTop.has(top)) byTop.set(top, []);
    byTop.get(top)!.push(p);
  }
  const total = Math.max(paths.length, 1);
  const folders = [...byTop.entries()]
    .map(([top, files]) => ({ path: top, purpose: folderPurpose(top, files), files: files.length, share: files.length / total }))
    .sort((a, b) => b.files - a.files);

  // For monorepos, also describe apps/* and packages/* one level down.
  for (const mono of ["apps", "packages", "services", "libs"]) {
    const kids = new Map<string, string[]>();
    for (const p of byTop.get(mono) ?? []) {
      const seg = p.split("/")[1];
      if (!seg || !p.slice(mono.length + 1).includes("/")) continue;
      if (!kids.has(seg)) kids.set(seg, []);
      kids.get(seg)!.push(p);
    }
    for (const [k, files] of kids) {
      folders.push({ path: `${mono}/${k}`, purpose: folderPurpose(k, files), files: files.length, share: files.length / total });
    }
  }
  if (rootFiles) folders.push({ path: "(root)", purpose: "Config and top-level files", files: rootFiles, share: rootFiles / total });

  const keyFiles: { path: string; role: string }[] = [];
  for (const p of paths) {
    const depth = p.split("/").length;
    const base = p.split("/").pop()!;
    if (depth === 1) {
      const hit = KEY_FILES.find(([re]) => re.test(base));
      if (hit) keyFiles.push({ path: p, role: hit[1] });
    } else if (/^\.github\/workflows\//.test(p)) {
      keyFiles.push({ path: p, role: "CI workflow" });
    } else if (depth <= 3 && /^(apps|packages)\/[^/]+\/package\.json$/.test(p)) {
      keyFiles.push({ path: p, role: "Workspace package manifest" });
    } else if (/(^|\/)schema\.prisma$/.test(p)) {
      keyFiles.push({ path: p, role: "Database schema" });
    }
  }

  const entryPoints: { path: string; why: string }[] = [];
  const seen = new Set<string>();
  const pushEntry = (p: string, why: string) => {
    if (seen.has(p) || entryPoints.length >= 10) return;
    seen.add(p);
    entryPoints.push({ path: p, why });
  };
  for (const m of pkgMain) {
    const rel = m.value.replace(/^\.\//, "");
    const full = m.path.includes("/") ? `${m.path.replace(/\/package\.json$/, "")}/${rel}` : rel;
    // Built output (dist/, distribution/, lib/) usually isn't committed; point at its source file instead.
    const stem = full.replace(/\.(c|m)?js$/, "");
    const base = stem.replace(/^(.*\/)?(dist|distribution|build|lib|out)\//, "$1");
    const src =
      paths.find((p) => p === full) ??
      paths.find((p) => ["src/", "source/", "lib/", ""].some((d) => /\.(ts|tsx|mts|js|mjs)$/.test(p) && p.replace(/\.(ts|tsx|mts|js|mjs)$/, "") === (base.includes("/") ? base.replace(/^([^/]*\/)?/, (x) => x) : d + base)));
    pushEntry(src ?? full, src && src !== full ? `source of "${m.field}" (${m.value}) in ${m.path}` : `"${m.field}" in ${m.path}`);
  }
  for (const [re, why] of ENTRY_CANDIDATES) {
    for (const p of paths) {
      const rel = p.replace(/^(apps|packages|services)\/[^/]+\//, "").replace(/^(backend|frontend|server|client|web|api)\//, "");
      if (re.test(rel) && p.split("/").length <= 5 && !/(^|\/)(tests?|__tests__|spec|examples?|docs?|scripts)\//.test(p)) pushEntry(p, why);
    }
  }

  return { tree, totalDirs: dirs, folders: folders.slice(0, 16), keyFiles: keyFiles.slice(0, 24), entryPoints };
}
