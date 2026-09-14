"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Dna,
  FlaskConical,
  NotebookText,
  TrendingUp,
} from "lucide-react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { FailureHeatmap } from "@/components/failure/failure-heatmap";
import { RegimeTimeline } from "@/components/regime/regime-timeline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

const chartTooltipStyle = {
  background: "rgba(13, 15, 20, 0.95)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: "0.875rem",
  color: "#F5F5F7",
  boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.8), 0 0 15px rgba(111, 107, 155, 0.15)",
  backdropFilter: "blur(12px)",
  padding: "10px 14px",
};

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
  const isFailure = label === "Failure Alerts";
  const isRegime = label === "Current Market Regime";

  let accentColor = "#8E88C7";
  let iconBg = "rgba(142, 136, 199, 0.12)";
  let borderGlow = "rgba(142, 136, 199, 0.25)";

  if (isFailure) {
    accentColor = "#F87171";
    iconBg = "rgba(248, 113, 113, 0.12)";
    borderGlow = "rgba(248, 113, 113, 0.25)";
  } else if (isRegime) {
    accentColor = "#38BDF8";
    iconBg = "rgba(56, 189, 248, 0.12)";
    borderGlow = "rgba(56, 189, 248, 0.25)";
  }

  return (
    <Card
      data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.18] hover:shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
      style={{
        boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)",
      }}
    >
      <div
        className="pointer-events-none absolute -top-16 left-1/2 h-24 w-3/4 -translate-x-1/2 rounded-full opacity-20 blur-2xl transition-opacity duration-300 group-hover:opacity-40"
        style={{ backgroundColor: accentColor }}
      />

      <CardContent className="flex min-h-[125px] flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#808495]">
            {label}
          </span>
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
            style={{
              backgroundColor: iconBg,
              color: accentColor,
              border: `1px solid ${borderGlow}`,
            }}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>

        <div>
          <p className="truncate text-[26px] font-bold tracking-tight text-[#F5F5F7]">
            {value}
          </p>
          {sub && (
            <p className="mt-0.5 truncate text-[11px] font-medium text-[#9A9DA8]">
              {sub}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, organization } = useAuthStore();
  const { subscribe } = useWebSocket();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatRoleName = (role?: string) => {
    if (!role) return "User";
    switch (role) {
      case "admin":
        return "Tenant Admin (demo org)";
      case "compliance_officer":
        return "Compliance Officer";
      case "risk_manager":
        return "Risk Manager";
      case "cio":
        return "CIO";
      case "researcher":
        return "Researcher";
      default:
        return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  };

  const symbol = useMemo(
    () =>
      user?.preferences?.default_regime_filter ||
      organization?.benchmark_symbol ||
      "SPY",
    [user, organization],
  );

  useEffect(() => {
    if (!user || !organization) return;
    let active = true;

    (async () => {
      try {
        const [
          regime,
          regimeHistory,
          strategyList,
          failures,
          research,
          evolutionRuns,
          topPerformers,
          heatmap,
        ] = await Promise.all([
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
        if (active) {
          setError(
            e instanceof Error
              ? e.message
              : "Failed to load dashboard data",
          );
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [user, organization, symbol]);

  useEffect(() => {
    const unsubRegime = subscribe(
      "regime_update",
      (event: WSEvent) => {
        if (String(event.symbol) !== symbol) return;

        setData((prev) =>
          prev && prev.regime
            ? {
                ...prev,
                regime: {
                  ...prev.regime,
                  regime_label: String(
                    event.new_regime,
                  ) as RegimeObject["regime_label"],
                  confidence_score:
                    typeof event.confidence === "number"
                      ? event.confidence
                      : prev.regime.confidence_score,
                },
              }
            : prev,
        );
      },
    );

    const unsubFailure = subscribe("failure_alert", () => {
      setData((prev) =>
        prev
          ? {
              ...prev,
              failureCount: prev.failureCount + 1,
            }
          : prev,
      );
    });

    return () => {
      unsubRegime();
      unsubFailure();
    };
  }, [subscribe, symbol]);

  const activeStrategies =
    data?.strategies.filter((s) => s.status === "active") ?? [];

  const avgRobustness = activeStrategies.length
    ? activeStrategies.reduce(
        (sum, s) => sum + (s.robustness_score ?? 0),
        0,
      ) /
      activeStrategies.filter(
        (s) => s.robustness_score !== null,
      ).length
    : null;

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const s of data?.strategies ?? []) {
      counts.set(
        s.status,
        (counts.get(s.status) ?? 0) + 1,
      );
    }

    return Array.from(counts.entries()).map(
      ([status, count]) => ({
        status,
        count,
      }),
    );
  }, [data?.strategies]);

  const equityCurveData = useMemo(() => {
    const performers = data?.topPerformers ?? [];
    const maxLen = Math.max(
      0,
      ...performers.map(
        (p) => p.equity_curve.length,
      ),
    );

    return Array.from(
      { length: maxLen },
      (_, i) => {
        const row: Record<
          string,
          number | undefined
        > = {
          bar: i,
        };

        for (const p of performers) {
          row[p.name] =
            p.equity_curve[i]?.value ??
            undefined;
        }

        return row;
      },
    );
  }, [data?.topPerformers]);

  const lineColors = [
    "#8B5CF6",
    "#38BDF8",
    "#34D399",
    "#FBBF24",
    "#F43F5E",
  ];

  const cardClass =
    "relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl";

  return (
    <DashboardShell>
      <div className="relative min-h-full bg-[#07080B] px-1 py-1 text-[#F5F5F7]">
        <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-[#5C568E]/10 blur-[120px]" />
        <div className="pointer-events-none absolute top-40 right-10 h-72 w-72 rounded-full bg-[#38BDF8]/5 blur-[100px]" />

        {error && (
          <p
            className="mb-6 rounded-2xl border p-4 text-xs font-medium text-[#F87171] shadow-lg backdrop-blur-md"
            style={{
              backgroundColor: "rgba(248, 113, 113, 0.08)",
              borderColor: "rgba(248, 113, 113, 0.25)",
            }}
          >
            {error}
          </p>
        )}

        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8E88C7] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8E88C7]" />
              </span>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#808495]">
                Quantix Intelligence • Research Mode
              </p>
            </div>

            <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight text-[#F5F5F7]">
              Hello, {user?.full_name || user?.email?.split("@")[0] || "User"}
            </h1>

            <p className="mt-1 text-sm font-semibold text-[#A79CFF]">
              {formatRoleName(user?.role)}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0F1117]/80 px-4 py-2 font-mono text-xs font-semibold text-[#F5F5F7] shadow-inner backdrop-blur-md"
              style={{
                boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)",
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />
              {symbol}
              <span className="text-[10px] text-[#666A76]">BENCHMARK</span>
            </div>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            icon={Activity}
            label="Current Market Regime"
            value={data?.regime?.regime_label ?? "—"}
            sub={
              data?.regime
                ? `${symbol} • ${(data.regime.confidence_score * 100).toFixed(0)}% conf`
                : symbol
            }
          />

          <KpiCard
            icon={FlaskConical}
            label="Active Strategies"
            value={String(activeStrategies.length)}
            sub="live research threads"
          />

          <KpiCard
            icon={TrendingUp}
            label="Avg Strategy Performance"
            value={
              avgRobustness !== null && !Number.isNaN(avgRobustness)
                ? avgRobustness.toFixed(2)
                : "—"
            }
            sub="mean robustness score"
          />

          <KpiCard
            icon={AlertTriangle}
            label="Failure Alerts"
            value={String(data?.failureCount ?? "—")}
            sub="logged constraint breaches"
          />

          <KpiCard
            icon={NotebookText}
            label="Research Activity"
            value={String(data?.researchCount ?? "—")}
            sub="active quant logs"
          />

          <KpiCard
            icon={Dna}
            label="Evolution Updates"
            value={String(data?.evolutionCount ?? "—")}
            sub="genetic optimizer runs"
          />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card
            className={cardClass}
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <CardHeader className="flex flex-row items-start justify-between border-b border-white/[0.06] p-5">
              <div>
                <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                  Equity Curve • Top 5 Strategies
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs text-[#808495]">
                  Normalized overlay indexed to individual backtest windows
                </CardDescription>
              </div>
              <ArrowUpRight className="h-4 w-4 text-[#808495]" />
            </CardHeader>

            <CardContent className="p-5">
              {equityCurveData.length === 0 ? (
                <p className="py-16 text-center text-xs text-[#666A76]">
                  No backtested strategies yet.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={290}>
                  <LineChart
                    data={equityCurveData}
                    margin={{ top: 12, right: 10, left: -14, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255, 255, 255, 0.04)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="bar"
                      tick={{ fontSize: 10, fill: "#808495" }}
                      stroke="#808495"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#808495" }}
                      stroke="#808495"
                      tickLine={false}
                      axisLine={false}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      labelStyle={{ color: "#808495" }}
                      wrapperStyle={{ transform: "translateY(-40px)" }}
                    />
                    <Legend
                      wrapperStyle={{
                        fontSize: 11,
                        color: "#9A9DA8",
                        paddingTop: "12px",
                      }}
                    />
                    {(data?.topPerformers ?? []).map((p, i) => (
                      <Line
                        key={p.strategy_id}
                        type="monotone"
                        dataKey={p.name}
                        stroke={lineColors[i % lineColors.length]}
                        strokeWidth={2.2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card
            className={cardClass}
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <CardHeader className="flex flex-row items-start justify-between border-b border-white/[0.06] p-5">
              <div>
                <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                  Strategy Distribution
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs text-[#808495]">
                  Breakdown by lifecycle status
                </CardDescription>
              </div>
              <ArrowUpRight className="h-4 w-4 text-[#808495]" />
            </CardHeader>

            <CardContent className="p-5">
              {statusCounts.length === 0 ? (
                <p className="py-16 text-center text-xs text-[#666A76]">
                  No strategies yet.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={290}>
                  <PieChart>
                    <Pie
                      data={statusCounts}
                      dataKey="count"
                      nameKey="status"
                      innerRadius={68}
                      outerRadius={100}
                      paddingAngle={4}
                      stroke="none"
                    >
                      {statusCounts.map((entry) => (
                        <Cell
                          key={entry.status}
                          fill={
                            STATUS_COLORS[
                              entry.status as keyof typeof STATUS_COLORS
                            ]
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      itemStyle={{ color: "#F5F5F7" }}
                      labelStyle={{ color: "#808495" }}
                    />
                    <Legend
                      wrapperStyle={{
                        fontSize: 11,
                        color: "#9A9DA8",
                        paddingTop: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card
            className={cardClass}
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <CardHeader className="flex flex-row items-start justify-between border-b border-white/[0.06] p-5">
              <div>
                <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                  Regime Timeline
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs text-[#808495]">
                  {symbol} • 12-month ensemble history
                </CardDescription>
              </div>
              <ArrowUpRight className="h-4 w-4 text-[#808495]" />
            </CardHeader>

            <CardContent className="p-5">
              {data?.regimeHistory.length ? (
                <RegimeTimeline points={data.regimeHistory} />
              ) : (
                <p className="py-16 text-center text-xs text-[#666A76]">
                  No regime history for {symbol} yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card
            className={cardClass}
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <CardHeader className="flex flex-row items-start justify-between border-b border-white/[0.06] p-5">
              <div>
                <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                  Failure Heatmap
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs text-[#808495]">
                  Strategy × regime failure density matrix
                </CardDescription>
              </div>
              <ArrowUpRight className="h-4 w-4 text-[#808495]" />
            </CardHeader>

            <CardContent className="p-5">
              <FailureHeatmap cells={data?.heatmapCells ?? []} />
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}