"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import type { RepoReport, TreeNode } from "@ara/shared";
import { EASE, Icon, Reveal } from "./ui";

function flatten(n: TreeNode, out: TreeNode[] = []) {
  for (const c of n.children ?? []) {
    out.push(c);
    if (c.type === "dir") flatten(c, out);
  }
  return out;
}

function fileTone(name: string) {
  if (/^readme/i.test(name)) return "t-doc";
  if (/\.(md|mdx|rst|txt)$/i.test(name)) return "t-doc";
  if (/\.(json|ya?ml|toml|ini|lock|env.*)$|^\.|config\./i.test(name)) return "t-cfg";
  if (/\.(png|jpe?g|gif|svg|webp|ico|mp4|webm|ai)$/i.test(name)) return "t-media";
  if (/\.(test|spec)\.|_test\.|^test_/i.test(name)) return "t-test";
  return "t-code";
}

function Node({ node, depth, open, toggle, entry }: { node: TreeNode; depth: number; open: Set<string>; toggle: (p: string) => void; entry: Set<string> }) {
  const isOpen = open.has(node.path);
  if (node.type === "file") {
    return (
      <li className={`tn file ${fileTone(node.name)}${entry.has(node.path) ? " entry" : ""}`} style={{ "--d": depth } as React.CSSProperties}>
        <Icon name="file" size={14} />
        <span className="tn-name">{node.name}</span>
        {entry.has(node.path) && <span className="tn-tag">entry</span>}
      </li>
    );
  }
  return (
    <li className="tn-dir-wrap">
      <button type="button" className={`tn dir${isOpen ? " open" : ""}`} style={{ "--d": depth } as React.CSSProperties} onClick={() => toggle(node.path)} aria-expanded={isOpen}>
        <motion.span className="tn-chev" animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.25, ease: EASE }}>
          <Icon name="chevron" size={13} />
        </motion.span>
        <Icon name="folder" size={14} />
        <span className="tn-name">{node.name}</span>
        <span className="tn-count">{node.files}</span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.32, ease: EASE }} className="tn-kids">
            {(node.children ?? []).map((c) => (
              <Node key={c.path} node={c} depth={depth + 1} open={open} toggle={toggle} entry={entry} />
            ))}
            {node.more ? (
              <li className="tn more" style={{ "--d": depth + 1 } as React.CSSProperties}>
                … {node.more} more
              </li>
            ) : null}
            {!node.children?.length && !node.more && node.files ? (
              <li className="tn more" style={{ "--d": depth + 1 } as React.CSSProperties}>
                {node.files} files (not expanded)
              </li>
            ) : null}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

export function StructureSection({ report: r }: { report: RepoReport }) {
  const reduce = useReducedMotion();
  const s = r.structure;
  const [open, setOpen] = useState<Set<string>>(() => {
    const first = (s.tree.children ?? []).find((c) => c.type === "dir" && /^(src|source|app|lib|apps|packages|backend|frontend)$/.test(c.name));
    return new Set(first ? [first.path] : []);
  });
  const [q, setQ] = useState("");
  const entry = useMemo(() => new Set(s.entryPoints.map((e) => e.path)), [s.entryPoints]);
  const all = useMemo(() => flatten(s.tree), [s.tree]);
  const matches = q.trim() ? all.filter((n) => n.path.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 80) : null;
  const toggle = (p: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  const maxShare = Math.max(...s.folders.map((f) => f.share), 0.01);

  return (
    <section id="structure" className="rp-section" aria-labelledby="structure-h">
      <Reveal>
        <div className="sec-head">
          <h2 id="structure-h">Structure</h2>
          <p className="sec-note">
            {s.totalFiles.toLocaleString()} files in {s.totalDirs.toLocaleString()} folders
          </p>
        </div>
      </Reveal>

      <div className="structure-grid">
        <Reveal className="card tree-card">
          <div className="tree-top">
            <h3 className="sub-h">Files</h3>
            <div className="tree-actions">
              <button type="button" className="mini" onClick={() => setOpen(new Set(all.filter((n) => n.type === "dir" && n.path.split("/").length <= 2).map((n) => n.path)))}>
                Expand
              </button>
              <button type="button" className="mini" onClick={() => setOpen(new Set())}>
                Collapse
              </button>
            </div>
          </div>
          <label className="tree-search">
            <span className="sr-only">Filter files</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter files…" spellCheck={false} />
          </label>
          <div className="tree-scroll">
            {matches ? (
              <ul className="tree flat">
                {matches.length === 0 && <li className="tn more">No files match "{q}"</li>}
                {matches.map((n) => {
                  const i = n.path.toLowerCase().indexOf(q.trim().toLowerCase());
                  return (
                    <li key={n.path} className={`tn ${n.type} ${n.type === "file" ? fileTone(n.name) : ""}`} style={{ "--d": 0 } as React.CSSProperties}>
                      <Icon name={n.type === "dir" ? "folder" : "file"} size={14} />
                      <span className="tn-name">
                        {n.path.slice(0, i)}
                        <mark>{n.path.slice(i, i + q.trim().length)}</mark>
                        {n.path.slice(i + q.trim().length)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="tree">
                {(s.tree.children ?? []).map((c) => (
                  <Node key={c.path} node={c} depth={0} open={open} toggle={toggle} entry={entry} />
                ))}
                {s.tree.more ? <li className="tn more">… {s.tree.more} more</li> : null}
              </ul>
            )}
          </div>
        </Reveal>

        <div className="structure-side">
          <Reveal className="card">
            <h3 className="sub-h">Where things live</h3>
            <ul className="folders">
              {s.folders.map((f, i) => (
                <li key={f.path}>
                  <div className="fd-top">
                    <code>{f.path === "(root)" ? "(top level)" : `${f.path}/`}</code>
                    <span className="fd-files">{f.files} files</span>
                  </div>
                  <span className="fd-purpose">{f.purpose}</span>
                  <span className="fd-bar" aria-hidden>
                    <motion.span
                      initial={reduce ? false : { scaleX: 0 }}
                      whileInView={{ scaleX: f.share / maxShare }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, ease: EASE, delay: 0.1 + i * 0.04 }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>

          {s.entryPoints.length > 0 && (
            <Reveal className="card" delay={0.05}>
              <h3 className="sub-h">Where it starts</h3>
              <ul className="kv-list">
                {s.entryPoints.map((e) => (
                  <li key={e.path}>
                    <code>{e.path}</code>
                    <span>{e.why}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {s.keyFiles.length > 0 && (
            <Reveal className="card" delay={0.1}>
              <h3 className="sub-h">Key files</h3>
              <ul className="kv-list">
                {s.keyFiles.map((k) => (
                  <li key={k.path}>
                    <code>{k.path}</code>
                    <span>{k.role}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}
