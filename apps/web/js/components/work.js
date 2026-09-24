// "Work done" tab: weekly activity chart, work-type breakdown, month-by-month timeline,
// contributors, most-changed areas/files and releases.
import { frag, h, reducedMotion, render } from "../dom.js";
import { TYPE_META, ago, countUp, icon, monthLabel, reveal } from "../ui.js";
import { grow } from "./grow.js";

function activity(weekly) {
  let hover = null;
  let W = 640;
  let measured = false; // bars animate on the first draw at the real width, not on later resizes
  const H = 210;
  const pad = { l: 30, r: 4, t: 16, b: 24 };
  const max = Math.max(1, ...weekly.map((w) => w.count));
  const n = weekly.length;
  const total = weekly.reduce((a, w) => a + w.count, 0);
  const fmt = (d) =>
    new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);

  const box = h("div", { class: "activity", onmouseleave: () => setHover(null) });
  let bars = [];
  let tip = null;
  let step = 0;

  function setHover(i) {
    hover = i;
    bars.forEach((b, j) => {
      if (!b) return;
      b.classList.toggle("on", hover === j);
      b.classList.toggle("dim", hover !== null && hover !== j);
    });
    tip?.remove();
    tip = null;
    if (hover === null) return;
    const w = weekly[hover];
    tip = h(
      "div",
      { class: "act-tip", style: { left: `${((pad.l + hover * step + step / 2) / W) * 100}%` } },
      h("b", null, w.count),
      ` commit${w.count === 1 ? "" : "s"}`,
      h("span", null, `week of ${fmt(w.week)}`),
    );
    box.append(tip);
  }

  // draw at the container's real pixel width so text and bar radii stay crisp
  function draw(animate) {
    step = (W - pad.l - pad.r) / Math.max(n, 1);
    const bw = Math.max(2, step - 2); // 2px surface gap between adjacent bars
    bars = [];
    const svg = h(
      "svg",
      {
        viewBox: `0 0 ${W} ${H}`,
        width: W,
        height: H,
        class: "act-svg",
        role: "img",
        "aria-label": `Commits per week over ${n} weeks, ${total} in total, peak ${max}`,
      },
      h("line", { x1: pad.l, x2: W - pad.r, y1: y(max), y2: y(max), class: "grid" }),
      h("line", { x1: pad.l, x2: W - pad.r, y1: y(0), y2: y(0), class: "axis" }),
      h("text", { x: pad.l - 6, y: y(max) + 4, class: "tick", "text-anchor": "end" }, max),
      h("text", { x: pad.l - 6, y: y(0) + 4, class: "tick", "text-anchor": "end" }, "0"),
      weekly.map((w, i) => {
        const x = pad.l + i * step + 1;
        const top = y(w.count);
        const hgt = y(0) - top;
        const r = Math.min(4, bw / 2, hgt);
        let bar = null;
        if (w.count > 0) {
          bar = h("path", {
            d: `M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y(0)} Z`,
            class: `bar${hover === i ? " on" : ""}${hover !== null && hover !== i ? " dim" : ""}`,
            style: { transformOrigin: `0px ${y(0)}px` },
          });
          // bars rise once, the first time the chart is seen; redraws on resize skip it
          if (animate) {
            grow(bar, { transform: "scaleY(0)" }, { transform: "scaleY(1)" }, { duration: 0.7, delay: 0.1 + (i / n) * 0.6 });
          }
        }
        bars.push(bar);
        // hit target covers the full column, bigger than the mark
        return h(
          "g",
          null,
          bar,
          h("rect", {
            x: pad.l + i * step,
            y: pad.t,
            width: step,
            height: H - pad.t - pad.b,
            fill: "transparent",
            tabindex: "-1",
            onmouseenter: () => setHover(i),
            onfocus: () => setHover(i),
          }),
        );
      }),
      n > 0 && [
        h("text", { x: pad.l, y: H - 6, class: "tick" }, fmt(weekly[0].week)),
        h("text", { x: W - pad.r, y: H - 6, class: "tick", "text-anchor": "end" }, fmt(weekly[n - 1].week)),
      ],
    );
    render(box, svg);
    if (hover !== null) setHover(hover);
  }

  draw(true);
  const ro = new ResizeObserver(([e]) => {
    const next = Math.max(260, Math.round(e.contentRect.width));
    if (next !== W || !measured) {
      W = next;
      draw(!measured);
      measured = true;
    }
  });
  ro.observe(box);
  return box;
}

function typeBar(byType, total) {
  const segs = [];
  const items = [];
  const setHover = (type) => {
    byType.forEach((t, i) => {
      const dim = !!type && type !== t.type;
      segs[i].classList.toggle("dim", dim);
      items[i].classList.toggle("dim", dim);
    });
  };
  return h(
    "div",
    { class: "typebar-wrap" },
    h(
      "div",
      {
        class: "typebar",
        role: "img",
        "aria-label": byType.map((t) => `${TYPE_META[t.type].label} ${t.count}`).join(", "),
        onmouseleave: () => setHover(null),
      },
      byType.map((t, i) => {
        const seg = h("span", { style: { background: TYPE_META[t.type].color }, onmouseenter: () => setHover(t.type) });
        segs.push(seg);
        return grow(seg, { flexGrow: 0.0001 }, { flexGrow: t.count }, { duration: 1, delay: 0.1 + i * 0.07 });
      }),
    ),
    h(
      "ul",
      { class: "legend" },
      byType.map((t) => {
        const li = h(
          "li",
          { onmouseenter: () => setHover(t.type), onmouseleave: () => setHover(null) },
          h("span", { class: "swatch", style: { background: TYPE_META[t.type].color }, "aria-hidden": "true" }),
          h("span", { class: "lg-name" }, TYPE_META[t.type].label),
          h("span", { class: "lg-val" }, `${t.count} · ${Math.round((t.count / Math.max(total, 1)) * 100)}%`),
        );
        items.push(li);
        return li;
      }),
    ),
  );
}

function typeBadge(type) {
  return h(
    "span",
    { class: "type-badge" },
    h("span", { class: "swatch", style: { background: TYPE_META[type].color }, "aria-hidden": "true" }),
    TYPE_META[type].label,
  );
}

/** Month list whose rail fills as it scrolls (offset: "start 75%" -> "end 60%"). */
function timeline(r) {
  let showAll = false;
  const fill = h("span", { class: "tl-rail-fill", style: { transform: reducedMotion() ? "scaleY(1)" : "scaleY(0)" } });
  const list = h("ol", { class: "timeline" });

  const month = (m, i) =>
    reveal(
      h(
        "li",
        { class: "tl-month" },
        h("span", { class: "tl-node", "aria-hidden": "true" }),
        h(
          "div",
          { class: "tl-head" },
          h("h4", null, monthLabel(m.month)),
          h("span", { class: "tl-count" }, `${m.count} commit${m.count === 1 ? "" : "s"}`),
          h(
            "span",
            { class: "tl-mini", "aria-hidden": "true" },
            Object.entries(m.byType).map(([t, c]) => h("span", { style: { flexGrow: c, background: TYPE_META[t].color } })),
          ),
        ),
        h(
          "ul",
          { class: "tl-commits" },
          m.highlights.map((c) =>
            h(
              "li",
              null,
              typeBadge(c.type),
              h("a", { href: `${r.repo.url}/commit/${c.sha}`, target: "_blank", rel: "noreferrer", class: "tl-msg" }, c.message),
              h(
                "span",
                { class: "tl-by" },
                `${c.author} · ${new Date(c.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
              ),
            ),
          ),
        ),
      ),
      { delay: Math.min(i, 3) * 0.04 },
    );

  const more =
    r.work.months.length > 6
      ? h("button", {
          type: "button",
          class: "ghost show-more",
          onclick: () => {
            showAll = !showAll;
            draw();
          },
        })
      : null;

  function draw() {
    const months = showAll ? r.work.months : r.work.months.slice(0, 6);
    render(list, h("span", { class: "tl-rail", "aria-hidden": "true" }, fill), months.map(month));
    if (more) more.textContent = showAll ? "Show fewer months" : `Show all ${r.work.months.length} months`;
    update();
  }

  function update() {
    if (reducedMotion()) return;
    const rect = list.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = (0.75 * vh - rect.top) / Math.max(1, rect.height + 0.15 * vh);
    fill.style.transform = `scaleY(${Math.min(1, Math.max(0, p))})`;
  }
  const onScroll = () => {
    if (!list.isConnected) {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      return;
    }
    update();
  };
  if (!reducedMotion()) {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    requestAnimationFrame(onScroll);
  }

  draw();
  return frag(list, more);
}

export function workSection(r) {
  const w = r.work;
  const maxC = Math.max(...w.contributors.map((c) => c.commits), 1);
  if (!w.commitsAnalyzed) {
    return h(
      "section",
      { id: "work", class: "rp-section" },
      h("h2", null, "Work done"),
      h("p", { class: "muted" }, "No commit history was found for this branch."),
    );
  }
  return h(
    "section",
    { id: "work", class: "rp-section", "aria-labelledby": "work-h" },
    reveal(
      h(
        "div",
        null,
        h(
          "div",
          { class: "sec-head" },
          h("h2", { id: "work-h" }, "Work done"),
          h(
            "p",
            { class: "sec-note" },
            w.truncated
              ? `Latest ${w.commitsAnalyzed} of ${r.repo.totalCommits?.toLocaleString()} commits`
              : `All ${w.commitsAnalyzed} commits`,
          ),
        ),
      ),
    ),

    reveal(
      h(
        "div",
        { class: "card work-summary" },
        h("p", null, w.summary),
        h(
          "dl",
          { class: "mini-stats" },
          h("div", null, h("dt", null, "Commits read"), h("dd", null, countUp(w.commitsAnalyzed))),
          h("div", null, h("dt", null, "People"), h("dd", null, countUp(w.contributorCount ?? w.contributors.length))),
          h(
            "div",
            null,
            h("dt", null, "First in range"),
            h(
              "dd",
              { class: "date" },
              w.firstDate ? new Date(w.firstDate).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "–",
            ),
          ),
          h("div", null, h("dt", null, "Latest"), h("dd", { class: "date" }, ago(w.lastDate))),
        ),
      ),
    ),

    h(
      "div",
      { class: "work-grid" },
      reveal(
        h(
          "div",
          { class: "card" },
          h("h3", { class: "sub-h" }, `Commits per week${w.weekly.length >= 52 ? " · last 12 months" : ""}`),
          activity(w.weekly),
        ),
      ),
      reveal(
        h("div", { class: "card" }, h("h3", { class: "sub-h" }, "What kind of work"), typeBar(w.byType, w.commitsAnalyzed)),
        { delay: 0.05 },
      ),
    ),

    reveal(h("div", null, h("h3", { class: "sub-h tl-title" }, "Month by month"))),
    timeline(r),

    h(
      "div",
      { class: "work-grid three" },
      w.contributors.length > 0 &&
        reveal(
          h(
            "div",
            { class: "card" },
            h("h3", { class: "sub-h" }, "Who built it"),
            h(
              "ul",
              { class: "people" },
              w.contributors.map((c, i) =>
                h(
                  "li",
                  null,
                  c.avatarUrl
                    ? h("img", { src: c.avatarUrl, alt: "", width: 28, height: 28, loading: "lazy" })
                    : h("span", { class: "initial", "aria-hidden": "true" }, c.name.slice(0, 1).toUpperCase()),
                  h(
                    "span",
                    { class: "pp-name" },
                    c.login ? h("a", { href: `https://github.com/${c.login}`, target: "_blank", rel: "noreferrer" }, c.name) : c.name,
                  ),
                  h(
                    "span",
                    { class: "pp-bar", "aria-hidden": "true" },
                    grow(h("span"), { transform: "scaleX(0)" }, { transform: `scaleX(${c.commits / maxC})` }, { duration: 0.8, delay: 0.1 + i * 0.04 }),
                  ),
                  h("span", { class: "pp-n" }, c.commits),
                ),
              ),
            ),
          ),
        ),
      w.areas.length > 0 &&
        reveal(
          h(
            "div",
            { class: "card" },
            h("h3", { class: "sub-h" }, "Most-changed areas"),
            h(
              "ul",
              { class: "kv-list rank" },
              w.areas.map((a) =>
                h(
                  "li",
                  null,
                  h("code", null, a.path === "(root)" ? "(top level)" : `${a.path}/`),
                  h("span", null, `${a.commits} commits · mostly `, typeBadge(a.mainType)),
                ),
              ),
            ),
          ),
          { delay: 0.05 },
        ),
      w.hotspots.length > 0 &&
        reveal(
          h(
            "div",
            { class: "card" },
            h("h3", { class: "sub-h" }, "Most-edited files"),
            h(
              "ul",
              { class: "kv-list rank" },
              w.hotspots.map((x) => h("li", null, h("code", null, x.path), h("span", null, `${x.commits} commits`))),
            ),
          ),
          { delay: 0.1 },
        ),
    ),

    w.releases.length > 0 &&
      reveal(
        h(
          "div",
          { class: "card releases" },
          h("h3", { class: "sub-h" }, "Releases"),
          h(
            "ul",
            null,
            w.releases.map((x) =>
              h(
                "li",
                null,
                h(
                  "a",
                  { href: x.url, target: "_blank", rel: "noreferrer" },
                  icon("tag", 14),
                  h("b", null, x.tag),
                  h(
                    "span",
                    null,
                    new Date(x.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
  );
}
