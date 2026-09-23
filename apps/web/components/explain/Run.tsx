"use client";
import type { RepoReport } from "@ara/shared";
import { CopyButton, Reveal } from "./ui";

export function RunSection({ report: r }: { report: RepoReport }) {
  const run = r.run;
  return (
    <section id="run" className="rp-section" aria-labelledby="run-h">
      <Reveal>
        <div className="sec-head">
          <h2 id="run-h">How to run it</h2>
          <p className="sec-note">Worked out from its lockfiles, scripts and entry points</p>
        </div>
      </Reveal>

      <ol className="steps-list">
        {run.steps.map((s, i) => (
          <Reveal as="li" key={s.title} className="step-card" delay={i * 0.05}>
            <span className="step-n" aria-hidden>
              {i + 1}
            </span>
            <div className="step-body">
              <div className="step-top">
                <h3>{s.title}</h3>
                <CopyButton text={s.commands.join("\n")} />
              </div>
              <pre className="cmd">
                {s.commands.map((c) => (
                  <code key={c}>
                    <span className="prompt" aria-hidden>
                      $
                    </span>
                    {c}
                  </code>
                ))}
              </pre>
              {s.note && <p className="step-note">{s.note}</p>}
            </div>
          </Reveal>
        ))}
      </ol>

      <div className="work-grid">
        {run.scripts.length > 0 && (
          <Reveal className="card">
            <h3 className="sub-h">Scripts in package.json</h3>
            <div className="table-wrap flush">
              <table>
                <tbody>
                  {run.scripts.map((s) => (
                    <tr key={s.name}>
                      <td>
                        <code className="accent-code">{s.name}</code>
                      </td>
                      <td>
                        <code className="wrap">{s.command}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        )}
        <Reveal className="card" delay={0.05}>
          <h3 className="sub-h">Environment variables it reads</h3>
          {run.envVars.length ? (
            <ul className="env-list">
              {run.envVars.map((e) => (
                <li key={e.name} title={`Seen in ${e.source}`}>
                  <code>{e.name}</code>
                  <span>{e.source}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">None found in the code that was read.</p>
          )}
          {run.ports.length > 0 && (
            <p className="ports">
              Listens on {run.ports.map((p, i) => (
                <span key={p}>
                  {i > 0 && ", "}
                  <code>:{p}</code>
                </span>
              ))}
            </p>
          )}
        </Reveal>
      </div>

      {run.readmeSnippets.length > 0 && (
        <Reveal className="card">
          <details className="readme-snips">
            <summary>What the README says ({run.readmeSnippets.length} snippet{run.readmeSnippets.length === 1 ? "" : "s"})</summary>
            {run.readmeSnippets.map((s, i) => (
              <div key={i} className="snip">
                <span className="snip-h">{s.heading}</span>
                <pre className="cmd">
                  <code>{s.code}</code>
                </pre>
              </div>
            ))}
          </details>
        </Reveal>
      )}
    </section>
  );
}
