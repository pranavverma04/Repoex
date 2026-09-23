"use client";
import { useEffect, useState } from "react";
import type { EvalRunSummary } from "@ara/shared";
import { api } from "@/lib/api";

export default function EvalPage() {
  const [runs, setRuns] = useState<EvalRunSummary[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.latestEval().then(setRuns).catch((e) => setError(e.message));
  }, []);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      setRuns(await api.runEval());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="page eval-page">
      <div className="eval-head">
        <div>
          <h1>Retrieval eval</h1>
          <p className="muted">
            Hand-written questions per sample repository, run through the real retrieval and agent pipeline with the
            cache bypassed. A question passes when every expected symbol shows up in the retrieved context.
          </p>
        </div>
        <button onClick={run} disabled={running}>
          {running ? "Running… (indexes sample repos first)" : "Run eval suite"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {runs?.length === 0 && <p className="muted">No eval runs yet.</p>}
      {runs?.map((r) => (
        <section key={r.repoUrl} className="eval-repo">
          <h2>
            {r.repoUrl.replace("https://github.com/", "")}
            <span className={`score ${r.passed === r.total ? "ok" : "warn"}`}>
              {r.passed}/{r.total} passed
            </span>
            <span className="muted small">avg {r.avgLatencyMs} ms</span>
          </h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Result</th>
                  <th>Question</th>
                  <th>Expected</th>
                  <th>Top retrieved</th>
                  <th className="num">Answer overlap</th>
                  <th className="num">Latency</th>
                </tr>
              </thead>
              <tbody>
                {r.results.map((q) => (
                  <tr key={q.questionId}>
                    <td>
                      <span className={`pill ${q.passed ? "pill-ready" : "pill-failed"}`}>{q.passed ? "Pass" : "Fail"}</span>
                    </td>
                    <td>{q.question}</td>
                    <td>
                      <code>{q.expectedSymbols.join(", ")}</code>
                    </td>
                    <td className="small">{q.retrieved.slice(0, 4).join(", ")}</td>
                    <td className="num">{Math.round(q.answerScore * 100)}%</td>
                    <td className="num">{q.latencyMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
