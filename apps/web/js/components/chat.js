import { api } from "../api.js";
import { h } from "../dom.js";
import { renderMarkdown } from "../markdown.js";
import { sourceList } from "./source-list.js";

const SUGGESTIONS = [
  "What are the main classes and what do they do?",
  "Who calls the main entry point?",
  "How are errors handled?",
];

function assistantMessage(res) {
  const trace = res.trace;
  return h(
    "div",
    { class: "msg msg-assistant" },
    h(
      "div",
      { class: "answer-meta" },
      res.cached && h("span", { class: "tag tag-cache" }, "cached"),
      h("span", null, `${res.latencyMs} ms`),
      trace && [
        h("span", null, `intent: ${trace.plan.intent}`),
        h("span", null, `${trace.attempts.length} retrieval pass${trace.attempts.length > 1 ? "es" : ""}`),
        h("span", null, `via ${trace.synthesizer}`),
      ],
    ),
    renderMarkdown(res.answer),
    trace &&
      h(
        "details",
        { class: "trace" },
        h("summary", null, "Agent trace"),
        h(
          "ol",
          null,
          trace.attempts.map((a) =>
            h(
              "li",
              null,
              "Plan → Retrieve with ",
              h("code", null, a.terms.join(", ") || "—"),
              ` → ${a.candidates} candidates → Reflect: ${a.sufficient ? "sufficient" : "insufficient, reformulate"}`,
            ),
          ),
          h("li", null, `Synthesize (${trace.synthesizer})`),
        ),
      ),
    sourceList(res.sources),
  );
}

/** Chat panel for one indexed repository. */
export function chat(repoId, repoName) {
  let busy = false;
  let count = 0;

  const end = h("div");
  const thinking = h("div", { class: "msg msg-assistant thinking" }, "Searching the code graph…");
  const intro = h(
    "div",
    { class: "chat-intro" },
    h("h2", null, `Ask about ${repoName}`),
    h(
      "p",
      { class: "muted" },
      "Name a function, class, or file for the sharpest answers, e.g. “who calls ",
      h("code", null, "parse"),
      "?” or “how does ",
      h("code", null, "Client.send"),
      " work?”",
    ),
    h(
      "div",
      { class: "suggestions" },
      SUGGESTIONS.map((s) => h("button", { class: "chip", onclick: () => send(s) }, s)),
    ),
  );
  const thread = h("div", { class: "thread" }, intro, end);
  const textarea = h("textarea", { id: "question", rows: 1, placeholder: "Ask how something works…" });
  const submit = h("button", { type: "submit", disabled: true }, "Ask");
  const form = h(
    "form",
    { class: "composer" },
    h("label", { for: "question", class: "sr-only" }, "Question"),
    textarea,
    submit,
  );

  const sync = () => {
    submit.disabled = busy || !textarea.value.trim();
  };
  const scrollEnd = () => end.scrollIntoView({ behavior: "smooth", block: "end" });
  const push = (el) => {
    if (count++ === 0) intro.remove();
    thread.insertBefore(el, end);
    scrollEnd();
  };

  async function send(question) {
    const q = question.trim();
    if (!q || busy) return;
    textarea.value = "";
    push(h("div", { class: "msg msg-user" }, q));
    busy = true;
    sync();
    thread.insertBefore(thinking, end);
    scrollEnd();
    let reply;
    try {
      reply = assistantMessage(await api.ask(repoId, q));
    } catch (err) {
      reply = h("div", { class: "msg msg-error" }, err.message);
    }
    thinking.remove();
    busy = false;
    push(reply);
    sync();
  }

  textarea.addEventListener("input", sync);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(textarea.value);
    }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send(textarea.value);
  });

  return h("div", { class: "chat" }, thread, form);
}
