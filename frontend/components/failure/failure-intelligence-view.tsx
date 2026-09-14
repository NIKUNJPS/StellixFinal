"use client";

import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, Cell, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, AlertTriangle, Activity, Zap, RefreshCw, Layers, ShieldAlert, Sparkles, Terminal } from "lucide-react";

import { FailureClusterChart } from "@/components/failure/failure-cluster-chart";
import { RegimeTimeline, type TimelineMarker } from "@/components/regime/regime-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getFailure, getFailureClusters, listFailures } from "@/lib/failure";
import { TRIGGER_LABELS, type Failure, type FailureCluster, type FailureListItem } from "@/lib/failure-types";
import { getRegimeHistory } from "@/lib/regime";
import type { RegimePoint } from "@/lib/regime-types";

const PALETTE = {
  mainBg: "#07080B",
  cardBg: "rgba(13, 15, 20, 0.7)",
  elevatedBg: "#0F1117",
  borderSubtle: "rgba(255, 255, 255, 0.08)",
  borderHover: "rgba(255, 255, 255, 0.18)",
  textPrimary: "#F5F5F7",
  textSecondary: "#9A9DA8",
  textMuted: "#808495",
  glowPurple: "#8E88C7",
  glowLavender: "#8B5CF6",
  success: "#34D399",
  danger: "#F87171",
  warning: "#FBBF24",
};

function getTriggerColor(trigger: string) {
  const label = trigger.toLowerCase();

  if (label.includes("drawdown")) return PALETTE.danger;
  if (label.includes("sharpe")) return PALETTE.warning;
  if (label.includes("regime")) return PALETTE.success;
  if (label.includes("manual")) return "#808495";

  return PALETTE.glowPurple;
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

  const cardClass = "relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl";

  return (
    <div
      className="relative min-h-full bg-[#07080B] px-4 pb-12 pt-6 text-[#F5F5F7] sm:px-6 lg:px-8"
      style={{ color: PALETTE.textSecondary }}
    >
      {/* Background Ambient Glows */}
      <div className="pointer-events-none absolute -top-28 left-1/4 h-80 w-80 rounded-full bg-[#8E88C7]/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-60 right-10 h-72 w-72 rounded-full bg-[#38BDF8]/5 blur-[100px]" />

      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* HEADER */}
        <header className="relative mb-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#808495]">
                <span
                  className="h-2 w-2 rounded-full bg-[#F87171]"
                  style={{
                    boxShadow: "0 0 10px rgba(248, 113, 113, 0.7)",
                  }}
                />
                Quantix Intelligence • Failure Research
              </div>

              <h1
                className="text-3xl font-extrabold tracking-tight"
                style={{ color: PALETTE.textPrimary }}
              >
                Failure Intelligence
              </h1>

              <p
                className="mt-1 text-xs"
                style={{ color: PALETTE.textSecondary }}
              >
                Failed strategies are preserved as research assets. Investigate failure patterns,
                triggers and their relationship with market regimes.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="rounded-xl border border-white/[0.08] bg-[#0F1117]/80 px-4 py-2 text-right shadow-inner backdrop-blur-md">
                <p
                  className="font-mono text-[9px] uppercase tracking-[0.16em]"
                  style={{ color: PALETTE.textMuted }}
                >
                  Recorded failures
                </p>

                <p
                  className="mt-0.5 font-mono text-2xl font-bold tracking-tight"
                  style={{ color: PALETTE.textPrimary }}
                >
                  {failures.length}
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-[#0F1117]/80 px-4 py-2 text-right shadow-inner backdrop-blur-md">
                <p
                  className="font-mono text-[9px] uppercase tracking-[0.16em]"
                  style={{ color: PALETTE.textMuted }}
                >
                  Research state
                </p>

                <p
                  className="mt-0.5 font-mono text-xs font-semibold tracking-wide"
                  style={{ color: PALETTE.glowPurple }}
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
            className="flex items-center gap-3 rounded-2xl border p-4 text-xs font-medium shadow-lg backdrop-blur-md"
            style={{
              backgroundColor: "rgba(248, 113, 113, 0.08)",
              borderColor: "rgba(248, 113, 113, 0.25)",
              color: PALETTE.danger,
            }}
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-[#F87171]" />
            <p>{error}</p>
          </div>
        )}

        {/* FAILURE SIGNATURE */}
        <section className="mb-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_0.65fr]">
            {/* Signature Distribution Card */}
            <div
              className={cardClass}
              style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p
                      className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
                      style={{ color: PALETTE.textMuted }}
                    >
                      Failure signature
                    </p>

                    <h2
                      className="mt-1 text-sm font-semibold tracking-wide"
                      style={{ color: PALETTE.textPrimary }}
                    >
                      What is breaking?
                    </h2>
                  </div>

                  <div
                    className="rounded-full border px-3 py-1 font-mono text-[10px] font-semibold tracking-wide"
                    style={{
                      backgroundColor: PALETTE.elevatedBg,
                      borderColor: PALETTE.borderSubtle,
                      color: PALETTE.textSecondary,
                    }}
                  >
                    Trigger distribution
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: PALETTE.danger,
                          boxShadow: "0 0 6px rgba(248, 113, 113, 0.7)",
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
                          boxShadow: "0 0 6px rgba(251, 191, 36, 0.7)",
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
                          boxShadow: "0 0 6px rgba(52, 211, 153, 0.7)",
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
                        style={{ backgroundColor: "#808495" }}
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
                  className="mt-6 flex h-1.5 overflow-hidden rounded-full border"
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
                            backgroundColor: "#808495",
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
              className={cardClass}
              style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
            >
              <div className="relative flex h-full flex-col justify-between p-6">
                <div>
                  <p
                    className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: PALETTE.textMuted }}
                  >
                    Research signal
                  </p>

                  <p
                    className="mt-3 text-lg font-medium leading-relaxed tracking-tight"
                    style={{ color: PALETTE.textPrimary }}
                  >
                    Failure is not discarded.
                    <br />
                    It becomes memory.
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-4">
                  <span
                    className="font-mono text-[10px] uppercase tracking-wider"
                    style={{ color: PALETTE.textMuted }}
                  >
                    Pillar 2
                  </span>

                  <span
                    className="font-mono text-xs font-semibold"
                    style={{ color: PALETTE.glowPurple }}
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
            className={cardClass}
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <CardHeader
              className="border-b px-5 py-4"
              style={{ borderColor: PALETTE.borderSubtle }}
            >
              <div className="flex items-end justify-between gap-4">
                <div>
                  <CardTitle
                    className="text-sm font-semibold tracking-wide"
                    style={{ color: PALETTE.textPrimary }}
                  >
                    Failure Events
                  </CardTitle>

                  <CardDescription
                    className="mt-0.5 text-xs"
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
                    className="w-full text-xs"
                    data-testid="failure-table"
                  >
                    <thead>
                      <tr
                        className="border-b text-left font-mono text-[10px] uppercase tracking-[0.14em]"
                        style={{
                          borderColor: PALETTE.borderSubtle,
                          backgroundColor: "rgba(15, 17, 23, 0.4)",
                          color: PALETTE.textMuted,
                        }}
                      >
                        <th className="px-5 py-3">Failure</th>
                        <th className="px-4 py-3">Regime</th>
                        <th className="px-4 py-3">Trigger</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-5 py-3">Explanation</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-white/[0.04]">
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
                            className={`cursor-pointer transition-colors ${
                              isSelected ? "bg-[#8E88C7]/15" : "hover:bg-white/[0.02]"
                            }`}
                          >
                            <td className="px-5 py-3.5 font-mono">
                              <span
                                className="font-mono text-xs font-medium"
                                style={{ color: PALETTE.textPrimary }}
                              >
                                {f.id.slice(0, 8)}
                              </span>
                            </td>

                            <td className="px-4 py-3.5">
                              <span
                                className="text-xs font-medium"
                                style={{ color: PALETTE.textPrimary }}
                              >
                                {f.regime_at_failure}
                              </span>
                            </td>

                            <td className="px-4 py-3.5">
                              <span
                                className="inline-flex rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider"
                                style={{
                                  background: "rgba(255, 255, 255, 0.04)",
                                  borderColor: `${triggerColor}40`,
                                  color: triggerColor,
                                }}
                              >
                                {triggerLabel}
                              </span>
                            </td>

                            <td
                              className="whitespace-nowrap px-4 py-3.5 font-mono text-xs"
                              style={{ color: PALETTE.textMuted }}
                            >
                              {f.failure_timestamp.slice(0, 10)}
                            </td>

                            <td className="max-w-[480px] px-5 py-3.5">
                              <p
                                className="line-clamp-2 text-xs leading-relaxed"
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
            className={cardClass}
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <div className="p-5">
              <p
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: PALETTE.textMuted }}
              >
                Failure profile
              </p>

              <div className="mt-5 space-y-4">
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
                    className="mt-1.5 h-1 overflow-hidden rounded-full border"
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
                    className="mt-1.5 h-1 overflow-hidden rounded-full border"
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
                    className="mt-1.5 h-1 overflow-hidden rounded-full border"
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
                    className="mt-1.5 h-1 overflow-hidden rounded-full border"
                    style={{
                      backgroundColor: PALETTE.elevatedBg,
                      borderColor: PALETTE.borderSubtle,
                    }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: "#808495",
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
                className="mt-6 border-t pt-4"
                style={{ borderColor: PALETTE.borderSubtle }}
              >
                <p
                  className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: PALETTE.textMuted }}
                >
                  Interpretation
                </p>

                <p
                  className="mt-1.5 text-xs leading-relaxed"
                  style={{ color: PALETTE.textSecondary }}
                >
                  Trigger frequency provides an initial signal before investigating individual failures.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SELECTED FAILURE DETAILS */}
        {selected && (
          <section className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <Card
              className={cardClass}
              style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
              data-testid="llm-explanation"
            >
              <CardHeader
                className="border-b px-5 py-4"
                style={{ borderColor: PALETTE.borderSubtle }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle
                      className="text-sm font-semibold tracking-wide"
                      style={{ color: PALETTE.textPrimary }}
                    >
                      Failure Analysis
                    </CardTitle>

                    <CardDescription
                      className="mt-0.5 text-xs"
                      style={{ color: PALETTE.textSecondary }}
                    >
                      AI-generated explanation
                    </CardDescription>
                  </div>

                  <div
                    className="rounded-xl border px-3 py-1 font-mono text-xs font-semibold"
                    style={{
                      backgroundColor: PALETTE.elevatedBg,
                      borderColor: PALETTE.borderSubtle,
                      color: PALETTE.glowPurple,
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
                    className="mb-4 rounded-xl border border-[#F87171]/30 bg-[#F87171]/10 px-3 py-1 font-mono text-[10px] font-semibold text-[#F87171]"
                    data-testid="numeric-validation-warning"
                  >
                    Numeric validation warning
                  </Badge>
                )}

                <div
                  className="rounded-xl border p-4"
                  style={{
                    backgroundColor: PALETTE.elevatedBg,
                    borderColor: PALETTE.borderSubtle,
                  }}
                >
                  <p
                    className="text-xs leading-relaxed"
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
              className={cardClass}
              style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
              data-testid="shap-chart"
            >
              <CardHeader
                className="border-b px-5 py-4"
                style={{ borderColor: PALETTE.borderSubtle }}
              >
                <CardTitle
                  className="text-sm font-semibold tracking-wide"
                  style={{ color: PALETTE.textPrimary }}
                >
                  Feature Attribution
                </CardTitle>

                <CardDescription
                  className="mt-0.5 text-xs"
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
                          stroke="rgba(255, 255, 255, 0.04)"
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
                            background: "rgba(13, 15, 20, 0.95)",
                            border: "1px solid rgba(255, 255, 255, 0.12)",
                            borderRadius: "0.875rem",
                            color: "#F5F5F7",
                            boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.8)",
                            backdropFilter: "blur(12px)",
                            fontSize: 12,
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
            className={cardClass}
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <CardHeader
              className="border-b px-5 py-4"
              style={{ borderColor: PALETTE.borderSubtle }}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <CardTitle
                    className="text-sm font-semibold tracking-wide"
                    style={{ color: PALETTE.textPrimary }}
                  >
                    Failure Clusters
                  </CardTitle>

                  <CardDescription
                    className="mt-0.5 text-xs"
                    style={{ color: PALETTE.textSecondary }}
                  >
                    Where failure conditions begin to form patterns.
                  </CardDescription>
                </div>

                <span
                  className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em]"
                  style={{ color: PALETTE.textMuted }}
                >
                  Regime × Trigger
                </span>
              </div>
            </CardHeader>

            <CardContent className="relative min-h-[430px] overflow-hidden px-5 py-6">
              <div className="relative z-10 flex min-h-[360px] items-center justify-center">
                <FailureClusterChart clusters={clusters} />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* TIMELINE */}
        <section>
          <Card
            className={cardClass}
            style={{ boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)" }}
          >
            <CardHeader
              className="border-b px-5 py-4"
              style={{ borderColor: PALETTE.borderSubtle }}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full bg-[#8E88C7]"
                      style={{
                        boxShadow: "0 0 8px rgba(142, 136, 199, 0.8)",
                      }}
                    />

                    <CardTitle
                      className="text-sm font-semibold tracking-wide"
                      style={{ color: PALETTE.textPrimary }}
                    >
                      Failure Timeline
                    </CardTitle>
                  </div>

                  <CardDescription
                    className="mt-0.5 text-xs"
                    style={{ color: PALETTE.textSecondary }}
                  >
                    Failure events overlaid on the selected market regime.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="h-10 w-28 rounded-xl border border-white/[0.08] bg-[#0F1117]/80 font-mono text-xs font-semibold text-[#F5F5F7] placeholder-[#666A76] focus-visible:ring-[#8E88C7]/40"
                    placeholder="SPY"
                  />

                  <Button
                    size="sm"
                    onClick={loadTimeline}
                    className="h-10 rounded-xl bg-[#8E88C7] px-4 font-semibold text-white shadow-lg hover:bg-[#8E88C7]/90"
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
                  className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.01]"
                >
                  <div className="text-center">
                    <p
                      className="text-xs font-semibold"
                      style={{ color: PALETTE.textSecondary }}
                    >
                      No timeline loaded
                    </p>

                    <p
                      className="mt-1 max-w-sm text-xs"
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
    </div>
  );
}