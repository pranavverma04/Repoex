// "Tech stack" tab: language bar with hover tips, then one card of tools per category.
import { h } from "../dom.js";
import { LANG_COLORS, reveal } from "../ui.js";
import { grow } from "./grow.js";

export function stackSection(r) {
  const langs = r.stack.languages;
  const top = langs.slice(0, 5);
  const rest = langs.slice(5).reduce((a, l) => a + l.pct, 0);
  const segs = [
    ...top.map((l, i) => ({ name: l.name, pct: l.pct, color: LANG_COLORS[i] })),
    ...(rest > 0.05 ? [{ name: "Other", pct: rest, color: "var(--s-other)" }] : []),
  ];
  const tools = r.stack.groups.reduce((n, g) => n + g.items.length, 0);

  return h(
    "section",
    { id: "stack", class: "rp-section", "aria-labelledby": "stack-h" },
    reveal(
      h(
        "div",
        null,
        h(
          "div",
          { class: "sec-head" },
          h("h2", { id: "stack-h" }, "Tech stack"),
          h(
            "p",
            { class: "sec-note" },
            `${tools} tools recognised`,
            r.stack.otherDependencies ? `, plus ${r.stack.otherDependencies} other dependencies` : "",
            ". Each one names the file it was found in.",
          ),
        ),
      ),
    ),
    segs.length > 0 && languages(segs),
    h(
      "div",
      { class: "stack-grid" },
      r.stack.groups.map((g, gi) =>
        reveal(
          h(
            "div",
            { class: "card stack-card" },
            h("h3", { class: "sub-h" }, g.category),
            h(
              "ul",
              { class: "chips" },
              g.items.map((it, i) =>
                chipIn(
                  h(
                    "li",
                    { class: it.dev ? "chip-dev" : "", title: `Found in ${it.source}${it.dev ? " (development only)" : ""}` },
                    h("span", { class: "chip-name" }, it.name),
                    it.version && h("span", { class: "chip-ver" }, it.version),
                    it.dev && h("span", { class: "chip-flag" }, "dev"),
                  ),
                  0.15 + i * 0.035,
                ),
              ),
            ),
          ),
          { delay: (gi % 3) * 0.06 },
        ),
      ),
      r.stack.packageManagers.length > 0 &&
        reveal(
          h(
            "div",
            { class: "card stack-card pm-card" },
            h("h3", { class: "sub-h" }, "Package managers"),
            h(
              "ul",
              { class: "chips" },
              r.stack.packageManagers.map((p) => h("li", null, h("span", { class: "chip-name" }, p))),
            ),
          ),
        ),
    ),
  );
}

/** Chips pop in (fade + scale + lift) when their card scrolls into view. */
function chipIn(li, delay) {
  return grow(li, { opacity: 0, transform: "translateY(6px) scale(0.9)" }, { opacity: 1, transform: "none" }, { duration: 0.45, delay });
}

function languages(segs) {
  const segEls = [];
  const legendEls = [];
  const tips = [];
  const setHover = (idx) => {
    segEls.forEach((el, i) => {
      el.classList.toggle("dim", idx !== null && idx !== i);
      tips[i]?.remove();
      tips[i] = null;
      if (idx === i) {
        tips[i] = h("span", { class: "tip enter fade", style: { "--dur": "0.2s" } }, h("b", null, segs[i].name), ` ${segs[i].pct.toFixed(1)}%`);
        el.append(tips[i]);
      }
    });
    legendEls.forEach((el, i) => el.classList.toggle("dim", idx !== null && idx !== i));
  };

  const bar = h(
    "div",
    {
      class: "lang-bar",
      role: "img",
      "aria-label": segs.map((s) => `${s.name} ${s.pct.toFixed(1)}%`).join(", "),
      onmouseleave: () => setHover(null),
    },
    segs.map((s, i) => {
      const el = h("span", {
        class: "lang-seg",
        style: { background: s.color },
        tabindex: 0,
        "aria-label": `${s.name} ${s.pct.toFixed(1)}%`,
        onmouseenter: () => setHover(i),
        onfocus: () => setHover(i),
      });
      segEls.push(el);
      return grow(el, { flexGrow: 0.0001 }, { flexGrow: Math.max(s.pct, 0.6) }, { duration: 1.1, delay: 0.1 + i * 0.08 });
    }),
  );

  return reveal(
    h(
      "div",
      { class: "card lang-card" },
      h("h3", { class: "sub-h" }, "Languages"),
      bar,
      h(
        "ul",
        { class: "legend" },
        segs.map((s, i) => {
          const li = h(
            "li",
            { onmouseenter: () => setHover(i), onmouseleave: () => setHover(null) },
            h("span", { class: "swatch", style: { background: s.color }, "aria-hidden": "true" }),
            h("span", { class: "lg-name" }, s.name),
            h("span", { class: "lg-val" }, `${s.pct < 0.1 ? "<0.1" : s.pct.toFixed(1)}%`),
          );
          legendEls.push(li);
          return li;
        }),
      ),
    ),
  );
}
