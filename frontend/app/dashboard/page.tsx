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
import {
  STATUS_COLORS,
  type StrategyListItem,
} from "@/lib/strategy-types";
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

const COLORS = {
  background: "#000000",
  surface: "#16232b",
  surfaceSoft: "#233038",
  silver: "#d3dbdd",
  ivory: "#fdf6e3",
  midnightGreen: "#075056",
  orange: "#ff5b04",
  sandYellow: "#f4d47c",
  teal: "#42f3e4",
  green: "#9bcf53",
  purple: "#8b72d9",
  red: "#ef4444",
};

const chartTooltipStyle = {
  background: COLORS.surface,
  border: `1px solid ${COLORS.surfaceSoft}`,
  borderRadius: "0.525rem",
  color: COLORS.ivory,
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
  const isStrategies = label === "Active Strategies";
  const isPerformance = label === "Avg Strategy Performance";
  const isResearch = label === "Research Activity";
  const isEvolution = label === "Evolution Updates";

  let background = COLORS.surface;
  let foreground = COLORS.ivory;
  let muted = COLORS.silver;
  let iconBackground = COLORS.surfaceSoft;
  let iconColor = COLORS.silver;

  if (isFailure) {
    background = COLORS.orange;
    foreground = "#ffffff";
    muted = "#fff1e8";
    iconBackground = "rgba(22, 35, 43, 0.18)";
    iconColor = "#ffffff";
  } else if (isStrategies) {
    background = COLORS.midnightGreen;
    foreground = "#ffffff";
    muted = "#b7e4df";
    iconBackground = "rgba(255, 255, 255, 0.12)";
    iconColor = COLORS.teal;
  } else if (isPerformance) {
    background = COLORS.sandYellow;
    foreground = COLORS.surface;
    muted = "#4b4b3d";
    iconBackground = "rgba(255, 255, 255, 0.28)";
    iconColor = COLORS.surface;
  } else if (isRegime) {
    background = COLORS.surfaceSoft;
    foreground = COLORS.ivory;
    muted = COLORS.silver;
    iconBackground = COLORS.midnightGreen;
    iconColor = COLORS.teal;
  } else if (isResearch) {
    background = "#2b273b";
    foreground = "#ffffff";
    muted = "#d8d0ee";
    iconBackground = "rgba(139, 114, 217, 0.2)";
    iconColor = "#b9a8ff";
  } else if (isEvolution) {
    background = "#15363a";
    foreground = "#ffffff";
    muted = "#b8dddd";
    iconBackground = "rgba(66, 243, 228, 0.12)";
    iconColor = COLORS.teal;
  }

  return (
    <Card
      data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className="rounded-[0.525rem] border-0 shadow-none"
      style={{
        backgroundColor: background,
        color: foreground,
      }}
    >
      <CardContent className="flex min-h-[118px] items-center gap-4 p-5">
        <div
          className="shrink-0 rounded-[0.525rem] p-2.5"
          style={{
            backgroundColor: iconBackground,
            color: iconColor,
          }}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0">
          <p
            className="text-[11px] font-medium uppercase tracking-[0.04em]"
            style={{ color: muted }}
          >
            {label}
          </p>

          <p
            className="mt-2 truncate text-[27px] font-semibold tracking-tight"
            style={{ color: foreground }}
          >
            {value}
          </p>

          {sub && (
            <p
              className="mt-1 truncate text-xs"
              style={{ color: muted }}
            >
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

  useEffect(() => {
    if (user?.role === "compliance_officer") {
      router.replace("/compliance/governance");
    }
  }, [user, router]);

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

  // Batch 19: the dashboard fetches once on mount (it never polled).
  // Realtime updates remain unchanged.
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
    COLORS.teal,
    COLORS.green,
    COLORS.sandYellow,
    "#9b7bea",
    "#ff5b5b",
  ];

  const cardClass =
    "rounded-[0.525rem] border border-[#233038] bg-[#16232b] shadow-none";

  return (
    <DashboardShell>
      <div
        className="min-h-full bg-black text-[#fdf6e3]"
        style={{
          color: COLORS.ivory,
        }}
      >
        {error && (
          <p className="mb-4 rounded-[0.525rem] border border-[#ff5b04]/40 bg-[#ff5b04]/10 px-4 py-3 text-sm text-[#ff9a68]">
            {error}
          </p>
        )}

        {/* Dashboard header */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#d3dbdd]/60">
              Research Environment
            </p>

            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#fdf6e3]">
              Dashboard
            </h1>

            <p className="mt-1 text-sm text-[#d3dbdd]/65">
              Monitor regimes, strategies, failures and
              research activity.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-[0.525rem] border border-[#233038] bg-[#d3dbdd] px-4 py-2 text-sm font-medium text-[#16232b]">
              {symbol}
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            icon={Activity}
            label="Current Market Regime"
            value={
              data?.regime?.regime_label ?? "—"
            }
            sub={
              data?.regime
                ? `${symbol} · ${(
                    data.regime.confidence_score *
                    100
                  ).toFixed(0)}% confidence`
                : symbol
            }
          />

          <KpiCard
            icon={FlaskConical}
            label="Active Strategies"
            value={String(
              activeStrategies.length,
            )}
            sub="active research strategies"
          />

          <KpiCard
            icon={TrendingUp}
            label="Avg Strategy Performance"
            value={
              avgRobustness !== null &&
              !Number.isNaN(avgRobustness)
                ? avgRobustness.toFixed(2)
                : "—"
            }
            sub="robustness score"
          />

          <KpiCard
            icon={AlertTriangle}
            label="Failure Alerts"
            value={String(
              data?.failureCount ?? "—",
            )}
            sub="recorded failures"
          />

          <KpiCard
            icon={NotebookText}
            label="Research Activity"
            value={String(
              data?.researchCount ?? "—",
            )}
            sub="notes"
          />

          <KpiCard
            icon={Dna}
            label="Evolution Updates"
            value={String(
              data?.evolutionCount ?? "—",
            )}
            sub="runs"
          />
        </div>

        {/* Main analytics grid — intentionally 2 × 2 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Equity Curve */}
          <Card className={cardClass}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-[#fdf6e3]">
                Equity Curve — Top 5 Strategies
              </CardTitle>

              <CardDescription className="text-xs text-[#d3dbdd]/55">
                Overlaid by bar index (each strategy&apos;s
                own backtest window)
              </CardDescription>
            </CardHeader>

            <CardContent>
              {equityCurveData.length === 0 ? (
                <p className="py-16 text-center text-sm text-[#d3dbdd]/55">
                  No backtested strategies yet.
                </p>
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height={280}
                >
                  <LineChart
                    data={equityCurveData}
                    margin={{
                      top: 8,
                      right: 8,
                      left: -12,
                      bottom: 4,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#233038"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="bar"
                      tick={{
                        fontSize: 10,
                        fill: "#d3dbdd",
                      }}
                      stroke="#233038"
                      tickLine={false}
                      axisLine={false}
                    />

                    <YAxis
                      tick={{
                        fontSize: 10,
                        fill: "#d3dbdd",
                      }}
                      stroke="#233038"
                      tickLine={false}
                      axisLine={false}
                      domain={[
                        "auto",
                        "auto",
                      ]}
                    />

                    <Tooltip
                      contentStyle={
                        chartTooltipStyle
                      }
                      labelStyle={{
                        color: COLORS.silver,
                      }}
                      wrapperStyle={{
                        transform: "translateY(-40px)",
                      }}
                    />

                    <Legend
                      wrapperStyle={{
                        fontSize: 11,
                        color: COLORS.silver,
                        paddingTop: "8px",
                      }}
                    />

                    {(data?.topPerformers ?? []).map(
                      (p, i) => (
                        <Line
                          key={p.strategy_id}
                          type="monotone"
                          dataKey={p.name}
                          stroke={
                            lineColors[
                              i %
                                lineColors.length
                            ]
                          }
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      ),
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Strategy Distribution */}
          <Card className={cardClass}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-[#fdf6e3]">
                Strategy Distribution
              </CardTitle>

              <CardDescription className="text-xs text-[#d3dbdd]/55">
                By lifecycle status
              </CardDescription>
            </CardHeader>

            <CardContent>
              {statusCounts.length === 0 ? (
                <p className="py-16 text-center text-sm text-[#d3dbdd]/55">
                  No strategies yet.
                </p>
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height={280}
                >
                  <PieChart>
                    <Pie
                      data={statusCounts}
                      dataKey="count"
                      nameKey="status"
                      innerRadius={62}
                      outerRadius={96}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {statusCounts.map(
                        (entry) => (
                          <Cell
                            key={entry.status}
                            fill={
                              STATUS_COLORS[
                                entry.status as keyof typeof STATUS_COLORS
                              ]
                            }
                          />
                        ),
                      )}
                    </Pie>

                    <Tooltip
                    contentStyle={{
                      background: "#fdf6e3",
                      border: "1px solid #d3dbdd",
                      borderRadius: "0.525rem",
                      color: "#16232b",
                    }}
                    itemStyle={{
                      color: "#16232b",
                    }}
                    labelStyle={{
                      color: "#16232b",
                    }}
                  />

                    <Legend
                      wrapperStyle={{
                        fontSize: 11,
                        color: COLORS.silver,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Regime Timeline */}
          <Card className={cardClass}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-[#fdf6e3]">
                Regime Timeline
              </CardTitle>

              <CardDescription className="text-xs text-[#d3dbdd]/55">
                {symbol} · 12-month ensemble history
              </CardDescription>
            </CardHeader>

            <CardContent>
              {data?.regimeHistory.length ? (
                <RegimeTimeline
                  points={
                    data.regimeHistory
                  }
                />
              ) : (
                <p className="py-16 text-center text-sm text-[#d3dbdd]/55">
                  No regime history for{" "}
                  {symbol} yet.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Failure Heatmap */}
          <Card className={cardClass}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-[#fdf6e3]">
                Failure Heatmap
              </CardTitle>

              <CardDescription className="text-xs text-[#d3dbdd]/55">
                Strategy × regime failure density
              </CardDescription>
            </CardHeader>

            <CardContent>
              <FailureHeatmap
                cells={
                  data?.heatmapCells ?? []
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}