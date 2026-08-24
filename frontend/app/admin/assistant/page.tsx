"use client";

import { useCallback, useRef, useState } from "react";
import {
  ArrowUp,
  Brain,
  CircleStop,
  Sparkles,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { streamChat } from "@/lib/llm";
import type { ChatStakes } from "@/lib/llm-types";

/**
 * Research Assistant (Batch 18) — streaming chat over SSE.
 *
 * The model badge is not decoration: the backend cost router picks a provider per
 * request (Gemini for routine chat, Claude when stakes are high), at a ~6x cost
 * difference. Showing which model actually answered keeps that choice visible to
 * the researcher rather than hidden in the audit log.
 */

const MODEL_STYLES: Record<string, string> = {
  gemini: "bg-[#075056]/20 text-[#8bd8c8] border-[#075056]/40",
  claude: "bg-[#074068]/25 text-[#8ebce0] border-[#074068]/40",
};

const FALLBACK_BADGE =
  "bg-[#d3dbdd]/5 text-[#d3dbdd]/60 border-[#d3dbdd]/10";

function modelBadgeClass(model: string): string {
  const key = Object.keys(MODEL_STYLES).find((k) =>
    model.startsWith(k),
  );

  return (key && MODEL_STYLES[key]) || FALLBACK_BADGE;
}

function modelLabel(model: string): string {
  if (model.startsWith("gemini-2.5-flash")) return "Gemini 2.5 Flash";
  if (model.startsWith("claude-sonnet")) return "Claude Sonnet";
  return model;
}

const STAKES: ChatStakes[] = ["low", "medium", "high"];

const SUGGESTIONS = [
  "How should position sizing adapt across volatility regimes?",
  "How can I test whether a strategy is regime-dependent?",
  "What makes a backtest robust across market conditions?",
];

export default function ResearchAssistantPage() {
  const [input, setInput] = useState("");
  const [stakes, setStakes] = useState<ChatStakes>("low");
  const [response, setResponse] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async () => {
    const message = input.trim();
    if (!message || streaming) return;

    setStreaming(true);
    setError(null);
    setResponse("");
    setModel(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for await (const event of streamChat(
        { message, stakes },
        controller.signal,
      )) {
        if (event.error) {
          setError(event.error);
          break;
        }

        if (event.model) {
          setModel((prev) => prev ?? event.model!);
        }

        if (event.chunk) {
          setResponse((prev) => prev + event.chunk);
        }

        if (event.done) break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, stakes, streaming]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className="min-h-full bg-black text-[#d3dbdd]">
      <div className="mx-auto w-full max-w-6xl px-1 py-2">
        {/* ============================================================
            HEADER
           ============================================================ */}

        <div className="mb-12 flex items-start justify-between gap-6">
          <div>
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#075056]/40 bg-[#075056]/10">
                <Brain className="h-4 w-4 text-[#78cfc0]" />
              </div>

              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d3dbdd]/35">
                Research Intelligence
              </span>
            </div>

            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[#d3dbdd]">
              Research Assistant
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#d3dbdd]/40">
              Explore strategy design, regimes, backtesting methodology, and
              risk. The assistant provides research analysis — it cannot
              forecast prices or modify strategies.
            </p>
          </div>

          {model && (
            <div className="hidden items-center gap-2.5 sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#5cc9b5] opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#5cc9b5]" />
              </span>

              <span className="text-[10px] uppercase tracking-[0.12em] text-[#d3dbdd]/25">
                {modelLabel(model)}
              </span>
            </div>
          )}
        </div>

        {/* ============================================================
            EMPTY STATE
           ============================================================ */}

        {!response && !streaming && !error && (
          <div className="mb-14">
            <div className="max-w-3xl">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#78cfc0]/60">
                Start a research thread
              </p>

              <h2 className="text-[2rem] font-medium tracking-[-0.035em] text-[#d3dbdd]">
                What are you researching?
              </h2>

              <p className="mt-3 max-w-xl text-sm leading-6 text-[#d3dbdd]/35">
                Ask a question about strategy behavior, market regimes,
                validation, risk, or quantitative research methodology.
              </p>
            </div>

            {/* Suggested research */}
            <div className="mt-8 grid max-w-5xl gap-x-3 gap-y-3 md:grid-cols-3">
              {SUGGESTIONS.map((suggestion, index) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setInput(suggestion)}
                  className="group relative border-t border-[#d3dbdd]/10 py-4 text-left transition-all duration-200 hover:border-[#075056]"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-[10px] font-medium text-[#d3dbdd]/20">
                      0{index + 1}
                    </span>

                    <Zap className="h-3.5 w-3.5 text-[#d3dbdd]/15 transition-colors group-hover:text-[#78cfc0]" />
                  </div>

                  <p className="max-w-xs text-xs leading-5 text-[#d3dbdd]/40 transition-colors group-hover:text-[#d3dbdd]/70">
                    {suggestion}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================
            CONVERSATION
           ============================================================ */}

        {(response || streaming || error) && (
          <div className="mb-10 max-w-4xl">
            {/* User question */}
            <div className="mb-9">
              <span className="mb-3 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d3dbdd]/25">
                Research query
              </span>

              <p className="text-lg leading-8 tracking-[-0.01em] text-[#d3dbdd]/85">
                {input}
              </p>
            </div>

            {/* Assistant response */}
            {(response || streaming) && (
              <div className="relative pl-5">
                <div className="absolute bottom-0 left-0 top-0 w-px bg-gradient-to-b from-[#5cc9b5] via-[#075056]/50 to-transparent" />

                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#075056]/15">
                    <Sparkles className="h-3.5 w-3.5 text-[#78cfc0]" />
                  </div>

                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d3dbdd]/30">
                    Research analysis
                  </span>

                  {model && (
                    <span className="text-[10px] text-[#d3dbdd]/20">
                      · {modelLabel(model)}
                    </span>
                  )}
                </div>

                <p
                  data-testid="assistant-response"
                  className={`whitespace-pre-wrap text-sm leading-7 text-[#d3dbdd]/70 ${
                    streaming
                      ? "after:ml-1 after:animate-blink after:text-[#5cc9b5] after:content-['▌']"
                      : ""
                  }`}
                >
                  {response}
                </p>

                {streaming && !response && (
                  <div className="flex items-center gap-2 py-4">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5cc9b5]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5cc9b5] [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5cc9b5] [animation-delay:300ms]" />
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-6 border-l border-[#c40707] bg-[#c40707]/5 px-4 py-3">
                <p
                  role="alert"
                  className="text-xs leading-5 text-[#ef8585]"
                >
                  {error}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ============================================================
            COMPOSER
           ============================================================ */}

        <div className="sticky bottom-4 z-20">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <div className="rounded-2xl border border-[#d3dbdd]/10 bg-[#16232b] shadow-[0_20px_60px_rgba(0,0,0,0.35)] transition-all duration-200 focus-within:border-[#075056]/60">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about your research..."
                disabled={streaming}
                maxLength={4000}
                aria-label="Question for the research assistant"
                className="h-14 border-0 bg-transparent px-4 text-sm text-[#d3dbdd] shadow-none placeholder:text-[#d3dbdd]/25 focus-visible:ring-0"
              />

              <div className="flex items-center justify-between border-t border-[#d3dbdd]/7 px-3 py-2">
                {/* Stakes */}
                <div className="flex items-center gap-1">
                  <span className="mr-2 hidden text-[9px] uppercase tracking-[0.15em] text-[#d3dbdd]/20 sm:inline">
                    Stakes
                  </span>

                  {STAKES.map((s) => {
                    const active = stakes === s;

                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={streaming}
                        onClick={() => setStakes(s)}
                        className={`
                          rounded-lg px-2.5 py-1.5 text-[10px]
                          font-medium capitalize transition-all
                          ${
                            active
                              ? "bg-[#075056]/25 text-[#78cfc0]"
                              : "text-[#d3dbdd]/30 hover:bg-[#d3dbdd]/5 hover:text-[#d3dbdd]/60"
                          }
                        `}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>

                {/* Send / Stop */}
                {streaming ? (
                  <Button
                    type="button"
                    onClick={stop}
                    className="h-9 rounded-xl bg-[#c40707] px-3 text-white shadow-none transition-all hover:bg-[#c40707]/90 active:scale-95"
                  >
                    <CircleStop className="mr-1.5 h-3.5 w-3.5" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={input.trim().length === 0}
                    className="h-9 w-9 rounded-xl bg-[#074068] p-0 text-white shadow-none transition-all hover:bg-[#074068]/90 hover:shadow-[0_8px_24px_rgba(7,64,104,0.28)] disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Send question"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between px-1">
              <p className="text-[9px] text-[#d3dbdd]/15">
                Research assistance only · verify important conclusions
              </p>

              <p className="hidden text-[9px] text-[#d3dbdd]/15 sm:block">
                {input.length}/4000
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}