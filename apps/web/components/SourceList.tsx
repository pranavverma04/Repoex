"use client";
import type { SourceRef } from "@ara/shared";

const REASON: Record<SourceRef["reason"], string> = {
  exact: "name match",
  partial: "partial name",
  path: "path match",
  content: "mentioned in body",
  caller: "caller",
  callee: "callee",
  import: "import",
};

export function SourceList({ sources }: { sources: SourceRef[] }) {
  if (!sources.length) return null;
  return (
    <details className="sources">
      <summary>
        Sources used <span className="count">{sources.length}</span>
      </summary>
      <ul>
        {sources.map((s) => (
          <li key={s.symbolId}>
            <details>
              <summary>
                <code className="sym">{s.name}</code>
                <span className="kind">{s.kind}</span>
                <span className="loc">
                  {s.path}:{s.startLine}–{s.endLine}
                </span>
                <span className="why">
                  {REASON[s.reason]}
                  {s.via ? ` of ${s.via}` : ""}
                </span>
              </summary>
              <pre>
                <code>{s.snippet}</code>
              </pre>
            </details>
          </li>
        ))}
      </ul>
    </details>
  );
}
