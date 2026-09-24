// Final-step answer synthesis. The LLM only ever sees context the retriever already
// verified; with no provider configured, an extractive (template) answer is produced instead.
import Anthropic from "@anthropic-ai/sdk";

import { neighbours } from "../retriever/retrieve.js";

export function activeProvider() {
  const forced = process.env.LLM_PROVIDER;
  if (forced) return forced;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "extractive";
}

const SYSTEM = `You answer questions about a single code repository.
You are given source snippets that a deterministic retriever selected from the repository (symbol name, file path, line range, and the real code).
Answer only from these snippets. If they don't contain the answer, say what is missing rather than guessing.
Reference code as \`path:line\` when you point at something. Keep the answer focused; use short code excerpts only when they help.`;

function renderContext(question, sources) {
  const blocks = sources.map(
    (s, i) =>
      `[${i + 1}] ${s.kind} ${s.name} — ${s.path}:${s.startLine}-${s.endLine} (${s.reason}${s.via ? ` of ${s.via}` : ""})\n\`\`\`\n${s.snippet}\n\`\`\``,
  );
  return `Question: ${question}\n\nRetrieved context:\n\n${blocks.join("\n\n")}`;
}

async function anthropic(prompt) {
  const client = new Anthropic();
  // Server-side fallbacks re-route a policy refusal to another model inside the same call.
  const res = await client.beta.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined to answer this question.");
  return res.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n")
    .trim();
}

/** Groq and Gemini both expose OpenAI-compatible chat endpoints. */
async function openAiCompatible(provider, prompt) {
  const cfg =
    provider === "groq"
      ? {
          url: "https://api.groq.com/openai/v1/chat/completions",
          key: process.env.GROQ_API_KEY,
          model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
        }
      : {
          url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
          key: process.env.GEMINI_API_KEY,
          model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
        };
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${provider} API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.choices[0]?.message.content?.trim() ?? "";
}

/** Template answer built only from retrieved symbols and graph edges. */
export function extractiveAnswer(question, sources, intent) {
  if (!sources.length) {
    return "I couldn't find any symbols or files matching this question in the indexed repository. Try naming a function, class, or file.";
  }
  const top = sources[0];
  const rel = neighbours(top.symbolId);
  const out = [];
  out.push(`**${top.name}** — ${top.kind} in \`${top.path}:${top.startLine}\` (lines ${top.startLine}–${top.endLine})`);
  if (top.docstring) out.push(`> ${top.docstring}`);
  if (top.signature) out.push(`Signature: \`${top.signature.replace(/`/g, "'")}\``);

  const list = (xs) => xs.map((x) => `\`${x}\``).join(", ");
  if (intent === "callers") {
    out.push(
      rel.calledBy.length ? `**Called by:** ${list(rel.calledBy)}` : "No callers were found in the indexed call graph.",
    );
  } else if (intent === "callees") {
    out.push(
      rel.calls.length
        ? `**Calls:** ${list(rel.calls)}`
        : "It makes no calls that resolve to other symbols in this repository.",
    );
  } else {
    if (rel.calls.length) out.push(`**Calls:** ${list(rel.calls)}`);
    if (rel.calledBy.length) out.push(`**Called by:** ${list(rel.calledBy)}`);
  }
  if (rel.importedIn.length) out.push(`**Imported in:** ${rel.importedIn.map((p) => `\`${p}\``).join(", ")}`);

  const excerpt = top.snippet.split("\n").slice(0, 30).join("\n");
  out.push("```\n" + excerpt + (top.snippet.split("\n").length > 30 ? "\n…" : "") + "\n```");

  const others = sources.slice(1, 8);
  if (others.length) {
    out.push("**Related context:**");
    for (const s of others) {
      const why = s.via ? `${s.reason} of \`${s.via}\`` : `${s.reason} match`;
      const doc = s.docstring ? ` — ${s.docstring.slice(0, 120)}` : "";
      out.push(`- \`${s.name}\` (${s.kind}, \`${s.path}:${s.startLine}\`) · ${why}${doc}`);
    }
  }
  out.push(
    "_Extractive answer (no LLM configured). Set ANTHROPIC_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY in apps/backend/.env for a written explanation._",
  );
  return out.join("\n\n");
}

export async function synthesize(question, sources, intent) {
  const provider = activeProvider();
  if (provider === "extractive" || !sources.length) {
    return { answer: extractiveAnswer(question, sources, intent), synthesizer: "extractive" };
  }
  const prompt = renderContext(question, sources);
  try {
    const answer = provider === "anthropic" ? await anthropic(prompt) : await openAiCompatible(provider, prompt);
    return { answer, synthesizer: provider };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      answer: `${extractiveAnswer(question, sources, intent)}\n\n_LLM synthesis failed (${provider}): ${msg}_`,
      synthesizer: "extractive (llm error)",
    };
  }
}
