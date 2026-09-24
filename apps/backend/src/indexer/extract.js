// Pass 1 of indexing: walk one file's syntax tree and collect its symbols plus the
// *unresolved* call and import references. Pass 2 (resolve.ts) turns references into
// edges once every file's symbols exist, so definition order across files never matters.

import { parserFor } from "./languages.js";

/** A symbol is identified across passes by name + start line within its file. */
export const symbolKey = (name, startLine) => `${name}:${startLine}`;

const firstLine = (n) => n.text.split("\n")[0].trim().slice(0, 200);
const stripQuotes = (s) => s.replace(/^[`'"]+|[`'"]+$/g, "");

function leadingComment(n) {
  // JS/TS `export function` puts the comment before the export_statement.
  const anchor = n.parent?.type === "export_statement" ? n.parent : n;
  const prev = anchor.previousNamedSibling;
  if (!prev || !/comment/.test(prev.type)) return null;
  if (anchor.startPosition.row - prev.endPosition.row > 1) return null;
  return cleanComment(prev.text);
}

function cleanComment(text) {
  return text
    .replace(/^\/\*\*?|\*\/$/g, "")
    .split("\n")
    .map((l) => l.replace(/^\s*(\/\/+|\*|#)\s?/, "").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 400);
}

function pythonDocstring(def) {
  const body = def.childForFieldName("body");
  const first = body?.namedChild(0);
  if (first?.type === "expression_statement" && first.namedChild(0)?.type === "string") {
    return first
      .namedChild(0)
      .text.replace(/^[rbuf]*("""|'''|"|')|("""|'''|"|')$/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400);
  }
  return null;
}

export async function extract(lang, source) {
  const parser = await parserFor(lang);
  const tree = parser.parse(source);
  const symbols = [];
  const refs = { calls: [], imports: [] };
  try {
    const add = (nameNode, node, kind, ctx, doc) => {
      const name = typeof nameNode === "string" ? nameNode : nameNode?.text;
      if (!name) return null;
      const sym = {
        name,
        kind,
        parent: kind === "method" ? ctx.className : null,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        signature: firstLine(node),
        docstring: doc === undefined ? leadingComment(node) : doc,
      };
      symbols.push(sym);
      return symbolKey(sym.name, sym.startLine);
    };
    const addCall = (callee, qualifier, ctx) => {
      if (callee && ctx.enclosing) refs.calls.push({ from: ctx.enclosing, callee, qualifier });
    };
    const addImport = (local, imported, module, node, ctx) => {
      const key = add(local, node, "import", ctx, null);
      if (key) refs.imports.push({ symbol: key, module, imported });
    };

    const visit = (node, ctx) => {
      const next = handlers[lang](node, ctx, { add, addCall, addImport });
      const childCtx = next ?? { ...ctx, topLevel: ctx.topLevel && isTransparent(node) };
      for (const child of node.namedChildren) visit(child, childCtx);
    };
    visit(tree.rootNode, { className: null, enclosing: null, topLevel: true });
  } finally {
    tree.delete();
    parser.delete();
  }
  return { symbols, refs };
}

/** Wrapper nodes that don't end "top level" (program, export statements, decorators, ...). */
function isTransparent(n) {
  return (
    /^(program|module|source_file|export_statement|decorated_definition|expression_statement|lexical_declaration|variable_declaration|class_body|block|declaration_list)$/.test(
      n.type,
    ) || n.parent === null
  );
}

/** Each handler inspects one node; returning a Ctx means "children run inside this definition". */

const field = (n, f) => n.childForFieldName(f);

const jsLike = (n, ctx, e) => {
  switch (n.type) {
    case "function_declaration":
    case "generator_function_declaration": {
      const key = e.add(field(n, "name"), n, "function", ctx);
      return { ...ctx, enclosing: key ?? ctx.enclosing, topLevel: false };
    }
    case "class_declaration":
    case "abstract_class_declaration":
    case "interface_declaration":
    case "enum_declaration": {
      const name = field(n, "name");
      const key = e.add(name, n, "class", ctx);
      return { className: name?.text ?? null, enclosing: key ?? ctx.enclosing, topLevel: false };
    }
    case "method_definition":
    case "abstract_method_signature": {
      const key = e.add(field(n, "name"), n, "method", ctx);
      return { ...ctx, enclosing: key ?? ctx.enclosing, topLevel: false };
    }
    case "public_field_definition": {
      const value = field(n, "value");
      if (value && /arrow_function|function/.test(value.type)) {
        const key = e.add(field(n, "name") ?? field(n, "property"), n, "method", ctx);
        return { ...ctx, enclosing: key ?? ctx.enclosing, topLevel: false };
      }
      return;
    }
    case "variable_declarator": {
      const name = field(n, "name");
      const value = field(n, "value");
      if (name?.type !== "identifier") return;
      if (value && /^(arrow_function|function_expression|function|generator_function)$/.test(value.type)) {
        const decl = n.parent ?? n;
        const key = e.add(name, decl, "function", ctx);
        return { ...ctx, enclosing: key ?? ctx.enclosing, topLevel: false };
      }
      if (ctx.topLevel) e.add(name, n.parent ?? n, "variable", ctx);
      return;
    }
    case "type_alias_declaration":
      if (ctx.topLevel) e.add(field(n, "name"), n, "variable", ctx);
      return;
    case "import_statement": {
      const source = field(n, "source");
      if (!source) return;
      const module = stripQuotes(source.text);
      const clause = n.namedChildren.find((c) => c.type === "import_clause");
      if (!clause) return;
      for (const part of clause.namedChildren) {
        if (part.type === "identifier") e.addImport(part.text, "default", module, n, ctx);
        else if (part.type === "namespace_import") {
          const id = part.namedChildren.find((c) => c.type === "identifier");
          if (id) e.addImport(id.text, "*", module, n, ctx);
        } else if (part.type === "named_imports") {
          for (const spec of part.namedChildren.filter((c) => c.type === "import_specifier")) {
            const imported = field(spec, "name")?.text;
            const local = field(spec, "alias")?.text ?? imported;
            if (imported && local) e.addImport(local, imported, module, n, ctx);
          }
        }
      }
      return;
    }
    case "call_expression": {
      const fn = field(n, "function");
      if (fn?.type === "identifier") e.addCall(fn.text, null, ctx);
      else if (fn?.type === "member_expression") {
        const obj = field(fn, "object");
        e.addCall(
          field(fn, "property")?.text,
          obj?.type === "this" ? "this" : obj?.type === "identifier" ? obj.text : null,
          ctx,
        );
      }
      return;
    }
    case "new_expression": {
      const c = field(n, "constructor");
      if (c?.type === "identifier") e.addCall(c.text, null, ctx);
      return;
    }
  }
};

const python = (n, ctx, e) => {
  switch (n.type) {
    case "function_definition": {
      const key = e.add(field(n, "name"), n, ctx.className ? "method" : "function", ctx, pythonDocstring(n));
      return { ...ctx, className: null, enclosing: key ?? ctx.enclosing, topLevel: false };
    }
    case "class_definition": {
      const name = field(n, "name");
      const key = e.add(name, n, "class", ctx, pythonDocstring(n));
      return { className: name?.text ?? null, enclosing: key ?? ctx.enclosing, topLevel: false };
    }
    case "assignment": {
      const left = field(n, "left");
      if (ctx.topLevel && left?.type === "identifier") e.add(left, n, "variable", ctx, null);
      return;
    }
    case "import_statement":
      for (const c of n.namedChildren) {
        if (c.type === "dotted_name") e.addImport(c.text.split(".").pop(), "*", c.text, n, ctx);
        else if (c.type === "aliased_import") {
          const mod = field(c, "name")?.text;
          const alias = field(c, "alias")?.text;
          if (mod && alias) e.addImport(alias, "*", mod, n, ctx);
        }
      }
      return;
    case "import_from_statement": {
      const module = field(n, "module_name")?.text;
      if (!module) return;
      for (const c of n.namedChildren.slice(1)) {
        if (c.type === "dotted_name") e.addImport(c.text, c.text, module, n, ctx);
        else if (c.type === "aliased_import") {
          const name = field(c, "name")?.text;
          const alias = field(c, "alias")?.text;
          if (name && alias) e.addImport(alias, name, module, n, ctx);
        }
      }
      return;
    }
    case "call": {
      const fn = field(n, "function");
      if (fn?.type === "identifier") e.addCall(fn.text, null, ctx);
      else if (fn?.type === "attribute") {
        const obj = field(fn, "object");
        e.addCall(field(fn, "attribute")?.text, obj?.type === "identifier" ? obj.text : null, ctx);
      }
      return;
    }
  }
};

const go = (n, ctx, e) => {
  switch (n.type) {
    case "function_declaration": {
      const key = e.add(field(n, "name"), n, "function", ctx);
      return { ...ctx, enclosing: key ?? ctx.enclosing, topLevel: false };
    }
    case "method_declaration": {
      const recv = field(n, "receiver")?.text.match(/\*?\s*([A-Za-z_]\w*)\s*\)$/)?.[1] ?? null;
      const key = e.add(field(n, "name"), n, "method", { ...ctx, className: recv });
      return { ...ctx, className: recv, enclosing: key ?? ctx.enclosing, topLevel: false };
    }
    case "type_spec":
      e.add(field(n, "name"), n, "class", ctx);
      return;
    case "import_spec": {
      const p = field(n, "path");
      if (!p) return;
      const module = stripQuotes(p.text);
      e.addImport(field(n, "name")?.text ?? module.split("/").pop(), "*", module, n, ctx);
      return;
    }
    case "call_expression": {
      const fn = field(n, "function");
      if (fn?.type === "identifier") e.addCall(fn.text, null, ctx);
      else if (fn?.type === "selector_expression") {
        const obj = field(fn, "operand");
        e.addCall(field(fn, "field")?.text, obj?.type === "identifier" ? obj.text : null, ctx);
      }
      return;
    }
  }
};

const rust = (n, ctx, e) => {
  switch (n.type) {
    case "function_item": {
      const key = e.add(field(n, "name"), n, ctx.className ? "method" : "function", ctx);
      return { ...ctx, enclosing: key ?? ctx.enclosing, topLevel: false };
    }
    case "struct_item":
    case "enum_item":
    case "trait_item": {
      const name = field(n, "name");
      const key = e.add(name, n, "class", ctx);
      return { className: name?.text ?? null, enclosing: key ?? ctx.enclosing, topLevel: false };
    }
    case "impl_item": {
      const type = field(n, "type")?.text.replace(/<.*$/, "") ?? null;
      return { ...ctx, className: type, topLevel: false };
    }
    case "use_declaration": {
      // use a::b::{C, D as E};  |  use a::b::C;
      const arg = field(n, "argument")?.text ?? "";
      const brace = arg.indexOf("{");
      const module = brace >= 0 ? arg.slice(0, brace).replace(/::$/, "") : arg.split("::").slice(0, -1).join("::");
      const items = brace >= 0 ? arg.slice(brace + 1, arg.lastIndexOf("}")).split(",") : [arg];
      for (const item of items) {
        const [path, alias] = item.trim().split(/\s+as\s+/);
        const imported = path?.split("::").pop()?.trim();
        if (imported && /^\w+$/.test(imported)) e.addImport(alias?.trim() || imported, imported, module, n, ctx);
      }
      return;
    }
    case "call_expression": {
      const fn = field(n, "function");
      if (fn?.type === "identifier") e.addCall(fn.text, null, ctx);
      else if (fn?.type === "field_expression") {
        const obj = field(fn, "value");
        e.addCall(field(fn, "field")?.text, obj?.type === "self" ? "self" : null, ctx);
      } else if (fn?.type === "scoped_identifier")
        e.addCall(field(fn, "name")?.text, field(fn, "path")?.text ?? null, ctx);
      return;
    }
  }
};

const java = (n, ctx, e) => {
  switch (n.type) {
    case "class_declaration":
    case "interface_declaration":
    case "enum_declaration":
    case "record_declaration": {
      const name = field(n, "name");
      const key = e.add(name, n, "class", ctx);
      return { className: name?.text ?? null, enclosing: key ?? ctx.enclosing, topLevel: false };
    }
    case "method_declaration":
    case "constructor_declaration": {
      const key = e.add(field(n, "name"), n, "method", ctx);
      return { ...ctx, enclosing: key ?? ctx.enclosing, topLevel: false };
    }
    case "import_declaration": {
      const path = n.namedChildren.find((c) => /identifier/.test(c.type))?.text;
      if (path) e.addImport(path.split(".").pop(), path.split(".").pop(), path, n, ctx);
      return;
    }
    case "method_invocation": {
      const obj = field(n, "object");
      e.addCall(
        field(n, "name")?.text,
        obj?.type === "this" ? "this" : obj?.type === "identifier" ? obj.text : null,
        ctx,
      );
      return;
    }
    case "object_creation_expression":
      e.addCall(field(n, "type")?.text.replace(/<.*$/, ""), null, ctx);
      return;
  }
};

const handlers = {
  javascript: jsLike,
  typescript: jsLike,
  tsx: jsLike,
  python,
  go,
  rust,
  java,
};
