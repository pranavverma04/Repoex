// Scroll-triggered property animations for bars and meters (flex-grow, scaleX, scaleY).
// Stands in for motion's `initial` + `whileInView` + `viewport={{ once: true }}`.
import { reducedMotion } from "../dom.js";

let io = null;
const pending = new WeakMap();

/**
 * Sets `from` styles now and transitions to `to` the first time `el` scrolls into view.
 *   grow(seg, { flexGrow: 0.0001 }, { flexGrow: 12 }, { duration: 1.1, delay: 0.2 })
 * Style keys are CSS property names in camelCase or kebab-case.
 */
export function grow(el, from, to, { duration = 0.8, delay = 0 } = {}) {
  const apply = (styles) => {
    for (const [k, v] of Object.entries(styles)) el.style.setProperty(k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), String(v));
  };
  if (reducedMotion() || !("IntersectionObserver" in window)) {
    apply(to);
    return el;
  }
  apply(from);
  const props = Object.keys(to).map((k) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
  pending.set(el, () => {
    const existing = el.style.transition ? `${el.style.transition}, ` : "";
    el.style.transition = existing + props.map((p) => `${p} ${duration}s var(--ease-out) ${delay}s`).join(", ");
    // next frame, so the `from` value is painted before the transition starts
    requestAnimationFrame(() => requestAnimationFrame(() => apply(to)));
  });
  io ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      pending.get(e.target)?.();
      pending.delete(e.target);
    }
  });
  io.observe(el);
  return el;
}
