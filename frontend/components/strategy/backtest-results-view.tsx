"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BackLink } from "@/components/layout/back-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getBacktestResults } from "@/lib/backtest";
import type { BacktestResultsResponse } from "@/lib/backtest-types";
import { REGIME_COLORS, type RegimeLabel } from "@/lib/regime-types";
import { getStrategy, triggerBacktest } from "@/lib/strategy";
import { STATUS_COLORS, type StrategyRead } from "@/lib/strategy-types";

function pct(v: number | null, digits = 2): string {
  return v === null ? "—" : `${(v * 100).toFixed(digits)}%`;
}

function num(v: number | null, digits = 2): string {
  return v === null ? "—" : v.toFixed(digits);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl p-3 shadow-sm backdrop-blur-sm"
      style={{
        backgroundColor: "rgba(15, 17, 21, 0.65)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      <p className="text-xs font-mono uppercase tracking-wider text-[#9A9DA8]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[#F5F5F7]">{value}</p>
    </div>
  );
}

function bucketize(values: number[], binCount = 12): { bucket: string; count: number }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = span / binCount;
  const counts = new Array(binCount).fill(0);
  for (const v of values) {
    const idx = Math.min(binCount - 1, Math.floor((v - min) / width));
    counts[idx] += 1;
  }
  return counts.map((count, i) => ({
    bucket: (min + i * width).toFixed(0),
    count,
  }));
}

export function BacktestResultsView({ basePath = "/admin" }: { basePath?: string }) {
  const params = useParams();
  const id = String(params.id);

  const [strategy, setStrategy] = useState<StrategyRead | null>(null);
  const [result, setResult] = useState<BacktestResultsResponse | null>(null);
  const [symbol, setSymbol] = useState("AAPL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [detail, backtest] = await Promise.all([getStrategy(id), getBacktestResults(id)]);
      setStrategy(detail.strategy);
      setResult(backtest);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load backtest results");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function onRunBacktest() {
    setError(null);
    setBusy(true);
    try {
      await triggerBacktest(id, symbol);
      setTimeout(() => {
        load();
        setBusy(false);
      }, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start backtest");
      setBusy(false);
    }
  }

  const pnlHistogram = useMemo(() => bucketize((result?.trades ?? []).map((t) => t.pnl)), [result?.trades]);

  const regimeBars = useMemo(
    () =>
      (result?.per_regime ?? []).map((p) => ({
        regime: p.regime_label,
        sharpe: p.sharpe_ratio ?? 0,
      })),
    [result?.per_regime],
  );

  return (
    <>
      <BackLink href={`${basePath}/strategies`} label="Back to strategies" />
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#F5F5F7]">{strategy?.name ?? "Backtest Results"}</h1>
          {strategy && (
            <Badge className="mt-1 border border-white/10" style={{ background: STATUS_COLORS[strategy.status], color: "white" }}>
              {strategy.status}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="w-28 rounded-xl font-mono text-xs uppercase text-[#F5F5F7] focus-visible:border-white/40 focus-visible:ring-0"
            style={{
              backgroundColor: "rgba(20, 22, 27, 0.45)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          />
          <Button
            onClick={onRunBacktest}
            disabled={busy}
            data-testid="run-backtest"
            className="rounded-xl text-xs font-semibold tracking-wide text-white shadow-sm transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:opacity-40"
            style={{
              backgroundColor: "#5C568E",
              border: "1px solid rgba(255, 255, 255, 0.18)",
              boxShadow: "0 4px 20px rgba(92, 86, 142, 0.4)",
            }}
          >
            {busy ? "Running…" : "Run Backtest"}
          </Button>
        </div>
      </div>

      {error && (
        <p
          className="mb-4 rounded-xl p-3 text-xs font-medium text-[#E45B5B]"
          style={{
            backgroundColor: "rgba(228, 91, 91, 0.1)",
            border: "1px solid rgba(228, 91, 91, 0.3)",
          }}
        >
          {error}
        </p>
      )}

      {result && !result.has_run && (
        <Card
          className="rounded-2xl backdrop-blur-sm"
          style={{
            backgroundColor: "rgba(15, 17, 21, 0.65)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <CardContent className="p-6 text-sm text-[#9A9DA8]">
            This strategy hasn&apos;t been backtested yet. Enter a symbol above and click &quot;Run Backtest&quot;.
          </CardContent>
        </Card>
      )}

      {result?.has_run && result.aggregate && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Metric label="Sharpe Ratio" value={num(result.aggregate.sharpe_ratio)} />
            <Metric label="Sortino Ratio" value={num(result.aggregate.sortino_ratio)} />
            <Metric label="Calmar Ratio" value={num(result.aggregate.calmar_ratio)} />
            <Metric label="Max Drawdown" value={pct(result.aggregate.max_drawdown)} />
            <Metric label="Win Rate" value={pct(result.aggregate.win_rate)} />
            <Metric label="Profit Factor" value={num(result.aggregate.profit_factor)} />
            <Metric label="Total Trades" value={String(result.aggregate.trade_count)} />
            <Metric label="Annualized Return" value={pct(result.aggregate.annualized_return)} />
            <Metric label="Volatility" value={pct(result.aggregate.volatility)} />
            <Metric label="Beta vs Benchmark" value={num(result.aggregate.beta_vs_benchmark)} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card
              className="rounded-2xl backdrop-blur-sm"
              style={{
                backgroundColor: "rgba(15, 17, 21, 0.65)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <CardHeader className="border-b border-white/[0.06] pb-3">
                <CardTitle className="text-base font-semibold text-[#F5F5F7]">Equity Curve</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={result.charts?.equity_curve ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                    <XAxis dataKey="timestamp" tick={false} stroke="#666A76" />
                    <YAxis tick={{ fontSize: 11, fill: "#9A9DA8" }} stroke="#666A76" domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ background: "#0F1115", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "8px", color: "#F5F5F7" }} />
                    <Area type="monotone" dataKey="value" stroke="#5C568E" fill="#5C568E" fillOpacity={0.25} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card
              className="rounded-2xl backdrop-blur-sm"
              style={{
                backgroundColor: "rgba(15, 17, 21, 0.65)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <CardHeader className="border-b border-white/[0.06] pb-3">
                <CardTitle className="text-base font-semibold text-[#F5F5F7]">Drawdown</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={result.charts?.drawdown_series ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                    <XAxis dataKey="timestamp" tick={false} stroke="#666A76" />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#9A9DA8" }}
                      stroke="#666A76"
                      tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                    />
                    <Tooltip
                      contentStyle={{ background: "#0F1115", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "8px", color: "#F5F5F7" }}
                      formatter={(v: number) => `${(v * 100).toFixed(2)}%`}
                    />
                    <Area type="monotone" dataKey="value" stroke="#E45B5B" fill="#E45B5B" fillOpacity={0.25} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card
              className="rounded-2xl backdrop-blur-sm"
              style={{
                backgroundColor: "rgba(15, 17, 21, 0.65)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <CardHeader className="border-b border-white/[0.06] pb-3">
                <CardTitle className="text-base font-semibold text-[#F5F5F7]">Trade P&L Distribution</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {pnlHistogram.length === 0 ? (
                  <p className="text-sm text-[#666A76]">No trades yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={pnlHistogram}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#9A9DA8" }} stroke="#666A76" />
                      <YAxis tick={{ fontSize: 11, fill: "#9A9DA8" }} stroke="#666A76" allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#0F1115", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "8px", color: "#F5F5F7" }} />
                      <Bar dataKey="count" fill="#6F6B9B" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card
              className="rounded-2xl backdrop-blur-sm"
              style={{
                backgroundColor: "rgba(15, 17, 21, 0.65)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <CardHeader className="border-b border-white/[0.06] pb-3">
                <CardTitle className="text-base font-semibold text-[#F5F5F7]">Rolling Sharpe</CardTitle>
                <CardDescription className="text-xs text-[#666A76]">20-bar window</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={result.charts?.rolling_sharpe ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                    <XAxis dataKey="timestamp" tick={false} stroke="#666A76" />
                    <YAxis tick={{ fontSize: 11, fill: "#9A9DA8" }} stroke="#666A76" domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ background: "#0F1115", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "8px", color: "#F5F5F7" }} />
                    <Line type="monotone" dataKey="value" stroke="#E5A84B" dot={false} connectNulls={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card
              className="rounded-2xl backdrop-blur-sm lg:col-span-2"
              style={{
                backgroundColor: "rgba(15, 17, 21, 0.65)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <CardHeader className="border-b border-white/[0.06] pb-3">
                <CardTitle className="text-base font-semibold text-[#F5F5F7]">Regime Performance</CardTitle>
                <CardDescription className="text-xs text-[#666A76]">Sharpe ratio by regime at trade entry</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                {regimeBars.length === 0 ? (
                  <p className="text-sm text-[#666A76]">No per-regime trades yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={regimeBars}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                      <XAxis dataKey="regime" tick={{ fontSize: 11, fill: "#9A9DA8" }} stroke="#666A76" />
                      <YAxis tick={{ fontSize: 11, fill: "#9A9DA8" }} stroke="#666A76" />
                      <Tooltip contentStyle={{ background: "#0F1115", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "8px", color: "#F5F5F7" }} />
                      <Bar dataKey="sharpe" radius={[4, 4, 0, 0]}>
                        {regimeBars.map((entry) => (
                          <Cell key={entry.regime} fill={REGIME_COLORS[entry.regime as RegimeLabel] ?? "#6F6B9B"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card
            className="mt-4 rounded-2xl backdrop-blur-sm"
            style={{
              backgroundColor: "rgba(15, 17, 21, 0.65)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <CardHeader className="border-b border-white/[0.06] pb-3">
              <CardTitle className="text-base font-semibold text-[#F5F5F7]">Trade Log</CardTitle>
              <CardDescription className="text-xs text-[#666A76]">{result.trades.length} trades</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-white/[0.06] hover:bg-transparent">
                    <TableHead className="font-mono text-xs text-[#666A76]">Entry Date</TableHead>
                    <TableHead className="font-mono text-xs text-[#666A76]">Direction</TableHead>
                    <TableHead className="font-mono text-xs text-[#666A76]">Entry Price</TableHead>
                    <TableHead className="font-mono text-xs text-[#666A76]">Exit Price</TableHead>
                    <TableHead className="font-mono text-xs text-[#666A76]">P&L</TableHead>
                    <TableHead className="font-mono text-xs text-[#666A76]">Regime at Entry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.trades.map((t) => (
                    <TableRow key={t.id} className="border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]">
                      <TableCell className="text-xs text-[#9A9DA8]">{new Date(t.entry_timestamp).toLocaleDateString()}</TableCell>
                      <TableCell className="font-mono text-xs uppercase text-[#F5F5F7]">{t.direction}</TableCell>
                      <TableCell className="font-mono text-xs text-[#F5F5F7]">{t.entry_price.toFixed(2)}</TableCell>
                      <TableCell className="font-mono text-xs text-[#F5F5F7]">{t.exit_price.toFixed(2)}</TableCell>
                      <TableCell className={`font-mono text-xs font-medium ${t.pnl >= 0 ? "text-[#35C77A]" : "text-[#E45B5B]"}`}>
                        {t.pnl.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-xs text-[#9A9DA8]">{t.regime_at_entry ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}