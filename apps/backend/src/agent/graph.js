// The chat agent as an explicit LangGraph: Plan -> Retrieve -> Reflect -> (retry Plan | Synthesize).
// Plan/Retrieve/Reflect are deterministic; the LLM is used only inside Synthesize.
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { config } from "../config.js";
import { assembleContext, expandGraph, lexicalSearch } from "../retriever/retrieve.js";
import { detectIntent, extractTerms, reformulate } from "../retriever/terms.js";
import { synthesize } from "./llm.js";

const State = Annotation.Root({
  repoId: Annotation,
  question: Annotation,
  attempt: Annotation,
  intent: Annotation,
  terms: Annotation,
  tried: Annotation,
  candidates: Annotation,
  sources: Annotation,
  sufficient: Annotation,
  attempts: Annotation,
  answer: Annotation,
  synthesizer: Annotation,
});

function plan(s) {
  if (s.attempt === 0) {
    return { intent: detectIntent(s.question), terms: extractTerms(s.question), tried: [] };
  }
  // Retry: reformulate, and skip anything we already searched for.
  const fresh = reformulate(s.terms, s.question, s.attempt).filter(
    (t) => !s.tried.some((x) => x.toLowerCase() === t.toLowerCase()),
  );
  return { terms: fresh.length ? fresh : s.terms };
}

function retrieve(s) {
  const ranked = lexicalSearch(s.repoId, s.terms);
  // Keep the best previous candidates too, so a retry can only add context.
  const merged = new Map();
  for (const c of [...(s.candidates ?? []), ...ranked]) {
    const prev = merged.get(c.sym.symbol_id);
    if (!prev || c.score > prev.score) merged.set(c.sym.symbol_id, c);
  }
  const all = [...merged.values()].sort(
    (a, b) => b.score - a.score || a.sym.path.localeCompare(b.sym.path) || a.sym.start_line - b.sym.start_line,
  );
  const seeds = all.slice(0, config.retrieval.topCandidates);
  const sources = assembleContext(expandGraph(seeds, s.intent));
  return { candidates: all, sources, tried: [...s.tried, ...s.terms] };
}

/** Is the context good enough to answer from? Needs a name-level hit or several content hits. */
function reflect(s) {
  const best = s.candidates[0];
  const contentHits = s.candidates.filter((c) => c.reason === "content").length;
  const sufficient =
    s.sources.length > 0 && !!best && (best.reason === "exact" || best.score >= 55 || contentHits >= 3);
  return {
    sufficient,
    attempt: s.attempt + 1,
    attempts: [...(s.attempts ?? []), { terms: s.terms, candidates: s.candidates.length, sufficient }],
  };
}

async function synthesizeNode(s) {
  const { answer, synthesizer } = await synthesize(s.question, s.sources, s.intent);
  return { answer, synthesizer };
}

const graph = new StateGraph(State)
  .addNode("plan", plan)
  .addNode("retrieve", retrieve)
  .addNode("reflect", reflect)
  .addNode("synthesize", synthesizeNode)
  .addEdge(START, "plan")
  .addEdge("plan", "retrieve")
  .addEdge("retrieve", "reflect")
  .addConditionalEdges(
    "reflect",
    (s) => (s.sufficient || s.attempt > config.retrieval.maxRetries ? "synthesize" : "plan"),
    ["plan", "synthesize"],
  )
  .addEdge("synthesize", END)
  .compile();

export async function runAgent(repoId, question) {
  const final = await graph.invoke({
    repoId,
    question,
    attempt: 0,
    candidates: [],
    sources: [],
    attempts: [],
    tried: [],
    terms: [],
  });
  const trace = {
    plan: { terms: final.attempts[0]?.terms ?? [], intent: final.intent },
    attempts: final.attempts,
    synthesizer: final.synthesizer,
  };
  return { answer: final.answer, sources: final.sources, trace };
}
