"use client";
import { useEffect, useRef } from "react";

/** Fixed background: drifting copper glow, film grain, slow dust motes and a soft cursor light. */
export function Ambient() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = el.width = Math.floor(window.innerWidth * dpr);
      h = el.height = Math.floor(window.innerHeight * dpr);
      el.style.width = `${window.innerWidth}px`;
      el.style.height = `${window.innerHeight}px`;
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
    const draw = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      ctx.clearRect(0, 0, w, h);
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
        ctx.arc(m.x * w, m.y * h, m.r * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    // cursor light, eased toward the pointer
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight * 0.3;
    let gx = tx;
    let gy = ty;
    let graf = 0;
    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!graf) graf = requestAnimationFrame(follow);
    };
    const follow = () => {
      gx += (tx - gx) * 0.08;
      gy += (ty - gy) * 0.08;
      if (glow.current) glow.current.style.transform = `translate3d(${gx - 300}px, ${gy - 300}px, 0)`;
      graf = Math.abs(tx - gx) + Math.abs(ty - gy) > 0.5 ? requestAnimationFrame(follow) : 0;
    };
    if (!reduce && window.matchMedia("(pointer: fine)").matches) window.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(graf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className="env" aria-hidden>
      <div className="env-glow" ref={glow} />
      <canvas ref={canvas} className="env-motes" />
    </div>
  );
}
