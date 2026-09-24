// Tiny DOM helpers used by every page. Components are plain functions that return elements.
//
//   h("button", { class: "ghost", onclick: go, disabled: busy }, "Refresh")
//   h("ul", null, items.map((i) => h("li", null, i.name)))
//
// Props: `class`/`className`, `style` (string or object; "--vars" work), `dataset` (object),
// `on<event>` handlers, booleans (true = attribute present), anything else as an attribute.
// Children: strings/numbers (as text, never HTML), nodes, arrays, and null/false/undefined (skipped).

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set(["svg", "path", "circle", "rect", "g", "line", "polyline", "polygon", "text", "defs", "linearGradient", "stop", "title", "ellipse"]);

export function h(tag, props, ...children) {
  const svg = SVG_TAGS.has(tag);
  const el = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    // aria-* states are strings: `aria-selected: false` must render as "false", like React does
    if (value === false && key.startsWith("aria-")) {
      el.setAttribute(key, "false");
      continue;
    }
    if (value === undefined || value === null || value === false) continue;
    if (key === "class" || key === "className") el.setAttribute("class", value);
    else if (key === "style") {
      if (typeof value === "string") el.setAttribute("style", value);
      else for (const [k, v] of Object.entries(value)) if (v !== undefined && v !== null) el.style.setProperty(k.startsWith("--") ? k : k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), String(v));
    } else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "ref" && typeof value === "function") value(el);
    else if (!svg && (key === "value" || key === "checked" || key === "selected")) el[key] = value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  append(el, children);
  return el;
}

/** Appends children with the same rules as h(). */
export function append(parent, children) {
  for (const child of [children].flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

/** Replaces all children of `el`. */
export function render(el, ...children) {
  el.replaceChildren();
  return append(el, children);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** A DocumentFragment, for returning several siblings from one component. */
export const frag = (...children) => append(document.createDocumentFragment(), children);

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Page URL parts: /r/12 -> pathId() === 12 */
export const pathId = () => Number(location.pathname.split("/").filter(Boolean).pop());
