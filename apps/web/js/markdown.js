// Minimal Markdown -> DOM renderer for chat answers (replaces react-markdown).
// Builds nodes directly and never parses HTML, so answer text can't inject markup.
// Supports: # headings, paragraphs, > quotes, - / 1. lists, ``` fences, `code`, **bold**,
// *italic* / _italic_, and [links](https://...).
import { h } from "./dom.js";

// `_` only opens/closes emphasis at word edges (as in CommonMark), so ANTHROPIC_API_KEY stays literal.
const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|(?<![A-Za-z0-9])_\S(?:.*?\S)?_(?![A-Za-z0-9]))|(\[[^\]]+\]\([^)\s]+\))/g;

function inline(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (m[1]) out.push(h("code", null, tok.slice(1, -1)));
    else if (m[2]) out.push(h("strong", null, inline(tok.slice(2, -2))));
    else if (m[3]) out.push(h("em", null, inline(tok.slice(1, -1))));
    else {
      const [, label, href] = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      out.push(/^https?:\/\//i.test(href) ? h("a", { href, target: "_blank", rel: "noreferrer" }, label) : label);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderMarkdown(md) {
  const root = h("div", { class: "markdown" });
  const lines = String(md ?? "").replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++; // closing fence
      root.append(h("pre", null, h("code", { class: fence[1] ? `language-${fence[1]}` : null }, body.join("\n"))));
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      root.append(h(`h${Math.min(6, heading[1].length + 1)}`, null, inline(heading[2])));
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ""));
      root.append(h("blockquote", null, h("p", null, inline(body.join(" ")))));
      continue;
    }
    const bullet = /^\s*[-*+]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const re = ordered ? numbered : bullet;
      const items = [];
      while (i < lines.length && (re.test(lines[i]) || (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length))) {
        if (re.test(lines[i])) items.push(lines[i].replace(re, ""));
        else items[items.length - 1] += ` ${lines[i].trim()}`;
        i++;
      }
      root.append(h(ordered ? "ol" : "ul", null, items.map((t) => h("li", null, inline(t)))));
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,6}\s|>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]); // never stall on a line no rule above consumed
    root.append(h("p", null, inline(para.join(" "))));
  }
  return root;
}
