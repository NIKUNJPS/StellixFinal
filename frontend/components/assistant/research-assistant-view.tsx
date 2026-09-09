"use client";

import { useCallback, useRef, useState } from "react";
import {
  ArrowUp,
  Brain,
  CircleStop,
  Sparkles,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { streamChat } from "@/lib/llm";
import type { ChatStakes } from "@/lib/llm-types";

const PALETTE = {
  mainBg: "#08090B",
  cardBg: "#0F1115",
  elevatedBg: "#14161B",
  borderSubtle: "rgba(255, 255, 255, 0.06)",
  borderHover: "rgba(255, 255, 255, 0.12)",
  textPrimary: "#F5F5F7",
  textSecondary: "#9A9DA8",
  textMuted: "#666A76",
  glowPurple: "#4B4B70",
  glowLavender: "#6F6B9B",
  success: "#35C77A",
  danger: "#E45B5B",
  warning: "#E5A84B",
};

const MODEL_STYLES: Record<string, string> = {
  gemini: "bg-[#6F6B9B]/15 text-[#F5F5F7] border-[#6F6B9B]/30",
  claude: "bg-[#4B4B70]/20 text-[#F5F5F7] border-[#4B4B70]/35",
};

const FALLBACK_BADGE =
  "bg-white/[0.03] text-[#9A9DA8] border-white/[0.06]";

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

export function ResearchAssistantView() {
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
    <div
      className="relative min-h-full"
      style={{
        backgroundColor: PALETTE.mainBg,
        color: PALETTE.textSecondary,
      }}
    >
      {/* Subtle Atmospheric Lighting */}
      <div
        className="pointer-events-none absolute -top-28 left-1/4 h-[420px] w-[600px] -translate-x-1/2 rounded-full opacity-20 blur-[150px]"
        style={{
          background: "radial-gradient(circle, rgba(111, 107, 155, 0.4) 0%, rgba(75, 75, 112, 0.15) 60%, transparent 80%)",
        }}
      />
      <div
        className="pointer-events-none absolute top-40 right-10 h-[320px] w-[440px] rounded-full opacity-15 blur-[140px]"
        style={{
          background: "radial-gradient(circle, rgba(75, 75, 112, 0.35) 0%, rgba(15, 17, 21, 0.15) 65%, transparent 80%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {/* HEADER */}
        <div className="mb-12 flex items-start justify-between gap-6">
          <div>
            <div className="mb-3.5 flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-xl border"
                style={{
                  backgroundColor: PALETTE.cardBg,
                  borderColor: PALETTE.borderSubtle,
                  boxShadow: "0 0 12px rgba(111, 107, 155, 0.2)",
                }}
              >
                <Brain
                  className="h-4 w-4"
                  style={{ color: PALETTE.glowLavender }}
                />
              </div>

              <span
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em]"
                style={{ color: PALETTE.textMuted }}
              >
                Research Intelligence
              </span>
            </div>

            <h1
              className="text-3xl font-bold tracking-[-0.03em]"
              style={{ color: PALETTE.textPrimary }}
            >
              Research Assistant
            </h1>

            <p
              className="mt-2.5 max-w-2xl text-sm leading-6"
              style={{ color: PALETTE.textSecondary }}
            >
              Explore strategy design, regimes, backtesting methodology, and risk.
              The assistant provides research analysis — it cannot forecast prices or modify strategies.
            </p>
          </div>

          {model && (
            <div
              className="hidden items-center gap-2.5 rounded-full border px-3 py-1 font-mono sm:flex"
              style={{
                backgroundColor: PALETTE.elevatedBg,
                borderColor: PALETTE.borderSubtle,
              }}
            >
              <span className="relative flex h-2 w-2">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                  style={{ backgroundColor: PALETTE.success }}
                />
                <span
                  className="relative inline-flex h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: PALETTE.success,
                    boxShadow: "0 0 6px rgba(53, 199, 122, 0.8)",
                  }}
                />
              </span>

              <span
                className="text-[10px] uppercase tracking-[0.14em]"
                style={{ color: PALETTE.textSecondary }}
              >
                {modelLabel(model)}
              </span>
            </div>
          )}
        </div>

        {/* EMPTY STATE */}
        {!response && !streaming && !error && (
          <div className="mb-14">
            <div className="max-w-3xl">
              <p
                className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em]"
                style={{ color: PALETTE.glowLavender }}
              >
                Start a research thread
              </p>

              <h2
                className="text-[2rem] font-bold tracking-[-0.03em]"
                style={{ color: PALETTE.textPrimary }}
              >
                What are you researching?
              </h2>

              <p
                className="mt-2.5 max-w-xl text-sm leading-6"
                style={{ color: PALETTE.textSecondary }}
              >
                Ask a question about strategy behavior, market regimes, validation, risk, or quantitative research methodology.
              </p>
            </div>

            <div className="mt-8 grid max-w-5xl gap-4 md:grid-cols-3">
              {SUGGESTIONS.map((suggestion, index) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setInput(suggestion)}
                  className="group relative rounded-2xl border p-5 text-left transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
                  style={{
                    backgroundColor: PALETTE.cardBg,
                    borderColor: PALETTE.borderSubtle,
                    boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.6)",
                  }}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span
                      className="font-mono text-[11px] font-medium"
                      style={{ color: PALETTE.textMuted }}
                    >
                      0{index + 1}
                    </span>

                    <Zap
                      className="h-3.5 w-3.5 transition-colors duration-200 group-hover:text-white"
                      style={{ color: PALETTE.textMuted }}
                    />
                  </div>

                  <p
                    className="text-xs leading-5 transition-colors duration-200 group-hover:text-[#F5F5F7]"
                    style={{ color: PALETTE.textSecondary }}
                  >
                    {suggestion}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CONVERSATION */}
        {(response || streaming || error) && (
          <div className="mb-12 max-w-4xl space-y-8">
            {/* User Query Card */}
            <div
              className="rounded-2xl border p-6"
              style={{
                backgroundColor: PALETTE.cardBg,
                borderColor: PALETTE.borderSubtle,
                boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.6)",
              }}
            >
              <span
                className="mb-2.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: PALETTE.textMuted }}
              >
                Research query
              </span>

              <p
                className="text-base font-medium leading-7 tracking-tight"
                style={{ color: PALETTE.textPrimary }}
              >
                {input}
              </p>
            </div>

            {/* Assistant Response Card */}
            {(response || streaming) && (
              <div
                className="relative overflow-hidden rounded-2xl border p-6"
                style={{
                  backgroundColor: PALETTE.cardBg,
                  borderColor: PALETTE.borderSubtle,
                  boxShadow: "0 20px 50px -10px rgba(0, 0, 0, 0.7)",
                }}
              >
                {/* Accent Ribbon */}
                <div
                  className="absolute bottom-0 left-0 top-0 w-1"
                  style={{
                    background: "linear-gradient(to bottom, #6F6B9B, #4B4B70, transparent)",
                  }}
                />

                <div className="mb-4 flex items-center gap-2.5">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-lg border"
                    style={{
                      backgroundColor: PALETTE.elevatedBg,
                      borderColor: PALETTE.borderSubtle,
                    }}
                  >
                    <Sparkles
                      className="h-3.5 w-3.5"
                      style={{ color: PALETTE.glowLavender }}
                    />
                  </div>

                  <span
                    className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]"
                    style={{ color: PALETTE.textMuted }}
                  >
                    Research analysis
                  </span>

                  {model && (
                    <span
                      className="font-mono text-[10px]"
                      style={{ color: PALETTE.textMuted }}
                    >
                      · {modelLabel(model)}
                    </span>
                  )}
                </div>

                <p
                  data-testid="assistant-response"
                  className={`whitespace-pre-wrap text-sm leading-7 ${
                    streaming
                      ? "after:ml-1 after:animate-pulse after:font-mono after:text-[#6F6B9B] after:content-['▌']"
                      : ""
                  }`}
                  style={{ color: PALETTE.textPrimary }}
                >
                  {response}
                </p>

                {streaming && !response && (
                  <div className="flex items-center gap-2 py-4">
                    <span
                      className="h-1.5 w-1.5 animate-pulse rounded-full"
                      style={{ backgroundColor: PALETTE.glowLavender }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-pulse rounded-full [animation-delay:150ms]"
                      style={{ backgroundColor: PALETTE.glowLavender }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-pulse rounded-full [animation-delay:300ms]"
                      style={{ backgroundColor: PALETTE.glowLavender }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div
                className="rounded-xl border p-4 text-xs font-medium"
                style={{
                  backgroundColor: "rgba(228, 91, 91, 0.08)",
                  borderColor: "rgba(228, 91, 91, 0.3)",
                  color: PALETTE.danger,
                }}
              >
                <p role="alert">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* COMPOSER */}
        <div className="sticky bottom-6 z-20">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <div
              className="rounded-2xl border backdrop-blur-xl transition-all duration-200 focus-within:border-white/[0.18]"
              style={{
                backgroundColor: PALETTE.elevatedBg,
                borderColor: PALETTE.borderSubtle,
                boxShadow: "0 24px 60px -10px rgba(0, 0, 0, 0.85), 0 0 1px rgba(255, 255, 255, 0.08) inset",
              }}
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about your quantitative research..."
                disabled={streaming}
                maxLength={4000}
                aria-label="Question for the research assistant"
                className="h-14 border-0 bg-transparent px-5 text-sm shadow-none focus-visible:ring-0"
                style={{
                  color: PALETTE.textPrimary,
                }}
              />

              <div
                className="flex items-center justify-between border-t px-4 py-2.5"
                style={{ borderColor: PALETTE.borderSubtle }}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="mr-2 hidden font-mono text-[9px] uppercase tracking-[0.15em] sm:inline"
                    style={{ color: PALETTE.textMuted }}
                  >
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
                        className="rounded-lg px-2.5 py-1 font-mono text-[10px] font-medium capitalize transition-all duration-150"
                        style={{
                          backgroundColor: active
                            ? "rgba(111, 107, 155, 0.2)"
                            : "transparent",
                          color: active ? PALETTE.textPrimary : PALETTE.textMuted,
                          border: `1px solid ${
                            active
                              ? "rgba(111, 107, 155, 0.35)"
                              : "transparent"
                          }`,
                        }}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>

                {streaming ? (
                  <Button
                    type="button"
                    onClick={stop}
                    className="h-8 gap-1.5 rounded-xl border px-3 text-xs font-semibold text-white shadow-none transition-all duration-150 active:scale-95"
                    style={{
                      backgroundColor: "rgba(228, 91, 91, 0.15)",
                      borderColor: "rgba(228, 91, 91, 0.35)",
                      color: PALETTE.danger,
                    }}
                  >
                    <CircleStop className="h-3.5 w-3.5" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={input.trim().length === 0}
                    className="h-8 w-8 rounded-xl border p-0 transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-30"
                    style={{
                      backgroundColor: PALETTE.cardBg,
                      borderColor: "rgba(255, 255, 255, 0.12)",
                      color: PALETTE.textPrimary,
                      boxShadow: "0 4px 14px rgba(0, 0, 0, 0.6)",
                    }}
                    aria-label="Send question"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between px-2 font-mono text-[10px]">
              <p style={{ color: PALETTE.textMuted }}>
                Research assistance only · verify important model conclusions
              </p>

              <p className="hidden sm:block" style={{ color: PALETTE.textMuted }}>
                {input.length}/4000
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}