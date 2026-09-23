// The overview text. Always built from repo data first; when an LLM key is configured the
// model rewrites it from the same facts and fills in example API responses and CLI output.
import Anthropic from "@anthropic-ai/sdk";
import type { MockOutput, ProjectKind, RepoReport } from "@ara/shared";
import { activeProvider } from "../agent/llm.js";

const KIND_PHRASE: Record<ProjectKind, string> = {
  web: "web app",
  api: "backend API",
  cli: "command-line tool",
  library: "library",
  mobile: "mobile app",
  desktop: "desktop app",
  data: "data and machine-learning project",
  infra: "infrastructure setup",
  docs: "documentation project",
  other: "software project",
};

const AUDIENCE: Record<ProjectKind, string> = {
  web: "People who use it in a browser, and developers who want to run or change it.",
  api: "Frontend or app developers who call its endpoints, and backend developers who maintain it.",
  cli: "Developers and power users who run it from a terminal.",
  library: "Developers who add it as a dependency in their own code.",
  mobile: "Phone users, and developers building the app.",
  desktop: "Desktop users, and developers building the app.",
  data: "Data scientists and ML engineers reproducing or extending the analysis.",
  infra: "DevOps engineers deploying or operating the system.",
  docs: "Readers of the documentation and its contributors.",
  other: "Developers exploring or contributing to the project.",
};

export function cleanReadme(readme: string | null, name = ""): { intro: string | null; features: string[] } {
  if (!readme) return { intro: null, features: [] };
  const text = readme
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(picture|p|div|h1|a|img|source|br)[^>]*>|<\/(picture|p|div|h1|a)>/gi, "\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "");
  let intro: string | null = null;
  // an untouched starter README (create-next-app, Vite, CRA) says nothing about the project itself
  const starter = /bootstrapped with \[?`?create-|This template provides a minimal setup|Getting Started with Create React App/i.test(text);
  for (const para of starter ? [] : text.split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p || /^(#|```|\||>|-|\*|\d+\.|<|\[)/.test(p) || p.length < 40) continue;
    const plain = p.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").replace(/\s+/g, " ");
    if (/badge|shields\.io|npm version|build status|bootstrapped with|this template|getting started|start editing|auto-updates|learn more about|deploy(ed)? on vercel|create-next-app|create react app|readme\.md|docs?:\s|next\/font|this project uses/i.test(plain)) continue;
    if (/\.md\b/.test(plain) && plain.length < 140) continue;
    if (/^(click|run|install|clone|to (get|install|run|start)|first,|please|note:|see |check |read |follow|open|download|copy)\b/i.test(plain) || /:$/.test(plain)) continue;
    if (/=>|[{};]|\w\([^)]*\)\s*$|^\s*(const|let|var|import|from|def|func|fn)\b/.test(plain)) continue; // code, not prose
    // must read like a description of the project, not a setup instruction
    const describes = /\b(is|are) (a|an|the)\b|\blets you\b|\bhelps?\b|\ballows?\b|\bprovides?\b|\benables?\b|\bdesigned\b|\bbuilt (for|to|with)\b|\b(library|framework|tool|toolkit|app|application|website|platform|service|api|client|server|plugin|extension|engine|cli)\b/i;
    if (!describes.test(plain) && !(name && plain.toLowerCase().includes(name.toLowerCase()))) continue;
    if (/\b(feedback and contributions|check out the|github repository)\b/i.test(plain)) continue;
    const sentences = plain.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/);
    intro = sentences.slice(0, 3).join(" ").trim();
    break;
  }
  const features: string[] = [];
  const sec = text.match(/^#{1,3}\s*(?:✨\s*)?(?:key\s+)?(?:features|highlights|why\b[^\n]*|what it does)[^\n]*\n([\s\S]*?)(?=\n#{1,3}\s|$)/im);
  if (sec) {
    for (const m of sec[1].matchAll(/^\s*[-*]\s+(.+)$/gm)) {
      const item = m[1].replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim();
      if (item.length > 3 && features.length < 8) features.push(item.length > 140 ? item.slice(0, 137) + "…" : item);
    }
  }
  return { intro, features };
}

function listWords(xs: string[]) {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

export function templateOverview(r: Omit<RepoReport, "overview" | "ai" | "reportId">, readme: string | null): RepoReport["overview"] {
  const { intro, features } = cleanReadme(readme, r.repo.name);
  const kinds = r.mock.kinds;
  const kindText = kinds.filter((k) => k !== "other").map((k) => KIND_PHRASE[k]);
  const lang = r.stack.languages[0];
  const self = r.repo.name.toLowerCase();
  const runtime = (cat: string) =>
    r.stack.groups.find((g) => g.category === cat)?.items.filter((i) => !i.dev && i.name.toLowerCase().split(" ")[0] !== self).map((i) => i.name) ?? [];
  const frameworks = runtime("Frameworks");
  const backend = runtime("Backend & APIs");
  const dbs = runtime("Database & ORM");
  const main = [...frameworks, ...backend].slice(0, 3);

  const what = kindText.length ? listWords(kindText.map((k, i) => (i === 0 ? `a ${k}` : k)).map((s) => s.replace(/^a ([aeiou])/, "an $1"))) : "a software project";
  const oneLiner =
    r.repo.description?.trim() ||
    intro?.split(/(?<=[.!?])\s/)[0] ||
    `${r.repo.name} is ${what}${r.mock.web?.siteTitle ? ` called “${r.mock.web.siteTitle}”` : ""}${main.length ? `, built with ${listWords(main)}` : ""}.`;

  const plain: string[] = [];
  plain.push(`${r.repo.name} is ${what}${kinds.length === 1 && kinds[0] === "library" ? " that other code can import" : ""}.`);
  if (intro && intro !== oneLiner) plain.push(intro);
  if (lang) {
    plain.push(
      `It's written mostly in ${lang.name} (${Math.round(lang.pct)}%)${main.length ? ` and built on ${listWords(main)}` : ""}${dbs.length ? `, storing data with ${listWords(dbs.slice(0, 2))}` : ""}.`,
    );
  }
  if (r.mock.web?.pages.length) plain.push(`It has ${r.mock.web.pages.length} page${r.mock.web.pages.length === 1 ? "" : "s"} you can visit, starting at ${r.mock.web.pages[0].route}.`);
  if (r.mock.api?.endpoints.length) plain.push(`Other programs talk to it through ${r.mock.api.endpoints.length} API endpoint${r.mock.api.endpoints.length === 1 ? "" : "s"}.`);
  if (r.mock.cli) plain.push(`You run it in a terminal as \`${r.mock.cli.binName}\`${r.mock.cli.commands.length ? `, with ${r.mock.cli.commands.length} command${r.mock.cli.commands.length === 1 ? "" : "s"}` : ""}.`);
  if (r.mock.library) plain.push(`You add it to your own project with \`${r.mock.library.install}\`.`);

  const tech: string[] = [];
  const allLangs = r.stack.languages.filter((l) => l.pct >= 0.1).slice(0, 4).map((l) => `${l.name} ${l.pct.toFixed(1)}%`);
  if (allLangs.length) tech.push(`Languages: ${allLangs.join(", ")}.`);
  for (const g of r.stack.groups.slice(0, 6)) {
    tech.push(`${g.category}: ${g.items.slice(0, 6).map((i) => `${i.version ? `${i.name} ${i.version}` : i.name}${i.dev ? " (dev)" : ""}`).join(", ")}.`);
  }
  if (r.stack.packageManagers.length) tech.push(`Package management: ${r.stack.packageManagers.join(", ")}.`);
  if (r.structure.entryPoints.length) tech.push(`Entry points: ${r.structure.entryPoints.slice(0, 4).map((e) => e.path).join(", ")}.`);
  const topFolders = r.structure.folders
    .filter((f) => f.path !== "(root)" && !/^(tests?|__tests__|spec|test-d|e2e|docs?|examples?|\.github|media|assets|public)$/i.test(f.path))
    .slice(0, 3);
  if (topFolders.length) tech.push(`Most code lives in ${topFolders.map((f) => `${f.path}/ (${f.files} files)`).join(", ")}.`);
  if (r.mock.api) tech.push(`HTTP layer: ${r.mock.api.framework}, ${r.mock.api.endpoints.length} routes.`);

  return {
    oneLiner: oneLiner.replace(/^\p{Extended_Pictographic}\s*/u, ""),
    plain: plain.join(" "),
    technical: tech.join(" "),
    kinds,
    highlights: features,
    audience: AUDIENCE[kinds[0]] ?? AUDIENCE.other,
  };
}

// --- LLM enrichment --------------------------------------------------------

const SYSTEM = `You explain GitHub repositories to people who have never seen them.
You get facts that were extracted from one repository: metadata, README excerpt, detected stack, folder layout, commit history summary, and routes/commands found in the code.
Only state what the facts support. Don't invent features. Write plainly: short sentences, no hype, no marketing words.`;

const SCHEMA = {
  type: "object",
  properties: {
    oneLiner: { type: "string", description: "One sentence, under 25 words: what this project is." },
    plain: { type: "string", description: "3-5 sentences for a non-programmer: what it does, who it's for, how someone uses it." },
    technical: { type: "string", description: "4-7 sentences for a developer: architecture, main modules, data flow, notable libraries." },
    audience: { type: "string", description: "One sentence: who would use or work on this." },
    highlights: { type: "array", items: { type: "string" }, description: "Up to 6 concrete capabilities, each under 15 words." },
    workSummary: { type: "string", description: "2-4 sentences on what work has been done recently, based on the commit summary and highlights." },
    endpointExamples: {
      type: "array",
      description: "For up to 8 of the listed endpoints: a realistic example JSON response body, consistent with any response code given.",
      items: {
        type: "object",
        properties: { method: { type: "string" }, path: { type: "string" }, response: { type: "string" } },
        required: ["method", "path", "response"],
        additionalProperties: false,
      },
    },
    cliExamples: {
      type: "array",
      description: "Up to 3 example terminal sessions using the listed commands, with plausible output.",
      items: {
        type: "object",
        properties: { command: { type: "string" }, output: { type: "string" } },
        required: ["command", "output"],
        additionalProperties: false,
      },
    },
  },
  required: ["oneLiner", "plain", "technical", "audience", "highlights", "workSummary", "endpointExamples", "cliExamples"],
  additionalProperties: false,
} as const;

interface Enriched {
  oneLiner: string;
  plain: string;
  technical: string;
  audience: string;
  highlights: string[];
  workSummary: string;
  endpointExamples: { method: string; path: string; response: string }[];
  cliExamples: { command: string; output: string }[];
}

function factSheet(r: Omit<RepoReport, "ai" | "reportId">, readme: string | null): string {
  const mock: MockOutput = r.mock;
  const lines = [
    `Repository: ${r.repo.fullName}`,
    `Description: ${r.repo.description ?? "(none)"}`,
    `Topics: ${r.repo.topics.join(", ") || "(none)"}`,
    `Detected kinds: ${mock.kinds.join(", ")}`,
    `Languages: ${r.stack.languages.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", ")}`,
    ...r.stack.groups.map((g) => `${g.category}: ${g.items.map((i) => i.name).join(", ")}`),
    `Top folders: ${r.structure.folders.slice(0, 10).map((f) => `${f.path} (${f.files} files, ${f.purpose})`).join("; ")}`,
    `Entry points: ${r.structure.entryPoints.map((e) => e.path).join(", ")}`,
    `Work summary: ${r.work.summary}`,
    `Recent notable commits: ${r.work.months.slice(0, 4).flatMap((m) => m.highlights.slice(0, 3).map((h) => `[${h.type}] ${h.message}`)).join(" | ")}`,
  ];
  if (mock.web) lines.push(`Web pages: ${mock.web.pages.map((p) => `${p.route} (headings: ${p.headings.slice(0, 3).join(" / ") || "none"})`).join("; ")}`);
  if (mock.api) {
    lines.push(`API (${mock.api.framework}) endpoints:`);
    for (const e of mock.api.endpoints.slice(0, 16)) {
      lines.push(`- ${e.method} ${e.path}${e.bodyFields.length ? ` body: ${e.bodyFields.join(", ")}` : ""}${e.responseFromCode ? ` returns: ${e.responseFromCode.slice(0, 300).replace(/\s+/g, " ")}` : ""}`);
    }
  }
  if (mock.cli) lines.push(`CLI \`${mock.cli.binName}\` commands: ${mock.cli.commands.map((c) => `${c.usage} (${c.description ?? ""})`).join("; ")}; options: ${mock.cli.options.map((o) => o.flag).join(", ")}`);
  if (mock.library) lines.push(`Library install: ${mock.library.install}; exports: ${mock.library.exports.join(", ")}`);
  if (readme) lines.push("", "README (start):", readme.slice(0, 6000));
  return lines.join("\n");
}

async function callAnthropic(prompt: string): Promise<Enriched> {
  const client = new Anthropic();
  const res = await client.beta.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming);
  if (res.stop_reason === "refusal") throw new Error("The model declined this request.");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return JSON.parse(text) as Enriched;
}

async function callOpenAiCompatible(provider: "groq" | "gemini", prompt: string): Promise<Enriched> {
  const cfg =
    provider === "groq"
      ? { url: "https://api.groq.com/openai/v1/chat/completions", key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile" }
      : { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash" };
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${SYSTEM}\nReply with one JSON object matching this JSON Schema:\n${JSON.stringify(SCHEMA)}` },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`${provider} API error ${res.status}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return JSON.parse(data.choices[0]?.message.content ?? "{}") as Enriched;
}

/** Mutates the report with LLM-written text. Returns the provider used, or null when none is configured. */
export async function enrich(r: Omit<RepoReport, "ai" | "reportId">, readme: string | null): Promise<{ provider: string; error: string | null } | null> {
  const provider = activeProvider();
  if (provider === "extractive") return null;
  const prompt = factSheet(r, readme);
  try {
    const out = provider === "anthropic" ? await callAnthropic(prompt) : await callOpenAiCompatible(provider, prompt);
    if (out.oneLiner) r.overview.oneLiner = out.oneLiner;
    if (out.plain) r.overview.plain = out.plain;
    if (out.technical) r.overview.technical = out.technical;
    if (out.audience) r.overview.audience = out.audience;
    if (out.highlights?.length) r.overview.highlights = out.highlights.slice(0, 8);
    if (out.workSummary) r.work.summary = out.workSummary;
    if (r.mock.api) {
      for (const ex of out.endpointExamples ?? []) {
        const ep = r.mock.api.endpoints.find((e) => e.method === ex.method.toUpperCase() && e.path === ex.path);
        if (ep) ep.exampleResponse = ex.response;
      }
    }
    if (r.mock.cli && out.cliExamples?.length) {
      for (const ex of out.cliExamples.slice(0, 3)) r.mock.cli.session.push({ command: ex.command.replace(/^\$\s*/, ""), output: ex.output, aiWritten: true });
    }
    return { provider, error: null };
  } catch (err) {
    return { provider, error: err instanceof Error ? err.message : String(err) };
  }
}
