// CLI: `pnpm eval` — indexes the sample repos if needed, runs the dataset, prints a report.
import { runEval } from "./runner.js";

const summaries = await runEval();
let failed = 0;
for (const s of summaries) {
  console.log(`\n${s.repoUrl}  —  ${s.passed}/${s.total} passed, avg ${s.avgLatencyMs} ms`);
  for (const r of s.results) {
    const mark = r.passed ? "PASS" : "FAIL";
    console.log(`  ${mark}  ${String(r.latencyMs).padStart(5)} ms  answer ${r.answerScore.toFixed(2)}  ${r.question}`);
    if (!r.passed) {
      failed++;
      console.log(`        expected ${r.expectedSymbols.join(", ")}; got ${r.retrieved.slice(0, 8).join(", ")}`);
    }
  }
}
process.exit(failed ? 1 : 0);
