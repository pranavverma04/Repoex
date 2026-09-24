import { h } from "../dom.js";

const REASON = {
  exact: "name match",
  partial: "partial name",
  path: "path match",
  content: "mentioned in body",
  caller: "caller",
  callee: "callee",
  import: "import",
};

/** Collapsible list of the symbols an answer was built from, each with its source snippet. */
export function sourceList(sources) {
  if (!sources.length) return null;
  return h(
    "details",
    { class: "sources" },
    h("summary", null, "Sources used ", h("span", { class: "count" }, sources.length)),
    h(
      "ul",
      null,
      sources.map((s) =>
        h(
          "li",
          null,
          h(
            "details",
            null,
            h(
              "summary",
              null,
              h("code", { class: "sym" }, s.name),
              h("span", { class: "kind" }, s.kind),
              h("span", { class: "loc" }, `${s.path}:${s.startLine}–${s.endLine}`),
              h("span", { class: "why" }, REASON[s.reason], s.via ? ` of ${s.via}` : ""),
            ),
            h("pre", null, h("code", null, s.snippet)),
          ),
        ),
      ),
    ),
  );
}
