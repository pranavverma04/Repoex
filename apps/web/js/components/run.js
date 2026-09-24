// "How to run it" tab: numbered setup steps, package.json scripts, env vars and README snippets.
import { h } from "../dom.js";
import { copyButton, reveal } from "../ui.js";

export function runSection(r) {
  const run = r.run;
  return h(
    "section",
    { id: "run", class: "rp-section", "aria-labelledby": "run-h" },
    reveal(
      h(
        "div",
        null,
        h(
          "div",
          { class: "sec-head" },
          h("h2", { id: "run-h" }, "How to run it"),
          h("p", { class: "sec-note" }, "Worked out from its lockfiles, scripts and entry points"),
        ),
      ),
    ),

    h(
      "ol",
      { class: "steps-list" },
      run.steps.map((s, i) =>
        reveal(
          h(
            "li",
            { class: "step-card" },
            h("span", { class: "step-n", "aria-hidden": "true" }, i + 1),
            h(
              "div",
              { class: "step-body" },
              h("div", { class: "step-top" }, h("h3", null, s.title), copyButton(s.commands.join("\n"))),
              h(
                "pre",
                { class: "cmd" },
                s.commands.map((c) => h("code", null, h("span", { class: "prompt", "aria-hidden": "true" }, "$"), c)),
              ),
              s.note && h("p", { class: "step-note" }, s.note),
            ),
          ),
          { delay: i * 0.05 },
        ),
      ),
    ),

    h(
      "div",
      { class: "work-grid" },
      run.scripts.length > 0 &&
        reveal(
          h(
            "div",
            { class: "card" },
            h("h3", { class: "sub-h" }, "Scripts in package.json"),
            h(
              "div",
              { class: "table-wrap flush" },
              h(
                "table",
                null,
                h(
                  "tbody",
                  null,
                  run.scripts.map((s) =>
                    h(
                      "tr",
                      null,
                      h("td", null, h("code", { class: "accent-code" }, s.name)),
                      h("td", null, h("code", { class: "wrap" }, s.command)),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      reveal(
        h(
          "div",
          { class: "card" },
          h("h3", { class: "sub-h" }, "Environment variables it reads"),
          run.envVars.length
            ? h(
                "ul",
                { class: "env-list" },
                run.envVars.map((e) => h("li", { title: `Seen in ${e.source}` }, h("code", null, e.name), h("span", null, e.source))),
              )
            : h("p", { class: "muted small" }, "None found in the code that was read."),
          run.ports.length > 0 &&
            h(
              "p",
              { class: "ports" },
              "Listens on ",
              run.ports.map((p, i) => h("span", null, i > 0 && ", ", h("code", null, `:${p}`))),
            ),
        ),
        { delay: 0.05 },
      ),
    ),

    run.readmeSnippets.length > 0 &&
      reveal(
        h(
          "div",
          { class: "card" },
          h(
            "details",
            { class: "readme-snips" },
            h(
              "summary",
              null,
              `What the README says (${run.readmeSnippets.length} snippet${run.readmeSnippets.length === 1 ? "" : "s"})`,
            ),
            run.readmeSnippets.map((s) =>
              h(
                "div",
                { class: "snip" },
                h("span", { class: "snip-h" }, s.heading),
                h("pre", { class: "cmd" }, h("code", null, s.code)),
              ),
            ),
          ),
        ),
      ),
  );
}
