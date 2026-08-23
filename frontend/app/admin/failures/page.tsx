"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { FailureClusterChart } from "@/components/failure/failure-cluster-chart";
import {
  RegimeTimeline,
  type TimelineMarker,
} from "@/components/regime/regime-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getFailure,
  getFailureClusters,
  listFailures,
} from "@/lib/failure";
import {
  TRIGGER_COLORS,
  TRIGGER_LABELS,
  type Failure,
  type FailureCluster,
  type FailureListItem,
} from "@/lib/failure-types";
import { getRegimeHistory } from "@/lib/regime";
import type { RegimePoint } from "@/lib/regime-types";

const COLORS = {
  background: "#000000",
  surface: "#16232b",
  surfaceSoft: "#1b2b34",
  selected: "#042f34",
  teal: "#075056",
  red: "#c40707",
  sand: "#f2d17d",
  silver: "#d3dbdd",
};

function getTriggerColor(trigger: string) {
  const label = trigger.toLowerCase();

  if (label.includes("drawdown")) return COLORS.red;
  if (label.includes("sharpe")) return COLORS.sand;
  if (label.includes("regime")) return COLORS.teal;
  if (label.includes("manual")) return "#667780";

  return COLORS.teal;
}

export default function FailureIntelligencePage() {
  const [failures, setFailures] = useState<FailureListItem[]>([]);
  const [clusters, setClusters] = useState<FailureCluster[]>([]);
  const [selected, setSelected] = useState<Failure | null>(null);
  const [symbol, setSymbol] = useState("SPY");
  const [regimePoints, setRegimePoints] = useState<RegimePoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listFailures(), getFailureClusters()])
      .then(([f, c]) => {
        setFailures(f.items);
        setClusters(c.clusters);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load"),
      );
  }, []);

  const loadTimeline = useCallback(async () => {
    try {
      const hist = await getRegimeHistory(symbol.trim().toUpperCase());
      setRegimePoints(hist.points);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load regime timeline",
      );
    }
  }, [symbol]);

  async function selectFailure(id: string) {
    try {
      setSelected(await getFailure(id));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load failure",
      );
    }
  }

  const markers: TimelineMarker[] = failures.map((f) => ({
    timestamp: f.failure_timestamp,
    color: getTriggerColor(TRIGGER_LABELS[f.trigger_condition]),
    label: TRIGGER_LABELS[f.trigger_condition],
  }));

  const shapData =
    selected?.feature_attribution?.map((f) => ({
      name: f.feature_name,
      value:
        f.direction === "negative" ? -f.shap_value : f.shap_value,
      color:
        f.direction === "positive"
          ? COLORS.teal
          : COLORS.red,
    })) ?? [];

  const drawdownCount = failures.filter((f) =>
    TRIGGER_LABELS[f.trigger_condition]
      .toLowerCase()
      .includes("drawdown"),
  ).length;

  const sharpeCount = failures.filter((f) =>
    TRIGGER_LABELS[f.trigger_condition]
      .toLowerCase()
      .includes("sharpe"),
  ).length;

  const regimeCount = failures.filter((f) =>
    TRIGGER_LABELS[f.trigger_condition]
      .toLowerCase()
      .includes("regime"),
  ).length;

  const manualCount = failures.filter((f) =>
    TRIGGER_LABELS[f.trigger_condition]
      .toLowerCase()
      .includes("manual"),
  ).length;

  return (
    <div
      className="mx-auto w-full max-w-[1400px] px-1 pb-10"
      style={{ color: COLORS.silver }}
    >
      {/* =========================================================
          HEADER
      ========================================================= */}

      <header className="mb-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#c40707]" />
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#d3dbdd]/45">
                Research Intelligence
              </span>
            </div>

            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[#fdf6e3]">
              Failure Intelligence
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d3dbdd]/55">
              Failed strategies are preserved as research assets.
              Investigate failure patterns, triggers and their relationship
              with market regimes.
            </p>
          </div>

          <div className="flex items-end gap-8">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#d3dbdd]/35">
                Recorded failures
              </p>

              <p className="mt-1 text-4xl font-semibold tracking-[-0.04em] text-[#d3dbdd]">
                {failures.length}
              </p>
            </div>

            <div className="hidden h-12 w-px bg-[#d3dbdd]/10 sm:block" />

            <div className="hidden sm:block">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#d3dbdd]/35">
                Research state
              </p>

              <p className="mt-1 text-sm font-medium text-[#075056]">
                Append-only
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* =========================================================
          ERROR
      ========================================================= */}

      {error && (
        <div className="mb-6 rounded-xl border border-[#c40707]/30 bg-[#c40707]/[0.07] px-4 py-3 text-sm text-[#c40707]">
          {error}
        </div>
      )}

      {/* =========================================================
          FAILURE SIGNATURE
          Not four identical cards.
      ========================================================= */}

      <section className="mb-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          {/* Main signature block */}
          <div className="relative overflow-hidden rounded-2xl border border-[#d3dbdd]/10 bg-[#16232b] p-6">
            <div className="absolute right-[-70px] top-[-70px] h-48 w-48 rounded-full border border-[#075056]/20" />
            <div className="absolute right-[-30px] top-[-30px] h-28 w-28 rounded-full border border-[#075056]/20" />

            <div className="relative">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#d3dbdd]/40">
                    Failure signature
                  </p>

                  <h2 className="mt-2 text-lg font-semibold text-[#fdf6e3]">
                    What is breaking?
                  </h2>
                </div>

                <div className="rounded-full border border-[#d3dbdd]/10 bg-[#000000]/20 px-3 py-1 text-[10px] text-[#d3dbdd]/45">
                  Trigger distribution
                </div>
              </div>

              <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#c40707]" />
                    <span className="text-xs text-[#d3dbdd]/50">
                      Drawdown
                    </span>
                  </div>

                  <p className="text-2xl font-semibold text-[#c40707]">
                    {drawdownCount}
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#f2d17d]" />
                    <span className="text-xs text-[#d3dbdd]/50">
                      Sharpe
                    </span>
                  </div>

                  <p className="text-2xl font-semibold text-[#f2d17d]">
                    {sharpeCount}
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#075056]" />
                    <span className="text-xs text-[#d3dbdd]/50">
                      Regime
                    </span>
                  </div>

                  <p className="text-2xl font-semibold text-[#d3dbdd]">
                    {regimeCount}
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#667780]" />
                    <span className="text-xs text-[#d3dbdd]/50">
                      Manual
                    </span>
                  </div>

                  <p className="text-2xl font-semibold text-[#d3dbdd]">
                    {manualCount}
                  </p>
                </div>
              </div>

              {/* visual distribution */}
              <div className="mt-7 flex h-1.5 overflow-hidden rounded-full bg-[#000000]/30">
                {failures.length > 0 && (
                  <>
                    {drawdownCount > 0 && (
                      <div
                        className="h-full bg-[#c40707]"
                        style={{
                          width: `${(drawdownCount / failures.length) * 100}%`,
                        }}
                      />
                    )}

                    {sharpeCount > 0 && (
                      <div
                        className="h-full bg-[#f2d17d]"
                        style={{
                          width: `${(sharpeCount / failures.length) * 100}%`,
                        }}
                      />
                    )}

                    {regimeCount > 0 && (
                      <div
                        className="h-full bg-[#075056]"
                        style={{
                          width: `${(regimeCount / failures.length) * 100}%`,
                        }}
                      />
                    )}

                    {manualCount > 0 && (
                      <div
                        className="h-full bg-[#667780]"
                        style={{
                          width: `${(manualCount / failures.length) * 100}%`,
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Small research note */}
          <div className="relative overflow-hidden rounded-2xl border border-[#075056]/30 bg-[#042f34] p-6">
            <div className="absolute bottom-[-45px] right-[-45px] h-36 w-36 rounded-full border border-[#d3dbdd]/10" />

            <div className="relative flex h-full flex-col justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#d3dbdd]/45">
                  Research signal
                </p>

                <p className="mt-4 text-xl font-medium leading-7 text-[#d3dbdd]">
                  Failure is not discarded.
                  <br />
                  It becomes memory.
                </p>
              </div>

              <div className="mt-8 flex items-center justify-between">
                <span className="text-xs text-[#d3dbdd]/45">
                  Pillar 2
                </span>

                <span className="text-xs font-medium text-[#f2d17d]">
                  Failure intelligence
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          EVENTS + SIDE SIGNAL
      ========================================================= */}

      <section className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-[1fr_280px]">
        {/* Event table */}
        <Card className="overflow-hidden rounded-2xl border-[#d3dbdd]/10 bg-[#16232b]">
          <CardHeader className="border-b border-[#d3dbdd]/10 px-5 py-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <CardTitle className="text-base font-semibold text-[#fdf6e3]">
                  Failure Events
                </CardTitle>

                <CardDescription className="mt-1 text-xs text-[#d3dbdd]/45">
                  Recorded failures and their observed conditions.
                </CardDescription>
              </div>

              <span className="hidden text-[10px] uppercase tracking-[0.14em] text-[#d3dbdd]/30 sm:block">
                Select an event to investigate
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {failures.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <p className="text-sm text-[#d3dbdd]/50">
                  No failures detected — strategies performing well.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full text-sm"
                  data-testid="failure-table"
                >
                  <thead>
                    <tr className="border-b border-[#d3dbdd]/10 text-left text-[10px] uppercase tracking-[0.12em] text-[#d3dbdd]/35">
                      <th className="px-5 py-3">Failure</th>
                      <th className="px-4 py-3">Regime</th>
                      <th className="px-4 py-3">Trigger</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-5 py-3">Explanation</th>
                    </tr>
                  </thead>

                  <tbody>
                    {failures.map((f) => {
                      const triggerLabel =
                        TRIGGER_LABELS[f.trigger_condition];

                      const triggerColor =
                        getTriggerColor(triggerLabel);

                      return (
                        <tr
                          key={f.id}
                          onClick={() => selectFailure(f.id)}
                          className={`
                            cursor-pointer
                            border-b border-[#d3dbdd]/[0.07]
                            transition-all duration-200
                            hover:bg-[#042f34]/50
                            ${
                              selected?.id === f.id
                                ? "bg-[#042f34]/75"
                                : ""
                            }
                          `}
                        >
                          <td className="px-5 py-4">
                            <span className="font-mono text-[11px] text-[#d3dbdd]/55">
                              {f.id.slice(0, 8)}
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <span className="text-sm font-medium text-[#d3dbdd]">
                              {f.regime_at_failure}
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <Badge
                              className="rounded-lg border-0 px-2.5 py-1 text-[10px] font-semibold"
                              style={{
                                background: triggerColor,
                                color:
                                  triggerLabel
                                    .toLowerCase()
                                    .includes("sharpe")
                                    ? COLORS.background
                                    : COLORS.silver,
                              }}
                            >
                              {triggerLabel}
                            </Badge>
                          </td>

                          <td className="whitespace-nowrap px-4 py-4 text-xs text-[#d3dbdd]/45">
                            {f.failure_timestamp.slice(0, 10)}
                          </td>

                          <td className="max-w-[520px] px-5 py-4">
                            <p className="line-clamp-2 text-xs leading-5 text-[#d3dbdd]/50">
                              {f.llm_generated_explanation ??
                                "Explanation pending"}
                            </p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vertical signal rail */}
        <div className="rounded-2xl border border-[#d3dbdd]/10 bg-[#16232b] p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#d3dbdd]/35">
            Failure profile
          </p>

          <div className="mt-6 space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#d3dbdd]/55">
                  Drawdown
                </span>

                <span className="text-xs font-semibold text-[#c40707]">
                  {drawdownCount}
                </span>
              </div>

              <div className="mt-2 h-1 rounded-full bg-[#000000]/30">
                <div
                  className="h-full rounded-full bg-[#c40707]"
                  style={{
                    width:
                      failures.length > 0
                        ? `${(drawdownCount / failures.length) * 100}%`
                        : "0%",
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#d3dbdd]/55">
                  Sharpe
                </span>

                <span className="text-xs font-semibold text-[#f2d17d]">
                  {sharpeCount}
                </span>
              </div>

              <div className="mt-2 h-1 rounded-full bg-[#000000]/30">
                <div
                  className="h-full rounded-full bg-[#f2d17d]"
                  style={{
                    width:
                      failures.length > 0
                        ? `${(sharpeCount / failures.length) * 100}%`
                        : "0%",
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#d3dbdd]/55">
                  Regime
                </span>

                <span className="text-xs font-semibold text-[#075056]">
                  {regimeCount}
                </span>
              </div>

              <div className="mt-2 h-1 rounded-full bg-[#000000]/30">
                <div
                  className="h-full rounded-full bg-[#075056]"
                  style={{
                    width:
                      failures.length > 0
                        ? `${(regimeCount / failures.length) * 100}%`
                        : "0%",
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#d3dbdd]/55">
                  Manual
                </span>

                <span className="text-xs font-semibold text-[#667780]">
                  {manualCount}
                </span>
              </div>

              <div className="mt-2 h-1 rounded-full bg-[#000000]/30">
                <div
                  className="h-full rounded-full bg-[#667780]"
                  style={{
                    width:
                      failures.length > 0
                        ? `${(manualCount / failures.length) * 100}%`
                        : "0%",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-[#d3dbdd]/10 pt-5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#d3dbdd]/30">
              Interpretation
            </p>

            <p className="mt-2 text-xs leading-5 text-[#d3dbdd]/50">
              Trigger frequency provides an initial signal before
              investigating individual failures.
            </p>
          </div>
        </div>
      </section>

      {/* =========================================================
          SELECTED FAILURE
      ========================================================= */}

      {selected && (
        <section
          className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-[0.8fr_1.2fr]"
        >
          {/* AI explanation */}
          <Card
            className="overflow-hidden rounded-2xl border-[#d3dbdd]/10 bg-[#16232b]"
            data-testid="llm-explanation"
          >
            <CardHeader className="border-b border-[#d3dbdd]/10 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-sm font-semibold text-[#fdf6e3]">
                    Failure Analysis
                  </CardTitle>

                  <CardDescription className="mt-1 text-xs text-[#d3dbdd]/45">
                    AI-generated explanation
                  </CardDescription>
                </div>

                <div className="rounded-full bg-[#042f34] px-3 py-1 font-mono text-[10px] text-[#d3dbdd]/65">
                  {selected.id.slice(0, 8)}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-5">
              {selected.llm_numeric_validation_passed === false && (
                <Badge
                  variant="destructive"
                  className="mb-4 rounded-lg border border-[#c40707]/30 bg-[#c40707]/10 text-[#c40707]"
                  data-testid="numeric-validation-warning"
                >
                  Numeric validation warning
                </Badge>
              )}

              <div className="rounded-xl border border-[#d3dbdd]/10 bg-[#000000]/20 p-5">
                <p className="text-sm leading-7 text-[#d3dbdd]/75">
                  {selected.llm_generated_explanation ??
                    "Explanation pending — generated automatically shortly after the failure was recorded."}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* SHAP */}
          <Card
            className="overflow-hidden rounded-2xl border-[#d3dbdd]/10 bg-[#16232b]"
            data-testid="shap-chart"
          >
            <CardHeader className="border-b border-[#d3dbdd]/10 px-5 py-4">
              <CardTitle className="text-sm font-semibold text-[#fdf6e3]">
                Feature Attribution
              </CardTitle>

              <CardDescription className="mt-1 text-xs text-[#d3dbdd]/45">
                SHAP contribution · failure{" "}
                {selected.id.slice(0, 8)}
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5">
              {shapData.length === 0 ? (
                <div className="flex h-52 items-center justify-center">
                  <p className="text-sm text-[#d3dbdd]/45">
                    No attribution available.
                  </p>
                </div>
              ) : (
                <div className="h-52 w-full">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >
                    <BarChart
                      data={shapData}
                      layout="vertical"
                      margin={{
                        left: 24,
                        right: 30,
                        top: 4,
                        bottom: 4,
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#d3dbdd"
                        opacity={0.08}
                      />

                      <XAxis
                        type="number"
                        tick={{
                          fontSize: 10,
                          fill: COLORS.silver,
                          opacity: 0.5,
                        }}
                        axisLine={{
                          stroke: COLORS.silver,
                          opacity: 0.12,
                        }}
                        tickLine={false}
                      />

                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        tick={{
                          fontSize: 11,
                          fill: COLORS.silver,
                          opacity: 0.7,
                        }}
                        axisLine={false}
                        tickLine={false}
                      />

                      <Tooltip
                        contentStyle={{
                          background: COLORS.surface,
                          border: `1px solid ${COLORS.silver}20`,
                          borderRadius: 10,
                          color: COLORS.silver,
                          fontSize: 12,
                        }}
                        labelStyle={{
                          color: COLORS.silver,
                        }}
                        itemStyle={{
                          color: COLORS.silver,
                        }}
                      />

                      <Bar
                        dataKey="value"
                        radius={[0, 5, 5, 0]}
                      >
                        {shapData.map((d, i) => (
                          <Cell
                            key={i}
                            fill={d.color}
                          />
                        ))}

                        <LabelList
                          dataKey="value"
                          position="right"
                          formatter={(v: number) =>
                            v.toFixed(3)
                          }
                          style={{
                            fontSize: 10,
                            fill: COLORS.silver,
                          }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* =========================================================
          FAILURE CLUSTERS
      ========================================================= */}

      <section className="mb-6">
        <Card className="overflow-hidden rounded-2xl border-[#d3dbdd]/10 bg-[#16232b]">
          <CardHeader className="border-b border-[#d3dbdd]/10 px-5 py-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-[#fdf6e3]">
                  Failure Clusters
                </CardTitle>

                <CardDescription className="mt-1 text-xs text-[#d3dbdd]/45">
                  Where failure conditions begin to form patterns.
                </CardDescription>
              </div>

              <span className="text-[10px] uppercase tracking-[0.15em] text-[#d3dbdd]/30">
                Regime × Trigger
              </span>
            </div>
          </CardHeader>

          <CardContent className="relative min-h-[430px] overflow-hidden px-5 py-7">
            {/* subtle background structure */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-[18%] top-[15%] h-40 w-40 rounded-full border border-[#075056]/10" />
              <div className="absolute left-[18%] top-[15%] h-72 w-72 rounded-full border border-[#075056]/[0.05]" />

              <div className="absolute right-[12%] bottom-[10%] h-52 w-52 rounded-full border border-[#c40707]/[0.05]" />
            </div>

            {/* Existing integration remains unchanged */}
            <div className="relative z-10 flex min-h-[360px] items-center justify-center">
              <FailureClusterChart clusters={clusters} />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* =========================================================
          TIMELINE
      ========================================================= */}

      <section>
        <Card className="overflow-hidden rounded-2xl border-[#d3dbdd]/10 bg-[#16232b]">
          <CardHeader className="border-b border-[#d3dbdd]/10 px-5 py-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#075056]" />

                  <CardTitle className="text-sm font-semibold text-[#fdf6e3]">
                    Failure Timeline
                  </CardTitle>
                </div>

                <CardDescription className="mt-1 text-xs text-[#d3dbdd]/45">
                  Failure events overlaid on the selected market regime.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="
                    h-9
                    w-24
                    rounded-lg
                    border-[#d3dbdd]/15
                    bg-[#000000]/30
                    text-sm
                    text-[#d3dbdd]
                    placeholder:text-[#d3dbdd]/30
                    focus-visible:border-[#075056]
                    focus-visible:ring-[#075056]/30
                  "
                  placeholder="SPY"
                />

                <Button
                  size="sm"
                  onClick={loadTimeline}
                  className="
                    h-9
                    rounded-lg
                    bg-[#075056]
                    px-4
                    text-[#d3dbdd]
                    hover:bg-[#075056]/80
                  "
                >
                  Load
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="px-5 py-6">
            {regimePoints.length > 0 ? (
              <RegimeTimeline
                points={regimePoints}
                markers={markers}
              />
            ) : (
              <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-[#d3dbdd]/10 bg-[#000000]/15">
                <div className="text-center">
                  <p className="text-sm font-medium text-[#d3dbdd]/60">
                    No timeline loaded
                  </p>

                  <p className="mt-1 max-w-sm text-xs leading-5 text-[#d3dbdd]/35">
                    Enter a symbol above to overlay failure events
                    on its regime timeline.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}