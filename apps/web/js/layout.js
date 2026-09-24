// Page chrome shared by every page: the top navigation bar and the ambient background
// (drifting copper glow, dust motes, soft cursor light). Call mountLayout() once per page.
import { h, reducedMotion } from "./dom.js";

const LINKS = [
  { href: "/", label: "Explain", match: (p) => p === "/" || p.startsWith("/r/") },
  { href: "/eval", label: "Eval", match: (p) => p.startsWith("/eval") },
];

function topNav() {
  const path = location.pathname;
  const ring = (r, width, opacity, dash, cls) =>
    h("circle", { cx: 32, cy: 32, r, fill: "none", stroke: "currentColor", "stroke-width": width, opacity, "stroke-dasharray": dash, class: cls });
  const header = h(
    "header",
    { class: "topbar" },
    h(
      "a",
      { href: "/", class: "brand", "aria-label": "AI-Repo-Assistant home" },
      h(
        "svg",
        { viewBox: "0 0 64 64", width: 28, height: 28, "aria-hidden": "true", class: "brand-rings" },
        h("circle", { cx: 32, cy: 32, r: 7, fill: "none", stroke: "currentColor", "stroke-width": 3.4 }),
        ring(15, 2.4, ".6", "70 24", "ring-a"),
        ring(23, 1.8, ".32", "40 16", "ring-b"),
      ),
      h("span", null, "AI-Repo-", h("span", { class: "brand-em" }, "Assistant")),
    ),
    h(
      "nav",
      { "aria-label": "Main" },
      LINKS.map((l) => {
        const active = l.match(path);
        return h(
          "a",
          { href: l.href, class: active ? "active" : "", "aria-current": active ? "page" : null },
          active && h("span", { class: "nav-pill" }),
          h("span", { class: "nav-label" }, l.label),
        );
      }),
    ),
  );
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 12);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  return header;
}

function ambient() {
  const glow = h("div", { class: "env-glow" });
  const canvas = h("canvas", { class: "env-motes" });
  const root = h("div", { class: "env", "aria-hidden": "true" }, glow, canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return root;
  const reduce = reducedMotion();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0;
  let h2 = 0;
  const resize = () => {
    w = canvas.width = Math.floor(window.innerWidth * dpr);
    h2 = canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  };
  resize();
  window.addEventListener("resize", resize);

  const count = window.innerWidth < 700 ? 18 : 38;
  const motes = Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.5 + Math.random() * 1.6,
    vx: (Math.random() - 0.5) * 0.00012,
    vy: -0.00004 - Math.random() * 0.00012,
    a: 0.08 + Math.random() * 0.22,
    tw: Math.random() * Math.PI * 2,
  }));

  let raf = 0;
  let last = performance.now();
  const draw = (now) => {
    const dt = Math.min(64, now - last);
    last = now;
    ctx.clearRect(0, 0, w, h2);
    for (const m of motes) {
      if (!reduce) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.tw += dt * 0.0012;
        if (m.y < -0.02) m.y = 1.02;
        if (m.x < -0.02) m.x = 1.02;
        if (m.x > 1.02) m.x = -0.02;
      }
      const alpha = m.a * (0.65 + 0.35 * Math.sin(m.tw));
      ctx.beginPath();
      ctx.fillStyle = `rgba(239, 214, 186, ${alpha})`;
      ctx.arc(m.x * w, m.y * h2, m.r * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!reduce) raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  document.addEventListener("visibilitychange", () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && !reduce) {
      last = performance.now();
      raf = requestAnimationFrame(draw);
    }
  });

  // cursor light, eased toward the pointer
  let tx = window.innerWidth / 2;
  let ty = window.innerHeight * 0.3;
  let gx = tx;
  let gy = ty;
  let graf = 0;
  const follow = () => {
    gx += (tx - gx) * 0.08;
    gy += (ty - gy) * 0.08;
    glow.style.transform = `translate3d(${gx - 300}px, ${gy - 300}px, 0)`;
    graf = Math.abs(tx - gx) + Math.abs(ty - gy) > 0.5 ? requestAnimationFrame(follow) : 0;
  };
  if (!reduce && window.matchMedia("(pointer: fine)").matches) {
    window.addEventListener(
      "pointermove",
      (e) => {
        tx = e.clientX;
        ty = e.clientY;
        if (!graf) graf = requestAnimationFrame(follow);
      },
      { passive: true },
    );
  }
  return root;
}

/** Inserts the skip link, ambient background and top nav before <main id="main">. */
export function mountLayout() {
  const main = document.getElementById("main");
  document.body.insertBefore(h("a", { href: "#main", class: "skip" }, "Skip to content"), document.body.firstChild);
  document.body.insertBefore(ambient(), main);
  document.body.insertBefore(topNav(), main);
}
