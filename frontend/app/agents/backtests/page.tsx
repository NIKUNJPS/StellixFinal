"use client";

import { ArrowLeft, FlaskConical, Play } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  GLASS,
  LABEL,
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
import type { AgentBacktestDetail, AgentBacktestSummary, AgentProgressEvent, AnalystKey, DeskStatus } from "@/lib/agent-types";
import { getBacktest, getDeskStatus, listBacktests, startBacktest } from "@/lib/agents";

const ANALYSTS: { key: AnalystKey; label: string }[] = [
  { key: "market", label: "Market" },
  { key: "social", label: "Sentiment" },
  { key: "news", label: "News" },
  { key: "fundamentals", label: "Fundamentals" },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Mirrors TradingAgents' iter_grid: every Nth calendar day from start, never past today. */
function gridSize(start: string, end: string, every: number): number {
  const s = new Date(start);
  const e = new Date(Math.min(new Date(end).getTime(), Date.now()));
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s || every < 1) return 0;
  return Math.floor((e.getTime() - s.getTime()) / 86_400_000 / every) + 1;
}

function BacktestsContent() {
  const canRun = useCan("agents.run");
  const { subscribe } = useWebSocket();
  const [status, setStatus] = useState<DeskStatus | null>(null);
  const [runs, setRuns] = useState<AgentBacktestSummary[] | null>(null);
  const [selected, setSelected] = useState<AgentBacktestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tickers, setTickers] = useState("NVDA, AAPL");
  const [start, setStart] = useState(isoDaysAgo(120));
  const [end, setEnd] = useState(isoDaysAgo(14));
  const [every, setEvery] = useState(14);
  const [analysts, setAnalysts] = useState<AnalystKey[]>(["market", "news"]);
  const [submitting, setSubmitting] = useState(false);
  const reloadTimer = useRef<ReturnType<typeof setTimeout>>();

  const loadRuns = useCallback(async () => {
    try {
      setRuns((await listBacktests()).items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load backtests");
    }
  }, []);

  const open = useCallback(async (id: string) => {
    try {
      setSelected(await getBacktest(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the backtest");
    }
  }, []);

  useEffect(() => {
    getDeskStatus().then(setStatus).catch(() => setStatus(null));
    void loadRuns();
  }, [loadRuns]);

  useEffect(
    () =>
      subscribe("agent_progress", (event: WSEvent) => {
        const ev = event as unknown as AgentProgressEvent;
        if (!ev.backtest_run_id || (ev.status !== "completed" && ev.status !== "failed")) return;
        // A cell finished: refresh (debounced — cells can finish close together).
        clearTimeout(reloadTimer.current);
        reloadTimer.current = setTimeout(() => {
          void loadRuns();
          if (selected?.id === ev.backtest_run_id) void open(ev.backtest_run_id);
        }, 800);
      }),
    [subscribe, loadRuns, open, selected?.id],
  );
  useEffect(() => () => clearTimeout(reloadTimer.current), []);

  const tickerList = useMemo(
    () => Array.from(new Set(tickers.split(/[\s,]+/).map((t) => t.trim().toUpperCase()).filter(Boolean))),
    [tickers],
  );
  const cells = tickerList.length * gridSize(start, end, every);
  const maxCells = status?.backtest_max_cells ?? 40;

  async function onStart() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await startBacktest({ tickers: tickerList, start_date: start, end_date: end, every_n_days: every, selected_analysts: analysts });
      await loadRuns();
      await open(res.run_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start the backtest");
    } finally {
      setSubmitting(false);
    }
  }

  const disabled =
    !canRun || !status?.configured || submitting || cells === 0 || cells > maxCells || analysts.length === 0;

  return (
    <div className="relative min-h-full bg-[#07080B] px-1 py-1 text-[#F5F5F7]">
      <Link href="/agents" className="mb-4 inline-flex items-center gap-1 text-xs text-[#9A9DA8] hover:text-[#F5F5F7]">
        <ArrowLeft className="h-3.5 w-3.5" /> Agent Desk
      </Link>
      <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
        <FlaskConical className="h-7 w-7 text-[#8E88C7]" /> Agent backtests
      </h1>
      <p className="mt-1 max-w-3xl text-xs text-[#9A9DA8]">
        Runs the full desk over a ticker × date grid, in date order, then scores each call on realised alpha split by the
        regime it was made in. Each cell sees only what was knowable on its date, including lessons from earlier cells whose
        outcome had already resolved.
      </p>

      {status && !status.configured && (
        <div className="mt-4 rounded-2xl border border-[#FBBF24]/25 bg-[#FBBF24]/10 p-4 text-xs text-[#FBBF24]">{status.reason}</div>
      )}
      {error && (
        <div className="mt-4 rounded-2xl border border-[#F87171]/25 bg-[#F87171]/10 p-4 text-xs font-medium text-[#F87171]">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
        <section className={`${GLASS} p-5`}>
          <p className={LABEL}>New grid</p>
          <label className="mt-3 block">
            <span className="text-[11px] text-[#9A9DA8]">Tickers (up to 10)</span>
            <input
              value={tickers}
              onChange={(e) => setTickers(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-[#8E88C7]/60"
            />
          </label>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              ["From", start, setStart],
              ["To", end, setEnd],
            ].map(([label, value, set]) => (
              <label key={label as string} className="block">
                <span className="text-[11px] text-[#9A9DA8]">{label as string}</span>
                <input
                  type="date"
                  value={value as string}
                  onChange={(e) => (set as (v: string) => void)(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/30 px-1.5 py-2 font-mono text-[11px] outline-none [color-scheme:dark]"
                />
              </label>
            ))}
            <label className="block">
              <span className="text-[11px] text-[#9A9DA8]">Every N days</span>
              <input
                type="number"
                min={1}
                max={90}
                value={every}
                onChange={(e) => setEvery(Number(e.target.value) || 1)}
                className="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/30 px-2 py-2 font-mono text-xs outline-none"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {ANALYSTS.map((a) => {
              const on = analysts.includes(a.key);
              return (
                <button
                  key={a.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setAnalysts((p) => (on ? p.filter((x) => x !== a.key) : [...p, a.key]))}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                    on ? "border-[#8E88C7]/50 bg-[#8E88C7]/15 text-[#E4E2F7]" : "border-white/[0.06] text-[#808495]"
                  }`}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
          <p className={`mt-4 font-mono text-xs ${cells > maxCells ? "text-[#F87171]" : "text-[#9A9DA8]"}`}>
            {cells} cells ({tickerList.length} tickers × {gridSize(start, end, every)} dates) · limit {maxCells}
          </p>
          <p className="mt-1 text-[11px] text-[#666A76]">
            Each cell is a full multi-agent run. Dates within the last {status?.holding_days ?? 5} trading days cannot be
            scored yet.
          </p>
          <button
            type="button"
            onClick={onStart}
            disabled={disabled}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#8E88C7] px-4 py-2.5 text-sm font-semibold text-[#0B0B10] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-4 w-4" /> {submitting ? "Queuing…" : "Run the grid"}
          </button>
        </section>

        <section className={`${GLASS} p-5`}>
          <p className={LABEL}>Runs</p>
          {runs === null ? (
            <div className="mt-3 h-20 animate-pulse rounded-xl bg-white/[0.03]" />
          ) : runs.length === 0 ? (
            <p className="mt-3 text-xs text-[#9A9DA8]">No agent backtests yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-white/[0.04]">
              {runs.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => void open(r.id)}
                    className={`flex w-full items-center gap-3 px-2 py-2 text-left text-xs hover:bg-white/[0.03] ${
                      selected?.id === r.id ? "bg-white/[0.04]" : ""
                    }`}
                  >
                    <span className="font-mono font-semibold">{r.tickers.join(", ")}</span>
                    <span className="font-mono text-[#808495]">
                      {r.trade_dates[0]} → {r.trade_dates[r.trade_dates.length - 1]}
                    </span>
                    <span className="ml-auto font-mono text-[#9A9DA8]">
                      {r.completed_cells + r.failed_cells}/{r.total_cells}
                    </span>
                    <StatusPill status={r.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {selected && (
        <section className={`${GLASS} mt-6 p-5`}>
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mono text-sm font-semibold">{selected.tickers.join(", ")}</p>
            <StatusPill status={selected.status} />
            <span className="font-mono text-[11px] text-[#808495]">
              {selected.completed_cells} completed · {selected.failed_cells} failed · {selected.summary.scored_cells ?? 0} scored
              of {selected.total_cells}
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
            <div
              className="h-full bg-[#8E88C7] transition-all"
              style={{ width: `${((selected.completed_cells + selected.failed_cells) / Math.max(selected.total_cells, 1)) * 100}%` }}
            />
          </div>
          {selected.error && <p className="mt-3 font-mono text-[11px] text-[#F87171]">{selected.error}</p>}

          <p className={`${LABEL} mt-6 mb-2`}>Realised alpha by regime × rating</p>
          <RegimeRatingTable summary={selected.summary} />

          <p className={`${LABEL} mt-6 mb-2`}>Cells</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr>
                  {["Date", "Ticker", "Regime", "Rating", "Alpha", "Status"].map((h) => (
                    <th key={h} className={`${LABEL} px-2 py-2`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected.cells.map((c) => (
                  <tr key={c.id} className="border-t border-white/[0.04] text-xs">
                    <td className="px-2 py-1.5 font-mono text-[#9A9DA8]">{c.trade_date}</td>
                    <td className="px-2 py-1.5 font-mono font-semibold">
                      <Link href={`/agents/${c.id}`} className="hover:underline">
                        {c.ticker}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5">
                      <RegimeBadge regime={c.regime_at_analysis} />
                    </td>
                    <td className="px-2 py-1.5">
                      <RatingBadge rating={c.rating} />
                    </td>
                    <td className="px-2 py-1.5 font-mono" style={{ color: alphaColor(c.settled_alpha) }}>
                      {pct(c.settled_alpha)}
                    </td>
                    <td className="px-2 py-1.5">
                      <StatusPill status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default function AgentBacktestsPage() {
  return (
    <DashboardShell>
      <BacktestsContent />
    </DashboardShell>
  );
}
