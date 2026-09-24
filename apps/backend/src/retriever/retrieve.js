// Retrieval: lexical search over the symbols/files tables -> deterministic ranking ->
// bounded graph traversal -> source snippets sliced from stored file content.
// Never touches the filesystem and never uses embeddings.

import { config } from "../config.js";
import { db } from "../db.js";

const SYM_COLS = `s.symbol_id, s.file_id, s.name, s.kind, s.parent, s.start_line, s.end_line, s.signature, s.docstring, f.path`;
const KIND_BOOST = { class: 8, function: 6, method: 5, variable: -8, import: -40 };
const REASON_RANK = ["exact", "partial", "path", "content", "caller", "callee", "import"];

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Lexical search + ranking: exact name > partial name > path > content mention. */
export function lexicalSearch(repoId, terms) {
  const scores = new Map();
  const bump = (sym, score, reason) => {
    const prev = scores.get(sym.symbol_id);
    const total = score + (KIND_BOOST[sym.kind] ?? 0);
    if (!prev) scores.set(sym.symbol_id, { sym, score: total, reason });
    else {
      prev.score += score; // matching several terms compounds
      if (REASON_RANK.indexOf(reason) < REASON_RANK.indexOf(prev.reason)) prev.reason = reason;
    }
  };

  const exactQ = db.prepare(
    `SELECT ${SYM_COLS} FROM symbols s JOIN files f USING (file_id)
     WHERE s.repo_id = ? AND s.name = ? COLLATE NOCASE AND s.kind != 'import'`,
  );
  const partialQ = db.prepare(
    `SELECT ${SYM_COLS} FROM symbols s JOIN files f USING (file_id)
     WHERE s.repo_id = ? AND s.name LIKE ? ESCAPE '\\' AND s.name != ? COLLATE NOCASE AND s.kind != 'import'
     ORDER BY length(s.name), f.path, s.start_line LIMIT 40`,
  );
  const pathQ = db.prepare(
    `SELECT ${SYM_COLS} FROM symbols s JOIN files f USING (file_id)
     WHERE s.repo_id = ? AND f.path LIKE ? ESCAPE '\\' AND s.kind IN ('class','function') AND s.parent IS NULL
     ORDER BY f.path, s.start_line LIMIT 12`,
  );
  const contentFilesQ = db.prepare(
    `SELECT file_id, content FROM files WHERE repo_id = ? AND instr(lower(content), ?) > 0 ORDER BY path LIMIT 25`,
  );
  const fileSymsQ = db.prepare(
    `SELECT ${SYM_COLS} FROM symbols s JOIN files f USING (file_id)
     WHERE s.file_id = ? AND s.kind != 'import' ORDER BY s.start_line`,
  );

  const qualifiedQ = db.prepare(
    `SELECT ${SYM_COLS} FROM symbols s JOIN files f USING (file_id)
     WHERE s.repo_id = ? AND s.parent = ? COLLATE NOCASE AND s.name = ? COLLATE NOCASE AND s.kind != 'import'`,
  );

  for (const term of terms) {
    if (term.includes(".")) {
      const [parent, name] = term.split(".");
      for (const s of qualifiedQ.all(repoId, parent, name)) bump(s, 200, "exact");
      continue;
    }
    const t = term.toLowerCase();
    // Terms written like code (CamelCase, snake_case) are stronger evidence than plain words.
    const w = /[a-z][A-Z]|_|^[A-Z][a-z]/.test(term) ? 1.5 : 1;
    let nameHits = 0;
    for (const s of exactQ.all(repoId, term)) {
      // a plain English word that happens to equal a name (e.g. a `headers` variable) is weaker evidence
      bump(s, w > 1 ? 150 : 70, "exact");
      nameHits++;
    }
    if (t.length >= 3) {
      for (const s of partialQ.all(repoId, `%${escapeLike(term)}%`, term)) {
        // closer length => closer match; also favour prefix matches
        const ratio = t.length / s.name.length;
        bump(s, w * (30 + Math.round(30 * ratio) + (s.name.toLowerCase().startsWith(t) ? 5 : 0)), "partial");
        nameHits++;
      }
      for (const s of pathQ.all(repoId, `%${escapeLike(t)}%`)) bump(s, 20, "path");
    }
    // Content mentions: only when the term is specific enough and names alone found little.
    if (t.length >= 4 && nameHits < 3) {
      for (const f of contentFilesQ.all(repoId, t)) {
        const lines = f.content.split("\n");
        const syms = fileSymsQ.all(f.file_id);
        // attribute each mention to the innermost symbol that contains it, once per symbol per term
        const credited = new Set();
        for (let i = 0; i < lines.length; i++) {
          if (!lines[i].toLowerCase().includes(t)) continue;
          const line = i + 1;
          const owner = syms
            .filter((s) => s.start_line <= line && s.end_line >= line)
            .sort((a, b) => a.end_line - a.start_line - (b.end_line - b.start_line))[0];
          if (owner && !credited.has(owner.symbol_id)) {
            credited.add(owner.symbol_id);
            bump(owner, 12, "content");
          }
        }
      }
    }
  }

  // "the Context class ... invoke": a member of a class the question names beats either alone.
  const codeTerms = new Set(terms.filter((t) => /[a-z][A-Z]|_|^[A-Z][a-z]/.test(t)).map((t) => t.toLowerCase()));
  const namedClasses = new Set(
    [...scores.values()]
      .filter((c) => c.sym.kind === "class" && codeTerms.has(c.sym.name.toLowerCase()))
      .map((c) => c.sym.name.toLowerCase()),
  );
  const asksAboutTests = terms.some((t) => /^tests?$|spec/i.test(t));
  for (const c of scores.values()) {
    if (
      c.sym.parent &&
      namedClasses.has(c.sym.parent.toLowerCase()) &&
      (c.reason === "exact" || c.reason === "partial")
    ) {
      c.score += 90;
    }
    // Test code mentions everything; rank it below the implementation unless tests were asked about.
    if (
      !asksAboutTests &&
      /(^|\/)(tests?|__tests__|spec|test-d)\/|[._-](test|spec)\.\w+$|(^|\/)test_[^/]+$/.test(c.sym.path)
    ) {
      c.score = Math.round(c.score * 0.6);
    }
  }

  // Collapse same-named definitions in one file (e.g. Python @overload stubs) into the longest one.
  const best = new Map();
  for (const c of scores.values()) {
    const key = `${c.sym.file_id}|${c.sym.parent ?? ""}|${c.sym.name}`;
    const prev = best.get(key);
    const span = (x) => x.sym.end_line - x.sym.start_line;
    if (!prev) best.set(key, c);
    else best.set(key, { ...(span(c) > span(prev) ? c : prev), score: Math.max(c.score, prev.score) });
  }

  return [...best.values()].sort(
    (a, b) => b.score - a.score || a.sym.path.localeCompare(b.sym.path) || a.sym.start_line - b.sym.start_line,
  );
}

/** Bounded BFS over call/import edges from the top candidates. */
export function expandGraph(seeds, intent) {
  const { maxHops, maxContextSymbols } = config.retrieval;
  const hops = intent === "callers" || intent === "callees" ? maxHops : 1;
  const out = new Map(seeds.map((c) => [c.sym.symbol_id, c]));

  const callersQ = db.prepare(
    `SELECT ${SYM_COLS}, e.edge_type FROM edges e JOIN symbols s ON s.symbol_id = e.from_symbol_id JOIN files f ON f.file_id = s.file_id
     WHERE e.to_symbol_id = ? ORDER BY (f.path LIKE '%test%'), f.path, s.start_line LIMIT 12`,
  );
  const calleesQ = db.prepare(
    `SELECT ${SYM_COLS}, e.edge_type FROM edges e JOIN symbols s ON s.symbol_id = e.to_symbol_id JOIN files f ON f.file_id = s.file_id
     WHERE e.from_symbol_id = ? ORDER BY (f.path LIKE '%test%'), f.path, s.start_line LIMIT 12`,
  );

  let frontier = seeds;
  for (let hop = 1; hop <= hops && out.size < maxContextSymbols; hop++) {
    const nextFrontier = [];
    for (const c of frontier) {
      const decay = 0.5 ** hop;
      const wantCallers = intent !== "callees";
      const wantCallees = intent !== "callers" || hop === 1;
      const neighbours = [];
      if (wantCallers)
        for (const r of callersQ.all(c.sym.symbol_id)) {
          neighbours.push([r, r.edge_type === "imports" ? "import" : "caller"]);
        }
      if (wantCallees)
        for (const r of calleesQ.all(c.sym.symbol_id)) {
          neighbours.push([r, "callee"]);
        }
      for (const [sym, reason] of neighbours) {
        if (out.size >= maxContextSymbols) break;
        // import symbols are one-line stubs; the "imported in" list covers them in answers
        if (out.has(sym.symbol_id) || sym.kind === "import") continue;
        const boost =
          (intent === "callers" && reason === "caller") || (intent === "callees" && reason === "callee") ? 1.5 : 1;
        const cand = { sym, score: Math.round(c.score * decay * boost), reason, via: c.sym.name };
        out.set(sym.symbol_id, cand);
        nextFrontier.push(cand);
      }
    }
    frontier = nextFrontier;
  }
  return [...out.values()];
}

/** Slices real source lines for each candidate from files.content, within a context budget. */
export function assembleContext(cands) {
  const { maxSnippetLines, maxContextChars } = config.retrieval;
  const contentQ = db.prepare(`SELECT content FROM files WHERE file_id = ?`);
  const fileLines = new Map();
  const refs = [];
  let budget = maxContextChars;
  for (const c of cands) {
    let lines = fileLines.get(c.sym.file_id);
    if (!lines) {
      lines = (contentQ.get(c.sym.file_id).content ?? "").split("\n");
      fileLines.set(c.sym.file_id, lines);
    }
    const end = Math.min(c.sym.end_line, c.sym.start_line + maxSnippetLines - 1);
    let snippet = lines.slice(c.sym.start_line - 1, end).join("\n");
    if (end < c.sym.end_line) snippet += `\n… (${c.sym.end_line - end} more lines)`;
    if (snippet.length > budget) {
      if (refs.length >= 3) break;
      snippet = snippet.slice(0, Math.max(budget, 400));
    }
    budget -= snippet.length;
    refs.push({
      symbolId: c.sym.symbol_id,
      name: c.sym.parent ? `${c.sym.parent}.${c.sym.name}` : c.sym.name,
      kind: c.sym.kind,
      path: c.sym.path,
      startLine: c.sym.start_line,
      endLine: c.sym.end_line,
      reason: c.reason,
      via: c.via,
      score: c.score,
      signature: c.sym.signature,
      docstring: c.sym.docstring,
      snippet,
    });
  }
  return refs;
}

/** Call-graph neighbours of one symbol, for the extractive answer's "calls / called by" lines. */
export function neighbours(symbolId) {
  const q = (sql) => db.prepare(sql).all(symbolId);
  const fmt = (r) => (r.parent ? `${r.parent}.${r.name}` : r.name);
  return {
    calls: q(
      `SELECT s.name, s.parent, f.path FROM edges e JOIN symbols s ON s.symbol_id=e.to_symbol_id JOIN files f ON f.file_id=s.file_id
       WHERE e.from_symbol_id=? AND e.edge_type='calls' ORDER BY s.name LIMIT 15`,
    ).map(fmt),
    calledBy: q(
      `SELECT s.name, s.parent, f.path FROM edges e JOIN symbols s ON s.symbol_id=e.from_symbol_id JOIN files f ON f.file_id=s.file_id
       WHERE e.to_symbol_id=? AND e.edge_type='calls' ORDER BY s.name LIMIT 15`,
    ).map(fmt),
    importedIn: db
      .prepare(
        `SELECT DISTINCT f.path FROM edges e JOIN symbols s ON s.symbol_id=e.from_symbol_id JOIN files f ON f.file_id=s.file_id
         WHERE e.to_symbol_id=? AND e.edge_type='imports' ORDER BY f.path LIMIT 10`,
      )
      .all(symbolId)
      .map((r) => r.path),
  };
}
