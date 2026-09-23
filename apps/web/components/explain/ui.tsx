"use client";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CommitType } from "@ara/shared";

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Headline that resolves word by word from blur to sharp. */
export function SplitText({ text, className, delay = 0, as = "h1" }: { text: string; className?: string; delay?: number; as?: "h1" | "h2" | "p" }) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  // *wrapped* words render in the emphasis weight
  let em = false;
  const words = text.split(" ").map((raw) => {
    const start = raw.startsWith("*");
    if (start) em = true;
    const word = { w: raw.replace(/\*/g, ""), em };
    if (raw.endsWith("*")) em = false;
    return word;
  });
  return (
    <Tag className={className} aria-label={text.replace(/\*/g, "")}>
      {words.map(({ w, em: isEm }, i) => (
        <motion.span
          key={i}
          aria-hidden
          className={isEm ? "word em" : "word"}
          initial={reduce ? false : { opacity: 0, y: "0.35em", filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.9, ease: EASE, delay: delay + i * 0.06 }}
        >
          {w}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </Tag>
  );
}

/** Fades and lifts children in the first time they scroll into view. */
export function Reveal({ children, delay = 0, className, y = 22, as = "div" }: { children: ReactNode; delay?: number; className?: string; y?: number; as?: "div" | "section" | "li" }) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
}

/** Number that counts up once visible. */
export function CountUp({ value, className, format = (n: number) => Math.round(n).toLocaleString() }: { value: number; className?: string; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!ref.current) return;
    if (!inView || reduce) {
      ref.current.textContent = format(inView || reduce ? value : 0);
      return;
    }
    const controls = animate(0, value, {
      duration: Math.min(1.8, 0.6 + Math.log10(Math.max(10, value)) * 0.3),
      ease: EASE,
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = format(v);
      },
    });
    return () => controls.stop();
  }, [inView, value, reduce, format]);
  return (
    <span ref={ref} className={className}>
      {format(0)}
    </span>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`copy${done ? " done" : ""}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {}
      }}
      aria-label={done ? "Copied" : label}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
        {done ? (
          <motion.path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35 }} />
        ) : (
          <>
            <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <path d="M15.5 8.5V6.5A2 2 0 0 0 13.5 4.5h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" strokeWidth="1.7" />
          </>
        )}
      </svg>
      <span>{done ? "Copied" : label}</span>
    </button>
  );
}

const PATHS: Record<string, string> = {
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

export function Icon({ name, size = 16, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  const filled = name === "github" || name === "play";
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <path
        d={PATHS[name] ?? ""}
        fill={filled ? "currentColor" : "none"}
        stroke={filled ? "none" : "currentColor"}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const TYPE_META: Record<CommitType, { label: string; color: string }> = {
  feature: { label: "Feature", color: "var(--s1)" },
  fix: { label: "Fix", color: "var(--s2)" },
  refactor: { label: "Improvement", color: "var(--s3)" },
  docs: { label: "Docs", color: "var(--s4)" },
  tests: { label: "Tests", color: "var(--s5)" },
  maintenance: { label: "Maintenance", color: "var(--s6)" },
  other: { label: "Other", color: "var(--s-other)" },
};

export const LANG_COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];

export function ago(iso: string | null): string {
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

export const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(Math.round(n));

export function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
