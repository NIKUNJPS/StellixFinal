"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { REGIME_COLORS, type RegimeLabel } from "@/lib/regime-types";
import {
  listStrategies,
} from "@/lib/strategy";
import {
  STATUS_COLORS,
  type StrategyListItem,
  type StrategyStatus,
} from "@/lib/strategy-types";

type SortKey = "name" | "robustness_score" | "created_at";

const COLORS = {
  charcoal: "#16232b",
  teal: "#075056",
  orange: "#c40707",
  sand: "#f2d17d",
  silver: "#d3dbdd",
  blue: "#074068"
};

function robustnessColor(v: number | null): string {
  if (v === null) return "rgba(211, 219, 221, 0.45)";
  if (v >= 0.7) return COLORS.teal;
  if (v >= 0.4) return COLORS.sand;
  return COLORS.orange;
}

function robustnessWidth(v: number | null): string {
  if (v === null) return "0%";
  return `${Math.min(Math.max(v * 100, 0), 100)}%`;
}

export function StrategyExplorerView({ basePath = "/admin" }: { basePath?: string }) {
  const [rows, setRows] = useState<StrategyListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] =
    useState<StrategyStatus | "all">("all");
  const [sortKey, setSortKey] =
    useState<SortKey>("created_at");
  const [sortDir, setSortDir] =
    useState<"asc" | "desc">("desc");

  useEffect(() => {
    listStrategies()
      .then((data) => setRows(data.items))
      .catch((e) =>
        setError(
          e instanceof Error
            ? e.message
            : "Failed to load",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const view = useMemo(() => {
    let items = rows;

    if (statusFilter !== "all") {
      items = items.filter(
        (r) => r.status === statusFilter,
      );
    }

    const dir = sortDir === "asc" ? 1 : -1;

    return [...items].sort((a, b) => {
      if (sortKey === "name") {
        return a.name.localeCompare(b.name) * dir;
      }

      if (sortKey === "robustness_score") {
        return (
          ((a.robustness_score ?? -1) -
            (b.robustness_score ?? -1)) *
          dir
        );
      }

      return (
        (+new Date(a.created_at) -
          +new Date(b.created_at)) *
        dir
      );
    });
  }, [
    rows,
    statusFilter,
    sortKey,
    sortDir,
  ]);

  function sortBy(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) =>
        d === "asc" ? "desc" : "asc",
      );
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <section
        className="overflow-hidden rounded-[22px] border"
        style={{
          backgroundColor: COLORS.charcoal,
          borderColor:
            "rgba(211, 219, 221, 0.10)",
          boxShadow:
            "0 20px 60px rgba(0,0,0,0.24)",
        }}
      >
        <div className="px-7 pb-5 pt-7 md:px-9 md:pt-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p
                className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em]"
                style={{
                  color:
                    "rgba(211, 219, 221, 0.52)",
                }}
              >
                Research Environment
              </p>

              <div className="flex items-center gap-3">
                <h1
                  className="text-[28px] font-semibold tracking-[-0.025em]"
                  style={{ color: "#fdf6e3" }}
                >
                  Strategy Explorer
                </h1>

                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    backgroundColor:
                      "rgba(7, 80, 86, 0.55)",
                    color: COLORS.silver,
                  }}
                >
                  {rows.length} strategies
                </span>
              </div>

              <p
                className="mt-1.5 text-sm"
                style={{
                  color:
                    "rgba(211, 219, 221, 0.62)",
                }}
              >
                Explore, compare and evaluate
                research strategies.
              </p>
            </div>

            <Link
              href={`${basePath}/strategies/new`}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-[11px] px-4 text-sm font-semibold transition-all duration-200 hover:-translate-y-px"
              style={{
                backgroundColor: COLORS.blue,
                color: "#ffffff",
                boxShadow:
                  "0 6px 18px rgba(7, 64, 104, 0.22)",
              }}
            >
              + New strategy
            </Link>
          </div>
        </div>

        <div
          className="border-y px-7 py-4 md:px-9"
          style={{
            borderColor:
              "rgba(211, 219, 221, 0.08)",
            backgroundColor:
              "rgba(0, 0, 0, 0.10)",
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="mr-1 text-[11px] font-medium uppercase tracking-[0.12em]"
                style={{
                  color:
                    "rgba(211, 219, 221, 0.45)",
                }}
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
                const selected =
                  statusFilter === status;

                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() =>
                      setStatusFilter(
                        status as
                          | StrategyStatus
                          | "all",
                      )
                    }
                    className="rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-all duration-150"
                    style={{
                      backgroundColor: selected
                        ? COLORS.teal
                        : "rgba(211, 219, 221, 0.055)",
                      color: selected
                        ? "#fdf6e3"
                        : "rgba(211, 219, 221, 0.62)",
                      border: `1px solid ${
                        selected
                          ? "rgba(211, 219, 221, 0.10)"
                          : "rgba(211, 219, 221, 0.07)"
                      }`,
                    }}
                  >
                    {status}
                  </button>
                );
              })}
            </div>

            <span
              className="text-xs"
              style={{
                color:
                  "rgba(211, 219, 221, 0.40)",
              }}
            >
              {view.length} shown
            </span>
          </div>
        </div>

        {error && (
          <div className="px-7 pt-5 md:px-9">
            <p
              className="rounded-xl border px-4 py-3 text-sm"
              style={{
                borderColor:
                  "rgba(254, 91, 5, 0.25)",
                backgroundColor:
                  "rgba(254, 91, 5, 0.08)",
                color: COLORS.orange,
              }}
            >
              {error}
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center">
            <div className="text-center">
              <div
                className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
                style={{
                  borderColor:
                    "rgba(211, 219, 221, 0.20)",
                  borderTopColor:
                    COLORS.silver,
                }}
              />

              <p
                className="text-sm"
                style={{
                  color:
                    "rgba(211, 219, 221, 0.48)",
                }}
              >
                Loading strategies…
              </p>
            </div>
          </div>
        ) : view.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
            <div
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{
                backgroundColor:
                  "rgba(7, 80, 86, 0.45)",
                color: COLORS.silver,
              }}
            >
              +
            </div>

            <p
              className="text-sm font-medium"
              style={{ color: "#fdf6e3" }}
            >
              No strategies yet
            </p>

            <p
              className="mt-1 max-w-sm text-xs"
              style={{
                color:
                  "rgba(211, 219, 221, 0.48)",
              }}
            >
              Build your first strategy to
              start evaluating performance
              across market regimes.
            </p>

            <Link
              href={`${basePath}/strategies/new`}
              className="mt-5 inline-flex h-9 items-center rounded-[10px] px-4 text-sm font-medium"
              style={{
                backgroundColor: COLORS.orange,
                color: "#ffffff",
              }}
            >
              Build a strategy →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[1120px] text-sm"
              data-testid="strategy-table"
            >
              <thead>
                <tr
                  className="border-b"
                  style={{
                    borderColor:
                      "rgba(211, 219, 221, 0.08)",
                  }}
                >
                  <Th
                    onClick={() => sortBy("name")}
                  >
                    Name
                  </Th>

                  <th
                    className="px-4 py-4 text-left text-[10px] font-semibold uppercase tracking-[0.13em]"
                    style={{
                      color:
                        "rgba(211, 219, 221, 0.42)",
                    }}
                  >
                    Status
                  </th>

                  <th
                    className="px-4 py-4 text-left text-[10px] font-semibold uppercase tracking-[0.13em]"
                    style={{
                      color:
                        "rgba(211, 219, 221, 0.42)",
                    }}
                  >
                    Version
                  </th>

                  <Th
                    onClick={() =>
                      sortBy(
                        "robustness_score",
                      )
                    }
                  >
                    Robustness
                  </Th>

                  <th
                    className="px-4 py-4 text-left text-[10px] font-semibold uppercase tracking-[0.13em]"
                    style={{
                      color:
                        "rgba(211, 219, 221, 0.42)",
                    }}
                  >
                    Regime compatibility
                  </th>

                  <th
                    className="px-4 py-4 text-left text-[10px] font-semibold uppercase tracking-[0.13em]"
                    style={{
                      color:
                        "rgba(211, 219, 221, 0.42)",
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {view.map((s) => {
                  const robustness =
                    s.robustness_score;

                  return (
                    <tr
                      key={s.id}
                      className="group border-b transition-colors duration-150 hover:bg-white/[0.025]"
                      style={{
                        borderColor:
                          "rgba(211, 219, 221, 0.065)",
                      }}
                    >
                      <td className="min-w-[520px] max-w-[620px] px-4 py-5">
                        <Link
                          href={`${basePath}/strategies/${s.id}/validation`}
                          className="block"
                        >
                          <div
                            className="whitespace-normal break-words text-sm font-semibold leading-6 transition-colors"
                            style={{
                              color: "#fdf6e3",
                            }}
                          >
                            {s.name}
                          </div>

                          <div
                            className="mt-1 text-[11px]"
                            style={{
                              color:
                                "rgba(211, 219, 221, 0.38)",
                            }}
                          >
                            Strategy research
                            artifact
                          </div>
                        </Link>
                      </td>

                      <td className="px-4 py-5">
                        <StatusPill
                          status={s.status}
                        />
                      </td>

                      <td
                        className="px-4 py-5 text-xs"
                        style={{
                          color:
                            "rgba(211, 219, 221, 0.62)",
                        }}
                      >
                        v{s.version}
                      </td>

                      <td className="w-[180px] px-4 py-5">
                        <div className="flex items-center gap-3">
                          <span
                            className="w-9 text-sm font-semibold"
                            style={{
                              color:
                                robustnessColor(
                                  robustness,
                                ),
                            }}
                          >
                            {robustness === null
                              ? "—"
                              : robustness.toFixed(
                                  2,
                                )}
                          </span>

                          <div
                            className="h-1.5 w-20 overflow-hidden rounded-full"
                            style={{
                              backgroundColor:
                                "rgba(211, 219, 221, 0.10)",
                            }}
                          >
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width:
                                  robustnessWidth(
                                    robustness,
                                  ),
                                backgroundColor:
                                  robustnessColor(
                                    robustness,
                                  ),
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-5">
                        <div className="flex max-w-[420px] flex-wrap gap-1.5">
                          {s.regime_compatibility ? (
                            Object.entries(
                              s.regime_compatibility,
                            ).map(
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
                              className="text-xs"
                              style={{
                                color:
                                  "rgba(211, 219, 221, 0.38)",
                              }}
                            >
                              Not backtested
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-5">
                        <button
                          type="button"
                          className="text-xs font-medium transition-colors hover:underline"
                          style={{
                            color: COLORS.orange,
                          }}
                          title="Delete strategy"
                        >
                          Delete
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
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <th
      className="cursor-pointer px-4 py-4 text-left text-[10px] font-semibold uppercase tracking-[0.13em] transition-colors"
      style={{
        color: "rgba(211, 219, 221, 0.42)",
      }}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1.5 hover:text-[#d3dbdd]">
        {children}
        <span
          className="text-[9px]"
          style={{
            color:
              "rgba(211, 219, 221, 0.28)",
          }}
        >
          ↕
        </span>
      </span>
    </th>
  );
}

function StatusPill({
  status,
}: {
  status: StrategyStatus;
}) {
  let background = "rgba(211, 219, 221, 0.10)";
  let color = COLORS.silver;

  if (status === "active") {
    background = "rgba(7, 80, 86, 0.85)";
    color = "#fdf6e3";
  }

  if (status === "candidate") {
    background = "rgba(242, 209, 125, 0.18)";
    color = COLORS.sand;
  }

  if (status === "failed") {
    background = "rgba(254, 91, 5, 0.16)";
    color = "#c40707";
  }

  if (status === "draft") {
    background = "rgba(211, 219, 221, 0.10)";
    color = COLORS.silver;
  }

  if (status === "retired") {
    background = "rgba(22, 35, 43, 0.95)";
    color = "rgba(211, 219, 221, 0.58)";
  }

  return (
    <span
      className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize"
      style={{
        backgroundColor: background,
        color,
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
  let background =
    "rgba(211, 219, 221, 0.08)";
  let color =
    "rgba(211, 219, 221, 0.72)";

  const normalized =
    regime.toLowerCase();

  if (
    normalized.includes("low-volatility") ||
    normalized.includes("low volatility")
  ) {
    background = "rgba(7, 80, 86, 0.48)";
    color = "#7fd9d2";
  } else if (
    normalized.includes("high-volatility") ||
    normalized.includes("high volatility")
  ) {
    background = "rgba(242, 209, 125, 0.16)";
    color = COLORS.sand;
  } else if (normalized === "bear") {
    background = "rgba(254, 91, 5, 0.15)";
    color = "#c40707";
  } else if (normalized === "bull") {
    background = "rgba(7, 80, 86, 0.48)";
    color = "#82d8d1";
  } else if (normalized === "crisis") {
    background = "rgba(211, 219, 221, 0.12)";
    color = COLORS.silver;
  } else if (normalized === "sideways") {
    background = "rgba(211, 219, 221, 0.10)";
    color = "rgba(211, 219, 221, 0.72)";
  }

  return (
    <span
      title={`Sharpe ${
        sharpe === null
          ? "n/a"
          : sharpe.toFixed(2)
      }`}
      className="rounded-md px-2 py-1 text-[10px] font-medium"
      style={{
        backgroundColor: background,
        color,
      }}
    >
      {regime}
    </span>
  );
}
