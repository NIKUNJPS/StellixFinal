"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CrossAssetRegime } from "@/components/regime/cross-asset-regime";
import { RegimeTimeline } from "@/components/regime/regime-timeline";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";
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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getCompatibilityAlerts,
  getCurrentRegime,
  getRegimeHistory,
  getRegimeStatistics,
  triggerRegimeDetection,
} from "@/lib/regime";
import {
  REGIME_COLORS,
  type RegimeLabel,
  type RegimeObject,
  type RegimePoint,
  type StrategyCompatibilityAlert,
  type RegimeStatisticsItem,
} from "@/lib/regime-types";

function ConfidenceGauge({ value, color }: { value: number; color: string }) {
  const r = 70;
  const cx = 90;
  const cy = 90;
  const angle = Math.PI * (1 - Math.min(Math.max(value, 0), 1));
  const x = cx + r * Math.cos(angle);
  const y = cy - r * Math.sin(angle);
  const bg = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const val = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x} ${y}`;
  return (
    <svg viewBox="0 0 180 100" className="w-full max-w-[200px]">
      <path d={bg} fill="none" stroke="hsl(var(--border))" strokeWidth={12} strokeLinecap="round" />
      <path d={val} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" />
      <text x={cx} y={78} textAnchor="middle" className="fill-foreground" style={{ fontSize: 26, fontWeight: 700 }}>
        {(value * 100).toFixed(0)}%
      </text>
      <text x={cx} y={94} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 10 }}>
        confidence
      </text>
    </svg>
  );
}

function TransitionHeatmap({ regime }: { regime: RegimeObject }) {
  const matrix = regime.transition_probs?.matrix;
  const labels = regime.transition_probs?.hmm_state_labels;
  if (!matrix || !labels) {
    return <p className="text-sm text-muted-foreground">No transition matrix available.</p>;
  }
  const stateIndices = Object.keys(labels)
    .map(Number)
    .sort((a, b) => a - b);
  const cell = 70;
  const margin = { top: 60, left: 100 };
  const size = stateIndices.length;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${margin.left + size * cell} ${margin.top + size * cell}`}
      role="img"
      aria-label="HMM transition probability matrix"
    >
      {stateIndices.map((s, ci) => (
        <text
          key={`col-${s}`}
          x={margin.left + ci * cell + cell / 2}
          y={margin.top - 12}
          textAnchor="middle"
          style={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
        >
          {labels[String(s)]}
        </text>
      ))}
      {stateIndices.map((rowState, ri) => (
        <g key={`row-${rowState}`}>
          <text
            x={margin.left - 10}
            y={margin.top + ri * cell + cell / 2 + 4}
            textAnchor="end"
            style={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
          >
            {labels[String(rowState)]}
          </text>
          {stateIndices.map((colState, ci) => {
            const p = matrix[rowState]?.[colState] ?? 0;
            return (
              <g key={`${rowState}-${colState}`}>
                <rect
                  x={margin.left + ci * cell + 1}
                  y={margin.top + ri * cell + 1}
                  width={cell - 2}
                  height={cell - 2}
                  rx={3}
                  fill="#00b4d8"
                  fillOpacity={p}
                >
                  <title>
                    {labels[String(rowState)]} → {labels[String(colState)]}: {(p * 100).toFixed(1)}%
                  </title>
                </rect>
                <text
                  x={margin.left + ci * cell + cell / 2}
                  y={margin.top + ri * cell + cell / 2 + 4}
                  textAnchor="middle"
                  style={{ fontSize: 11, fontWeight: 600, fill: p > 0.5 ? "white" : "hsl(var(--foreground))" }}
                >
                  {(p * 100).toFixed(0)}%
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

function StatsTable({ items }: { items: RegimeStatisticsItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No regime history yet.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Regime</TableHead>
          <TableHead>Duration (bars)</TableHead>
          <TableHead>Avg Return</TableHead>
          <TableHead>Avg Volatility</TableHead>
          <TableHead>Avg Sharpe</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.regime_label}>
            <TableCell>
              <Badge style={{ background: REGIME_COLORS[item.regime_label], color: "white" }}>
                {item.regime_label}
              </Badge>
            </TableCell>
            <TableCell>{item.duration_days}</TableCell>
            <TableCell>{item.avg_return === null ? "—" : `${(item.avg_return * 100).toFixed(2)}%`}</TableCell>
            <TableCell>{item.avg_volatility === null ? "—" : `${(item.avg_volatility * 100).toFixed(2)}%`}</TableCell>
            <TableCell>{item.avg_sharpe === null ? "—" : item.avg_sharpe.toFixed(2)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CompatibilityAlerts({ alerts }: { alerts: StrategyCompatibilityAlert[] }) {
  if (alerts.length === 0) {
    return <p className="text-sm text-muted-foreground">Every active strategy is compatible with the current regime.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((a) => (
        <li key={a.strategy_id} className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          <Link href={`/admin/strategies/${a.strategy_id}/backtest-results`} className="font-medium hover:underline">
            {a.strategy_name}
          </Link>
          <span className="text-muted-foreground">
            {a.compatibility_sharpe === null ? "no data for this regime" : `Sharpe ${a.compatibility_sharpe.toFixed(2)}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function RegimeMonitorPage() {
  const [symbol, setSymbol] = useState("AAPL");
  const [points, setPoints] = useState<RegimePoint[] | null>(null);
  const [current, setCurrent] = useState<RegimeObject | null>(null);
  const [stats, setStats] = useState<RegimeStatisticsItem[]>([]);
  const [alerts, setAlerts] = useState<StrategyCompatibilityAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Batch 19: a live-pushed regime overrides the badge label between fetches, and
  // the LIVE flag pulses for 3s after an update lands. Typed as RegimeLabel because
  // the backend only ever publishes one of those values (app/regime/taxonomy.py).
  const [liveRegime, setLiveRegime] = useState<RegimeLabel | null>(null);
  const [justUpdated, setJustUpdated] = useState(false);
  const { subscribe } = useWebSocket();
  const liveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const unsub = subscribe("regime_update", (event: WSEvent) => {
      // Only react to the symbol currently on screen.
      if (String(event.symbol) !== symbol.trim().toUpperCase()) return;
      setLiveRegime(String(event.new_regime) as RegimeLabel);
      setJustUpdated(true);
      clearTimeout(liveTimer.current);
      liveTimer.current = setTimeout(() => setJustUpdated(false), 3000);
    });
    return () => {
      unsub();
      clearTimeout(liveTimer.current);
    };
  }, [subscribe, symbol]);

  // A fresh REST load is authoritative — drop any live override so the two can't
  // disagree.
  const displayedRegime = liveRegime ?? current?.regime_label ?? null;

  async function load() {
    setLiveRegime(null);
    setError(null);
    setBusy(true);
    try {
      const sym = symbol.trim().toUpperCase();
      const [history, cur, statsResp, alertsResp] = await Promise.all([
        getRegimeHistory(sym),
        getCurrentRegime(sym),
        getRegimeStatistics(sym),
        getCompatibilityAlerts(sym),
      ]);
      setPoints(history.points);
      setCurrent(cur);
      setStats(statsResp.items);
      setAlerts(alertsResp.alerts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }

  async function rerun() {
    setError(null);
    setBusy(true);
    try {
      await triggerRegimeDetection(symbol.trim().toUpperCase());
      // Detection is async; give the worker a moment, then reload.
      setTimeout(load, 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to trigger detection");
      setBusy(false);
    }
  }

  return (
    <>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Regime Monitor</CardTitle>
          <CardDescription>
            Ensemble regime timeline (HMM · PELT · GMM · GARCH) with a fast-triggering Crisis override.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Symbol</Label>
              <Input name="symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} className="w-40" />
            </div>
            <Button onClick={load} data-testid="load-timeline" disabled={busy}>
              {busy ? "Loading…" : "Load timeline"}
            </Button>
            <Button variant="outline" onClick={rerun} disabled={busy}>
              Re-run detection
            </Button>
          </div>

          {error && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Cross-asset regime divergence (Batch 22) — a distinct section; it does not
          touch the animated single-symbol view below. */}
      <div className="mb-4">
        <CrossAssetRegime />
      </div>

      {current && (
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Current Status</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-2">
              <ConfidenceGauge value={current.confidence_score} color={REGIME_COLORS[current.regime_label]} />
              <AnimatePresence mode="wait">
                <motion.div
                  key={displayedRegime ?? current.regime_label}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.3 }}
                >
                  <Badge
                    style={{
                      background: REGIME_COLORS[displayedRegime ?? current.regime_label],
                      color: "white",
                    }}
                  >
                    {displayedRegime ?? current.regime_label}
                  </Badge>
                </motion.div>
              </AnimatePresence>
              {justUpdated && (
                <span
                  className="animate-pulse font-mono text-xs text-green-400"
                  data-testid="regime-live-badge"
                >
                  ● LIVE
                </span>
              )}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Transition Probabilities</CardTitle>
              <CardDescription>HMM state-transition matrix</CardDescription>
            </CardHeader>
            <CardContent>
              <TransitionHeatmap regime={current} />
            </CardContent>
          </Card>
        </div>
      )}

      {points && points.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>12-Month Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <RegimeTimeline points={points} />
          </CardContent>
        </Card>
      )}
      {points && points.length === 0 && (
        <p className="mb-4 text-sm text-muted-foreground">
          No regime data yet — ingest data for this symbol (Data Ingest page), which auto-runs detection, or click
          &quot;Re-run detection&quot;.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Regime Statistics</CardTitle>
            <CardDescription>Duration / avg return / avg volatility / avg Sharpe per regime</CardDescription>
          </CardHeader>
          <CardContent>
            <StatsTable items={stats} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Strategy Compatibility Alerts</CardTitle>
            <CardDescription>Active strategies not validated for the current regime</CardDescription>
          </CardHeader>
          <CardContent>
            <CompatibilityAlerts alerts={alerts} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
