// Tech stack detection from manifests. Nothing here is guessed from file names alone:
// every item names the manifest it was read from.
import type { StackGroup, StackItem } from "@ara/shared";

type Cat =
  | "Frameworks"
  | "UI & styling"
  | "Data fetching & state"
  | "Backend & APIs"
  | "Database & ORM"
  | "Auth"
  | "AI & ML"
  | "Testing"
  | "Build & tooling"
  | "Code quality"
  | "Infrastructure & deploy"
  | "CI/CD";

const ORDER: Cat[] = [
  "Frameworks",
  "UI & styling",
  "Data fetching & state",
  "Backend & APIs",
  "Database & ORM",
  "Auth",
  "AI & ML",
  "Testing",
  "Build & tooling",
  "Code quality",
  "Infrastructure & deploy",
  "CI/CD",
];

/** [matcher, display name, category]. Matchers are exact names, or regexes for families. */
const KNOWN: [string | RegExp, string, Cat][] = [
  // JS frameworks
  ["next", "Next.js", "Frameworks"],
  ["react", "React", "Frameworks"],
  ["react-native", "React Native", "Frameworks"],
  ["expo", "Expo", "Frameworks"],
  ["vue", "Vue", "Frameworks"],
  ["nuxt", "Nuxt", "Frameworks"],
  ["svelte", "Svelte", "Frameworks"],
  ["@sveltejs/kit", "SvelteKit", "Frameworks"],
  ["@angular/core", "Angular", "Frameworks"],
  ["solid-js", "Solid", "Frameworks"],
  ["astro", "Astro", "Frameworks"],
  ["@remix-run/react", "Remix", "Frameworks"],
  ["gatsby", "Gatsby", "Frameworks"],
  ["preact", "Preact", "Frameworks"],
  ["electron", "Electron", "Frameworks"],
  ["@tauri-apps/api", "Tauri", "Frameworks"],
  ["three", "Three.js", "Frameworks"],
  // UI
  ["tailwindcss", "Tailwind CSS", "UI & styling"],
  ["styled-components", "styled-components", "UI & styling"],
  ["@emotion/react", "Emotion", "UI & styling"],
  ["sass", "Sass", "UI & styling"],
  [/^@mui\//, "Material UI", "UI & styling"],
  ["@chakra-ui/react", "Chakra UI", "UI & styling"],
  [/^@radix-ui\//, "Radix UI", "UI & styling"],
  ["antd", "Ant Design", "UI & styling"],
  ["bootstrap", "Bootstrap", "UI & styling"],
  ["framer-motion", "Framer Motion", "UI & styling"],
  ["motion", "Motion", "UI & styling"],
  ["gsap", "GSAP", "UI & styling"],
  ["lucide-react", "Lucide icons", "UI & styling"],
  [/^@heroicons\//, "Heroicons", "UI & styling"],
  ["shadcn", "shadcn/ui", "UI & styling"],
  ["class-variance-authority", "CVA", "UI & styling"],
  ["recharts", "Recharts", "UI & styling"],
  ["chart.js", "Chart.js", "UI & styling"],
  ["d3", "D3", "UI & styling"],
  ["react-markdown", "react-markdown", "UI & styling"],
  // data/state
  ["@tanstack/react-query", "TanStack Query", "Data fetching & state"],
  ["swr", "SWR", "Data fetching & state"],
  ["redux", "Redux", "Data fetching & state"],
  ["@reduxjs/toolkit", "Redux Toolkit", "Data fetching & state"],
  ["zustand", "Zustand", "Data fetching & state"],
  ["jotai", "Jotai", "Data fetching & state"],
  ["mobx", "MobX", "Data fetching & state"],
  ["pinia", "Pinia", "Data fetching & state"],
  ["axios", "Axios", "Data fetching & state"],
  ["ky", "ky", "Data fetching & state"],
  ["@apollo/client", "Apollo Client", "Data fetching & state"],
  ["graphql", "GraphQL", "Data fetching & state"],
  ["@trpc/server", "tRPC", "Backend & APIs"],
  ["zod", "Zod", "Data fetching & state"],
  ["react-hook-form", "React Hook Form", "Data fetching & state"],
  ["socket.io", "Socket.IO", "Backend & APIs"],
  ["socket.io-client", "Socket.IO client", "Data fetching & state"],
  // backend JS
  ["express", "Express", "Backend & APIs"],
  ["hono", "Hono", "Backend & APIs"],
  ["fastify", "Fastify", "Backend & APIs"],
  ["koa", "Koa", "Backend & APIs"],
  ["@nestjs/core", "NestJS", "Backend & APIs"],
  ["@hapi/hapi", "hapi", "Backend & APIs"],
  ["elysia", "Elysia", "Backend & APIs"],
  ["ws", "ws (WebSockets)", "Backend & APIs"],
  ["commander", "Commander (CLI)", "Backend & APIs"],
  ["yargs", "yargs (CLI)", "Backend & APIs"],
  ["bullmq", "BullMQ", "Backend & APIs"],
  ["@langchain/langgraph", "LangGraph", "AI & ML"],
  [/^@langchain\//, "LangChain", "AI & ML"],
  ["langchain", "LangChain", "AI & ML"],
  ["@anthropic-ai/sdk", "Anthropic SDK", "AI & ML"],
  ["openai", "OpenAI SDK", "AI & ML"],
  ["@google/generative-ai", "Gemini SDK", "AI & ML"],
  ["ai", "Vercel AI SDK", "AI & ML"],
  ["@tensorflow/tfjs", "TensorFlow.js", "AI & ML"],
  ["web-tree-sitter", "tree-sitter", "Build & tooling"],
  // db
  ["prisma", "Prisma", "Database & ORM"],
  ["@prisma/client", "Prisma", "Database & ORM"],
  ["drizzle-orm", "Drizzle ORM", "Database & ORM"],
  ["mongoose", "Mongoose (MongoDB)", "Database & ORM"],
  ["mongodb", "MongoDB driver", "Database & ORM"],
  ["pg", "PostgreSQL (pg)", "Database & ORM"],
  ["mysql2", "MySQL", "Database & ORM"],
  ["better-sqlite3", "SQLite", "Database & ORM"],
  ["sqlite3", "SQLite", "Database & ORM"],
  ["sequelize", "Sequelize", "Database & ORM"],
  ["typeorm", "TypeORM", "Database & ORM"],
  ["knex", "Knex", "Database & ORM"],
  ["redis", "Redis", "Database & ORM"],
  ["ioredis", "Redis", "Database & ORM"],
  ["@supabase/supabase-js", "Supabase", "Database & ORM"],
  ["firebase", "Firebase", "Database & ORM"],
  ["firebase-admin", "Firebase Admin", "Database & ORM"],
  // auth
  ["next-auth", "NextAuth", "Auth"],
  [/^@auth\//, "Auth.js", "Auth"],
  [/^@clerk\//, "Clerk", "Auth"],
  ["passport", "Passport", "Auth"],
  ["jsonwebtoken", "JWT", "Auth"],
  ["bcrypt", "bcrypt", "Auth"],
  ["bcryptjs", "bcrypt", "Auth"],
  ["lucia", "Lucia", "Auth"],
  // testing
  ["jest", "Jest", "Testing"],
  ["vitest", "Vitest", "Testing"],
  ["mocha", "Mocha", "Testing"],
  ["ava", "AVA", "Testing"],
  ["@playwright/test", "Playwright", "Testing"],
  ["playwright", "Playwright", "Testing"],
  ["cypress", "Cypress", "Testing"],
  [/^@testing-library\//, "Testing Library", "Testing"],
  ["supertest", "Supertest", "Testing"],
  // build
  ["typescript", "TypeScript", "Build & tooling"],
  ["vite", "Vite", "Build & tooling"],
  ["webpack", "webpack", "Build & tooling"],
  ["esbuild", "esbuild", "Build & tooling"],
  ["rollup", "Rollup", "Build & tooling"],
  ["tsup", "tsup", "Build & tooling"],
  ["turbo", "Turborepo", "Build & tooling"],
  ["nx", "Nx", "Build & tooling"],
  ["@babel/core", "Babel", "Build & tooling"],
  ["tsx", "tsx", "Build & tooling"],
  ["ts-node", "ts-node", "Build & tooling"],
  ["nodemon", "nodemon", "Build & tooling"],
  ["parcel", "Parcel", "Build & tooling"],
  // quality
  ["eslint", "ESLint", "Code quality"],
  ["prettier", "Prettier", "Code quality"],
  ["@biomejs/biome", "Biome", "Code quality"],
  ["xo", "XO", "Code quality"],
  ["husky", "Husky", "Code quality"],
  ["lint-staged", "lint-staged", "Code quality"],
  // python
  ["django", "Django", "Frameworks"],
  ["flask", "Flask", "Backend & APIs"],
  ["fastapi", "FastAPI", "Backend & APIs"],
  ["starlette", "Starlette", "Backend & APIs"],
  ["uvicorn", "Uvicorn", "Backend & APIs"],
  ["gunicorn", "Gunicorn", "Infrastructure & deploy"],
  ["djangorestframework", "Django REST framework", "Backend & APIs"],
  ["streamlit", "Streamlit", "Frameworks"],
  ["gradio", "Gradio", "Frameworks"],
  ["click", "Click (CLI)", "Backend & APIs"],
  ["typer", "Typer (CLI)", "Backend & APIs"],
  ["rich", "Rich", "UI & styling"],
  ["requests", "Requests", "Data fetching & state"],
  ["httpx", "HTTPX", "Data fetching & state"],
  ["aiohttp", "aiohttp", "Data fetching & state"],
  ["pydantic", "Pydantic", "Data fetching & state"],
  ["sqlalchemy", "SQLAlchemy", "Database & ORM"],
  ["psycopg2", "PostgreSQL (psycopg2)", "Database & ORM"],
  ["psycopg2-binary", "PostgreSQL (psycopg2)", "Database & ORM"],
  ["psycopg", "PostgreSQL (psycopg)", "Database & ORM"],
  ["pymongo", "MongoDB (PyMongo)", "Database & ORM"],
  ["alembic", "Alembic", "Database & ORM"],
  ["celery", "Celery", "Backend & APIs"],
  ["numpy", "NumPy", "AI & ML"],
  ["pandas", "pandas", "AI & ML"],
  ["scikit-learn", "scikit-learn", "AI & ML"],
  ["torch", "PyTorch", "AI & ML"],
  ["tensorflow", "TensorFlow", "AI & ML"],
  ["keras", "Keras", "AI & ML"],
  ["transformers", "Hugging Face Transformers", "AI & ML"],
  ["sentence-transformers", "Sentence Transformers", "AI & ML"],
  ["anthropic", "Anthropic SDK", "AI & ML"],
  ["matplotlib", "Matplotlib", "AI & ML"],
  ["opencv-python", "OpenCV", "AI & ML"],
  ["jupyter", "Jupyter", "AI & ML"],
  ["pytest", "pytest", "Testing"],
  ["tox", "tox", "Testing"],
  ["nox", "nox", "Testing"],
  ["black", "Black", "Code quality"],
  ["ruff", "Ruff", "Code quality"],
  ["flake8", "Flake8", "Code quality"],
  ["mypy", "mypy", "Code quality"],
  ["pre-commit", "pre-commit", "Code quality"],
  ["setuptools", "setuptools", "Build & tooling"],
  ["hatchling", "Hatch", "Build & tooling"],
  ["poetry-core", "Poetry", "Build & tooling"],
  ["flit-core", "Flit", "Build & tooling"],
  // go
  ["github.com/gin-gonic/gin", "Gin", "Backend & APIs"],
  ["github.com/labstack/echo/v4", "Echo", "Backend & APIs"],
  ["github.com/gofiber/fiber/v2", "Fiber", "Backend & APIs"],
  ["github.com/go-chi/chi/v5", "chi", "Backend & APIs"],
  ["github.com/gorilla/mux", "Gorilla mux", "Backend & APIs"],
  ["github.com/spf13/cobra", "Cobra (CLI)", "Backend & APIs"],
  ["github.com/urfave/cli/v2", "urfave/cli", "Backend & APIs"],
  ["gorm.io/gorm", "GORM", "Database & ORM"],
  ["github.com/jackc/pgx/v5", "pgx (PostgreSQL)", "Database & ORM"],
  ["github.com/stretchr/testify", "testify", "Testing"],
  ["google.golang.org/grpc", "gRPC", "Backend & APIs"],
  ["github.com/charmbracelet/bubbletea", "Bubble Tea (TUI)", "UI & styling"],
  // rust
  ["tokio", "Tokio", "Backend & APIs"],
  ["axum", "Axum", "Backend & APIs"],
  ["actix-web", "Actix Web", "Backend & APIs"],
  ["rocket", "Rocket", "Backend & APIs"],
  ["serde", "Serde", "Data fetching & state"],
  ["clap", "clap (CLI)", "Backend & APIs"],
  ["reqwest", "reqwest", "Data fetching & state"],
  ["sqlx", "SQLx", "Database & ORM"],
  ["diesel", "Diesel", "Database & ORM"],
  ["tauri", "Tauri", "Frameworks"],
  ["bevy", "Bevy", "Frameworks"],
  ["ratatui", "Ratatui (TUI)", "UI & styling"],
  // ruby / php / java
  ["rails", "Ruby on Rails", "Frameworks"],
  ["sinatra", "Sinatra", "Backend & APIs"],
  ["rspec", "RSpec", "Testing"],
  ["laravel/framework", "Laravel", "Frameworks"],
  ["symfony/framework-bundle", "Symfony", "Frameworks"],
  ["phpunit/phpunit", "PHPUnit", "Testing"],
  [/spring-boot/, "Spring Boot", "Frameworks"],
  [/junit/, "JUnit", "Testing"],
  [/hibernate/, "Hibernate", "Database & ORM"],
  [/lombok/, "Lombok", "Build & tooling"],
  // dart
  ["flutter", "Flutter", "Frameworks"],
];

const exact = new Map<string, [string, Cat]>();
const families: [RegExp, string, Cat][] = [];
for (const [m, label, cat] of KNOWN) {
  if (typeof m === "string") exact.set(m.toLowerCase(), [label, cat]);
  else families.push([m, label, cat]);
}

function classify(dep: string): [string, Cat] | null {
  const k = dep.toLowerCase();
  const hit = exact.get(k) ?? exact.get(k.replace(/_/g, "-"));
  if (hit) return hit;
  for (const [re, label, cat] of families) if (re.test(k)) return [label, cat];
  return null;
}

export interface Manifests {
  packageJsons: { path: string; json: any }[];
  files: Map<string, string>;
  paths: string[];
}

export interface StackResult {
  groups: StackGroup[];
  packageManagers: string[];
  otherDependencies: number;
  /** every dependency name seen, lower-cased, for other analysers */
  deps: Set<string>;
}

function cleanVersion(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(/\d+(?:\.\d+){0,2}/);
  return m ? m[0] : null;
}

/** Parses `name==1.2`, `name>=1`, `name[extra]~=2` style requirement lines. */
function parseRequirement(line: string): [string, string | null] | null {
  const l = line.replace(/#.*/, "").trim();
  if (!l || l.startsWith("-")) return null;
  const m = l.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*(?:[=<>!~]=?\s*([\w.*]+))?/);
  return m ? [m[1], m[2] ?? null] : null;
}

export function detectStack(input: Manifests): StackResult {
  const found = new Map<string, StackItem & { cat: Cat }>();
  const deps = new Set<string>();
  let unknown = 0;

  const add = (dep: string, version: unknown, source: string, dev = false) => {
    deps.add(dep.toLowerCase());
    const c = classify(dep);
    if (!c) {
      unknown++;
      return;
    }
    const [label, cat] = c;
    const cur = found.get(label);
    if (!cur) found.set(label, { name: label, version: cleanVersion(version), source, cat, dev });
    else if (cur.dev && !dev) Object.assign(cur, { version: cleanVersion(version) ?? cur.version, source, dev: false });
  };
  const addTool = (label: string, cat: Cat, source: string) => {
    if (!found.has(label)) found.set(label, { name: label, version: null, source, cat });
  };

  for (const { path: p, json } of input.packageJsons) {
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      for (const [d, v] of Object.entries(json?.[field] ?? {})) add(d, v, p, field === "devDependencies");
    }
    if (json?.engines?.node) addTool("Node.js", "Build & tooling", p);
  }

  const f = input.files;
  for (const [p, text] of f) {
    const base = p.split("/").pop()!.toLowerCase();
    if (/^requirements.*\.txt$/.test(base)) {
      for (const line of text.split("\n")) {
        const r = parseRequirement(line);
        if (r) add(r[0], r[1], p);
      }
    } else if (base === "pyproject.toml") {
      // PEP 621 dependency arrays and Poetry tables
      for (const m of text.matchAll(/["']([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*(?:[=<>!~]=?\s*([\w.*]+))?[^"']*["']/g)) {
        if (/dependencies|requires/.test(text.slice(Math.max(0, m.index! - 400), m.index!))) add(m[1], m[2], p);
      }
      for (const sec of text.matchAll(/\[tool\.poetry(?:\.group\.\w+)?\.(?:dev-)?dependencies\]([\s\S]*?)(?=\n\[|$)/g)) {
        for (const m of sec[1].matchAll(/^([A-Za-z0-9][\w.-]*)\s*=\s*["{]?\s*(?:version\s*=\s*)?["^~>=]*([\d.]+)?/gm)) {
          if (m[1] !== "python") add(m[1], m[2], p);
        }
      }
      if (/\[tool\.poetry\]/.test(text)) addTool("Poetry", "Build & tooling", p);
      if (/\[tool\.ruff/.test(text)) addTool("Ruff", "Code quality", p);
      if (/\[tool\.pytest/.test(text)) addTool("pytest", "Testing", p);
    } else if (base === "setup.py" || base === "setup.cfg") {
      for (const m of text.matchAll(/["']([A-Za-z][\w.-]*)\s*(?:[=<>!~]=?\s*([\w.]+))?["']/g)) {
        if (/install_requires|requires/.test(text.slice(Math.max(0, m.index! - 300), m.index!))) add(m[1], m[2], p);
      }
    } else if (base === "pipfile") {
      for (const m of text.matchAll(/^([A-Za-z][\w.-]*)\s*=\s*["{]/gm)) add(m[1], null, p);
    } else if (base === "go.mod") {
      addTool("Go", "Build & tooling", p);
      for (const m of text.matchAll(/^\s*([\w.-]+\.[\w.-]+\/[\w./-]+)\s+v([\d.]+)/gm)) add(m[1], m[2], p);
    } else if (base === "cargo.toml") {
      for (const sec of text.matchAll(/\[(?:dev-|build-)?dependencies\]([\s\S]*?)(?=\n\[|$)/g)) {
        for (const m of sec[1].matchAll(/^([\w-]+)\s*=\s*(?:"([^"]+)"|\{[^}]*?version\s*=\s*"([^"]+)")?/gm)) add(m[1], m[2] ?? m[3], p);
      }
    } else if (base === "gemfile") {
      for (const m of text.matchAll(/^\s*gem\s+["']([\w-]+)["'](?:\s*,\s*["'][~>=\s]*([\d.]+))?/gm)) add(m[1], m[2], p);
    } else if (base === "composer.json") {
      try {
        const j = JSON.parse(text);
        for (const field of ["require", "require-dev"]) for (const [d, v] of Object.entries(j[field] ?? {})) add(d, v, p);
      } catch {}
    } else if (base === "pom.xml") {
      for (const m of text.matchAll(/<artifactId>([^<]+)<\/artifactId>(?:\s*<version>([^<]+)<\/version>)?/g)) add(m[1], m[2], p);
      addTool("Maven", "Build & tooling", p);
    } else if (/^build\.gradle(\.kts)?$/.test(base)) {
      for (const m of text.matchAll(/["']([\w.-]+):([\w.-]+):?([\w.-]*)["']/g)) add(m[2], m[3], p);
      addTool("Gradle", "Build & tooling", p);
    } else if (base === "pubspec.yaml") {
      for (const m of text.matchAll(/^\s{2}([a-z_]+):/gm)) add(m[1], null, p);
    } else if (base === "dockerfile" || base.endsWith(".dockerfile")) {
      addTool("Docker", "Infrastructure & deploy", p);
    } else if (/^(docker-)?compose\.ya?ml$/.test(base) || /^docker-compose\.[\w-]+\.ya?ml$/.test(base)) {
      addTool("Docker Compose", "Infrastructure & deploy", p);
      for (const m of text.matchAll(/image:\s*["']?([\w./-]+)/g)) {
        const img = m[1].split("/").pop()!.toLowerCase();
        const db: Record<string, string> = { postgres: "PostgreSQL", mysql: "MySQL", mariadb: "MariaDB", redis: "Redis", mongo: "MongoDB", elasticsearch: "Elasticsearch", rabbitmq: "RabbitMQ", nginx: "nginx", minio: "MinIO" };
        const hit = Object.keys(db).find((k) => img.startsWith(k));
        if (hit) addTool(db[hit], hit === "nginx" ? "Infrastructure & deploy" : "Database & ORM", p);
      }
    }
  }

  const has = (re: RegExp) => input.paths.some((p) => re.test(p));
  const tool = (re: RegExp, label: string, cat: Cat) => {
    const p = input.paths.find((x) => re.test(x));
    if (p) addTool(label, cat, p);
  };
  tool(/^\.github\/workflows\/.+\.ya?ml$/, "GitHub Actions", "CI/CD");
  tool(/^\.gitlab-ci\.yml$/, "GitLab CI", "CI/CD");
  tool(/^\.circleci\/config\.yml$/, "CircleCI", "CI/CD");
  tool(/^\.travis\.yml$/, "Travis CI", "CI/CD");
  tool(/^vercel\.json$/, "Vercel", "Infrastructure & deploy");
  tool(/^netlify\.toml$/, "Netlify", "Infrastructure & deploy");
  tool(/^fly\.toml$/, "Fly.io", "Infrastructure & deploy");
  tool(/^render\.ya?ml$/, "Render", "Infrastructure & deploy");
  tool(/^railway\.(json|toml)$/, "Railway", "Infrastructure & deploy");
  tool(/^Procfile$/, "Heroku (Procfile)", "Infrastructure & deploy");
  tool(/\.tf$/, "Terraform", "Infrastructure & deploy");
  tool(/(^|\/)(k8s|kubernetes|helm|charts)\//, "Kubernetes", "Infrastructure & deploy");
  tool(/(^|\/)wrangler\.(toml|jsonc?)$/, "Cloudflare Workers", "Infrastructure & deploy");
  tool(/(^|\/)firebase\.json$/, "Firebase Hosting", "Infrastructure & deploy");
  tool(/(^|\/)tailwind\.config\.\w+$/, "Tailwind CSS", "UI & styling");
  tool(/(^|\/)Makefile$/, "Make", "Build & tooling");
  tool(/(^|\/)CMakeLists\.txt$/, "CMake", "Build & tooling");
  tool(/(^|\/)platformio\.ini$/, "PlatformIO", "Build & tooling");
  tool(/(^|\/)\.eslintrc(\.\w+)?$|(^|\/)eslint\.config\.\w+$/, "ESLint", "Code quality");
  tool(/(^|\/)\.prettierrc(\.\w+)?$/, "Prettier", "Code quality");
  if (has(/\.ipynb$/)) addTool("Jupyter notebooks", "AI & ML", input.paths.find((p) => p.endsWith(".ipynb"))!);

  const pms: string[] = [];
  const pm = (re: RegExp, name: string) => has(re) && pms.push(name);
  pm(/(^|\/)pnpm-lock\.yaml$/, "pnpm");
  pm(/(^|\/)yarn\.lock$/, "Yarn");
  pm(/(^|\/)bun\.lockb?$/, "Bun");
  pm(/(^|\/)package-lock\.json$/, "npm");
  if (!pms.length && input.packageJsons.length) pms.push("npm");
  pm(/(^|\/)poetry\.lock$/, "Poetry");
  pm(/(^|\/)uv\.lock$/, "uv");
  pm(/(^|\/)Pipfile\.lock$/, "Pipenv");
  if (!pms.some((x) => ["Poetry", "uv", "Pipenv"].includes(x)) && has(/(^|\/)requirements.*\.txt$|(^|\/)pyproject\.toml$|(^|\/)setup\.py$/)) pms.push("pip");
  pm(/(^|\/)go\.mod$/, "Go modules");
  pm(/(^|\/)Cargo\.toml$/, "Cargo");
  pm(/(^|\/)Gemfile$/, "Bundler");
  pm(/(^|\/)composer\.json$/, "Composer");
  pm(/(^|\/)pom\.xml$/, "Maven");
  pm(/(^|\/)build\.gradle(\.kts)?$/, "Gradle");
  pm(/(^|\/)pubspec\.yaml$/, "pub");

  const byCat = new Map<Cat, StackItem[]>();
  for (const { cat, ...item } of found.values()) {
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(item.dev ? item : { name: item.name, version: item.version, source: item.source });
  }
  // runtime items first, dev-only tools after
  for (const items of byCat.values()) items.sort((a, b) => Number(!!a.dev) - Number(!!b.dev));
  const groups = ORDER.filter((c) => byCat.has(c)).map((c) => ({ category: c, items: byCat.get(c)! }));
  return { groups, packageManagers: [...new Set(pms)], otherDependencies: unknown, deps };
}
