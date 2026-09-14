"use client";

import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Layers,
  ShieldAlert,
  TrendingDown,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  getPortfolioCorrelation,
  getPortfolioOverview,
} from "@/lib/portfolio";

import type {
  CorrelationMatrix,
  PortfolioOverview,
  RiskAlert,
} from "@/lib/portfolio-types";

/* -------------------------------------------------------------------------- */
/*                                CHART LOADER                                */
/* -------------------------------------------------------------------------- */

const PortfolioCharts = dynamic(
  () => import("@/components/portfolio/portfolio-charts"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[260px] animate-pulse rounded-2xl border border-white/[0.06] bg-[#0F1117]/70" />
    ),
  },
);

/* -------------------------------------------------------------------------- */
/*                                  COLORS                                    */
/* -------------------------------------------------------------------------- */

const REGIME_DONUT: Record<string, string> = {
  Bull: "#34D399",
  Bear: "#F87171",
  Crisis: "#F43F5E",
  "High-Volatility": "#FBBF24",
  Sideways: "#8E88C7",
  "Low-Volatility": "#38BDF8",
};

/* -------------------------------------------------------------------------- */
/*                               ALERT STYLES                                 */
/* -------------------------------------------------------------------------- */

const ALERT_STYLES: Record<RiskAlert["severity"], string> = {
  critical:
    "border-[#F87171]/25 bg-[#F87171]/10 text-[#F87171]",

  warning:
    "border-[#FBBF24]/25 bg-[#FBBF24]/10 text-[#FBBF24]",

  info:
    "border-[#38BDF8]/25 bg-[#38BDF8]/10 text-[#38BDF8]",
};

/* -------------------------------------------------------------------------- */
/*                                KPI CARD                                    */
/* -------------------------------------------------------------------------- */

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "primary",
}: {
  icon: typeof Layers;
  label: string;
  value: string;
  sub?: string;
  tone?: "primary" | "danger" | "warning";
}) {
  let accentColor = "#8E88C7";
  let iconBg = "rgba(142,136,199,0.12)";
  let borderGlow = "rgba(142,136,199,0.25)";

  if (tone === "danger") {
    accentColor = "#F87171";
    iconBg = "rgba(248,113,113,0.12)";
    borderGlow = "rgba(248,113,113,0.25)";
  }

  if (tone === "warning") {
    accentColor = "#FBBF24";
    iconBg = "rgba(251,191,36,0.12)";
    borderGlow = "rgba(251,191,36,0.25)";
  }

  return (
    <Card
      className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl"
      style={{
        boxShadow:
          "inset 0 1px 0 0 rgba(255,255,255,0.08)",
      }}
    >
      {/* Static subtle top glow */}

      <div
        className="pointer-events-none absolute -top-16 left-1/2 h-24 w-3/4 -translate-x-1/2 rounded-full opacity-20 blur-2xl"
        style={{
          backgroundColor: accentColor,
        }}
      />

      <CardContent className="flex min-h-[125px] flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#808495]">
            {label}
          </span>

          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
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
          <p className="truncate text-[27px] font-bold tracking-tight text-[#F5F5F7]">
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

/* -------------------------------------------------------------------------- */
/*                          CORRELATION COLOR LOGIC                           */
/* -------------------------------------------------------------------------- */

function correlationColor(v: number): string {
  const t = Math.max(-1, Math.min(1, v));

  if (t >= 0) {
    const r = Math.round(13 + (248 - 13) * t);
    const g = Math.round(15 + (113 - 15) * t);
    const b = Math.round(20 + (113 - 20) * t);

    return `rgb(${r},${g},${b})`;
  }

  const a = -t;

  const r = Math.round(13 + (56 - 13) * a);
  const g = Math.round(15 + (189 - 15) * a);
  const b = Math.round(20 + (248 - 20) * a);

  return `rgb(${r},${g},${b})`;
}

/* -------------------------------------------------------------------------- */
/*                           CORRELATION HEATMAP                              */
/* -------------------------------------------------------------------------- */

function CorrelationHeatmap({
  corr,
}: {
  corr: CorrelationMatrix;
}) {
  if (corr.matrix.length < 2) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-[#9A9DA8]">
            Not enough backtest history yet to compute correlations.
          </p>

          {corr.excluded.length > 0 && (
            <p className="mt-2 text-xs text-[#666A76]">
              Excluded: {corr.excluded.join(", ")}
            </p>
          )}
        </div>
      </div>
    );
  }

  const n = corr.labels.length;

  const short = (name: string) =>
    name.length > 10
      ? `${name.slice(0, 9)}…`
      : name;

  return (
    <div className="overflow-x-auto">
      <div
        role="img"
        aria-label={`Correlation heatmap of ${n} strategies over ${corr.days_used} trading days`}
        className="min-w-max"
      >
        <table className="border-separate border-spacing-1.5 text-[11px]">
          <thead>
            <tr>
              <th className="p-1" />

              {corr.labels.map((label) => (
                <th
                  key={label}
                  className="p-1 font-medium text-[#808495]"
                  title={label}
                >
                  {short(label)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {corr.matrix.map((row, i) => (
              <tr key={corr.labels[i]}>
                <td
                  className="whitespace-nowrap p-1 text-right font-medium text-[#808495]"
                  title={corr.labels[i]}
                >
                  {short(corr.labels[i]!)}
                </td>

                {row.map((value, j) =>
                  value === null ? (
                    <td
                      key={j}
                      className="h-10 w-14 rounded-lg border border-white/[0.03] bg-white/[0.015] text-center font-mono text-[11px] text-[#666A76]"
                    >
                      —
                    </td>
                  ) : (
                    <td
                      key={j}
                      className="h-10 w-14 rounded-lg text-center font-mono text-[11px] font-medium text-[#F5F5F7] shadow-inner"
                      style={{
                        background: correlationColor(value),
                      }}
                      title={`${corr.labels[i]} × ${
                        corr.labels[j]
                      }: ${value.toFixed(2)}`}
                    >
                      {value.toFixed(2)}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {corr.excluded.length > 0 && (
        <p className="mt-4 text-xs text-[#666A76]">
          Excluded (insufficient history):{" "}
          {corr.excluded.join(", ")}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               MAIN PAGE                                    */
/* -------------------------------------------------------------------------- */

export default function PortfolioPage() {
  const [overview, setOverview] =
    useState<PortfolioOverview | null>(null);

  const [corr, setCorr] =
    useState<CorrelationMatrix | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [ov, cm] = await Promise.all([
          getPortfolioOverview(),
          getPortfolioCorrelation(),
        ]);

        if (!active) return;

        setOverview(ov);
        setCorr(cm);
      } catch (e) {
        if (active) {
          setError(
            e instanceof Error
              ? e.message
              : "Failed to load portfolio",
          );
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const donutData = useMemo(
    () =>
      (overview?.regime_exposure ?? []).map(
        (regime) => ({
          name: regime.regime,
          value: regime.count,
          color:
            REGIME_DONUT[regime.regime] ??
            "#8E88C7",
        }),
      ),
    [overview],
  );

  const cardClass =
    "relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl";

  return (
    <div className="relative min-h-full bg-[#07080B] px-1 py-1 text-[#F5F5F7]">
      {/* Background atmosphere */}

      <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-[#5C568E]/10 blur-[120px]" />

      <div className="pointer-events-none absolute top-40 right-10 h-72 w-72 rounded-full bg-[#38BDF8]/5 blur-[100px]" />

      {/* Error */}

      {error && (
        <div className="mb-6 rounded-2xl border border-[#F87171]/25 bg-[#F87171]/10 p-4 text-xs font-medium text-[#F87171] backdrop-blur-md">
          {error}
        </div>
      )}

      {/* Page Header */}

      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8E88C7] opacity-75" />

              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8E88C7]" />
            </span>

            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#808495]">
              Portfolio Intelligence • Research Mode
            </p>
          </div>

          <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight text-[#F5F5F7]">
            Portfolio
          </h1>

          <p className="mt-1 max-w-2xl text-xs text-[#9A9DA8]">
            Cross-strategy intelligence for performance,
            exposure, correlation, and portfolio-level risk.
          </p>
        </div>

        <div
          className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0F1117]/80 px-4 py-2 font-mono text-xs font-semibold text-[#F5F5F7] shadow-inner backdrop-blur-md"
          style={{
            boxShadow:
              "inset 0 1px 0 0 rgba(255,255,255,0.08)",
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />

          ACTIVE BOOK

          <span className="text-[10px] text-[#666A76]">
            LIVE
          </span>
        </div>
      </div>

      {overview && (
        <>
          {/* KPI CARDS */}

          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={Activity}
              label="Portfolio Sharpe"
              value={
                overview.portfolio_sharpe != null
                  ? overview.portfolio_sharpe.toFixed(2)
                  : "—"
              }
              sub="risk-adjusted return"
            />

            <KpiCard
              icon={TrendingDown}
              label="Max Drawdown"
              tone="danger"
              value={
                overview.portfolio_max_drawdown != null
                  ? `${(
                      overview.portfolio_max_drawdown * 100
                    ).toFixed(1)}%`
                  : "—"
              }
              sub="maximum portfolio decline"
            />

            <KpiCard
              icon={Layers}
              label="Active Strategies"
              value={String(
                overview.total_active_strategies,
              )}
              sub="currently in portfolio"
            />

            <KpiCard
              icon={ShieldAlert}
              label="Risk Alerts"
              tone={
                overview.risk_alerts.length > 0
                  ? "warning"
                  : "primary"
              }
              value={String(
                overview.risk_alerts.length,
              )}
              sub={
                overview.risk_alerts.length > 0
                  ? "requires attention"
                  : "within thresholds"
              }
            />
          </div>

          {/* MAIN GRID */}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* LEFT COLUMN */}

            <div className="space-y-5">
              <Card
                className={cardClass}
                style={{
                  boxShadow:
                    "inset 0 1px 0 0 rgba(255,255,255,0.08)",
                }}
              >
                <CardHeader className="flex flex-row items-start justify-between border-b border-white/[0.06] p-5">
                  <div>
                    <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                      Combined Equity Curve
                    </CardTitle>

                    <CardDescription className="mt-0.5 text-xs text-[#808495]">
                      Equal-weighted portfolio performance,
                      normalised to 1.0
                    </CardDescription>
                  </div>

                  <ArrowUpRight className="h-4 w-4 text-[#808495]" />
                </CardHeader>

                <CardContent className="p-5">
                  <PortfolioCharts
                    kind="equity"
                    data={overview.combined_equity_curve}
                  />
                </CardContent>
              </Card>

              <Card
                className={cardClass}
                style={{
                  boxShadow:
                    "inset 0 1px 0 0 rgba(255,255,255,0.08)",
                }}
              >
                <CardHeader className="flex flex-row items-start justify-between border-b border-white/[0.06] p-5">
                  <div>
                    <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                      Regime Specialisation
                    </CardTitle>

                    <CardDescription className="mt-0.5 text-xs text-[#808495]">
                      Active strategies grouped by dominant
                      market regime
                    </CardDescription>
                  </div>

                  <ArrowUpRight className="h-4 w-4 text-[#808495]" />
                </CardHeader>

                <CardContent className="p-5">
                  {donutData.length > 0 ? (
                    <PortfolioCharts
                      kind="donut"
                      data={donutData}
                    />
                  ) : (
                    <div className="flex min-h-[240px] items-center justify-center">
                      <p className="text-sm text-[#666A76]">
                        No regime compatibility data yet.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* RIGHT COLUMN */}

            <div className="space-y-5">
              <Card
                className={cardClass}
                style={{
                  boxShadow:
                    "inset 0 1px 0 0 rgba(255,255,255,0.08)",
                }}
              >
                <CardHeader className="flex flex-row items-start justify-between border-b border-white/[0.06] p-5">
                  <div>
                    <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                      Strategy Correlation
                    </CardTitle>

                    <CardDescription className="mt-0.5 text-xs text-[#808495]">
                      Daily-return correlation across active
                      strategy equity curves
                      {corr && corr.days_used > 0
                        ? ` • ${corr.days_used} days`
                        : ""}
                    </CardDescription>
                  </div>

                  <ArrowUpRight className="h-4 w-4 text-[#808495]" />
                </CardHeader>

                <CardContent className="p-5">
                  {corr ? (
                    <CorrelationHeatmap corr={corr} />
                  ) : (
                    <div className="h-48 animate-pulse rounded-xl border border-white/[0.05] bg-[#0F1117]/60" />
                  )}
                </CardContent>
              </Card>

              <Card
                className={cardClass}
                style={{
                  boxShadow:
                    "inset 0 1px 0 0 rgba(255,255,255,0.08)",
                }}
              >
                <CardHeader className="flex flex-row items-start justify-between border-b border-white/[0.06] p-5">
                  <div>
                    <CardTitle className="text-sm font-semibold tracking-wide text-[#F5F5F7]">
                      Risk Alerts
                    </CardTitle>

                    <CardDescription className="mt-0.5 text-xs text-[#808495]">
                      Portfolio-level concentration,
                      correlation, and drawdown signals
                    </CardDescription>
                  </div>

                  <ShieldAlert className="h-4 w-4 text-[#808495]" />
                </CardHeader>

                <CardContent className="p-5">
                  {overview.risk_alerts.length === 0 ? (
                    <div className="flex items-center gap-3 rounded-xl border border-[#34D399]/15 bg-[#34D399]/5 p-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#34D399]/20 bg-[#34D399]/10">
                        <ShieldAlert className="h-4 w-4 text-[#34D399]" />
                      </div>

                      <div>
                        <p className="text-sm font-medium text-[#F5F5F7]">
                          Portfolio within thresholds
                        </p>

                        <p className="mt-1 text-xs leading-relaxed text-[#808495]">
                          No concentration, correlation, or
                          drawdown alerts are currently active.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {overview.risk_alerts.map(
                        (alert, index) => (
                          <li
                            key={index}
                            className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-[#0A0B10]/60 p-3.5"
                          >
                            <Badge
                              variant="outline"
                              className={cn(
                                "shrink-0 rounded-lg border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                                ALERT_STYLES[
                                  alert.severity
                                ],
                              )}
                            >
                              {alert.kind}
                            </Badge>

                            <div className="flex min-w-0 items-start gap-2">
                              <AlertTriangle
                                className="mt-0.5 h-4 w-4 shrink-0 text-[#F87171]"
                                aria-hidden
                              />

                              <p className="text-sm leading-relaxed text-[#9A9DA8]">
                                {alert.message}
                              </p>
                            </div>
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* FOOTNOTE */}

          {overview.strategies_without_metrics.length >
            0 && (
            <div className="mt-6 border-t border-white/[0.06] pt-5">
              <p className="text-xs text-[#666A76]">
                Active strategies without stored backtest
                metrics — excluded from portfolio Sharpe and
                drawdown calculations:{" "}
                {overview.strategies_without_metrics.join(
                  ", ",
                )}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}