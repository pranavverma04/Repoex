// "How to run it": setup steps from lockfiles, scripts and entry points, env vars, ports.

const ENV_PATTERNS = [
  /process\.env\.([A-Z][A-Z0-9_]{2,})/g,
  /process\.env\[["']([A-Z][A-Z0-9_]{2,})["']\]/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]{2,})/g,
  /os\.environ(?:\.get)?\(\s*["']([A-Z][A-Z0-9_]{2,})["']/g,
  /os\.environ\[\s*["']([A-Z][A-Z0-9_]{2,})["']\s*\]/g,
  /os\.getenv\(\s*["']([A-Z][A-Z0-9_]{2,})["']/g,
  /os\.Getenv\(\s*"([A-Z][A-Z0-9_]{2,})"/g,
  /env::var\(\s*"([A-Z][A-Z0-9_]{2,})"/g,
  /System\.getenv\(\s*"([A-Z][A-Z0-9_]{2,})"/g,
  /ENV\[["']([A-Z][A-Z0-9_]{2,})["']\]/g,
];
const IGNORED_ENV = new Set([
  "NODE_ENV",
  "HOME",
  "PATH",
  "PWD",
  "USER",
  "SHELL",
  "TERM",
  "CI",
  "DEBUG",
  "TZ",
  "LANG",
  "TMPDIR",
  "NEXT_RUNTIME",
  "VERCEL",
  "GITHUB_ACTIONS",
  "FORCE_COLOR",
  "NO_COLOR",
]);

function readmeSnippets(readme) {
  if (!readme) return [];
  const out = [];
  let heading = "";
  let inRunSection = false;
  for (const m of readme.matchAll(/^(#{1,4})\s+(.+)$|```([\w-]*)\n([\s\S]*?)```/gm)) {
    if (m[2]) {
      heading = m[2]
        .replace(/[`*_[\]]/g, "")
        .replace(/\(.*?\)/g, "")
        .trim();
      inRunSection = /install|setup|set up|getting started|quick ?start|usage|run|develop|build|local/i.test(heading);
      continue;
    }
    const lang = m[3];
    const code = m[4].trimEnd();
    if (!inRunSection || !code || code.split("\n").length > 16) continue;
    if (lang && !/^(sh|bash|shell|console|zsh|powershell|cmd|text)$/.test(lang)) continue;
    out.push({ heading, code: code.replace(/^\$ /gm, "") });
    if (out.length >= 4) break;
  }
  return out;
}

export function buildRun(input) {
  const steps = [];
  const has = (re) => input.paths.some((p) => re.test(p));
  steps.push({
    title: "Get the code",
    commands: [`git clone https://github.com/${input.fullName}.git`, `cd ${input.name}`],
    note: null,
  });

  const root = input.packageJsons.find((p) => p.path === "package.json")?.json;
  const pm = input.packageManagers.find((p) => ["pnpm", "Yarn", "Bun", "npm"].includes(p));
  const runCmd = pm === "pnpm" ? "pnpm" : pm === "Yarn" ? "yarn" : pm === "Bun" ? "bun run" : "npm run";
  const scripts = [];
  if (root?.scripts)
    for (const [name, command] of Object.entries(root.scripts)) scripts.push({ name, command: String(command) });

  const installs = [];
  if (root)
    installs.push(
      pm === "pnpm" ? "pnpm install" : pm === "Yarn" ? "yarn" : pm === "Bun" ? "bun install" : "npm install",
    );
  if (input.packageManagers.includes("Poetry")) installs.push("poetry install");
  else if (input.packageManagers.includes("uv")) installs.push("uv sync");
  else if (input.packageManagers.includes("Pipenv")) installs.push("pipenv install");
  else if (has(/^requirements\.txt$/))
    installs.push("python -m venv .venv && source .venv/bin/activate", "pip install -r requirements.txt");
  else if (has(/^(pyproject\.toml|setup\.py)$/))
    installs.push("python -m venv .venv && source .venv/bin/activate", "pip install -e .");
  if (has(/^go\.mod$/)) installs.push("go mod download");
  if (has(/^Cargo\.toml$/)) installs.push("cargo build");
  if (has(/^Gemfile$/)) installs.push("bundle install");
  if (has(/^composer\.json$/)) installs.push("composer install");
  if (has(/^pubspec\.yaml$/)) installs.push("flutter pub get");
  if (has(/^pom\.xml$/)) installs.push("./mvnw install  # or: mvn install");
  if (has(/^build\.gradle(\.kts)?$/)) installs.push("./gradlew build");
  if (has(/^platformio\.ini$/)) installs.push("pio run");
  if (installs.length) {
    const nodeVer = root?.engines?.node ? `Needs Node ${root.engines.node}.` : null;
    const pyVer = input.files.get("pyproject.toml")?.match(/requires-python\s*=\s*["']([^"']+)/)?.[1];
    steps.push({
      title: "Install dependencies",
      commands: installs,
      note: [nodeVer, pyVer ? `Needs Python ${pyVer}.` : null].filter(Boolean).join(" ") || null,
    });
  }

  // Libraries and CLIs are installed and called, not started; skip app-server guesses for them.
  const isApp = input.mock.kinds.some((k) => !["library", "cli", "docs", "infra"].includes(k));
  const envFile = input.paths.find(
    (p) => /(^|\/)\.env\.(example|sample|template|local\.example)$/.test(p) && p.split("/").length <= 3,
  );
  const envVars = new Map();
  for (const [f, t] of input.files) {
    if (/(^|\/)\.env\.(example|sample|template|local\.example)$/.test(f)) {
      for (const m of t.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]{2,})\s*=/gm))
        if (!envVars.has(m[1])) envVars.set(m[1], f);
    }
  }
  for (const [f, t] of input.files) {
    if (/(^|\/)(tests?|__tests__|spec)\//.test(f)) continue;
    for (const re of ENV_PATTERNS) {
      re.lastIndex = 0;
      for (const m of t.matchAll(re))
        if (!IGNORED_ENV.has(m[1]) && !envVars.has(m[1]) && envVars.size < 30) envVars.set(m[1], f);
    }
  }
  if (envFile) {
    steps.push({
      title: "Set environment variables",
      commands: [
        `cp ${envFile} ${envFile.replace(/\.(example|sample|template)$/, "").replace(/\.local\.example$/, ".local")}`,
      ],
      note: "Fill in the values it lists before starting.",
    });
  } else if (envVars.size && isApp) {
    steps.push({
      title: "Set environment variables",
      commands: [...envVars.keys()].slice(0, 6).map((k) => `export ${k}=…`),
      note: "The code reads these. Not all may be required.",
    });
  }

  const start = [];
  const s = new Map(scripts.map((x) => [x.name, x.command]));
  const firstScript = ["dev", "start", "serve", "develop", "start:dev", "watch"].find((n) => s.has(n));
  if (firstScript) start.push(`${runCmd} ${firstScript}`.replace("npm run start", "npm start"));
  const hasFile = (re) => input.paths.find((p) => re.test(p));
  if (!start.length && !isApp) {
    if (input.mock.cli) start.push(`${input.mock.cli.binName} --help`);
    else if (input.mock.library?.usage) {
      steps.push({
        title: "Use it in your code",
        commands: [input.mock.library.install],
        note: "See the usage example under Mock output.",
      });
    }
  }
  if (!start.length && isApp) {
    const manage = hasFile(/^manage\.py$/);
    const fastapiApp = [...input.files.entries()].find(([f, t]) => /\.py$/.test(f) && /FastAPI\(/.test(t));
    const flaskApp = [...input.files.entries()].find(([f, t]) => /\.py$/.test(f) && /Flask\(__name__\)/.test(t));
    const streamlit =
      input.deps.has("streamlit") &&
      [...input.files.entries()].find(([f, t]) => /\.py$/.test(f) && /import streamlit/.test(t));
    if (manage) start.push("python manage.py migrate", "python manage.py runserver");
    else if (fastapiApp) {
      const mod = fastapiApp[0].replace(/\.py$/, "").replace(/\//g, ".");
      const varName = fastapiApp[1].match(/(\w+)\s*=\s*FastAPI\(/)?.[1] ?? "app";
      start.push(`uvicorn ${mod}:${varName} --reload`);
    } else if (streamlit) start.push(`streamlit run ${streamlit[0]}`);
    else if (flaskApp) start.push(`flask --app ${flaskApp[0]} run`);
    else if (hasFile(/^(main|app|run|bot)\.py$/)) start.push(`python ${hasFile(/^(main|app|run|bot)\.py$/)}`);
    else if (hasFile(/^[\w-]+\/__main__\.py$/))
      start.push(`python -m ${hasFile(/^[\w-]+\/__main__\.py$/).split("/")[0]}`);
    else if (hasFile(/^main\.go$/)) start.push("go run .");
    else if (hasFile(/^cmd\/[^/]+\/main\.go$/))
      start.push(`go run ./${hasFile(/^cmd\/[^/]+\/main\.go$/).replace(/\/main\.go$/, "")}`);
    else if (hasFile(/^src\/main\.rs$/)) start.push("cargo run");
    else if (hasFile(/^Gemfile$/) && input.deps.has("rails")) start.push("bin/rails db:setup", "bin/rails server");
    else if (hasFile(/^pubspec\.yaml$/)) start.push("flutter run");
    else if (hasFile(/^index\.html$/)) start.push("npx serve .  # or open index.html in a browser");
    else if (hasFile(/^platformio\.ini$/)) start.push("pio run --target upload");
  }
  const compose = hasFile(/^(docker-)?compose\.ya?ml$/);
  if (start.length) {
    steps.push({
      title: isApp ? "Start it" : "Try the command",
      commands: start,
      note: input.port && isApp ? `Then open http://localhost:${input.port}` : null,
    });
  }
  if (compose)
    steps.push({ title: "Or run everything with Docker", commands: ["docker compose up --build"], note: null });
  else if (hasFile(/^Dockerfile$/))
    steps.push({
      title: "Or run it in Docker",
      commands: [
        `docker build -t ${input.name.toLowerCase()} .`,
        `docker run --rm -it ${input.port ? `-p ${input.port}:${input.port} ` : ""}${input.name.toLowerCase()}`,
      ],
      note: null,
    });

  const test = [];
  if (s.has("test")) test.push(runCmd === "npm run" ? "npm test" : `${runCmd} test`);
  else if (input.deps.has("pytest") || has(/(^|\/)tests?\/test_\w+\.py$|(^|\/)test_\w+\.py$/)) test.push("pytest");
  else if (has(/_test\.go$/)) test.push("go test ./...");
  else if (has(/^Cargo\.toml$/)) test.push("cargo test");
  if (test.length) steps.push({ title: "Run the tests", commands: test, note: null });

  const ports = new Set();
  if (input.port) ports.add(input.port);
  for (const [, t] of input.files) for (const m of t.matchAll(/\bEXPOSE\s+(\d{2,5})/g)) ports.add(Number(m[1]));
  const composeText = compose ? input.files.get(compose) : null;
  if (composeText) for (const m of composeText.matchAll(/["']?(\d{2,5}):\d{2,5}["']?/g)) ports.add(Number(m[1]));

  return {
    steps,
    scripts: scripts.slice(0, 20),
    envVars: [...envVars.entries()].map(([name, source]) => ({ name, source })),
    ports: [...ports].slice(0, 6),
    readmeSnippets: readmeSnippets(input.readme),
  };
}
