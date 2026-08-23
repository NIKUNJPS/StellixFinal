"use client";

import { AlertTriangle, Layers, ShieldAlert, TrendingDown } from "lucide-react";
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
import { getPortfolioCorrelation, getPortfolioOverview } from "@/lib/portfolio";
import type {
  CorrelationMatrix,
  PortfolioOverview,
  RiskAlert,
} from "@/lib/portfolio-types";

// Charts pull recharts (a large lib) that this page is the only admin consumer of
// besides backtest-results — load it client-side so it stays out of the initial
// bundle (Batch 20 Lighthouse pass). ssr:false + a skeleton avoids layout shift.
const PortfolioCharts = dynamic(
  () => import("@/components/portfolio/portfolio-charts"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[260px] animate-pulse rounded-xl border border-[#d3dbdd]/10 bg-[#16232b]/60" />
    ),
  },
);

// Stellix Labs palette
const COLORS = {
  midnight: "#16232b",
  tealDark: "#042F34",
  teal: "#075056",
  orange: "#c40707",
  sand: "#f2d17d",
  silver: "#d3dbdd",
  black: "#000000",
};

// Donut colours keyed by the regime label the backend emits.
const REGIME_DONUT: Record<string, string> = {
  Bull: "#075056",
  Bear: "#c40707",
  Crisis: "#16232b",
  "High-Volatility": "#f2d17d",
  Sideways: "#d3dbdd",
  "Low-Volatility": "#075056",
};

const ALERT_STYLES: Record<RiskAlert["severity"], string> = {
  critical:
    "border-[#c40707]/40 bg-[#c40707]/10 text-[#c40707]",
  warning:
    "border-[#f2d17d]/40 bg-[#f2d17d]/10 text-[#f2d17d]",
  info:
    "border-[#075056]/50 bg-[#075056]/20 text-[#d3dbdd]",
};

function KpiCard({
  icon: Icon,
  label,
  value,
  tone = "accent",
}: {
  icon: typeof Layers;
  label: string;
  value: string;
  tone?: "accent" | "danger" | "warn";
}) {
  const toneClass =
    tone === "danger"
      ? "bg-[#c40707]/12 text-[#c40707]"
      : tone === "warn"
        ? "bg-[#f2d17d]/12 text-[#f2d17d]"
        : "bg-[#075056]/25 text-[#d3dbdd]";

  return (
    <Card className="rounded-xl border border-[#d3dbdd]/10 bg-[#16232b] shadow-none transition-colors duration-200 hover:border-[#d3dbdd]/15">
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`rounded-xl p-2.5 ${toneClass}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>

        <div className="min-w-0">
          <p className="text-xs text-[#d3dbdd]/55">
            {label}
          </p>

          <p className="truncate text-xl font-semibold text-[#d3dbdd]">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Correlation cell colour.
 *
 * Kept as a separate function because the correlation data/integration
 * remains unchanged. Only the visual mapping has been adapted to the
 * Stellix palette.
 */
function correlationColor(v: number): string {
  const t = Math.max(-1, Math.min(1, v));

  if (t >= 0) {
    // #16232b → #c40707 for positive correlation
    const r = Math.round(22 + (196 - 22) * t);
    const g = Math.round(35 + (7 - 35) * t);
    const b = Math.round(43 + (7 - 43) * t);

    return `rgb(${r},${g},${b})`;
  }

  const a = -t;

  // #16232b → #075056 for negative correlation
  const r = Math.round(22 + (7 - 22) * a);
  const g = Math.round(35 + (80 - 35) * a);
  const b = Math.round(43 + (86 - 43) * a);

  return `rgb(${r},${g},${b})`;
}

function CorrelationHeatmap({
  corr,
}: {
  corr: CorrelationMatrix;
}) {
  if (corr.matrix.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-[#d3dbdd]/55">
        Not enough backtest history yet to compute correlations.

        {corr.excluded.length > 0 && (
          <span className="mt-1 block text-xs text-[#d3dbdd]/40">
            Excluded: {corr.excluded.join(", ")}
          </span>
        )}
      </p>
    );
  }

  const n = corr.labels.length;

  const short = (name: string) =>
    name.length > 10 ? `${name.slice(0, 9)}…` : name;

  return (
    <div className="overflow-x-auto">
      <div
        role="img"
        aria-label={`Correlation heatmap of ${n} strategies over ${corr.days_used} trading days. Red is high positive correlation, cyan is negative.`}
      >
        <table className="border-separate border-spacing-1 text-[11px]">
          <thead>
            <tr>
              <th className="p-1" />

              {corr.labels.map((l) => (
                <th
                  key={l}
                  className="p-1 font-medium text-[#d3dbdd]/55"
                  title={l}
                >
                  {short(l)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {corr.matrix.map((row, i) => (
              <tr key={corr.labels[i]}>
                <td
                  className="whitespace-nowrap p-1 text-right font-medium text-[#d3dbdd]/55"
                  title={corr.labels[i]}
                >
                  {short(corr.labels[i]!)}
                </td>

                {row.map((v, j) =>
                  v === null ? (
                    <td
                      key={j}
                      className="h-9 w-14 rounded-lg text-center font-mono text-[11px] text-[#d3dbdd]/50"
                      title={`${corr.labels[i]} × ${corr.labels[j]}: unavailable`}
                    >
                      —
                    </td>
                  ) : (
                    <td
                      key={j}
                      className="h-9 w-14 rounded-lg text-center font-mono text-[11px] text-[#d3dbdd]"
                      style={{
                        background: correlationColor(v),
                      }}
                      title={`${corr.labels[i]} × ${corr.labels[j]}: ${v.toFixed(2)}`}
                    >
                      {v.toFixed(2)}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {corr.excluded.length > 0 && (
        <p className="mt-2 text-xs text-[#d3dbdd]/40">
          Excluded (insufficient history):{" "}
          {corr.excluded.join(", ")}
        </p>
      )}
    </div>
  );
}

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
      (overview?.regime_exposure ?? []).map((r) => ({
        name: r.regime,
        value: r.count,
        color: REGIME_DONUT[r.regime] ?? "#64748B",
      })),
    [overview],
  );

  return (
    <>
      <div className="space-y-6">
        {/* Page heading */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#d3dbdd]">
            Portfolio
          </h1>

          <p className="mt-1 text-sm text-[#d3dbdd]/50">
            Cross-strategy view of the active book — equal-weighted,
            computed from real stored backtest metrics and equity curves.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-[#c40707]/30 bg-[#c40707]/10 px-3 py-2 text-sm text-[#c40707]"
          >
            {error}
          </p>
        )}

        {overview && (
          <>
            {/* Row 1 — KPI cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                icon={Layers}
                label="Portfolio Sharpe"
                value={
                  overview.portfolio_sharpe != null
                    ? overview.portfolio_sharpe.toFixed(2)
                    : "—"
                }
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
              />

              <KpiCard
                icon={Layers}
                label="Active Strategies"
                value={String(
                  overview.total_active_strategies,
                )}
              />

              <KpiCard
                icon={ShieldAlert}
                label="Risk Alerts"
                tone={
                  overview.risk_alerts.length > 0
                    ? "warn"
                    : "accent"
                }
                value={String(
                  overview.risk_alerts.length,
                )}
              />
            </div>

            {/* Row 2 — two columns */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Left: combined equity + regime donut */}
              <div className="space-y-4">
                <Card className="rounded-xl border border-[#d3dbdd]/10 bg-[#16232b] shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-[#d3dbdd]">
                      Combined Equity Curve
                    </CardTitle>

                    <CardDescription className="text-xs text-[#d3dbdd]/45">
                      Equal-weighted, normalised to 1.0 at start
                    </CardDescription>
                  </CardHeader>

                  <CardContent>
                    <PortfolioCharts
                      kind="equity"
                      data={overview.combined_equity_curve}
                    />
                  </CardContent>
                </Card>

                <Card className="rounded-xl border border-[#d3dbdd]/10 bg-[#16232b] shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-[#d3dbdd]">
                      Regime Specialisation
                    </CardTitle>

                    <CardDescription className="text-xs text-[#d3dbdd]/45">
                      Active strategies by dominant regime
                      (from stored compatibility scores)
                    </CardDescription>
                  </CardHeader>

                  <CardContent>
                    {donutData.length > 0 ? (
                      <PortfolioCharts
                        kind="donut"
                        data={donutData}
                      />
                    ) : (
                      <p className="py-10 text-center text-sm text-[#d3dbdd]/45">
                        No regime compatibility data yet.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right: correlation heatmap + risk alerts */}
              <div className="space-y-4">
                <Card className="rounded-xl border border-[#d3dbdd]/10 bg-[#16232b] shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-[#d3dbdd]">
                      Strategy Correlation
                    </CardTitle>

                    <CardDescription className="text-xs text-[#d3dbdd]/45">
                      Daily-return correlation over real equity
                      curves
                      {corr && corr.days_used > 0
                        ? ` · ${corr.days_used} days`
                        : ""}
                    </CardDescription>
                  </CardHeader>

                  <CardContent>
                    {corr ? (
                      <CorrelationHeatmap corr={corr} />
                    ) : (
                      <div className="h-40 animate-pulse rounded-xl border border-[#d3dbdd]/10 bg-[#16232b]/70" />
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-xl border border-[#d3dbdd]/10 bg-[#16232b] shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-[#d3dbdd]">
                      Risk Alerts
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    {overview.risk_alerts.length === 0 ? (
                      <div className="rounded-xl border border-[#075056]/30 bg-[#075056]/10 px-4 py-3">
                        <p className="text-sm text-[#d3dbdd]/65">
                          No risk alerts — the book is within
                          concentration, correlation, and drawdown
                          thresholds.
                        </p>
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {overview.risk_alerts.map((a, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 rounded-xl border border-[#d3dbdd]/10 bg-[#000000]/20 p-3"
                          >
                            <Badge
                              variant="outline"
                              className={cn(
                                "shrink-0 rounded-lg",
                                ALERT_STYLES[a.severity],
                              )}
                            >
                              {a.kind}
                            </Badge>

                            <span className="flex items-start gap-1.5 text-sm text-[#d3dbdd]/75">
                              <AlertTriangle
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#c40707]"
                                aria-hidden
                              />

                              {a.message}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            {overview.strategies_without_metrics.length > 0 && (
              <p className="text-xs text-[#d3dbdd]/40">
                Active but without stored backtest metrics
                (excluded from Sharpe/drawdown):{" "}
                {overview.strategies_without_metrics.join(", ")}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}