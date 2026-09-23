import { createRequire } from "node:module";
import Parser from "web-tree-sitter";

export type Language = "javascript" | "typescript" | "tsx" | "python" | "go" | "rust" | "java";

const EXT: Record<string, Language> = {
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".ts": "typescript", ".mts": "typescript", ".cts": "typescript",
  ".tsx": "tsx",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
};

export function languageForPath(p: string): Language | null {
  const dot = p.lastIndexOf(".");
  if (dot < 0) return null;
  return EXT[p.slice(dot).toLowerCase()] ?? null;
}

const require = createRequire(import.meta.url);
let initPromise: Promise<void> | null = null;
const loaded = new Map<Language, Parser.Language>();

/** Lazily loads the tree-sitter WASM grammar for a language and returns a parser for it. */
export async function parserFor(lang: Language): Promise<Parser> {
  initPromise ??= Parser.init();
  await initPromise;
  let grammar = loaded.get(lang);
  if (!grammar) {
    grammar = await Parser.Language.load(require.resolve(`tree-sitter-wasms/out/tree-sitter-${lang}.wasm`));
    loaded.set(lang, grammar);
  }
  const parser = new Parser();
  parser.setLanguage(grammar);
  return parser;
}
