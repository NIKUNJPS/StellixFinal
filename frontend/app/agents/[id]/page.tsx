"use client";

import { ArrowLeft, Bot, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  GLASS,
  LABEL,
  Markdown,
  PipelineProgress,
  RatingBadge,
  RegimeBadge,
  StatusPill,
  alphaColor,
  pct,
} from "@/components/agents/agent-ui";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";
import type { AgentAnalysisDetail, AgentProgressEvent, Lesson } from "@/lib/agent-types";
import { useCan } from "@/hooks/use-permissions";
import { getAnalysis, retryAnalysis } from "@/lib/agents";

const TAB = "rounded-lg px-3 py-1.5 text-xs data-[state=active]:bg-white/[0.08] data-[state=active]:text-[#F5F5F7]";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className={LABEL}>{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div>
      <p className={LABEL}>{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold" style={color ? { color } : undefined}>
        {value}
      </p>
    </div>
  );
}

function LessonList({ lessons, empty }: { lessons?: Lesson[]; empty: string }) {
  if (!lessons || lessons.length === 0) return <p className="text-xs text-[#666A76]">{empty}</p>;
  return (
    <ul className="space-y-2">
      {lessons.map((l) => (
        <li key={`${l.ticker}-${l.trade_date}`} className="text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold">{l.ticker}</span>
            <span className="font-mono text-[#808495]">{l.trade_date}</span>
            <RegimeBadge regime={l.regime} />
            <RatingBadge rating={(l.rating as AgentAnalysisDetail["rating"]) ?? null} />
            <span className="font-mono" style={{ color: alphaColor(l.alpha) }}>
              α {pct(l.alpha)}
            </span>
          </div>
          {l.reflection && <p className="mt-1 text-[#9A9DA8]">{l.reflection}</p>}
        </li>
      ))}
    </ul>
  );
}

function AnalysisDetailContent({ id }: { id: string }) {
  const { subscribe } = useWebSocket();
  const [a, setA] = useState<AgentAnalysisDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const canRun = useCan("agents.run");

  async function onRetry() {
    setRetrying(true);
    try {
      await retryAnalysis(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to retry");
    } finally {
      setRetrying(false);
    }
  }

  const load = useCallback(() => {
    getAnalysis(id)
      .then(setA)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load the analysis"));
  }, [id]);

  useEffect(load, [load]);

  useEffect(
    () =>
      subscribe("agent_progress", (event: WSEvent) => {
        const ev = event as unknown as AgentProgressEvent;
        if (ev.analysis_id !== id) return;
        if (ev.status === "completed" || ev.status === "failed") return load();
        setA((prev) =>
          prev && ev.stage && !prev.progress.some((p) => p.stage === ev.stage)
            ? { ...prev, status: ev.status, progress: [...prev.progress, { stage: ev.stage, at: new Date().toISOString() }] }
            : prev,
        );
      }),
    [subscribe, id, load],
  );

  if (error) return <p className="p-6 text-sm text-[#F87171]">{error}</p>;
  if (!a) return <div className="m-2 h-64 animate-pulse rounded-2xl bg-white/[0.03]" />;

  const r = a.reports ?? {};
  const ctx = a.regime_context ?? {};
  const running = a.status === "queued" || a.status === "running";

  return (
    <div className="relative min-h-full bg-[#07080B] px-1 py-1 text-[#F5F5F7]">
      <Link href="/agents" className="mb-4 inline-flex items-center gap-1 text-xs text-[#9A9DA8] hover:text-[#F5F5F7]">
        <ArrowLeft className="h-3.5 w-3.5" /> Agent Desk
      </Link>

      {/* Header */}
      <section className={`${GLASS} p-5`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[#808495]">
              <Bot className="h-3.5 w-3.5" /> Multi-agent analysis{a.backtest_run_id ? " · backtest cell" : ""}
            </p>
            <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-extrabold tracking-tight">
              <span className="font-mono">{a.ticker}</span>
              <span className="font-mono text-base font-normal text-[#808495]">{a.trade_date}</span>
              <StatusPill status={a.status} />
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <RegimeBadge regime={a.regime_at_analysis} confidence={a.regime_confidence} />
              <span className="font-mono text-[11px] text-[#666A76]">
                Stellix Labs Research · {a.llm_call_count} audited agent steps
              </span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className={LABEL}>Portfolio manager</p>
              <div className="mt-1">
                <RatingBadge rating={a.rating} size="lg" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <Stat label="Trader" value={a.trader_action ?? "—"} />
              <Stat label="Horizon" value={a.time_horizon ?? "—"} />
              <Stat label="Sizing" value={a.position_sizing ?? "—"} />
              <Stat
                label={`Alpha${a.benchmark ? ` vs ${a.benchmark}` : ""}`}
                value={a.settled_alpha == null ? "pending" : pct(a.settled_alpha)}
                color={alphaColor(a.settled_alpha)}
              />
            </div>
          </div>
        </div>
        {a.error && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[#F87171]/25 bg-[#F87171]/10 p-3 sm:flex-row sm:items-center">
            <p className="flex-1 font-mono text-[11px] text-[#F87171]">{a.error}</p>
            {canRun && a.status === "failed" && (
              <button
                type="button"
                onClick={onRetry}
                disabled={retrying}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 py-1.5 text-xs text-[#F5F5F7] hover:bg-white/[0.06] disabled:opacity-50"
                title="Resumes from the last agent that finished"
              >
                <RotateCcw className="h-3.5 w-3.5" /> {retrying ? "Queuing…" : "Retry from last agent"}
              </button>
            )}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-[#666A76]">
          <span>language {String(a.config_snapshot?.output_language ?? "English")}</span>
          <span>
            book{" "}
            {a.portfolio == null
              ? "not provided"
              : a.portfolio.positions.length === 0
                ? "flat"
                : a.portfolio.positions.map((p) => `${p.ticker} ${p.quantity}`).join(", ")}
            {a.portfolio?.cash != null && ` · cash ${a.portfolio.cash.toLocaleString()} ${a.portfolio.currency ?? ""}`}
          </span>
        </div>
      </section>

      {(running || a.status === "failed") && (
        <section className={`${GLASS} mt-6 p-5`}>
          <p className={`${LABEL} mb-3`}>Pipeline</p>
          <PipelineProgress expected={a.expected_stages} done={a.progress.map((p) => p.stage)} status={a.status} />
        </section>
      )}

      {a.settled_at && (
        <section className={`${GLASS} mt-6 p-5`}>
          <p className={LABEL}>Outcome (settled {a.settled_resolution_date})</p>
          <div className="mt-3 flex flex-wrap gap-8">
            <Stat label="Raw return" value={pct(a.settled_raw_return)} color={alphaColor(a.settled_raw_return)} />
            <Stat label={`Alpha vs ${a.benchmark}`} value={pct(a.settled_alpha)} color={alphaColor(a.settled_alpha)} />
            <Stat label="Window" value={`${a.holding_days} trading days`} />
          </div>
          {a.settled_reflection && <p className="mt-3 max-w-3xl text-sm text-[#D4D5DB]">{a.settled_reflection}</p>}
        </section>
      )}

      {a.status === "completed" && (
        <Tabs defaultValue="decision" className="mt-6">
          <TabsList className="flex flex-wrap gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
            <TabsTrigger className={TAB} value="decision">Decision</TabsTrigger>
            <TabsTrigger className={TAB} value="analysts">Analyst reports</TabsTrigger>
            <TabsTrigger className={TAB} value="debate">Bull vs bear</TabsTrigger>
            <TabsTrigger className={TAB} value="risk">Risk committee</TabsTrigger>
            <TabsTrigger className={TAB} value="context">Stellix context</TabsTrigger>
          </TabsList>

          <TabsContent value="decision" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Block title="Portfolio manager — final decision">
              <Markdown source={r.final_trade_decision} />
            </Block>
            <div className="grid gap-4">
              <Block title="Research manager — investment plan">
                <Markdown source={r.investment_plan} />
              </Block>
              <Block title="Trader — transaction proposal">
                <Markdown source={r.trader_investment_plan} />
              </Block>
            </div>
          </TabsContent>

          <TabsContent value="analysts" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Block title="Market / technical">
              <Markdown source={r.market_report} />
            </Block>
            <Block title="Sentiment">
              <Markdown source={r.sentiment_report} />
            </Block>
            <Block title="News & macro">
              <Markdown source={r.news_report} />
            </Block>
            <Block title="Fundamentals">
              <Markdown source={r.fundamentals_report} />
            </Block>
          </TabsContent>

          <TabsContent value="debate" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Block title="Bull researcher">
              <Markdown source={r.investment_debate?.bull_history} />
            </Block>
            <Block title="Bear researcher">
              <Markdown source={r.investment_debate?.bear_history} />
            </Block>
            <div className="lg:col-span-2">
              <Block title="Research manager — judgement">
                <Markdown source={r.investment_debate?.judge_decision} />
              </Block>
            </div>
          </TabsContent>

          <TabsContent value="risk" className="mt-4 grid gap-4 lg:grid-cols-3">
            <Block title="Aggressive">
              <Markdown source={r.risk_debate?.aggressive_history} />
            </Block>
            <Block title="Neutral">
              <Markdown source={r.risk_debate?.neutral_history} />
            </Block>
            <Block title="Conservative">
              <Markdown source={r.risk_debate?.conservative_history} />
            </Block>
          </TabsContent>

          <TabsContent value="context" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Block title={`Regime path (as of ${ctx.regime_as_of ?? a.trade_date})`}>
              {ctx.regime_path && ctx.regime_path.length > 0 ? (
                <ol className="space-y-1.5">
                  {ctx.regime_path.map((s) => (
                    <li key={`${s.regime}-${s.start}`} className="flex items-center gap-3 text-xs">
                      <RegimeBadge regime={s.regime} />
                      <span className="font-mono text-[#808495]">
                        {s.start} → {s.end} ({s.bars} bars)
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-[#666A76]">No Stellix regime labels for this ticker on or before the date.</p>
              )}
            </Block>
            <Block title="Your strategies on this symbol">
              {ctx.strategies && ctx.strategies.length > 0 ? (
                <ul className="space-y-1.5 text-xs">
                  {ctx.strategies.map((s, i) => (
                    <li key={`${i}-${s.name}`}className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{s.name}</span>
                      <span className="font-mono text-[#808495]">[{s.status}]</span>
                      <span className="font-mono text-[#9A9DA8]">robustness {s.robustness_score?.toFixed(3) ?? "—"}</span>
                      {ctx.regime && (
                        <span className="font-mono" style={{ color: alphaColor(s.sharpe_in_current_regime) }}>
                          Sharpe in {ctx.regime}: {s.sharpe_in_current_regime?.toFixed(2) ?? "—"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[#666A76]">No strategies on this symbol existed by the analysis date.</p>
              )}
            </Block>
            <Block title="Recorded failures">
              {ctx.failures && ctx.failures.length > 0 ? (
                <ul className="space-y-1.5 text-xs">
                  {ctx.failures.map((f) => (
                    <li key={`${f.strategy}-${f.at}`}>
                      <span className="font-mono text-[#808495]">{f.at}</span> {f.strategy} —{" "}
                      <span className="text-[#F87171]">{f.trigger}</span> in {f.regime}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[#666A76]">No failures on this symbol by the analysis date.</p>
              )}
              {ctx.regime_failure_triggers && ctx.regime_failure_triggers.length > 0 && (
                <p className="mt-2 text-[11px] text-[#9A9DA8]">
                  Org-wide in {ctx.regime}: {ctx.regime_failure_triggers.map((t) => `${t.trigger} ×${t.count}`).join(", ")}
                </p>
              )}
            </Block>
            <Block title="Lessons given to the portfolio manager">
              <p className="mb-2 text-[11px] text-[#9A9DA8]">Same ticker</p>
              <LessonList lessons={ctx.lessons_same_ticker} empty="No settled calls on this ticker before this date." />
              <p className="mb-2 mt-4 text-[11px] text-[#9A9DA8]">Other tickers, same regime</p>
              <LessonList lessons={ctx.lessons_same_regime} empty="No settled calls in this regime before this date." />
            </Block>
            <div className="lg:col-span-2">
              <Block title="Exact text injected into every agent">
                <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[#9A9DA8]">
                  {ctx.instrument_text || "—"}
                </pre>
              </Block>
            </div>
          </TabsContent>
        </Tabs>
      )}

      <p className="mt-8 text-center text-[11px] text-[#666A76]">
        Numeric price target, entry and stop levels are withheld under Safeguard 1. Research output only — not investment
        advice.
      </p>
    </div>
  );
}

export default function AnalysisDetailPage() {
  const params = useParams<{ id: string }>();
  return <DashboardShell>{params?.id ? <AnalysisDetailContent id={params.id} /> : null}</DashboardShell>;
}
