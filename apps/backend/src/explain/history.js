// "What work has been done": commit classification, timeline, contributors, hotspots.

const CONVENTIONAL = {
  feat: "feature",
  feature: "feature",
  add: "feature",
  fix: "fix",
  bugfix: "fix",
  hotfix: "fix",
  refactor: "refactor",
  perf: "refactor",
  style: "refactor",
  docs: "docs",
  doc: "docs",
  test: "tests",
  tests: "tests",
  chore: "maintenance",
  build: "maintenance",
  ci: "maintenance",
  deps: "maintenance",
  release: "maintenance",
  revert: "maintenance",
};

/** gitmoji.dev prefixes, used by many repos instead of conventional commits */
const GITMOJI = [
  [["✨", "🎉", "🥚", "🚩"], "feature"],
  [["🐛", "🚑", "🩹", "🔒", "🥅", "🚨"], "fix"],
  [["♻", "🎨", "⚡", "🔥", "💄", "🚚", "🏷", "🗑", "💫", "🧑‍💻", "🦺", "🏗"], "refactor"],
  [["📝", "💡", "✏", "📄", "🌐", "💬"], "docs"],
  [["✅", "🧪", "🤡", "📸"], "tests"],
  [
    [
      "🔧",
      "🔨",
      "⬆",
      "⬇",
      "📌",
      "🔖",
      "👷",
      "💚",
      "🐳",
      "🚀",
      "📦",
      "➕",
      "➖",
      "🙈",
      "🔀",
      "⏪",
      "🧱",
      "👥",
      "🌱",
      "🙏",
    ],
    "maintenance",
  ],
];

export function classifyCommit(subject, files) {
  const raw = subject.trim();
  if (/release notes|changelog/i.test(raw) && /^(📝|docs|update|chore)/i.test(raw)) return "maintenance";
  for (const [emojis, type] of GITMOJI) if (emojis.some((e) => raw.startsWith(e))) return type;
  const s = raw.replace(/^(:\w+:|\p{Extended_Pictographic}|\uFE0F|\u200D|\s)+/u, "");
  const conv = s.match(/^(\w+)(?:\([^)]*\))?!?:/);
  if (conv && CONVENTIONAL[conv[1].toLowerCase()]) return CONVENTIONAL[conv[1].toLowerCase()];
  const l = s.toLowerCase();
  if (/^merge (pull request|branch|remote)/.test(l)) return "maintenance";
  if (
    /^(revert|bump|release|v?\d+\.\d+\.\d+(-[\w.]+)?$|upgrade|update (dependencies|deps)|chore|require (node|python|go)|drop (support|node)|meta tweaks?$)/.test(
      l,
    ) ||
    /\bdependabot\b|renovate/.test(l)
  )
    return "maintenance";
  if (/^(update|upgrade|bump|pin|unpin)\b.*\b(dependencies|deps|requirements|lockfile|versions?)\b/.test(l))
    return "maintenance";
  if (/\b(fix(e[sd])?|bug|crash|resolve[sd]?|patch|hotfix|correct|repair|broken|issue #?\d+|regression)\b/.test(l))
    return "fix";
  if (/\b(refactor|clean ?up|rename|restructure|simplif|reorganiz|move|tidy|perf|optimi[sz])/.test(l))
    return "refactor";
  if (/\b(test|tests|spec|coverage)\b/.test(l)) return "tests";
  if (
    /\b(docs?|readme|typos?|comments?|documentation|changelog)\b/.test(l) ||
    /^(document|clarify|explain|describe|mention)\b/.test(l)
  )
    return "docs";
  if (
    /^(add|adds|added|implement|introduce|create|support|new|enable|allow|initial)\b/.test(l) ||
    /\b(feature|feat)\b/.test(l)
  )
    return "feature";
  if (files.length && files.every((f) => /\.(md|mdx|rst|txt)$/i.test(f) || /^docs?\//.test(f))) return "docs";
  if (
    files.length &&
    files.every((f) => /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.\w+$|_test\.go$|test_\w+\.py$/.test(f))
  )
    return "tests";
  if (
    /^(preserve|respect|harden|guard|prevent|ensure|avoid|reject|enforce|strip|normalize|sanitize|validate|don'?t|do not|never|stop|gracefully|ignore|handle|restore|keep|throw|catch|retry|escape)\b/.test(
      l,
    )
  )
    return "fix";
  if (
    /^(update|improve|change|tweaks?|minor|various|small|make|use|set|adjust|allow|remove|drop|delete|unify|skip|return|treat|run|type|merge|replace|convert|extract|split|bump|polish|upgrade|migrate|switch|refine|reduce|speed)\b/.test(
      l,
    )
  )
    return "refactor";
  return "other";
}

const TYPE_ORDER = ["feature", "fix", "refactor", "docs", "tests", "maintenance", "other"];
const TYPE_WORD = {
  feature: "adding features",
  fix: "fixing bugs",
  refactor: "improving existing code",
  docs: "writing docs",
  tests: "writing tests",
  maintenance: "maintenance and releases",
  other: "other changes",
};
const IMPORTANCE = { feature: 6, fix: 5, refactor: 3, tests: 2, docs: 2, other: 1, maintenance: 0 };

function weekStart(iso) {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

function monthName(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function areaOf(file) {
  const parts = file.split("/");
  if (parts.length === 1) return "(root)";
  if (["apps", "packages", "services", "libs", "src"].includes(parts[0]) && parts.length > 2)
    return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

export function analyzeHistory(commits, shallow, ghContributors, releases, totalCommits) {
  const infos = commits.map((c) => ({
    sha: c.sha,
    message: c.subject,
    author: c.author,
    date: c.date,
    type: classifyCommit(c.subject, c.files),
    files: c.files.length,
  }));
  const isMerge = (c) => /^merge (pull request|branch|remote)/i.test(c.message);

  const typeCounts = new Map();
  for (const c of infos) typeCounts.set(c.type, (typeCounts.get(c.type) ?? 0) + 1);
  const byType = TYPE_ORDER.filter((t) => typeCounts.has(t)).map((t) => ({ type: t, count: typeCounts.get(t) }));

  // Weekly activity: every week from the first analysed commit to the latest (capped at 52 weeks).
  const weekly = [];
  if (infos.length) {
    const counts = new Map();
    for (const c of infos) counts.set(weekStart(c.date), (counts.get(weekStart(c.date)) ?? 0) + 1);
    const last = new Date(weekStart(infos[0].date));
    const first = new Date(weekStart(infos[infos.length - 1].date));
    const cur = new Date(last);
    while (cur >= first && weekly.length < 52) {
      const k = cur.toISOString().slice(0, 10);
      weekly.unshift({ week: k, count: counts.get(k) ?? 0 });
      cur.setUTCDate(cur.getUTCDate() - 7);
    }
  }

  const monthMap = new Map();
  for (const c of infos) {
    const k = c.date.slice(0, 7);
    if (!monthMap.has(k)) monthMap.set(k, []);
    monthMap.get(k).push(c);
  }
  const months = [...monthMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 18)
    .map(([month, list]) => {
      const bt = {};
      for (const c of list) bt[c.type] = (bt[c.type] ?? 0) + 1;
      const highlights = list
        .filter((c) => !isMerge(c))
        .map((c, i) => ({ c, score: IMPORTANCE[c.type] * 10 + Math.min(c.files, 20) / 4 - i * 0.01 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((x) => x.c)
        .sort((a, b) => b.date.localeCompare(a.date));
      return { month, count: list.length, byType: bt, highlights };
    });

  // Contributors from the analysed window; GitHub avatars matched by login or name when possible.
  const people = new Map();
  for (const c of commits) {
    if (/\[bot\]|dependabot|renovate|github-actions/i.test(c.author)) continue;
    const key = c.email.toLowerCase() || c.author;
    const p = people.get(key) ?? { name: c.author, email: c.email, commits: 0 };
    p.commits++;
    people.set(key, p);
  }
  // Merge identities that share a display name.
  const byName = new Map();
  for (const p of people.values()) {
    const k = p.name.toLowerCase();
    const cur = byName.get(k);
    if (cur) cur.commits += p.commits;
    else byName.set(k, { ...p });
  }
  const analysed = Math.max(1, commits.length);
  const ghByLogin = new Map(ghContributors.map((g) => [g.login.toLowerCase(), g]));
  const contributors = [...byName.values()]
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 12)
    .map((p) => {
      const noreply = p.email.match(/^(?:\d+\+)?([\w-]+)@users\.noreply\.github\.com$/i)?.[1];
      const gh =
        (noreply && ghByLogin.get(noreply.toLowerCase())) || ghByLogin.get(p.name.toLowerCase().replace(/\s+/g, ""));
      return {
        name: p.name,
        login: gh?.login ?? noreply ?? null,
        avatarUrl: gh?.avatarUrl ?? (noreply ? `https://github.com/${noreply}.png?size=80` : null),
        commits: p.commits,
        share: p.commits / analysed,
      };
    });

  const areaMap = new Map();
  const fileMap = new Map();
  for (const [i, c] of commits.entries()) {
    const t = infos[i].type;
    const touched = new Set();
    for (const f of c.files) {
      touched.add(areaOf(f));
      fileMap.set(f, (fileMap.get(f) ?? 0) + 1);
    }
    for (const a of touched) {
      if (!areaMap.has(a)) areaMap.set(a, new Map());
      const m = areaMap.get(a);
      m.set(t, (m.get(t) ?? 0) + 1);
    }
  }
  const areas = [...areaMap.entries()]
    .map(([path, m]) => {
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      const main =
        [...m.entries()].filter(([t]) => t !== "maintenance" && t !== "other").sort((a, b) => b[1] - a[1])[0]?.[0] ??
        "other";
      return { path, commits: total, mainType: main };
    })
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 10);
  const hotspots = [...fileMap.entries()]
    .filter(
      ([f]) =>
        !/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|Cargo\.lock|go\.sum|CHANGELOG\.md)$/i.test(
          f,
        ),
    )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, n]) => ({ path, commits: n }));

  // Plain-language summary of the work.
  const lastDate = infos[0]?.date ?? null;
  const firstDate = infos[infos.length - 1]?.date ?? null;
  const parts = [];
  if (infos.length) {
    const truncated = shallow && commits.length >= 2;
    const span = firstDate && lastDate ? spanText(firstDate, lastDate) : "";
    parts.push(
      truncated && totalCommits && totalCommits > infos.length
        ? `This looks at the latest ${infos.length} of ${totalCommits.toLocaleString()} commits, covering ${span}.`
        : `The whole history is ${infos.length} commit${infos.length === 1 ? "" : "s"} over ${span}.`,
    );
    const pct = (n) => `${Math.round((n / infos.length) * 100)}%`;
    const maint = typeCounts.get("maintenance") ?? 0;
    const heavyMaint = maint / infos.length > 0.4;
    const top = byType
      .filter((b) => b.type !== "other" && (!heavyMaint || b.type !== "maintenance"))
      .sort((a, b) => b.count - a.count)
      .slice(0, 2);
    if (top.length) {
      const list = top.map((t) => `${TYPE_WORD[t.type]} (${pct(t.count)})`).join(" and ");
      parts.push(
        heavyMaint
          ? `${pct(maint)} are routine maintenance (releases, dependency bumps); the rest went mostly into ${list}.`
          : `Most of the work went into ${list}.`,
      );
    }
    const busiest = months.slice().sort((a, b) => b.count - a.count)[0];
    if (busiest && months.length > 1)
      parts.push(`The busiest month was ${monthName(busiest.month)} with ${busiest.count} commits.`);
    const topArea = areas.find((a) => a.path !== "(root)");
    if (topArea) parts.push(`The most-changed area is ${topArea.path}/.`);
    if (contributors.length) {
      const lead = contributors[0];
      parts.push(
        contributors.length === 1
          ? `All of it is by ${lead.name}.`
          : `${byName.size} people contributed; ${lead.name} made ${Math.round(lead.share * 100)}% of these commits.`,
      );
    }
    if (lastDate) parts.push(`The last change was ${agoText(lastDate)}.`);
  }

  return {
    summary: parts.join(" "),
    commitsAnalyzed: infos.length,
    truncated: shallow && totalCommits !== null && totalCommits > infos.length,
    firstDate,
    lastDate,
    byType,
    weekly,
    months,
    recent: infos.slice(0, 15),
    contributors,
    contributorCount: byName.size,
    areas,
    hotspots,
    releases,
  };
}

export function agoText(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30.4);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function spanText(fromIso, toIso) {
  const days = Math.max(1, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000));
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 730) return `${Math.round(days / 30.4)} months`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, "")} years`;
}
