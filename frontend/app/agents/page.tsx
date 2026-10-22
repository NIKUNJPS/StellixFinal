"use client";

import { ArrowRight, Bot, FlaskConical, Play, RefreshCw, Scale } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  GLASS,
  LABEL,
  PipelineProgress,
  RatingBadge,
  RegimeBadge,
  RegimeRatingTable,
  StatusPill,
  alphaColor,
  pct,
} from "@/components/agents/agent-ui";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { useCan } from "@/hooks/use-permissions";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";
import type {
  AgentAnalysisSummary,
  AgentProgressEvent,
  AnalystKey,
  DeskStatus,
  PortfolioInput,
  ScoreSummary,
} from "@/lib/agent-types";
import { getDeskStatus, getTrackRecord, listAnalyses, settleNow, startAnalysis } from "@/lib/agents";
import { terminalApi, type HoldingPortfolio } from "@/lib/terminal";

const ANALYSTS: { key: AnalystKey; label: string; hint: string }[] = [
  { key: "market", label: "Market / technical", hint: "Price action, MACD, RSI, volatility" },
  { key: "social", label: "Sentiment", hint: "News headlines, StockTwits, Reddit" },
  { key: "news", label: "News & macro", hint: "Company and global news, FRED" },
  { key: "fundamentals", label: "Fundamentals", hint: "Statements and ratios" },
];

const LANGUAGES = ["English", "Chinese", "Hindi", "Japanese", "Korean", "Spanish", "French", "German", "Portuguese", "Arabic"];

/** "NVDA 120 150" per line -> positions; throws with the offending line. */
function parseBook(text: string, cash: string, currency: string): PortfolioInput {
  const positions = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [ticker, qty, avg] = line.split(/[\s,]+/);
      const quantity = Number(qty);
      if (!ticker || !Number.isFinite(quantity)) throw new Error(`Holding "${line}" should be: TICKER QUANTITY [AVERAGE_PRICE]`);
      const average_price = avg === undefined ? null : Number(avg);
      if (average_price !== null && !(average_price > 0)) throw new Error(`Average price in "${line}" must be positive`);
      return { ticker: ticker.toUpperCase(), quantity, average_price };
    });
  return {
    cash: cash.trim() === "" ? null : Number(cash),
    currency: currency.trim() || null,
    positions,
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function applyProgress(item: AgentAnalysisSummary, ev: AgentProgressEvent): AgentAnalysisSummary {
  const progress =
    ev.stage && !item.progress.some((p) => p.stage === ev.stage)
      ? [...item.progress, { stage: ev.stage, at: new Date().toISOString() }]
      : item.progress;
  return { ...item, status: ev.status, rating: ev.rating ?? item.rating, progress };
}

function AgentDeskContent() {
  const canRun = useCan("agents.run");
  const { subscribe, connected } = useWebSocket();
  const [status, setStatus] = useState<DeskStatus | null>(null);
  const [items, setItems] = useState<AgentAnalysisSummary[] | null>(null);
  const [record, setRecord] = useState<ScoreSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [ticker, setTicker] = useState("NVDA");
  const [tradeDate, setTradeDate] = useState(today());
  const [analysts, setAnalysts] = useState<AnalystKey[]>(["market", "social", "news", "fundamentals"]);
  const [submitting, setSubmitting] = useState(false);
  const [language, setLanguage] = useState("");
  const [useBook, setUseBook] = useState(false);
  // Batch 31: "tracked" = a Market Terminal holdings portfolio; "manual" = typed below.
  const [bookSource, setBookSource] = useState<"manual" | "tracked">("manual");
  const [trackedId, setTrackedId] = useState<string>("");
  const [tracked, setTracked] = useState<HoldingPortfolio[]>([]);
  const [bookText, setBookText] = useState("NVDA 120 150");
  const [cash, setCash] = useState("25000");
  const [currency, setCurrency] = useState("USD");

  const refresh = useCallback(async () => {
    try {
      const [list, track] = await Promise.all([listAnalyses({ limit: 50 }), getTrackRecord()]);
      setItems(list.items);
      setRecord(track.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the agent desk");
    }
  }, []);

  useEffect(() => {
    getDeskStatus().then(setStatus).catch(() => setStatus(null));
    terminalApi
      .portfolios()
      .then((ps) => {
        setTracked(ps);
        // Arriving from the Terminal's holdings widget (?holdings=<id>) preselects that book.
        const wanted = new URLSearchParams(window.location.search).get("holdings");
        const pick = ps.find((p) => p.id === wanted) ?? ps[0];
        if (pick) setTrackedId(pick.id);
        if (wanted && pick?.id === wanted) {
          setUseBook(true);
          setBookSource("tracked");
        }
      })
      .catch(() => setTracked([]));
    void refresh();
  }, [refresh]);

  useEffect(
    () =>
      subscribe("agent_progress", (event: WSEvent) => {
        const ev = event as unknown as AgentProgressEvent;
        if (ev.backtest_run_id) return; // backtest cells live on the Backtests page
        setItems((prev) => prev?.map((i) => (i.id === ev.analysis_id ? applyProgress(i, ev) : i)) ?? prev);
        if (ev.status === "completed" || ev.status === "failed") void refresh();
      }),
    [subscribe, refresh],
  );

  // Fallback when the realtime socket is down: poll while anything is in flight.
  const inFlight = useMemo(() => (items ?? []).filter((i) => i.status === "queued" || i.status === "running"), [items]);
  useEffect(() => {
    if (connected || inFlight.length === 0) return;
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [connected, inFlight.length, refresh]);

  async function onRun() {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await startAnalysis({
        ticker: ticker.trim(),
        trade_date: tradeDate,
        selected_analysts: analysts,
        output_language: language || undefined,
        portfolio: useBook && bookSource === "manual" ? parseBook(bookText, cash, currency) : undefined,
        holdings_portfolio_id: useBook && bookSource === "tracked" && trackedId ? trackedId : undefined,
      });
      setNotice(`Analysis of ${ticker.trim().toUpperCase()} queued — it streams into "In progress" as each agent finishes.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start the analysis");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSettle() {
    try {
      await settleNow();
      setNotice("Settlement queued. Calls are scored once their holding window has traded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to queue settlement");
    }
  }

  const toggle = (k: AnalystKey) =>
    setAnalysts((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  const disabled = !canRun || !status?.configured || submitting || analysts.length === 0 || !ticker.trim();

  return (
    <div className="relative min-h-full bg-[#07080B] px-1 py-1 text-[#F5F5F7]">
      <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-[#5C568E]/10 blur-[120px]" />

      {/* Header */}
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#808495]">
            Multi-agent research • Stellix Labs Research
          </p>
          <h1 className="mt-1.5 flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <Bot className="h-7 w-7 text-[#8E88C7]" /> Agent Desk
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-[#9A9DA8]">
            Analysts, a bull/bear debate, a trader, a risk committee and a portfolio manager argue each call. Every run
            is told the Stellix regime, your strategies&apos; evidence in that regime, their failures, and the desk&apos;s
            own settled lessons, all as of the analysis date.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 font-mono text-xs ${
              connected ? "border-[#34D399]/30 text-[#34D399]" : "border-white/[0.08] text-[#808495]"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-[#34D399]" : "bg-[#666A76]"}`} />
            {connected ? "live progress" : "polling"}
          </span>
          <Link
            href="/agents/backtests"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#8E88C7]/30 bg-[#8E88C7]/10 px-3 py-2 text-xs font-semibold text-[#B7B2E6] hover:bg-[#8E88C7]/20"
          >
            <FlaskConical className="h-3.5 w-3.5" /> Agent backtests
          </Link>
        </div>
      </div>

      {status && !status.configured && (
        <div className="mb-6 rounded-2xl border border-[#FBBF24]/25 bg-[#FBBF24]/10 p-4 text-xs text-[#FBBF24]">
          <p className="font-semibold">The agent desk is not configured.</p>
          <p className="mt-1 text-[#E8D3A0]">{status.reason} Add the key to <code>backend/.env</code> and restart the API and the Celery worker.</p>
        </div>
      )}
      {notice && (
        <div className="mb-6 rounded-2xl border border-[#34D399]/25 bg-[#34D399]/10 p-4 text-xs font-medium text-[#34D399]">
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-2xl border border-[#F87171]/25 bg-[#F87171]/10 p-4 text-xs font-medium text-[#F87171]">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* New analysis */}
        <section className={`${GLASS} p-5`}>
          <p className={LABEL}>New analysis</p>
          <div className="mt-3 grid grid-cols-[1fr_140px] gap-3">
            <label className="block">
              <span className="text-[11px] text-[#9A9DA8]">Ticker</span>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="NVDA, 0700.HK, BTC-USD"
                className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-[#8E88C7]/60"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-[#9A9DA8]">Analysis date</span>
              <input
                type="date"
                value={tradeDate}
                max={today()}
                onChange={(e) => setTradeDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/30 px-2 py-2 font-mono text-xs outline-none focus:border-[#8E88C7]/60 [color-scheme:dark]"
              />
            </label>
          </div>
          <p className="mt-4 text-[11px] text-[#9A9DA8]">Analyst team</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {ANALYSTS.map((a) => {
              const on = analysts.includes(a.key);
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => toggle(a.key)}
                  title={a.hint}
                  aria-pressed={on}
                  className={`rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                    on
                      ? "border-[#8E88C7]/50 bg-[#8E88C7]/15 text-[#E4E2F7]"
                      : "border-white/[0.06] bg-white/[0.02] text-[#808495] hover:text-[#D4D5DB]"
                  }`}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
          <label className="mt-4 block">
            <span className="text-[11px] text-[#9A9DA8]">Report language</span>
            <input
              list="agent-languages"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder={status?.output_language ?? "English"}
              className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-xs outline-none focus:border-[#8E88C7]/60"
            />
            <datalist id="agent-languages">
              {LANGUAGES.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </label>

          <label className="mt-4 flex items-center gap-2 text-[11px] text-[#9A9DA8]">
            <input type="checkbox" checked={useBook} onChange={(e) => setUseBook(e.target.checked)} className="accent-[#8E88C7]" />
            Run against my holdings (trader, risk team and PM see your book)
          </label>
          {useBook && tracked.length > 0 && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-[#9A9DA8]">
              <label className="flex items-center gap-1">
                <input type="radio" name="book-source" checked={bookSource === "tracked"} onChange={() => setBookSource("tracked")} className="accent-[#8E88C7]" />
                Tracked portfolio
              </label>
              <select
                aria-label="Tracked portfolio"
                value={trackedId}
                onChange={(e) => {
                  setTrackedId(e.target.value);
                  setBookSource("tracked");
                }}
                className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-black/30 px-2 py-1 text-xs outline-none"
              >
                {tracked.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.base_currency})
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1">
                <input type="radio" name="book-source" checked={bookSource === "manual"} onChange={() => setBookSource("manual")} className="accent-[#8E88C7]" />
                Type it
              </label>
            </div>
          )}
          {useBook && bookSource === "manual" && (
            <div className="mt-2 space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="grid grid-cols-[1fr_80px] gap-2">
                <input
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                  placeholder="Cash"
                  inputMode="decimal"
                  className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 font-mono text-xs outline-none"
                />
                <input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  placeholder="USD"
                  className="rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 font-mono text-xs uppercase outline-none"
                />
              </div>
              <textarea
                value={bookText}
                onChange={(e) => setBookText(e.target.value)}
                rows={3}
                placeholder={"NVDA 120 150\nAAPL -50 190"}
                className="w-full rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 font-mono text-xs outline-none"
              />
              <p className="text-[10px] text-[#666A76]">
                One holding per line: TICKER QUANTITY [AVERAGE_PRICE]; negative quantity = short. Empty = a flat book.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={onRun}
            disabled={disabled}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#8E88C7] px-4 py-2.5 text-sm font-semibold text-[#0B0B10] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-4 w-4" /> {submitting ? "Queuing…" : "Run the desk"}
          </button>
          {!canRun && (
            <p className="mt-2 text-[11px] text-[#9A9DA8]">Your role can read analyses but not start them (agents.run).</p>
          )}
          {status && (
            <p className="mt-3 font-mono text-[10px] leading-relaxed text-[#666A76]">
              Stellix Labs Research. A run takes a few minutes; every step is recorded in the LLM audit log and the
              result is scored against what the market actually did over {status.holding_days} trading days.
            </p>
          )}
        </section>

        {/* In flight */}
        <section className={`${GLASS} p-5`}>
          <p className={LABEL}>In progress</p>
          {inFlight.length === 0 ? (
            <p className="mt-3 text-xs text-[#9A9DA8]">Nothing running. Queued and running analyses stream here, agent by agent.</p>
          ) : (
            <div className="mt-3 space-y-5">
              {inFlight.map((i) => (
                <div key={i.id}>
                  <div className="mb-2 flex items-center gap-3">
                    <Link href={`/agents/${i.id}`} className="font-mono text-sm font-semibold hover:underline">
                      {i.ticker}
                    </Link>
                    <span className="font-mono text-[11px] text-[#808495]">{i.trade_date}</span>
                    <StatusPill status={i.status} />
                    <span className="ml-auto font-mono text-[11px] text-[#808495]">
                      {i.progress.length}/{i.expected_stages.length} agents
                    </span>
                  </div>
                  <PipelineProgress
                    expected={i.expected_stages}
                    done={i.progress.map((p) => p.stage)}
                    status={i.status}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Analyses */}
      <section className={`${GLASS} mt-6 p-5`}>
        <div className="flex items-center justify-between">
          <p className={LABEL}>Analyses</p>
          <button type="button" onClick={() => void refresh()} className="text-[#808495] hover:text-[#F5F5F7]" title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        {items === null ? (
          <div className="mt-3 h-24 animate-pulse rounded-xl bg-white/[0.03]" />
        ) : items.length === 0 ? (
          <p className="mt-3 text-xs text-[#9A9DA8]">No analyses yet. Run the desk on a ticker to start the memory.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr>
                  {["Ticker", "Date", "Regime", "Rating", "Trader", "Alpha", "Status", ""].map((h) => (
                    <th key={h} className={`${LABEL} px-2 py-2`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t border-white/[0.04] text-xs">
                    <td className="px-2 py-2 font-mono font-semibold">{i.ticker}</td>
                    <td className="px-2 py-2 font-mono text-[#9A9DA8]">{i.trade_date}</td>
                    <td className="px-2 py-2">
                      <RegimeBadge regime={i.regime_at_analysis} confidence={i.regime_confidence} />
                    </td>
                    <td className="px-2 py-2">
                      <RatingBadge rating={i.rating} />
                    </td>
                    <td className="px-2 py-2 font-mono text-[#9A9DA8]">{i.trader_action ?? "—"}</td>
                    <td className="px-2 py-2 font-mono" style={{ color: alphaColor(i.settled_alpha) }}>
                      {i.settled_alpha == null ? <span className="text-[#666A76]">pending</span> : pct(i.settled_alpha)}
                    </td>
                    <td className="px-2 py-2">
                      <StatusPill status={i.status} />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Link href={`/agents/${i.id}`} className="inline-flex items-center gap-1 text-[#B7B2E6] hover:underline">
                        Open <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Track record */}
      <section className={`${GLASS} mt-6 p-5`}>
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <p className={`${LABEL} flex items-center gap-1.5`}>
              <Scale className="h-3 w-3" /> Desk track record, by regime × rating
            </p>
            <p className="mt-1 text-[11px] text-[#9A9DA8]">
              Mean realised alpha against the regional benchmark. Hit rate counts directional calls only.
            </p>
          </div>
          {canRun && (
            <button
              type="button"
              onClick={onSettle}
              className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-[11px] text-[#D4D5DB] hover:bg-white/[0.04]"
            >
              Settle now
            </button>
          )}
        </div>
        <div className="mt-4">{record ? <RegimeRatingTable summary={record} /> : null}</div>
      </section>

      <p className="mt-8 text-center text-[11px] text-[#666A76]">
        Research output from a multi-agent LLM framework. It creates no strategy, signal or order. Numeric price levels are
        withheld under Safeguard 1. Not investment advice.
      </p>
    </div>
  );
}

export default function AgentDeskPage() {
  return (
    <DashboardShell>
      <AgentDeskContent />
    </DashboardShell>
  );
}
