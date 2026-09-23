"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatResponse } from "@ara/shared";
import { api } from "@/lib/api";
import { SourceList } from "./SourceList";

type Message = { role: "user"; text: string } | { role: "assistant"; res: ChatResponse } | { role: "error"; text: string };

const SUGGESTIONS = [
  "What are the main classes and what do they do?",
  "Who calls the main entry point?",
  "How are errors handled?",
];

export function Chat({ repoId, repoName }: { repoId: number; repoName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await api.ask(repoId, q);
      setMessages((m) => [...m, { role: "assistant", res }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "error", text: (err as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat">
      <div className="thread">
        {messages.length === 0 && (
          <div className="chat-intro">
            <h2>Ask about {repoName}</h2>
            <p className="muted">
              Name a function, class, or file for the sharpest answers, e.g. “who calls <code>parse</code>?” or “how
              does <code>Client.send</code> work?”
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="msg msg-user">
              {m.text}
            </div>
          ) : m.role === "error" ? (
            <div key={i} className="msg msg-error">
              {m.text}
            </div>
          ) : (
            <div key={i} className="msg msg-assistant">
              <div className="answer-meta">
                {m.res.cached ? <span className="tag tag-cache">cached</span> : null}
                <span>{m.res.latencyMs} ms</span>
                {m.res.trace && (
                  <>
                    <span>intent: {m.res.trace.plan.intent}</span>
                    <span>
                      {m.res.trace.attempts.length} retrieval pass{m.res.trace.attempts.length > 1 ? "es" : ""}
                    </span>
                    <span>via {m.res.trace.synthesizer}</span>
                  </>
                )}
              </div>
              <div className="markdown">
                <ReactMarkdown>{m.res.answer}</ReactMarkdown>
              </div>
              {m.res.trace && (
                <details className="trace">
                  <summary>Agent trace</summary>
                  <ol>
                    {m.res.trace.attempts.map((a, j) => (
                      <li key={j}>
                        Plan → Retrieve with <code>{a.terms.join(", ") || "—"}</code> → {a.candidates} candidates →
                        Reflect: {a.sufficient ? "sufficient" : "insufficient, reformulate"}
                      </li>
                    ))}
                    <li>Synthesize ({m.res.trace.synthesizer})</li>
                  </ol>
                </details>
              )}
              <SourceList sources={m.res.sources} />
            </div>
          ),
        )}
        {busy && <div className="msg msg-assistant thinking">Searching the code graph…</div>}
        <div ref={endRef} />
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="question" className="sr-only">
          Question
        </label>
        <textarea
          id="question"
          value={input}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask how something works…"
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Ask
        </button>
      </form>
    </div>
  );
}
