// Deterministic query planning: pull identifier-like search terms and an intent out of
// a natural-language question. No LLM involved.

const STOP = new Set(
  `a an the and or but if then else of to in on at by for from with without into onto about as is are was were be been being
   do does did doing done have has had having can could should would will shall may might must this that these those it its
   i me my we our you your he she they them their what which who whom whose where when why how there here all any each
   some such no not only own same so than too very just also please explain tell show give find list describe me
   work works working happen happens used use uses using handled handle handles implemented implement implementation
   code codebase repo repository project file files function functions method methods class classes module modules
   defined define definition located locate call calls called caller callers callee callees import imports imported
   thing things part parts way logic flow main between like get gets set sets make makes does doing`.split(/\s+/),
);

export type Intent = "callers" | "callees" | "definition" | "explain";

export interface Plan {
  terms: string[];
  intent: Intent;
}

export function detectIntent(q: string): Intent {
  const s = q.toLowerCase();
  if (/\b(who|what|which)\b.*\bcalls?\b|\bcallers?\b|\bcalled by\b|\bwhere is .* (used|called)\b|\busages?\b/.test(s)) {
    if (/\bwhat does .* call\b|\bcallees?\b/.test(s)) return "callees";
    return "callers";
  }
  if (/\bwhat does .* call\b|\bcallees?\b|\bdepends? on\b|\bdependencies\b/.test(s)) return "callees";
  if (/\bwhere\b.*\b(defined|declared|located|live|lives)\b|\bdefinition of\b|\bwhich file\b/.test(s)) return "definition";
  return "explain";
}

const isIdentifierish = (t: string) => /[a-z][A-Z]|_|\d|^[A-Z][a-z]+[A-Z]/.test(t) || /^[A-Z][A-Za-z]+$/.test(t);

/** First-pass terms: explicit `code`, identifier-looking tokens, then remaining content words. */
export function extractTerms(question: string): string[] {
  const out: string[] = [];
  const push = (t: string) => {
    const clean = t.replace(/^[^\w]+|[^\w]+$/g, "").replace(/\(\)$/, "");
    if (clean.length < 2 || out.some((o) => o.toLowerCase() === clean.toLowerCase())) return;
    out.push(clean);
  };
  for (const m of question.matchAll(/`([^`]+)`/g)) {
    m[1].split(/[.\s:/()]+/).forEach(push);
  }
  const tokens = question.replace(/`[^`]*`/g, " ").match(/[A-Za-z_][\w]*(?:\.[A-Za-z_]\w*)*/g) ?? [];
  const idents = tokens.filter((t) => !STOP.has(t.toLowerCase()) && (isIdentifierish(t) || t.includes(".")));
  for (const t of idents) {
    if (t.includes(".")) push(t.split(".").slice(-2).join(".")); // Class.method as one precise term
    t.split(".").forEach(push);
  }
  for (const t of tokens) {
    if (t.length < 3 || STOP.has(t.toLowerCase()) || idents.includes(t)) continue;
    push(t);
    // plain English words also search by stem: "retries" -> "retry", "encoded" -> "encod"
    const st = stem(t);
    if (st !== t.toLowerCase() && st.length >= 4) push(st);
  }
  return out.slice(0, 8);
}

function splitIdentifier(t: string): string[] {
  return t
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean);
}

function stem(w: string): string {
  const s = w.toLowerCase();
  for (const suf of ["ization", "ations", "ation", "ings", "ing", "ers", "er", "ies", "es", "ed", "s"]) {
    if (s.length - suf.length >= 4 && s.endsWith(suf)) return suf === "ies" ? `${s.slice(0, -3)}y` : s.slice(0, -suf.length);
  }
  return s;
}

/**
 * Reformulation used by the agent's bounded retry: break compound identifiers into
 * parts and fall back to word stems, dropping terms that already came back empty.
 */
export function reformulate(previous: string[], question: string, attempt: number): string[] {
  const out = new Set<string>();
  const base = previous.length ? previous : extractTerms(question);
  for (const t of base) {
    const parts = splitIdentifier(t);
    if (parts.length > 1) parts.forEach((p) => p.length >= 3 && !STOP.has(p.toLowerCase()) && out.add(p.toLowerCase()));
    const st = stem(t);
    if (st.length >= 3) out.add(st);
    if (attempt >= 2 && st.length >= 5) out.add(st.slice(0, Math.max(4, st.length - 2)));
  }
  // Also consider plain words from the question that the first pass skipped for being short.
  for (const w of question.match(/[A-Za-z]{4,}/g) ?? []) {
    if (!STOP.has(w.toLowerCase())) out.add(stem(w));
  }
  return [...out].slice(0, 10);
}
