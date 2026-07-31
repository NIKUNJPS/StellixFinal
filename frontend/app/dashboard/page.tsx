"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, AlertTriangle, Dna, FlaskConical, NotebookText, TrendingUp } from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { FailureHeatmap } from "@/components/failure/failure-heatmap";
import { RegimeTimeline } from "@/components/regime/regime-timeline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTopPerformers } from "@/lib/backtest";
import type { TopPerformerItem } from "@/lib/backtest-types";
import { getFailureHeatmap, listFailures } from "@/lib/failure";
import type { FailureHeatmapCell } from "@/lib/failure-types";
import { listEvolutionRuns } from "@/lib/evolution";
import { listResearchNotes } from "@/lib/research-note";
import { getCurrentRegime, getRegimeHistory } from "@/lib/regime";
import type { RegimeObject, RegimePoint } from "@/lib/regime-types";
import { listStrategies } from "@/lib/strategy";
import { STATUS_COLORS, type StrategyListItem } from "@/lib/strategy-types";
import { useAuthStore } from "@/store/auth-store";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";

interface DashboardData {
  regime: RegimeObject | null;
  regimeHistory: RegimePoint[];
  strategies: StrategyListItem[];
  failureCount: number;
  researchCount: number;
  evolutionCount: number;
  topPerformers: TopPerformerItem[];
  heatmapCells: FailureHeatmapCell[];
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="rounded-md bg-accent/15 p-2.5 text-accent">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-semibold">{value}</p>
          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user, organization } = useAuthStore();
  const { subscribe } = useWebSocket();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const symbol = useMemo(
    () => user?.preferences?.default_regime_filter || organization?.benchmark_symbol || "SPY",
    [user, organization],
  );

  useEffect(() => {
    if (!user || !organization) return;
    let active = true;
    (async () => {
      try {
        const [regime, regimeHistory, strategyList, failures, research, evolutionRuns, topPerformers, heatmap] =
          await Promise.all([
            getCurrentRegime(symbol),
            getRegimeHistory(symbol),
            listStrategies(),
            listFailures(),
            listResearchNotes({ limit: 1 }),
            listEvolutionRuns(),
            getTopPerformers(5),
            getFailureHeatmap(),
          ]);
        if (!active) return;
        setData({
          regime,
          regimeHistory: regimeHistory.points,
          strategies: strategyList.items,
          failureCount: failures.total,
          researchCount: research.total,
          evolutionCount: evolutionRuns.total,
          topPerformers: topPerformers.items,
          heatmapCells: heatmap.cells,
        });
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load dashboard data");
      }
    })();
    return () => {
      active = false;
    };
  }, [user, organization, symbol]);

  // Batch 19: the dashboard fetches once on mount (it never polled). Rather than add
  // polling, subscribe to the realtime stream so the regime card and failure count
  // update live without a refresh. The heavier aggregate cards (top performers,
  // heatmap, counts that need a DB roll-up) still come from the initial fetch — a
  // realtime event doesn't carry enough to recompute those honestly.
  useEffect(() => {
    const unsubRegime = subscribe("regime_update", (event: WSEvent) => {
      if (String(event.symbol) !== symbol) return; // only the dashboard's own symbol
      setData((prev) =>
        prev && prev.regime
          ? {
              ...prev,
              regime: {
                ...prev.regime,
                regime_label: String(event.new_regime) as RegimeObject["regime_label"],
                confidence_score:
                  typeof event.confidence === "number"
                    ? event.confidence
                    : prev.regime.confidence_score,
              },
            }
          : prev,
      );
    });
    const unsubFailure = subscribe("failure_alert", () => {
      // A new failure just landed — bump the count the badge reads, live.
      setData((prev) => (prev ? { ...prev, failureCount: prev.failureCount + 1 } : prev));
    });
    return () => {
      unsubRegime();
      unsubFailure();
    };
  }, [subscribe, symbol]);

  const activeStrategies = data?.strategies.filter((s) => s.status === "active") ?? [];
  const avgRobustness = activeStrategies.length
    ? activeStrategies.reduce((sum, s) => sum + (s.robustness_score ?? 0), 0) /
      activeStrategies.filter((s) => s.robustness_score !== null).length
    : null;

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of data?.strategies ?? []) counts.set(s.status, (counts.get(s.status) ?? 0) + 1);
    return Array.from(counts.entries()).map(([status, count]) => ({ status, count }));
  }, [data?.strategies]);

  const equityCurveData = useMemo(() => {
    const performers = data?.topPerformers ?? [];
    const maxLen = Math.max(0, ...performers.map((p) => p.equity_curve.length));
    return Array.from({ length: maxLen }, (_, i) => {
      const row: Record<string, number | undefined> = { bar: i };
      for (const p of performers) row[p.name] = p.equity_curve[i]?.value ?? undefined;
      return row;
    });
  }, [data?.topPerformers]);

  const lineColors = ["#00b4d8", "#16a34a", "#f59e0b", "#9333ea", "#dc2626"];

  return (
    <DashboardShell>
      {error && (
        <p className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={Activity}
          label="Current Market Regime"
          value={data?.regime?.regime_label ?? "—"}
          sub={data?.regime ? `${symbol} · ${(data.regime.confidence_score * 100).toFixed(0)}% confidence` : symbol}
        />
        <KpiCard icon={FlaskConical} label="Active Strategies" value={String(activeStrategies.length)} />
        <KpiCard
          icon={TrendingUp}
          label="Avg Strategy Performance"
          value={avgRobustness !== null && !Number.isNaN(avgRobustness) ? avgRobustness.toFixed(2) : "—"}
          sub="robustness score"
        />
        <KpiCard icon={AlertTriangle} label="Failure Alerts" value={String(data?.failureCount ?? "—")} />
        <KpiCard icon={NotebookText} label="Research Activity" value={String(data?.researchCount ?? "—")} sub="notes" />
        <KpiCard icon={Dna} label="Evolution Updates" value={String(data?.evolutionCount ?? "—")} sub="runs" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Equity Curve — Top 5 Strategies</CardTitle>
            <CardDescription>Overlaid by bar index (each strategy&apos;s own backtest window)</CardDescription>
          </CardHeader>
          <CardContent>
            {equityCurveData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No backtested strategies yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={equityCurveData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="bar" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" domain={["auto", "auto"]} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {(data?.topPerformers ?? []).map((p, i) => (
                    <Line
                      key={p.strategy_id}
                      type="monotone"
                      dataKey={p.name}
                      stroke={lineColors[i % lineColors.length]}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Strategy Distribution</CardTitle>
            <CardDescription>By lifecycle status</CardDescription>
          </CardHeader>
          <CardContent>
            {statusCounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No strategies yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={statusCounts}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {statusCounts.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status as keyof typeof STATUS_COLORS]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Regime Timeline</CardTitle>
            <CardDescription>{symbol} · 12-month ensemble history</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.regimeHistory.length ? (
              <RegimeTimeline points={data.regimeHistory} />
            ) : (
              <p className="text-sm text-muted-foreground">No regime history for {symbol} yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Failure Heatmap</CardTitle>
            <CardDescription>Strategy × regime failure density</CardDescription>
          </CardHeader>
          <CardContent>
            <FailureHeatmap cells={data?.heatmapCells ?? []} />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
