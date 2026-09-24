// Markdown export of a report, for docs, lab files or a PR description.

const TYPE_LABEL = {
  feature: "Features",
  fix: "Fixes",
  refactor: "Improvements",
  docs: "Docs",
  tests: "Tests",
  maintenance: "Maintenance",
  other: "Other",
};

function tree(node, depth, maxDepth, lines, prefix = "") {
  const kids = node.children ?? [];
  kids.forEach((k, i) => {
    const last = i === kids.length - 1 && !node.more;
    lines.push(`${prefix}${last ? "└── " : "├── "}${k.name}${k.type === "dir" ? "/" : ""}`);
    if (k.type === "dir" && depth < maxDepth) tree(k, depth + 1, maxDepth, lines, prefix + (last ? "    " : "│   "));
  });
  if (node.more) lines.push(`${prefix}└── … ${node.more} more`);
}

export function reportToMarkdown(r) {
  const out = [];
  const p = (...xs) => out.push(...xs);
  p(`# ${r.repo.fullName}`, "", `> ${r.overview.oneLiner}`, "");
  p(
    `**Branch** \`${r.branch}\` at \`${r.sha.slice(0, 7)}\` · ★ ${r.repo.stars.toLocaleString()} · ${r.repo.forks.toLocaleString()} forks · ${r.repo.license ?? "no license"} · [GitHub](${r.repo.url})`,
    "",
  );

  p(
    "## Overview",
    "",
    r.overview.plain,
    "",
    "**For developers:** " + r.overview.technical,
    "",
    `**Who it's for:** ${r.overview.audience}`,
    "",
  );
  if (r.overview.highlights.length) p("**Highlights**", "", ...r.overview.highlights.map((h) => `- ${h}`), "");

  p("## Tech stack", "");
  if (r.stack.languages.length)
    p(
      `**Languages:** ${r.stack.languages
        .filter((l) => l.pct >= 0.1)
        .slice(0, 6)
        .map((l) => `${l.name} ${l.pct.toFixed(1)}%`)
        .join(", ")}`,
      "",
    );
  for (const g of r.stack.groups)
    p(`- **${g.category}:** ${g.items.map((i) => (i.version ? `${i.name} ${i.version}` : i.name)).join(", ")}`);
  if (r.stack.packageManagers.length) p(`- **Package managers:** ${r.stack.packageManagers.join(", ")}`);
  p("");

  p(
    "## Structure",
    "",
    `${r.structure.totalFiles.toLocaleString()} files in ${r.structure.totalDirs.toLocaleString()} folders.`,
    "",
  );
  p(
    "| Folder | What it holds | Files |",
    "|---|---|---|",
    ...r.structure.folders.map((f) => `| \`${f.path}\` | ${f.purpose} | ${f.files} |`),
    "",
  );
  const lines = [`${r.repo.name}/`];
  tree(r.structure.tree, 1, 2, lines);
  p("```", ...lines.slice(0, 80), "```", "");
  if (r.structure.entryPoints.length)
    p("**Entry points**", "", ...r.structure.entryPoints.map((e) => `- \`${e.path}\`: ${e.why}`), "");

  p("## Work done", "", r.work.summary, "");
  if (r.work.byType.length)
    p(`**By type:** ${r.work.byType.map((t) => `${TYPE_LABEL[t.type]} ${t.count}`).join(" · ")}`, "");
  for (const m of r.work.months.slice(0, 6)) {
    p(
      `### ${m.month} · ${m.count} commits`,
      "",
      ...m.highlights.map((h) => `- **${TYPE_LABEL[h.type]}:** ${h.message} (${h.author})`),
      "",
    );
  }
  if (r.work.contributors.length)
    p("**Contributors:** " + r.work.contributors.map((c) => `${c.name} (${c.commits})`).join(", "), "");
  if (r.work.releases.length)
    p("**Releases:** " + r.work.releases.map((x) => `[${x.tag}](${x.url}) ${x.date.slice(0, 10)}`).join(", "), "");

  p("## How to run it", "");
  r.run.steps.forEach((s, i) => {
    p(
      `${i + 1}. **${s.title}**${s.note ? ` (${s.note})` : ""}`,
      "",
      "   ```sh",
      ...s.commands.map((c) => `   ${c}`),
      "   ```",
      "",
    );
  });
  if (r.run.envVars.length) p(`**Environment variables:** ${r.run.envVars.map((e) => `\`${e.name}\``).join(", ")}`, "");

  p("## Mock output", "", "_A preview built by reading the code. The repository was not run._", "");
  const m = r.mock;
  if (m.web) {
    p(`### Pages (${m.web.framework})`, "");
    for (const pg of m.web.pages) p(`- \`${pg.route}\`${pg.headings[0] ? `: ${pg.headings[0]}` : ""} (\`${pg.file}\`)`);
    p("");
  }
  if (m.api) {
    p(
      `### API (${m.api.framework})`,
      "",
      "| Method | Path | Source |",
      "|---|---|---|",
      ...m.api.endpoints.map((e) => `| ${e.method} | \`${e.path}\` | \`${e.file}:${e.line}\` |`),
      "",
    );
    const ex = m.api.endpoints.find((e) => e.responseFromCode || e.exampleResponse);
    if (ex)
      p(
        `Example: \`${ex.method} ${ex.path}\``,
        "",
        "```sh",
        ex.request,
        "```",
        "",
        "```json",
        ex.exampleResponse ?? ex.responseFromCode ?? "",
        "```",
        "",
      );
  }
  if (m.cli) for (const s of m.cli.session) p("```console", `$ ${s.command}`, s.output, "```", "");
  if (m.library)
    p("```sh", m.library.install, "```", "", ...(m.library.usage ? ["```", m.library.usage, "```", ""] : []));
  p(
    "---",
    `_Generated ${r.generatedAt.slice(0, 10)} by AI-Repo-Assistant${r.ai.used ? ` with ${r.ai.provider}` : " from repository data"}._`,
  );
  return out.join("\n");
}
