"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
import { BackLink } from "@/components/layout/back-link";
import { getValidation, triggerValidation } from "@/lib/validation";
import {
  CLASSIFICATION_COLORS,
  METHOD_LABELS,
  type ValidationResult,
} from "@/lib/validation-types";

function Gauge({ value, color }: { value: number; color: string }) {
  const r = 80;
  const cx = 100;
  const cy = 100;
  const angle = Math.PI * (1 - Math.min(Math.max(value, 0), 1));
  const x = cx + r * Math.cos(angle);
  const y = cy - r * Math.sin(angle);
  const bg = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const val = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x} ${y}`;
  return (
    <svg viewBox="0 0 200 116" className="w-full max-w-[240px]">
      <path d={bg} fill="none" stroke="hsl(var(--border))" strokeWidth={14} strokeLinecap="round" />
      <path d={val} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />
      <text x={cx} y={92} textAnchor="middle" className="fill-foreground" style={{ fontSize: 30, fontWeight: 700 }}>
        {value.toFixed(2)}
      </text>
      <text x={cx} y={110} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 11 }}>
        composite robustness
      </text>
    </svg>
  );
}

export default function ValidationAnalyticsPage() {
  const params = useParams();
  const id = String(params.id);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [symbol, setSymbol] = useState("SPY");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setResult(await getValidation(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function run() {
    setError(null);
    setRunning(true);
    try {
      await triggerValidation(id, symbol);
      const started = Date.now();
      const poll = async () => {
        const r = await getValidation(id);
        if (r && (!result || r.created_at !== result.created_at)) {
          setResult(r);
          setRunning(false);
        } else if (Date.now() - started < 60000) {
          setTimeout(poll, 3000);
        } else {
          setRunning(false);
        }
      };
      setTimeout(poll, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start validation");
      setRunning(false);
    }
  }

  const md = result?.method_details;
  const mc = md?.monte_carlo;
  const ddData =
    mc?.drawdown_hist?.counts.map((count, i) => {
      const edges = mc.drawdown_hist.edges;
      const mid = ((edges[i] ?? 0) + (edges[i + 1] ?? edges[i] ?? 0)) / 2;
      return { bin: (mid * 100).toFixed(0), count };
    }) ?? [];
  const foldData =
    md?.walk_forward?.folds.map((f) => ({
      fold: `Fold ${f.fold}`,
      sharpe: f.oos_sharpe ?? 0,
      passed: f.passed,
    })) ?? [];

  const subs = md?.sub_scores ?? {};
  const weights = md?.effective_weights ?? md?.weights ?? {};

  return (
    <div className="mx-auto w-full max-w-5xl">
      <BackLink href="/admin/strategies" label="Back to strategies" />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Validation Analytics</CardTitle>
              <CardDescription>5-method robustness validation (SRC §11).</CardDescription>
            </div>
            <div className="flex items-end gap-2">
              <Input
                name="symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-28"
              />
              <Button onClick={run} disabled={running} data-testid="run-validation">
                {running ? "Validating…" : "Run validation"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-8">
          {error && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !result ? (
            <p className="text-sm text-muted-foreground">
              Not validated yet — enter a symbol with ingested data and click “Run validation”.
            </p>
          ) : (
            <div data-testid="validation-analytics" className="flex flex-col gap-8">
              {/* Composite gauge + 5-component breakdown */}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-border p-4">
                  <Gauge value={result.composite_score} color={CLASSIFICATION_COLORS[result.classification]} />
                  <Badge style={{ background: CLASSIFICATION_COLORS[result.classification], color: "white" }}>
                    {result.classification.replace("_", " ")}
                  </Badge>
                </div>
                <div className="flex flex-col justify-center gap-2 rounded-md border border-border p-4">
                  <span className="mb-1 text-sm font-medium">Component breakdown</span>
                  {Object.entries(METHOD_LABELS).map(([key, label]) => {
                    const v = subs[key];
                    const w = weights[key];
                    return (
                      <div key={key} className="flex items-center gap-3 text-xs">
                        <span className="w-28 text-muted-foreground">{label}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                          <div
                            className="h-full rounded-full bg-stellix-highlight"
                            style={{ width: `${v === null || v === undefined ? 0 : v * 100}%` }}
                          />
                        </div>
                        <span className="w-16 text-right font-medium">
                          {v === null || v === undefined ? "N/A" : v.toFixed(2)}
                        </span>
                        <span className="w-10 text-right text-muted-foreground">
                          {w ? `${Math.round(w * 100)}%` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Walk-forward fold-by-fold OOS Sharpe */}
              <div>
                <h3 className="mb-2 text-sm font-medium">Walk-forward — out-of-sample Sharpe per fold</h3>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={foldData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="fold" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={40} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                      <ReferenceLine y={0.5} stroke="#f59e0b" strokeDasharray="4 4" />
                      <Bar dataKey="sharpe">
                        {foldData.map((f, i) => (
                          <Cell key={i} fill={f.passed ? "#16a34a" : "#dc2626"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Regime cross-validation grid */}
              <div>
                <h3 className="mb-2 text-sm font-medium">Regime cross-validation (primary regimes)</h3>
                <table className="w-full text-sm" data-testid="regime-cv-grid">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2">Regime</th>
                      <th className="px-3 py-2">Trades</th>
                      <th className="px-3 py-2">Sharpe</th>
                      <th className="px-3 py-2">Positive</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(md?.regime_cv?.primary_regimes ?? {}).map(([regime, m]) => (
                      <tr key={regime} className="border-b border-border/60">
                        <td className="px-3 py-2 font-medium">{regime}</td>
                        <td className="px-3 py-2">{m.trade_count}</td>
                        <td className="px-3 py-2">{m.sharpe_ratio === null ? "—" : m.sharpe_ratio.toFixed(3)}</td>
                        <td className="px-3 py-2">{m.positive ? "✓" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Monte Carlo drawdown distribution */}
              <div>
                <h3 className="mb-2 text-sm font-medium">
                  Monte Carlo — simulated max-drawdown distribution
                  {mc && ` (${mc.n_simulations} sims · 95th pct ${(mc.p95_drawdown * 100).toFixed(1)}%)`}
                </h3>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ddData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="bin" tick={{ fontSize: 10 }} label={{ value: "drawdown %", position: "insideBottom", offset: -2, fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} width={40} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                      {mc && (
                        <ReferenceLine x={(mc.tolerance * 100).toFixed(0)} stroke="#dc2626" strokeDasharray="4 4" label={{ value: "tolerance", fontSize: 10, fill: "#dc2626" }} />
                      )}
                      <Bar dataKey="count" fill="var(--stellix-highlight)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
