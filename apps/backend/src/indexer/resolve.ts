// Pass 2 of indexing: turn every file's stored call/import references into edges.
// Runs over the whole repo after pass 1, so it sees every symbol regardless of which
// file defined it first. Also re-run after a refresh (without re-parsing unchanged files).
import path from "node:path/posix";
import { db } from "../db.js";
import { symbolKey, type FileRefs } from "./extract.js";

interface SymRow {
  symbol_id: number;
  file_id: number;
  name: string;
  kind: string;
  parent: string | null;
  start_line: number;
  end_line: number;
}

interface FileRow {
  file_id: number;
  path: string;
  language: string;
  refs_json: string;
}

const JS_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts"];

/** Maps a module specifier to the repo files it refers to (empty for third-party modules). */
function resolveModule(from: FileRow, spec: string, byPath: Map<string, number>, allPaths: string[]): number[] {
  const tryPaths = (cands: string[]) => {
    for (const c of cands) {
      const id = byPath.get(path.normalize(c));
      if (id !== undefined) return [id];
    }
    return [];
  };
  const dir = path.dirname(from.path);
  switch (from.language) {
    case "javascript":
    case "typescript":
    case "tsx": {
      let base: string[];
      if (spec.startsWith(".")) base = [path.join(dir, spec)];
      else if (spec.startsWith("@/") || spec.startsWith("~/")) base = [spec.slice(2), `src/${spec.slice(2)}`];
      else return [];
      const cands: string[] = [];
      for (const b of base) {
        const noExt = b.replace(/\.(m|c)?js$/, "");
        cands.push(b, ...JS_EXTS.map((e) => noExt + e), ...JS_EXTS.map((e) => `${b}/index${e}`));
      }
      return tryPaths(cands);
    }
    case "python": {
      let rel: string;
      if (spec.startsWith(".")) {
        const dots = spec.match(/^\.+/)![0].length;
        let base = dir;
        for (let i = 1; i < dots; i++) base = path.dirname(base);
        rel = path.join(base, spec.slice(dots).replace(/\./g, "/"));
      } else rel = spec.replace(/\./g, "/");
      const roots = spec.startsWith(".") ? [""] : ["", "src/", "lib/"];
      return tryPaths(roots.flatMap((r) => [`${r}${rel}.py`, `${r}${rel}/__init__.py`]));
    }
    case "go": {
      // import "github.com/x/y/pkg/foo" -> every file in a directory ending in pkg/foo
      const parts = spec.split("/");
      for (let take = Math.min(parts.length, 4); take >= 1; take--) {
        const suffix = parts.slice(-take).join("/");
        const ids = allPaths
          .filter((p) => p.endsWith(".go") && (path.dirname(p) === suffix || path.dirname(p).endsWith(`/${suffix}`)))
          .map((p) => byPath.get(p)!);
        if (ids.length) return ids;
      }
      return [];
    }
    case "java": {
      const rel = `${spec.replace(/\./g, "/")}.java`;
      const hit = allPaths.find((p) => p === rel || p.endsWith(`/${rel}`));
      return hit ? [byPath.get(hit)!] : [];
    }
    default:
      return [];
  }
}

/** `ctx` ~ Context, `cmd` ~ Command, `request` ~ Request: exact, prefix, or ordered-letter abbreviation. */
function looksLikeInstanceOf(variable: string, className: string) {
  const v = variable.toLowerCase().replace(/^_+/, "");
  const c = className.toLowerCase();
  if (v.length < 3) return false;
  if (v === c || c.startsWith(v) || v.endsWith(c)) return true;
  if (v[0] !== c[0]) return false;
  let i = 0;
  for (const ch of c) if (ch === v[i]) i++;
  return i === v.length;
}

/** Rebuilds every edge for a repo from stored refs. Returns the number of edges written. */
export function resolveEdges(repoId: number): number {
  const files = db.prepare(`SELECT file_id, path, language, refs_json FROM files WHERE repo_id = ?`).all(repoId) as FileRow[];
  const syms = db
    .prepare(`SELECT symbol_id, file_id, name, kind, parent, start_line, end_line FROM symbols WHERE repo_id = ?`)
    .all(repoId) as SymRow[];

  const byPath = new Map(files.map((f) => [f.path, f.file_id]));
  const pathOf = new Map(files.map((f) => [f.file_id, f.path]));
  const allPaths = files.map((f) => f.path);
  const byKey = new Map<string, SymRow>(); // `${fileId}|name:line`
  const defsByName = new Map<string, SymRow[]>();
  const defsByFile = new Map<number, SymRow[]>();
  for (const s of syms) {
    byKey.set(`${s.file_id}|${symbolKey(s.name, s.start_line)}`, s);
    if (s.kind === "import") continue;
    const same = defsByName.get(s.name) ?? defsByName.set(s.name, []).get(s.name)!;
    // Python @overload stubs / TS overload signatures: keep only the real (longest) definition.
    const dup = same.findIndex((d) => d.file_id === s.file_id && d.parent === s.parent);
    if (dup >= 0) {
      if (s.end_line - s.start_line > same[dup].end_line - same[dup].start_line) same[dup] = s;
    } else same.push(s);
    (defsByFile.get(s.file_id) ?? defsByFile.set(s.file_id, []).get(s.file_id)!).push(s);
  }

  const edges: [number, number, string][] = [];
  for (const file of files) {
    const refs = JSON.parse(file.refs_json) as FileRefs;
    const importedFiles = new Set<number>();
    const importTargets = new Map<string, SymRow>(); // local name -> resolved definition
    const namespaces = new Map<string, number[]>(); // `import * as x` / `import pkg` -> files

    for (const imp of refs.imports) {
      const importSym = byKey.get(`${file.file_id}|${imp.symbol}`);
      if (!importSym) continue;
      const targets = resolveModule(file, imp.module, byPath, allPaths);
      targets.forEach((t) => importedFiles.add(t));
      const inTargets = (name: string) =>
        targets.flatMap((t) => defsByFile.get(t) ?? []).find((s) => s.name === name && !s.parent);
      let target: SymRow | undefined;
      if (imp.imported === "*") {
        if (targets.length) namespaces.set(importSym.name, targets);
      } else if (imp.imported === "default") {
        target = inTargets(importSym.name);
      } else {
        target = inTargets(imp.imported);
        // Python `from pkg import submodule` imports a module, not a symbol.
        if (!target && file.language === "python") {
          const sub = imp.module.endsWith(".") ? imp.module + imp.imported : `${imp.module}.${imp.imported}`;
          const subFiles = resolveModule(file, sub, byPath, allPaths);
          if (subFiles.length) {
            namespaces.set(importSym.name, subFiles);
            subFiles.forEach((t) => importedFiles.add(t));
          }
        }
        // Rust `use` paths aren't mapped to files; fall back to a repo-unique name.
        if (!target && file.language === "rust" && defsByName.get(imp.imported)?.length === 1) {
          target = defsByName.get(imp.imported)![0];
        }
      }
      if (target) {
        edges.push([importSym.symbol_id, target.symbol_id, "imports"]);
        importTargets.set(importSym.name, target);
      }
    }

    for (const call of refs.calls) {
      const from = byKey.get(`${file.file_id}|${call.from}`);
      if (!from) continue;
      const cands = defsByName.get(call.callee) ?? [];
      const q = call.qualifier;
      let target: SymRow | undefined;
      if (q === "this" || q === "self") {
        // own-class method first, then any method in the same file (inherited/mixin)
        target =
          cands.find((c) => c.file_id === file.file_id && c.parent === from.parent) ??
          cands.find((c) => c.file_id === file.file_id && c.kind === "method");
      } else if (q && namespaces.has(q)) {
        const ns = namespaces.get(q)!;
        target = cands.find((c) => ns.includes(c.file_id) && !c.parent);
      } else if (q) {
        // obj.method() on an object we can't type. Try, in order: a variable named after a class
        // (ctx -> Context, cmd -> Command), a method of a class this file imports, a unique
        // function in an imported file. Otherwise no edge: `x.update()` is usually a builtin.
        const byVarName = cands.filter((c) => c.parent && looksLikeInstanceOf(q, c.parent));
        const importedClasses = new Set([...importTargets.values()].filter((t) => t.kind === "class").map((t) => t.name));
        const viaClass = cands.filter((c) => c.parent && importedClasses.has(c.parent));
        const inImported = cands.filter((c) => importedFiles.has(c.file_id) && c.kind !== "method");
        target =
          byVarName.length === 1 ? byVarName[0]
          : viaClass.length === 1 ? viaClass[0]
          : inImported.length === 1 ? inImported[0]
          : undefined;
      } else {
        // Plain f(): same file, an explicit import, or (Go/Java-style packages) the same directory.
        const dir = path.dirname(file.path);
        const sameDir = cands.filter((c) => c.kind !== "method" && path.dirname(pathOf.get(c.file_id)!) === dir);
        target =
          importTargets.get(call.callee) ??
          cands.find((c) => c.file_id === file.file_id && c.kind !== "method") ??
          cands.find((c) => importedFiles.has(c.file_id) && !c.parent) ??
          (sameDir.length === 1 ? sameDir[0] : undefined);
      }
      if (target && target.symbol_id !== from.symbol_id) edges.push([from.symbol_id, target.symbol_id, "calls"]);
    }
  }

  const write = db.transaction(() => {
    db.prepare(`DELETE FROM edges WHERE repo_id = ?`).run(repoId);
    const ins = db.prepare(
      `INSERT OR IGNORE INTO edges (repo_id, from_symbol_id, to_symbol_id, edge_type) VALUES (?, ?, ?, ?)`,
    );
    for (const [a, b, t] of edges) ins.run(repoId, a, b, t);
  });
  write();
  return (db.prepare(`SELECT COUNT(*) AS n FROM edges WHERE repo_id = ?`).get(repoId) as { n: number }).n;
}
