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
  TRIGGER_LABELS,
  type Failure,
  type FailureCluster,
  type FailureListItem,
} from "@/lib/failure-types";
import { getRegimeHistory } from "@/lib/regime";
import type { RegimePoint } from "@/lib/regime-types";

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

function getTriggerColor(trigger: string) {
  const label = trigger.toLowerCase();

  if (label.includes("drawdown")) return PALETTE.danger;
  if (label.includes("sharpe")) return PALETTE.warning;
  if (label.includes("regime")) return PALETTE.success;
  if (label.includes("manual")) return "#7B8092";

  return PALETTE.glowLavender;
}

export function FailureIntelligenceView() {
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
          ? PALETTE.success
          : PALETTE.danger,
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
      className="relative mx-auto w-full max-w-[1400px] px-1 pb-10"
      style={{ color: PALETTE.textSecondary }}
    >
      {/* Cinematic Ambient Atmosphere Glow */}
      <div
        className="pointer-events-none absolute -top-28 left-1/4 h-[380px] w-[560px] -translate-x-1/2 rounded-full opacity-25 blur-[140px]"
        style={{
          background: "radial-gradient(circle, rgba(111, 107, 155, 0.35) 0%, rgba(75, 75, 112, 0.15) 55%, transparent 80%)",
        }}
      />
      <div
        className="pointer-events-none absolute -top-24 right-10 h-[320px] w-[460px] rounded-full opacity-20 blur-[150px]"
        style={{
          background: "radial-gradient(circle, rgba(75, 75, 112, 0.35) 0%, rgba(15, 17, 21, 0.2) 65%, transparent 80%)",
        }}
      />

      {/* HEADER */}
      <header className="relative mb-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: PALETTE.danger,
                  boxShadow: "0 0 8px rgba(228, 91, 91, 0.8)",
                }}
              />
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
              Failure Intelligence
            </h1>

            <p
              className="mt-2 max-w-2xl text-sm leading-6"
              style={{ color: PALETTE.textSecondary }}
            >
              Failed strategies are preserved as research assets. Investigate failure patterns,
              triggers and their relationship with market regimes.
            </p>
          </div>

          <div className="flex items-end gap-8">
            <div>
              <p
                className="font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ color: PALETTE.textMuted }}
              >
                Recorded failures
              </p>

              <p
                className="mt-1 font-mono text-4xl font-bold tracking-[-0.04em]"
                style={{ color: PALETTE.textPrimary }}
              >
                {failures.length}
              </p>
            </div>

            <div
              className="hidden h-12 w-px sm:block"
              style={{ backgroundColor: PALETTE.borderSubtle }}
            />

            <div className="hidden sm:block">
              <p
                className="font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ color: PALETTE.textMuted }}
              >
                Research state
              </p>

              <p
                className="mt-1 font-mono text-sm font-semibold tracking-wide"
                style={{ color: PALETTE.glowLavender }}
              >
                Append-only
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ERROR ALERT */}
      {error && (
        <div
          className="mb-6 rounded-xl border px-4 py-3 text-sm font-medium"
          style={{
            borderColor: "rgba(228, 91, 91, 0.35)",
            backgroundColor: "rgba(228, 91, 91, 0.08)",
            color: PALETTE.danger,
          }}
        >
          {error}
        </div>
      )}

      {/* FAILURE SIGNATURE */}
      <section className="mb-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          {/* Signature Distribution Card */}
          <div
            className="relative overflow-hidden rounded-[20px] border p-6 transition-all duration-200"
            style={{
              backgroundColor: PALETTE.cardBg,
              borderColor: PALETTE.borderSubtle,
              boxShadow: "0 20px 50px -10px rgba(0, 0, 0, 0.65)",
            }}
          >
            <div
              className="absolute right-[-70px] top-[-70px] h-48 w-48 rounded-full border opacity-20"
              style={{ borderColor: PALETTE.glowLavender }}
            />
            <div
              className="absolute right-[-30px] top-[-30px] h-28 w-28 rounded-full border opacity-15"
              style={{ borderColor: PALETTE.glowPurple }}
            />

            <div className="relative">
              <div className="flex items-start justify-between">
                <div>
                  <p
                    className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: PALETTE.textMuted }}
                  >
                    Failure signature
                  </p>

                  <h2
                    className="mt-1.5 text-lg font-bold tracking-tight"
                    style={{ color: PALETTE.textPrimary }}
                  >
                    What is breaking?
                  </h2>
                </div>

                <div
                  className="rounded-full border px-3 py-1 font-mono text-[10px] font-medium"
                  style={{
                    backgroundColor: PALETTE.elevatedBg,
                    borderColor: PALETTE.borderSubtle,
                    color: PALETTE.textSecondary,
                  }}
                >
                  Trigger distribution
                </div>
              </div>

              <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: PALETTE.danger,
                        boxShadow: "0 0 6px rgba(228, 91, 91, 0.7)",
                      }}
                    />
                    <span
                      className="text-xs"
                      style={{ color: PALETTE.textSecondary }}
                    >
                      Drawdown
                    </span>
                  </div>

                  <p
                    className="font-mono text-2xl font-bold"
                    style={{ color: PALETTE.danger }}
                  >
                    {drawdownCount}
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: PALETTE.warning,
                        boxShadow: "0 0 6px rgba(229, 168, 75, 0.7)",
                      }}
                    />
                    <span
                      className="text-xs"
                      style={{ color: PALETTE.textSecondary }}
                    >
                      Sharpe
                    </span>
                  </div>

                  <p
                    className="font-mono text-2xl font-bold"
                    style={{ color: PALETTE.warning }}
                  >
                    {sharpeCount}
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: PALETTE.success,
                        boxShadow: "0 0 6px rgba(53, 199, 122, 0.7)",
                      }}
                    />
                    <span
                      className="text-xs"
                      style={{ color: PALETTE.textSecondary }}
                    >
                      Regime
                    </span>
                  </div>

                  <p
                    className="font-mono text-2xl font-bold"
                    style={{ color: PALETTE.textPrimary }}
                  >
                    {regimeCount}
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: "#7B8092" }}
                    />
                    <span
                      className="text-xs"
                      style={{ color: PALETTE.textSecondary }}
                    >
                      Manual
                    </span>
                  </div>

                  <p
                    className="font-mono text-2xl font-bold"
                    style={{ color: PALETTE.textPrimary }}
                  >
                    {manualCount}
                  </p>
                </div>
              </div>

              {/* Progress Proportions Bar */}
              <div
                className="mt-7 flex h-1.5 overflow-hidden rounded-full border"
                style={{
                  backgroundColor: PALETTE.elevatedBg,
                  borderColor: PALETTE.borderSubtle,
                }}
              >
                {failures.length > 0 && (
                  <>
                    {drawdownCount > 0 && (
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          backgroundColor: PALETTE.danger,
                          width: `${(drawdownCount / failures.length) * 100}%`,
                        }}
                      />
                    )}

                    {sharpeCount > 0 && (
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          backgroundColor: PALETTE.warning,
                          width: `${(sharpeCount / failures.length) * 100}%`,
                        }}
                      />
                    )}

                    {regimeCount > 0 && (
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          backgroundColor: PALETTE.success,
                          width: `${(regimeCount / failures.length) * 100}%`,
                        }}
                      />
                    )}

                    {manualCount > 0 && (
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          backgroundColor: "#7B8092",
                          width: `${(manualCount / failures.length) * 100}%`,
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Research Signal Panel */}
          <div
            className="relative overflow-hidden rounded-[20px] border p-6 transition-all duration-200"
            style={{
              backgroundColor: PALETTE.cardBg,
              borderColor: "rgba(111, 107, 155, 0.2)",
              boxShadow: "0 20px 50px -10px rgba(0, 0, 0, 0.65)",
            }}
          >
            <div
              className="absolute bottom-[-45px] right-[-45px] h-36 w-36 rounded-full border opacity-15"
              style={{ borderColor: PALETTE.glowLavender }}
            />

            <div className="relative flex h-full flex-col justify-between">
              <div>
                <p
                  className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: PALETTE.textMuted }}
                >
                  Research signal
                </p>

                <p
                  className="mt-4 text-xl font-medium leading-7 tracking-tight"
                  style={{ color: PALETTE.textPrimary }}
                >
                  Failure is not discarded.
                  <br />
                  It becomes memory.
                </p>
              </div>

              <div className="mt-8 flex items-center justify-between">
                <span
                  className="font-mono text-xs uppercase tracking-wider"
                  style={{ color: PALETTE.textMuted }}
                >
                  Pillar 2
                </span>

                <span
                  className="font-mono text-xs font-semibold"
                  style={{ color: PALETTE.glowLavender }}
                >
                  Failure intelligence
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EVENTS TABLE & PROFILE */}
      <section className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-[1fr_280px]">
        {/* Table Card */}
        <Card
          className="overflow-hidden rounded-[20px] border"
          style={{
            backgroundColor: PALETTE.cardBg,
            borderColor: PALETTE.borderSubtle,
            boxShadow: "0 20px 50px -10px rgba(0, 0, 0, 0.65)",
          }}
        >
          <CardHeader
            className="border-b px-6 py-4"
            style={{ borderColor: PALETTE.borderSubtle }}
          >
            <div className="flex items-end justify-between gap-4">
              <div>
                <CardTitle
                  className="text-base font-bold tracking-tight"
                  style={{ color: PALETTE.textPrimary }}
                >
                  Failure Events
                </CardTitle>

                <CardDescription
                  className="mt-1 text-xs"
                  style={{ color: PALETTE.textSecondary }}
                >
                  Recorded failures and their observed conditions.
                </CardDescription>
              </div>

              <span
                className="hidden font-mono text-[10px] uppercase tracking-[0.14em] sm:block"
                style={{ color: PALETTE.textMuted }}
              >
                Select an event to investigate
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {failures.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <p
                  className="font-mono text-xs"
                  style={{ color: PALETTE.textMuted }}
                >
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
                    <tr
                      className="border-b text-left font-mono text-[10px] uppercase tracking-[0.14em]"
                      style={{
                        borderColor: PALETTE.borderSubtle,
                        backgroundColor: "rgba(11, 16, 23, 0.3)",
                        color: PALETTE.textMuted,
                      }}
                    >
                      <th className="px-5 py-3.5">Failure</th>
                      <th className="px-4 py-3.5">Regime</th>
                      <th className="px-4 py-3.5">Trigger</th>
                      <th className="px-4 py-3.5">Date</th>
                      <th className="px-5 py-3.5">Explanation</th>
                    </tr>
                  </thead>

                  <tbody
                    className="divide-y"
                    style={{ borderColor: "rgba(255, 255, 255, 0.03)" }}
                  >
                    {failures.map((f) => {
                      const triggerLabel =
                        TRIGGER_LABELS[f.trigger_condition];

                      const triggerColor =
                        getTriggerColor(triggerLabel);

                      const isSelected = selected?.id === f.id;

                      return (
                        <tr
                          key={f.id}
                          onClick={() => selectFailure(f.id)}
                          className="cursor-pointer border-b transition-all duration-150 hover:bg-white/[0.02]"
                          style={{
                            borderColor: "rgba(255, 255, 255, 0.03)",
                            backgroundColor: isSelected
                              ? PALETTE.elevatedBg
                              : "transparent",
                          }}
                        >
                          <td className="px-5 py-4">
                            <span
                              className="font-mono text-[11px]"
                              style={{ color: PALETTE.textMuted }}
                            >
                              {f.id.slice(0, 8)}
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <span
                              className="text-sm font-medium"
                              style={{ color: PALETTE.textPrimary }}
                            >
                              {f.regime_at_failure}
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <Badge
                              className="rounded-md border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
                              style={{
                                background: "rgba(255, 255, 255, 0.04)",
                                borderColor: `${triggerColor}40`,
                                color: triggerColor,
                              }}
                            >
                              {triggerLabel}
                            </Badge>
                          </td>

                          <td
                            className="whitespace-nowrap px-4 py-4 font-mono text-xs"
                            style={{ color: PALETTE.textMuted }}
                          >
                            {f.failure_timestamp.slice(0, 10)}
                          </td>

                          <td className="max-w-[520px] px-5 py-4">
                            <p
                              className="line-clamp-2 text-xs leading-5"
                              style={{ color: PALETTE.textSecondary }}
                            >
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

        {/* Profile Sidebar */}
        <div
          className="rounded-[20px] border p-5"
          style={{
            backgroundColor: PALETTE.cardBg,
            borderColor: PALETTE.borderSubtle,
            boxShadow: "0 20px 50px -10px rgba(0, 0, 0, 0.65)",
          }}
        >
          <p
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: PALETTE.textMuted }}
          >
            Failure profile
          </p>

          <div className="mt-6 space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <span
                  className="text-xs"
                  style={{ color: PALETTE.textSecondary }}
                >
                  Drawdown
                </span>

                <span
                  className="font-mono text-xs font-semibold"
                  style={{ color: PALETTE.danger }}
                >
                  {drawdownCount}
                </span>
              </div>

              <div
                className="mt-2 h-1 overflow-hidden rounded-full border"
                style={{
                  backgroundColor: PALETTE.elevatedBg,
                  borderColor: PALETTE.borderSubtle,
                }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: PALETTE.danger,
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
                <span
                  className="text-xs"
                  style={{ color: PALETTE.textSecondary }}
                >
                  Sharpe
                </span>

                <span
                  className="font-mono text-xs font-semibold"
                  style={{ color: PALETTE.warning }}
                >
                  {sharpeCount}
                </span>
              </div>

              <div
                className="mt-2 h-1 overflow-hidden rounded-full border"
                style={{
                  backgroundColor: PALETTE.elevatedBg,
                  borderColor: PALETTE.borderSubtle,
                }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: PALETTE.warning,
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
                <span
                  className="text-xs"
                  style={{ color: PALETTE.textSecondary }}
                >
                  Regime
                </span>

                <span
                  className="font-mono text-xs font-semibold"
                  style={{ color: PALETTE.success }}
                >
                  {regimeCount}
                </span>
              </div>

              <div
                className="mt-2 h-1 overflow-hidden rounded-full border"
                style={{
                  backgroundColor: PALETTE.elevatedBg,
                  borderColor: PALETTE.borderSubtle,
                }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: PALETTE.success,
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
                <span
                  className="text-xs"
                  style={{ color: PALETTE.textSecondary }}
                >
                  Manual
                </span>

                <span
                  className="font-mono text-xs font-semibold"
                  style={{ color: PALETTE.textSecondary }}
                >
                  {manualCount}
                </span>
              </div>

              <div
                className="mt-2 h-1 overflow-hidden rounded-full border"
                style={{
                  backgroundColor: PALETTE.elevatedBg,
                  borderColor: PALETTE.borderSubtle,
                }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: "#7B8092",
                    width:
                      failures.length > 0
                        ? `${(manualCount / failures.length) * 100}%`
                        : "0%",
                  }}
                />
              </div>
            </div>
          </div>

          <div
            className="mt-8 border-t pt-5"
            style={{ borderColor: PALETTE.borderSubtle }}
          >
            <p
              className="font-mono text-[10px] uppercase tracking-[0.14em]"
              style={{ color: PALETTE.textMuted }}
            >
              Interpretation
            </p>

            <p
              className="mt-2 text-xs leading-5"
              style={{ color: PALETTE.textSecondary }}
            >
              Trigger frequency provides an initial signal before investigating individual failures.
            </p>
          </div>
        </div>
      </section>

      {/* SELECTED FAILURE DETAILS */}
      {selected && (
        <section className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <Card
            className="overflow-hidden rounded-[20px] border"
            style={{
              backgroundColor: PALETTE.cardBg,
              borderColor: PALETTE.borderSubtle,
              boxShadow: "0 20px 50px -10px rgba(0, 0, 0, 0.65)",
            }}
            data-testid="llm-explanation"
          >
            <CardHeader
              className="border-b px-5 py-4"
              style={{ borderColor: PALETTE.borderSubtle }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle
                    className="text-sm font-bold tracking-tight"
                    style={{ color: PALETTE.textPrimary }}
                  >
                    Failure Analysis
                  </CardTitle>

                  <CardDescription
                    className="mt-1 text-xs"
                    style={{ color: PALETTE.textSecondary }}
                  >
                    AI-generated explanation
                  </CardDescription>
                </div>

                <div
                  className="rounded-full border px-3 py-1 font-mono text-[10px]"
                  style={{
                    backgroundColor: PALETTE.elevatedBg,
                    borderColor: PALETTE.borderSubtle,
                    color: PALETTE.glowLavender,
                  }}
                >
                  {selected.id.slice(0, 8)}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-5">
              {selected.llm_numeric_validation_passed === false && (
                <Badge
                  variant="destructive"
                  className="mb-4 rounded-lg border px-2.5 py-1 font-mono text-[10px]"
                  style={{
                    backgroundColor: "rgba(228, 91, 91, 0.12)",
                    borderColor: "rgba(228, 91, 91, 0.3)",
                    color: PALETTE.danger,
                  }}
                  data-testid="numeric-validation-warning"
                >
                  Numeric validation warning
                </Badge>
              )}

              <div
                className="rounded-xl border p-5"
                style={{
                  backgroundColor: PALETTE.elevatedBg,
                  borderColor: PALETTE.borderSubtle,
                }}
              >
                <p
                  className="text-sm leading-7"
                  style={{ color: PALETTE.textPrimary }}
                >
                  {selected.llm_generated_explanation ??
                    "Explanation pending — generated automatically shortly after the failure was recorded."}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* SHAP Chart */}
          <Card
            className="overflow-hidden rounded-[20px] border"
            style={{
              backgroundColor: PALETTE.cardBg,
              borderColor: PALETTE.borderSubtle,
              boxShadow: "0 20px 50px -10px rgba(0, 0, 0, 0.65)",
            }}
            data-testid="shap-chart"
          >
            <CardHeader
              className="border-b px-5 py-4"
              style={{ borderColor: PALETTE.borderSubtle }}
            >
              <CardTitle
                className="text-sm font-bold tracking-tight"
                style={{ color: PALETTE.textPrimary }}
              >
                Feature Attribution
              </CardTitle>

              <CardDescription
                className="mt-1 text-xs"
                style={{ color: PALETTE.textSecondary }}
              >
                SHAP contribution · failure {selected.id.slice(0, 8)}
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5">
              {shapData.length === 0 ? (
                <div className="flex h-52 items-center justify-center">
                  <p
                    className="font-mono text-xs"
                    style={{ color: PALETTE.textMuted }}
                  >
                    No attribution available.
                  </p>
                </div>
              ) : (
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={shapData}
                      layout="vertical"
                      margin={{ left: 24, right: 30, top: 4, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255, 255, 255, 0.05)"
                      />

                      <XAxis
                        type="number"
                        tick={{
                          fontSize: 10,
                          fill: PALETTE.textMuted,
                        }}
                        axisLine={{
                          stroke: PALETTE.borderSubtle,
                        }}
                        tickLine={false}
                      />

                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        tick={{
                          fontSize: 11,
                          fill: PALETTE.textSecondary,
                        }}
                        axisLine={false}
                        tickLine={false}
                      />

                      <Tooltip
                        contentStyle={{
                          background: PALETTE.elevatedBg,
                          border: `1px solid ${PALETTE.borderSubtle}`,
                          borderRadius: 12,
                          color: PALETTE.textPrimary,
                          fontSize: 12,
                          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.8)",
                        }}
                        labelStyle={{ color: PALETTE.textPrimary }}
                        itemStyle={{ color: PALETTE.textSecondary }}
                      />

                      <Bar
                        dataKey="value"
                        radius={[0, 4, 4, 0]}
                      >
                        {shapData.map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}

                        <LabelList
                          dataKey="value"
                          position="right"
                          formatter={(v: number) => v.toFixed(3)}
                          style={{
                            fontSize: 10,
                            fill: PALETTE.textMuted,
                            fontFamily: "monospace",
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

      {/* CLUSTERS */}
      <section className="mb-6">
        <Card
          className="overflow-hidden rounded-[20px] border"
          style={{
            backgroundColor: PALETTE.cardBg,
            borderColor: PALETTE.borderSubtle,
            boxShadow: "0 20px 50px -10px rgba(0, 0, 0, 0.65)",
          }}
        >
          <CardHeader
            className="border-b px-6 py-5"
            style={{ borderColor: PALETTE.borderSubtle }}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle
                  className="text-base font-bold tracking-tight"
                  style={{ color: PALETTE.textPrimary }}
                >
                  Failure Clusters
                </CardTitle>

                <CardDescription
                  className="mt-1 text-xs"
                  style={{ color: PALETTE.textSecondary }}
                >
                  Where failure conditions begin to form patterns.
                </CardDescription>
              </div>

              <span
                className="font-mono text-[10px] uppercase tracking-[0.15em]"
                style={{ color: PALETTE.textMuted }}
              >
                Regime × Trigger
              </span>
            </div>
          </CardHeader>

          <CardContent className="relative min-h-[430px] overflow-hidden px-5 py-7">
            <div className="pointer-events-none absolute inset-0">
              <div
                className="absolute left-[18%] top-[15%] h-40 w-40 rounded-full border opacity-15"
                style={{ borderColor: PALETTE.glowLavender }}
              />
              <div
                className="absolute left-[18%] top-[15%] h-72 w-72 rounded-full border opacity-10"
                style={{ borderColor: PALETTE.glowPurple }}
              />
              <div
                className="absolute right-[12%] bottom-[10%] h-52 w-52 rounded-full border opacity-10"
                style={{ borderColor: PALETTE.danger }}
              />
            </div>

            <div className="relative z-10 flex min-h-[360px] items-center justify-center">
              <FailureClusterChart clusters={clusters} />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* TIMELINE */}
      <section>
        <Card
          className="overflow-hidden rounded-[20px] border"
          style={{
            backgroundColor: PALETTE.cardBg,
            borderColor: PALETTE.borderSubtle,
            boxShadow: "0 20px 50px -10px rgba(0, 0, 0, 0.65)",
          }}
        >
          <CardHeader
            className="border-b px-6 py-5"
            style={{ borderColor: PALETTE.borderSubtle }}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      backgroundColor: PALETTE.glowLavender,
                      boxShadow: "0 0 6px rgba(111, 107, 155, 0.8)",
                    }}
                  />

                  <CardTitle
                    className="text-sm font-bold tracking-tight"
                    style={{ color: PALETTE.textPrimary }}
                  >
                    Failure Timeline
                  </CardTitle>
                </div>

                <CardDescription
                  className="mt-1 text-xs"
                  style={{ color: PALETTE.textSecondary }}
                >
                  Failure events overlaid on the selected market regime.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="h-9 w-24 rounded-lg border font-mono text-sm tracking-wide"
                  style={{
                    backgroundColor: PALETTE.elevatedBg,
                    borderColor: PALETTE.borderSubtle,
                    color: PALETTE.textPrimary,
                  }}
                  placeholder="SPY"
                />

                <Button
                  size="sm"
                  onClick={loadTimeline}
                  className="h-9 rounded-lg border px-4 font-mono text-xs font-semibold transition-all duration-150 active:scale-95"
                  style={{
                    backgroundColor: PALETTE.elevatedBg,
                    borderColor: "rgba(255, 255, 255, 0.12)",
                    color: PALETTE.textPrimary,
                  }}
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
              <div
                className="flex min-h-48 items-center justify-center rounded-xl border border-dashed"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.01)",
                  borderColor: PALETTE.borderSubtle,
                }}
              >
                <div className="text-center">
                  <p
                    className="font-medium text-sm"
                    style={{ color: PALETTE.textSecondary }}
                  >
                    No timeline loaded
                  </p>

                  <p
                    className="mt-1 max-w-sm text-xs leading-5"
                    style={{ color: PALETTE.textMuted }}
                  >
                    Enter a symbol above to overlay failure events on its regime timeline.
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