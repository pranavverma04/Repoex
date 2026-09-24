// Shared UI pieces: icons, animated headline, scroll reveal, count-up numbers, copy button,
// and small formatters. Plain-JS versions of what components/explain/ui.tsx did in React.
import { h, reducedMotion } from "./dom.js";

const PATHS = {
  star: "M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z",
  fork: "M7 4.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 15.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8.5v1.5a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V8.5M12 13v2.5",
  issue: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z",
  pr: "M6 4.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 11a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm12 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 8.5v7M18 15.5V9a3 3 0 0 0-3-3h-4m0 0l2.5-2.5M11 6l2.5 2.5",
  commit: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM3 12h5.5M15.5 12H21",
  people: "M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11zm-6 8.5c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5M16 5a3 3 0 0 1 0 6M18 14.3c1.8.7 3 2.5 3 4.7",
  github: "M12 3a9 9 0 0 0-2.85 17.54c.45.08.62-.2.62-.44v-1.55c-2.5.54-3.03-1.2-3.03-1.2-.41-1.04-1-1.32-1-1.32-.82-.56.06-.55.06-.55.9.06 1.38.93 1.38.93.8 1.38 2.1.98 2.62.75.08-.58.31-.98.57-1.2-2-.23-4.1-1-4.1-4.45 0-.98.35-1.79.93-2.42-.1-.23-.4-1.14.08-2.38 0 0 .76-.24 2.48.93a8.6 8.6 0 0 1 4.5 0c1.72-1.17 2.48-.93 2.48-.93.49 1.24.18 2.15.09 2.38.58.63.93 1.44.93 2.42 0 3.46-2.1 4.22-4.11 4.44.32.28.61.83.61 1.67v2.48c0 .24.16.52.62.43A9 9 0 0 0 12 3z",
  download: "M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14",
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
  print: "M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7z",
  chat: "M4.5 5.5h15v10h-8l-4.5 4v-4h-2.5z",
  refresh: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4",
  folder: "M3.5 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z",
  file: "M6.5 3.5h7l4 4v13h-11zM13.5 3.5v4h4",
  chevron: "M9 6l6 6-6 6",
  arrow: "M5 12h14m0 0l-5.5-5.5M19 12l-5.5 5.5",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M6.3 17.7l2.8-2.8M14.9 9.1l2.8-2.8",
  play: "M8 5.5v13l10.5-6.5z",
  tag: "M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-6.9 6.9a1 1 0 0 1-1.4 0zM8 8h.01",
  clock: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2",
  scale: "M12 4v16M5 20h14M6 8l-3 6a3 3 0 0 0 6 0zM18 8l-3 6a3 3 0 0 0 6 0zM6 8h12",
  check: "M5 12.5l4.2 4.2L19 7",
  terminal: "M4 5.5h16v13H4zM7.5 9.5l3 2.5-3 2.5M12.5 15h4",
  browser: "M3.5 6.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM3.5 9h17M6.5 6.8h.01M9 6.8h.01",
};

/** Inline SVG icon. `name` is a key of PATHS. */
export function icon(name, size = 16, className) {
  const filled = name === "github" || name === "play";
  return h(
    "svg",
    { viewBox: "0 0 24 24", width: size, height: size, class: className, "aria-hidden": "true" },
    h("path", {
      d: PATHS[name] ?? "",
      fill: filled ? "currentColor" : "none",
      stroke: filled ? "none" : "currentColor",
      "stroke-width": "1.7",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );
}

/** Headline that resolves word by word from blur to sharp. *Wrapped* words get the emphasis style. */
export function splitText(text, { tag = "h1", className, delay = 0 } = {}) {
  let em = false;
  const words = text.split(" ").map((raw) => {
    if (raw.startsWith("*")) em = true;
    const word = { w: raw.replace(/\*/g, ""), em };
    if (raw.endsWith("*")) em = false;
    return word;
  });
  return h(
    tag,
    { class: className, "aria-label": text.replace(/\*/g, "") },
    words.map(({ w, em: isEm }, i) =>
      h(
        "span",
        { "aria-hidden": "true", class: isEm ? "word em" : "word", style: { "--delay": `${delay + i * 0.06}s` } },
        w + (i < words.length - 1 ? " " : ""),
      ),
    ),
  );
}

let observer = null;
/** Fades and lifts `el` in the first time it scrolls into view. Returns `el`. */
export function reveal(el, { delay = 0, y = 22 } = {}) {
  el.classList.add("reveal");
  el.style.setProperty("--delay", `${delay}s`);
  el.style.setProperty("--y", `${y}px`);
  if (reducedMotion() || !("IntersectionObserver" in window)) {
    el.classList.add("in");
    return el;
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          observer.unobserve(e.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  observer.observe(el);
  return el;
}

/** Adds the one-shot entrance animation to `el` (see motion.css). Returns `el`. */
export function enter(el, { delay = 0, y, blur = false, kind } = {}) {
  el.classList.add("enter");
  if (blur) el.classList.add("blur");
  if (kind) el.classList.add(kind);
  if (delay) el.style.setProperty("--delay", `${delay}s`);
  if (y !== undefined) el.style.setProperty("--y", typeof y === "number" ? `${y}px` : y);
  return el;
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/** Number that counts up once it scrolls into view. */
export function countUp(value, { format = (n) => Math.round(n).toLocaleString(), className } = {}) {
  const el = h("span", { class: className }, format(reducedMotion() ? value : 0));
  if (reducedMotion() || !("IntersectionObserver" in window)) {
    el.textContent = format(value);
    return el;
  }
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    const duration = Math.min(1800, 600 + Math.log10(Math.max(10, value)) * 300);
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = format(value * easeOut(t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  io.observe(el);
  return el;
}

/** Button that copies `text` (or the result of calling it) to the clipboard. */
export function copyButton(text, label = "Copy") {
  const idle = () => [
    h(
      "svg",
      { viewBox: "0 0 24 24", width: 15, height: 15, "aria-hidden": "true" },
      h("rect", { x: "8.5", y: "8.5", width: "11", height: "11", rx: "2.5", fill: "none", stroke: "currentColor", "stroke-width": "1.7" }),
      h("path", { d: "M15.5 8.5V6.5A2 2 0 0 0 13.5 4.5h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2", fill: "none", stroke: "currentColor", "stroke-width": "1.7" }),
    ),
    h("span", null, label),
  ];
  const done = () => [
    h(
      "svg",
      { viewBox: "0 0 24 24", width: 15, height: 15, "aria-hidden": "true" },
      h("path", { d: "M5 12.5l4.2 4.2L19 7", fill: "none", stroke: "currentColor", "stroke-width": "2.2", "stroke-linecap": "round", "stroke-linejoin": "round", class: "draw" }),
    ),
    h("span", null, "Copied"),
  ];
  const btn = h("button", { type: "button", class: "copy", "aria-label": label }, idle());
  let timer = 0;
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
      btn.classList.add("done");
      btn.setAttribute("aria-label", "Copied");
      btn.replaceChildren(...done());
      clearTimeout(timer);
      timer = setTimeout(() => {
        btn.classList.remove("done");
        btn.setAttribute("aria-label", label);
        btn.replaceChildren(...idle());
      }, 1600);
    } catch {}
  });
  return btn;
}

/** Short-lived message at the bottom of the screen. */
export function toast(message, ms = 4200) {
  const el = h("div", { class: "toast enter", role: "status", style: { "--y": "20px" } }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

export const TYPE_META = {
  feature: { label: "Feature", color: "var(--s1)" },
  fix: { label: "Fix", color: "var(--s2)" },
  refactor: { label: "Improvement", color: "var(--s3)" },
  docs: { label: "Docs", color: "var(--s4)" },
  tests: { label: "Tests", color: "var(--s5)" },
  maintenance: { label: "Maintenance", color: "var(--s6)" },
  other: { label: "Other", color: "var(--s-other)" },
};

export const LANG_COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];

export function ago(iso) {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30.4);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export const compact = (n) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
    : n >= 10_000
      ? `${Math.round(n / 1000)}k`
      : n >= 1000
        ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`
        : String(Math.round(n));

export function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
