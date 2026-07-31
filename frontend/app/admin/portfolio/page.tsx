"use client";

import { AlertTriangle, Layers, ShieldAlert, TrendingDown } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPortfolioCorrelation, getPortfolioOverview } from "@/lib/portfolio";
import type { CorrelationMatrix, PortfolioOverview, RiskAlert } from "@/lib/portfolio-types";

// Charts pull recharts (a large lib) that this page is the only admin consumer of
// besides backtest-results — load it client-side so it stays out of the initial
// bundle (Batch 20 Lighthouse pass). ssr:false + a skeleton avoids layout shift.
const PortfolioCharts = dynamic(() => import("@/components/portfolio/portfolio-charts"), {
  ssr: false,
  loading: () => (
    <div className="h-[260px] animate-pulse rounded-lg border border-border bg-muted/30" />
  ),
});

// Donut colours (Batch 20 spec). Keyed by the regime label the backend emits.
const REGIME_DONUT: Record<string, string> = {
  Bull: "#10B981",
  Bear: "#EF4444",
  Crisis: "#7F1D1D",
  "High-Volatility": "#F59E0B",
  Sideways: "#94A3B8",
  "Low-Volatility": "#06B6D4",
};

const ALERT_STYLES: Record<RiskAlert["severity"], string> = {
  critical: "bg-red-500/15 text-red-300 border-red-500/30",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  info: "bg-sky-500/15 text-sky-300 border-sky-500/30",
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
      ? "bg-red-500/15 text-red-300"
      : tone === "warn"
        ? "bg-amber-500/15 text-amber-300"
        : "bg-accent/15 text-accent";
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`rounded-md p-2.5 ${toneClass}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Correlation cell colour: +1 red, 0 white, -1 cyan (Batch 20 spec). Interpolates
 * white→red for positive, white→cyan for negative, magnitude-proportional. */
function correlationColor(v: number): string {
  const t = Math.max(-1, Math.min(1, v));
  if (t >= 0) {
    // white (255,255,255) → red (239,68,68)
    const r = Math.round(255 + (239 - 255) * t);
    const g = Math.round(255 + (68 - 255) * t);
    const b = Math.round(255 + (68 - 255) * t);
    return `rgb(${r},${g},${b})`;
  }
  const a = -t;
  // white → cyan (6,182,212)
  const r = Math.round(255 + (6 - 255) * a);
  const g = Math.round(255 + (182 - 255) * a);
  const b = Math.round(255 + (212 - 255) * a);
  return `rgb(${r},${g},${b})`;
}

function CorrelationHeatmap({ corr }: { corr: CorrelationMatrix }) {
  if (corr.matrix.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Not enough backtest history yet to compute correlations.
        {corr.excluded.length > 0 && (
          <span className="mt-1 block text-xs">Excluded: {corr.excluded.join(", ")}</span>
        )}
      </p>
    );
  }
  const n = corr.labels.length;
  const short = (name: string) => (name.length > 10 ? `${name.slice(0, 9)}…` : name);
  return (
    <div className="overflow-x-auto">
      <div
        role="img"
        aria-label={`Correlation heatmap of ${n} strategies over ${corr.days_used} trading days. Red is high positive correlation, cyan is negative.`}
      >
        <table className="border-separate border-spacing-0.5 text-[11px]">
          <thead>
            <tr>
              <th className="p-1" />
              {corr.labels.map((l) => (
                <th key={l} className="p-1 font-medium text-muted-foreground" title={l}>
                  {short(l)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {corr.matrix.map((row, i) => (
              <tr key={corr.labels[i]}>
                <td
                  className="whitespace-nowrap p-1 text-right font-medium text-muted-foreground"
                  title={corr.labels[i]}
                >
                  {short(corr.labels[i]!)}
                </td>
                {row.map((v, j) =>
                  v === null ? (
                    <td
                      key={j}
                      className="h-9 w-14 rounded text-center font-mono text-[11px] text-muted-foreground"
                      title={`${corr.labels[i]} × ${corr.labels[j]}: unavailable`}
                    >
                      —
                    </td>
                  ) : (
                    <td
                      key={j}
                      className="h-9 w-14 rounded text-center font-mono text-[11px] text-slate-900"
                      style={{ background: correlationColor(v) }}
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
        <p className="mt-2 text-xs text-muted-foreground">
          Excluded (insufficient history): {corr.excluded.join(", ")}
        </p>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  const [overview, setOverview] = useState<PortfolioOverview | null>(null);
  const [corr, setCorr] = useState<CorrelationMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [ov, cm] = await Promise.all([getPortfolioOverview(), getPortfolioCorrelation()]);
        if (!active) return;
        setOverview(ov);
        setCorr(cm);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load portfolio");
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
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
          <p className="text-sm text-muted-foreground">
            Cross-strategy view of the active book — equal-weighted, computed from real
            stored backtest metrics and equity curves.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
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
                value={overview.portfolio_sharpe != null ? overview.portfolio_sharpe.toFixed(2) : "—"}
              />
              <KpiCard
                icon={TrendingDown}
                label="Max Drawdown"
                tone="danger"
                value={
                  overview.portfolio_max_drawdown != null
                    ? `${(overview.portfolio_max_drawdown * 100).toFixed(1)}%`
                    : "—"
                }
              />
              <KpiCard
                icon={Layers}
                label="Active Strategies"
                value={String(overview.total_active_strategies)}
              />
              <KpiCard
                icon={ShieldAlert}
                label="Risk Alerts"
                tone={overview.risk_alerts.length > 0 ? "warn" : "accent"}
                value={String(overview.risk_alerts.length)}
              />
            </div>

            {/* Row 2 — two columns */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Left: combined equity + regime donut */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Combined Equity Curve</CardTitle>
                    <CardDescription>Equal-weighted, normalised to 1.0 at start</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PortfolioCharts kind="equity" data={overview.combined_equity_curve} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Regime Specialisation</CardTitle>
                    <CardDescription>
                      Active strategies by dominant regime (from stored compatibility scores)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {donutData.length > 0 ? (
                      <PortfolioCharts kind="donut" data={donutData} />
                    ) : (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        No regime compatibility data yet.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right: correlation heatmap + risk alerts */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Strategy Correlation</CardTitle>
                    <CardDescription>
                      Daily-return correlation over real equity curves
                      {corr && corr.days_used > 0 ? ` · ${corr.days_used} days` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {corr ? (
                      <CorrelationHeatmap corr={corr} />
                    ) : (
                      <div className="h-40 animate-pulse rounded-lg bg-muted/30" />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Risk Alerts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {overview.risk_alerts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No risk alerts — the book is within concentration, correlation, and
                        drawdown thresholds.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {overview.risk_alerts.map((a, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <Badge variant="outline" className={ALERT_STYLES[a.severity]}>
                              {a.kind}
                            </Badge>
                            <span className="flex items-start gap-1.5 text-sm text-foreground">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
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
              <p className="text-xs text-muted-foreground">
                Active but without stored backtest metrics (excluded from Sharpe/drawdown):{" "}
                {overview.strategies_without_metrics.join(", ")}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
