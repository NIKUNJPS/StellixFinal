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
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
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
          <h1 className="text-xl font-semibold">{strategy?.name ?? "Backtest Results"}</h1>
          {strategy && (
            <Badge className="mt-1" style={{ background: STATUS_COLORS[strategy.status], color: "white" }}>
              {strategy.status}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="w-28" />
          <Button onClick={onRunBacktest} disabled={busy} data-testid="run-backtest">
            {busy ? "Running…" : "Run Backtest"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {result && !result.has_run && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
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
            <Card>
              <CardHeader>
                <CardTitle>Equity Curve</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={result.charts?.equity_curve ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="timestamp" tick={false} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                    <Area type="monotone" dataKey="value" stroke="#00b4d8" fill="#00b4d8" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Drawdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={result.charts?.drawdown_series ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="timestamp" tick={false} stroke="hsl(var(--muted-foreground))" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="hsl(var(--muted-foreground))"
                      tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                    />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                      formatter={(v: number) => `${(v * 100).toFixed(2)}%`}
                    />
                    <Area type="monotone" dataKey="value" stroke="#dc2626" fill="#dc2626" fillOpacity={0.25} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Trade P&L Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {pnlHistogram.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No trades yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={pnlHistogram}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                      <Bar dataKey="count" fill="#9333ea" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Rolling Sharpe</CardTitle>
                <CardDescription>20-bar window</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={result.charts?.rolling_sharpe ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="timestamp" tick={false} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                    <Line type="monotone" dataKey="value" stroke="#f59e0b" dot={false} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Regime Performance</CardTitle>
                <CardDescription>Sharpe ratio by regime at trade entry</CardDescription>
              </CardHeader>
              <CardContent>
                {regimeBars.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No per-regime trades yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={regimeBars}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="regime" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                      <Bar dataKey="sharpe">
                        {regimeBars.map((entry) => (
                          <Cell key={entry.regime} fill={REGIME_COLORS[entry.regime as RegimeLabel] ?? "#64748b"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Trade Log</CardTitle>
              <CardDescription>{result.trades.length} trades</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entry Date</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Entry Price</TableHead>
                    <TableHead>Exit Price</TableHead>
                    <TableHead>P&L</TableHead>
                    <TableHead>Regime at Entry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.trades.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{new Date(t.entry_timestamp).toLocaleDateString()}</TableCell>
                      <TableCell>{t.direction}</TableCell>
                      <TableCell>{t.entry_price.toFixed(2)}</TableCell>
                      <TableCell>{t.exit_price.toFixed(2)}</TableCell>
                      <TableCell className={t.pnl >= 0 ? "text-emerald-500" : "text-destructive"}>
                        {t.pnl.toFixed(2)}
                      </TableCell>
                      <TableCell>{t.regime_at_entry ?? "—"}</TableCell>
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
