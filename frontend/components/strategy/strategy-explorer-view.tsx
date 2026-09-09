"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, ArrowUpDown, ArrowUp, ArrowDown, Trash2 } from "lucide-react";

import { listStrategies } from "@/lib/strategy";
import type { StrategyListItem, StrategyStatus } from "@/lib/strategy-types";

type SortKey = "name" | "robustness_score" | "created_at";

const PALETTE = {
  mainBg: "#08090B",
  sidebarBg: "#0B1017",
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

function robustnessColor(v: number | null): string {
  if (v === null) return PALETTE.textMuted;
  if (v >= 0.7) return PALETTE.success;
  if (v >= 0.4) return PALETTE.warning;
  return PALETTE.danger;
}

function robustnessWidth(v: number | null): string {
  if (v === null) return "0%";
  return `${Math.min(Math.max(v * 100, 0), 100)}%`;
}

export function StrategyExplorerView({ basePath = "/admin" }: { basePath?: string }) {
  const [rows, setRows] = useState<StrategyListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StrategyStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    listStrategies()
      .then((data) => setRows(data.items))
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "Failed to load strategies",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const view = useMemo(() => {
    let items = rows;

    if (statusFilter !== "all") {
      items = items.filter((r) => r.status === statusFilter);
    }

    const dir = sortDir === "asc" ? 1 : -1;

    return [...items].sort((a, b) => {
      if (sortKey === "name") {
        return a.name.localeCompare(b.name) * dir;
      }

      if (sortKey === "robustness_score") {
        return (
          ((a.robustness_score ?? -1) - (b.robustness_score ?? -1)) * dir
        );
      }

      return (
        (+new Date(a.created_at) - +new Date(b.created_at)) * dir
      );
    });
  }, [rows, statusFilter, sortKey, sortDir]);

  function sortBy(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-[1340px]">
      {/* Cinematic Ambient Atmosphere Glow Inspired by Reference */}
      <div
        className="pointer-events-none absolute -top-32 left-1/4 h-[420px] w-[580px] -translate-x-1/2 rounded-full opacity-35 blur-[140px]"
        style={{
          background: "radial-gradient(circle, rgba(111, 107, 155, 0.35) 0%, rgba(75, 75, 112, 0.18) 50%, transparent 80%)",
        }}
      />
      <div
        className="pointer-events-none absolute -top-24 right-12 h-[340px] w-[460px] rounded-full opacity-20 blur-[150px]"
        style={{
          background: "radial-gradient(circle, rgba(75, 75, 112, 0.4) 0%, rgba(15, 17, 21, 0.2) 65%, transparent 80%)",
        }}
      />

      {/* Main Graphite Card Container */}
      <section
        className="relative overflow-hidden rounded-[20px] border transition-all duration-200"
        style={{
          backgroundColor: PALETTE.cardBg,
          borderColor: PALETTE.borderSubtle,
          boxShadow: "0 24px 70px -15px rgba(0, 0, 0, 0.8), 0 1px 2px rgba(255, 255, 255, 0.02) inset",
        }}
      >
        {/* Header Strip */}
        <div
          className="relative border-b px-7 pb-6 pt-7 md:px-9 md:pt-8"
          style={{ borderColor: PALETTE.borderSubtle }}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor: PALETTE.glowLavender,
                    boxShadow: "0 0 8px rgba(111, 107, 155, 0.8)",
                  }}
                />
                <p
                  className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em]"
                  style={{ color: PALETTE.textMuted }}
                >
                  Research Environment
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-0.5">
                <h1
                  className="text-[30px] font-bold tracking-[-0.03em]"
                  style={{ color: PALETTE.textPrimary }}
                >
                  Strategy Explorer
                </h1>

                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] font-medium"
                  style={{
                    backgroundColor: PALETTE.elevatedBg,
                    borderColor: PALETTE.borderSubtle,
                    color: PALETTE.textSecondary,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: PALETTE.success }}
                  />
                  {rows.length} {rows.length === 1 ? "strategy" : "strategies"}
                </span>
              </div>

              <p
                className="text-sm font-normal"
                style={{ color: PALETTE.textSecondary }}
              >
                Explore, compare, stress-test, and evaluate institutional quantitative models.
              </p>
            </div>

            {/* + New Strategy Action Button */}
            <Link
              href={`${basePath}/strategies/new`}
              className="group relative inline-flex h-10 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-[12px] border px-5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
              style={{
                backgroundColor: PALETTE.elevatedBg,
                borderColor: "rgba(255, 255, 255, 0.12)",
                color: PALETTE.textPrimary,
                boxShadow: "0 8px 24px -6px rgba(0, 0, 0, 0.6), 0 0 12px -2px rgba(111, 107, 155, 0.2)",
              }}
            >
              <Plus
                className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90"
                style={{ color: PALETTE.glowLavender }}
              />
              <span>New strategy</span>
            </Link>
          </div>
        </div>

        {/* Filter Navigation Bar */}
        <div
          className="border-b px-7 py-3.5 md:px-9"
          style={{
            borderColor: PALETTE.borderSubtle,
            backgroundColor: "rgba(11, 16, 23, 0.4)",
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="mr-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: PALETTE.textMuted }}
              >
                Status
              </span>

              {[
                "all",
                "draft",
                "candidate",
                "active",
                "failed",
                "retired",
              ].map((status) => {
                const selected = statusFilter === status;

                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() =>
                      setStatusFilter(
                        status as StrategyStatus | "all",
                      )
                    }
                    className="relative rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all duration-150 hover:-translate-y-px active:translate-y-0"
                    style={{
                      backgroundColor: selected
                        ? PALETTE.elevatedBg
                        : "transparent",
                      color: selected
                        ? PALETTE.textPrimary
                        : PALETTE.textSecondary,
                      border: `1px solid ${
                        selected
                          ? "rgba(255, 255, 255, 0.12)"
                          : "transparent"
                      }`,
                      boxShadow: selected
                        ? "0 4px 16px -2px rgba(0, 0, 0, 0.5)"
                        : "none",
                    }}
                  >
                    {status}
                  </button>
                );
              })}
            </div>

            <div
              className="font-mono text-xs"
              style={{ color: PALETTE.textMuted }}
            >
              Showing <span style={{ color: PALETTE.textPrimary }}>{view.length}</span> of {rows.length}
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="px-7 pt-5 md:px-9">
            <p
              className="rounded-xl border px-4 py-3 text-sm font-medium"
              style={{
                borderColor: "rgba(228, 91, 91, 0.3)",
                backgroundColor: "rgba(228, 91, 91, 0.08)",
                color: PALETTE.danger,
              }}
            >
              {error}
            </p>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex min-h-[380px] items-center justify-center">
            <div className="text-center">
              <div
                className="mx-auto mb-3.5 h-7 w-7 animate-spin rounded-full border-2 border-t-transparent"
                style={{
                  borderColor: PALETTE.borderSubtle,
                  borderTopColor: PALETTE.glowLavender,
                }}
              />
              <p
                className="font-mono text-xs uppercase tracking-wider"
                style={{ color: PALETTE.textMuted }}
              >
                Loading strategies…
              </p>
            </div>
          </div>
        ) : view.length === 0 ? (
          /* Empty State */
          <div className="flex min-h-[380px] flex-col items-center justify-center px-6 py-12 text-center">
            <div
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border"
              style={{
                backgroundColor: PALETTE.elevatedBg,
                borderColor: PALETTE.borderSubtle,
                color: PALETTE.glowLavender,
              }}
            >
              <Plus className="h-6 w-6" />
            </div>

            <p
              className="text-base font-semibold"
              style={{ color: PALETTE.textPrimary }}
            >
              No strategies yet
            </p>

            <p
              className="mt-1.5 max-w-sm text-xs leading-relaxed"
              style={{ color: PALETTE.textSecondary }}
            >
              Build your first strategy to start evaluating performance across market regimes.
            </p>

            <Link
              href={`${basePath}/strategies/new`}
              className="mt-6 inline-flex h-9 items-center gap-2 rounded-[10px] border px-4 text-xs font-semibold shadow-md transition-all duration-200 hover:-translate-y-0.5"
              style={{
                backgroundColor: PALETTE.elevatedBg,
                borderColor: "rgba(255, 255, 255, 0.12)",
                color: PALETTE.textPrimary,
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Build a strategy →
            </Link>
          </div>
        ) : (
          /* Strategy Data Table */
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[1140px] text-left text-sm"
              data-testid="strategy-table"
            >
              <thead>
                <tr
                  className="border-b"
                  style={{
                    borderColor: PALETTE.borderSubtle,
                    backgroundColor: "rgba(11, 16, 23, 0.3)",
                  }}
                >
                  <Th
                    onClick={() => sortBy("name")}
                    active={sortKey === "name"}
                    direction={sortDir}
                  >
                    Name
                  </Th>

                  <th
                    className="px-5 py-4 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: PALETTE.textMuted }}
                  >
                    Status
                  </th>

                  <th
                    className="px-5 py-4 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: PALETTE.textMuted }}
                  >
                    Version
                  </th>

                  <Th
                    onClick={() => sortBy("robustness_score")}
                    active={sortKey === "robustness_score"}
                    direction={sortDir}
                  >
                    Robustness
                  </Th>

                  <th
                    className="px-5 py-4 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: PALETTE.textMuted }}
                  >
                    Regime compatibility
                  </th>

                  <th
                    className="px-5 py-4 text-right font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{ color: PALETTE.textMuted }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y" style={{ borderColor: "rgba(255, 255, 255, 0.03)" }}>
                {view.map((s) => {
                  const robustness = s.robustness_score;

                  return (
                    <tr
                      key={s.id}
                      className="group transition-all duration-150 hover:bg-white/[0.02]"
                    >
                      {/* Name Column */}
                      <td className="min-w-[420px] max-w-[560px] px-5 py-4">
                        <Link
                          href={`${basePath}/strategies/${s.id}/validation`}
                          className="group/link block"
                        >
                          <div
                            className="whitespace-normal break-words text-[15px] font-semibold tracking-[-0.015em] transition-colors duration-150 group-hover/link:text-white"
                            style={{ color: PALETTE.textPrimary }}
                          >
                            {s.name}
                          </div>

                          <div
                            className="mt-0.5 flex items-center gap-2 font-mono text-[11px]"
                            style={{ color: PALETTE.textMuted }}
                          >
                            <span>Strategy research artifact</span>
                            <span>•</span>
                            <span>ID: {s.id.slice(0, 8)}</span>
                          </div>
                        </Link>
                      </td>

                      {/* Status Column */}
                      <td className="px-5 py-4">
                        <StatusPill status={s.status} />
                      </td>

                      {/* Version Column */}
                      <td
                        className="px-5 py-4 font-mono text-xs"
                        style={{ color: PALETTE.textSecondary }}
                      >
                        <span
                          className="rounded-md border px-2 py-1"
                          style={{
                            backgroundColor: PALETTE.elevatedBg,
                            borderColor: PALETTE.borderSubtle,
                          }}
                        >
                          v{s.version}
                        </span>
                      </td>

                      {/* Robustness Score Column */}
                      <td className="w-[210px] px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span
                            className="w-10 font-mono text-xs font-semibold"
                            style={{
                              color: robustnessColor(robustness),
                            }}
                          >
                            {robustness === null
                              ? "—"
                              : robustness.toFixed(2)}
                          </span>

                          <div
                            className="h-1.5 w-24 overflow-hidden rounded-full border"
                            style={{
                              backgroundColor: PALETTE.elevatedBg,
                              borderColor: PALETTE.borderSubtle,
                            }}
                          >
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: robustnessWidth(robustness),
                                backgroundColor: robustnessColor(robustness),
                                boxShadow:
                                  robustness !== null && robustness >= 0.4
                                    ? `0 0 8px ${robustnessColor(robustness)}`
                                    : "none",
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Regime Compatibility Column */}
                      <td className="px-5 py-4">
                        <div className="flex max-w-[420px] flex-wrap gap-1.5">
                          {s.regime_compatibility ? (
                            Object.entries(s.regime_compatibility).map(
                              ([regime, sharpe]) => (
                                <RegimePill
                                  key={regime}
                                  regime={regime}
                                  sharpe={sharpe}
                                />
                              ),
                            )
                          ) : (
                            <span
                              className="font-mono text-xs"
                              style={{ color: PALETTE.textMuted }}
                            >
                              Not backtested
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Delete Action Column */}
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150 hover:bg-red-500/10 hover:text-[#E45B5B]"
                          style={{
                            color: PALETTE.textMuted,
                          }}
                          title="Delete strategy"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Th({
  children,
  onClick,
  active = false,
  direction = "desc",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  direction?: "asc" | "desc";
}) {
  return (
    <th
      className="cursor-pointer px-5 py-4 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors hover:text-white"
      style={{
        color: active ? PALETTE.textPrimary : PALETTE.textMuted,
      }}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1.5">
        {children}
        {active ? (
          direction === "asc" ? (
            <ArrowUp className="h-3 w-3 text-white" />
          ) : (
            <ArrowDown className="h-3 w-3 text-white" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </th>
  );
}

function StatusPill({ status }: { status: StrategyStatus }) {
  let bg = "rgba(255, 255, 255, 0.04)";
  let text = PALETTE.textSecondary;
  let border = PALETTE.borderSubtle;

  if (status === "active") {
    bg = "rgba(53, 199, 122, 0.12)";
    text = PALETTE.success;
    border = "rgba(53, 199, 122, 0.25)";
  } else if (status === "candidate") {
    bg = "rgba(229, 168, 75, 0.12)";
    text = PALETTE.warning;
    border = "rgba(229, 168, 75, 0.22)";
  } else if (status === "failed") {
    bg = "rgba(228, 91, 91, 0.12)";
    text = PALETTE.danger;
    border = "rgba(228, 91, 91, 0.25)";
  } else if (status === "draft") {
    bg = PALETTE.elevatedBg;
    text = PALETTE.textSecondary;
    border = PALETTE.borderSubtle;
  } else if (status === "retired") {
    bg = "rgba(255, 255, 255, 0.02)";
    text = PALETTE.textMuted;
    border = "rgba(255, 255, 255, 0.04)";
  }

  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors"
      style={{
        backgroundColor: bg,
        color: text,
        borderColor: border,
      }}
    >
      {status}
    </span>
  );
}

function RegimePill({
  regime,
  sharpe,
}: {
  regime: string;
  sharpe: number | null;
}) {
  let bg = PALETTE.elevatedBg;
  let text = PALETTE.textSecondary;
  let border = PALETTE.borderSubtle;

  const normalized = regime.toLowerCase();

  if (
    normalized.includes("low-volatility") ||
    normalized.includes("low volatility") ||
    normalized === "bull"
  ) {
    bg = "rgba(53, 199, 122, 0.08)";
    text = PALETTE.success;
    border = "rgba(53, 199, 122, 0.18)";
  } else if (
    normalized.includes("high-volatility") ||
    normalized.includes("high volatility")
  ) {
    bg = "rgba(229, 168, 75, 0.08)";
    text = PALETTE.warning;
    border = "rgba(229, 168, 75, 0.18)";
  } else if (normalized === "bear" || normalized === "crisis") {
    bg = "rgba(228, 91, 91, 0.08)";
    text = PALETTE.danger;
    border = "rgba(228, 91, 91, 0.18)";
  }

  return (
    <span
      title={`Sharpe: ${sharpe === null ? "n/a" : sharpe.toFixed(2)}`}
      className="inline-flex items-center gap-1 rounded-[6px] border px-2 py-0.5 font-mono text-[10px] font-medium transition-colors"
      style={{
        backgroundColor: bg,
        color: text,
        borderColor: border,
      }}
    >
      <span>{regime}</span>
      {sharpe !== null && (
        <span style={{ color: PALETTE.textMuted }}>
          {sharpe.toFixed(1)}
        </span>
      )}
    </span>
  );
}