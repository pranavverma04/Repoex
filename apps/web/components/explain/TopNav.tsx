"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/", label: "Explain", match: (p: string) => p === "/" || p.startsWith("/r/") },
  { href: "/eval", label: "Eval", match: (p: string) => p.startsWith("/eval") },
];

export function TopNav() {
  const path = usePathname() ?? "/";
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`topbar${scrolled ? " scrolled" : ""}`}>
      <Link href="/" className="brand" aria-label="AI-Repo-Assistant home">
        <svg viewBox="0 0 64 64" width="28" height="28" aria-hidden className="brand-rings">
          <circle cx="32" cy="32" r="7" fill="none" stroke="currentColor" strokeWidth="3.4" />
          <circle cx="32" cy="32" r="15" fill="none" stroke="currentColor" strokeWidth="2.4" opacity=".6" strokeDasharray="70 24" className="ring-a" />
          <circle cx="32" cy="32" r="23" fill="none" stroke="currentColor" strokeWidth="1.8" opacity=".32" strokeDasharray="40 16" className="ring-b" />
        </svg>
        <span>
          AI-Repo-<span className="brand-em">Assistant</span>
        </span>
      </Link>
      <nav aria-label="Main">
        {LINKS.map((l) => {
          const active = l.match(path);
          return (
            <Link key={l.href} href={l.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
              {active && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="nav-label">{l.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
