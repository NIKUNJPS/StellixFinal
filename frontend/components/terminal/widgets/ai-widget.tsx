"use client";

import { Send, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { streamChat } from "@/lib/llm";

interface Turn {
  role: "user" | "assistant";
  text: string;
  model?: string;
  error?: string;
}

const SUGGESTIONS = ["Summarise today's news for this symbol", "What regime is it in and what does that imply?", "Key risks from the latest quarter?"];

/** The Research Assistant (same cost router, audit log and Safeguard 1), focused on the
 * active symbol: the server adds the delayed quote, the Stellix regime and headlines. */
export default function AiWidget({ symbol }: { symbol: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  // Block bodies on purpose: newer browsers return a Promise from scrollIntoView(), and
  // an effect must return nothing or a cleanup function.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns]);
  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text: q }, { role: "assistant", text: "" }]);
    const controller = new AbortController();
    abort.current = controller;
    const patch = (fn: (last: Turn) => Turn) =>
      setTurns((t) => {
        const last = t[t.length - 1];
        return last ? [...t.slice(0, -1), fn(last)] : t;
      });
    try {
      for await (const ev of streamChat({ message: q, context_symbol: symbol }, controller.signal)) {
        if (ev.error) patch((l) => ({ ...l, error: ev.error }));
        if (ev.chunk) patch((l) => ({ ...l, text: l.text + ev.chunk, model: ev.model ?? l.model }));
        if (ev.done) break;
      }
    } catch (e) {
      if (!controller.signal.aborted) patch((l) => ({ ...l, error: e instanceof Error ? e.message : "The assistant failed" }));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
        {turns.length === 0 && (
          <div className="space-y-1">
            <p className="text-[11px] text-[#808495]">Ask about {symbol}. Answers use its delayed quote, Stellix regime and recent headlines.</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} className="block w-full rounded border border-white/[0.06] px-2 py-1 text-left text-[11px] text-[#B7B2E6] hover:bg-white/[0.03]">
                {s}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "ml-6 rounded-lg bg-[#8E88C7]/15 px-2 py-1.5" : "mr-2"}>
            <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-[#D4D5DB]">
              {t.text || (t.role === "assistant" && busy && i === turns.length - 1 ? "…" : "")}
            </p>
            {t.error && <p className="mt-1 text-[10.5px] text-[#F87171]">{t.error}</p>}
            {t.model && <p className="mt-0.5 font-mono text-[9px] text-[#4B4F5C]">{t.model}</p>}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="flex gap-1 border-t border-white/[0.05] p-1.5"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask about ${symbol}…`}
          aria-label="Question for the AI assistant"
          maxLength={4000}
          className="min-w-0 flex-1 rounded border border-white/[0.08] bg-black/30 px-2 py-1 text-[11.5px] outline-none focus:border-[#8E88C7]/60"
        />
        {busy ? (
          <button type="button" onClick={() => abort.current?.abort()} className="rounded border border-white/[0.08] px-2 text-[#F87171]" aria-label="Stop">
            <Square className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button type="submit" className="rounded border border-white/[0.08] px-2 text-[#9A9DA8] hover:text-[#F5F5F7]" aria-label="Send">
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
      </form>
    </div>
  );
}
