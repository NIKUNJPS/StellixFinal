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

/* ============================================================
   CONFIDENCE GAUGE
   ============================================================ */

function ConfidenceGauge({
  value,
  color,
}: {
  value: number;
  color: string;
}) {
  const r = 70;
  const cx = 90;
  const cy = 90;

  const angle =
    Math.PI * (1 - Math.min(Math.max(value, 0), 1));

  const x = cx + r * Math.cos(angle);
  const y = cy - r * Math.sin(angle);

  const bg = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const val = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x} ${y}`;

  return (
    <svg
      viewBox="0 0 180 100"
      className="w-full max-w-[200px]"
    >
      <path
        d={bg}
        fill="none"
        stroke="hsl(var(--border))"
        strokeWidth={12}
        strokeLinecap="round"
      />

      <path
        d={val}
        fill="none"
        stroke={color}
        strokeWidth={12}
        strokeLinecap="round"
      />

      <text
        x={cx}
        y={78}
        textAnchor="middle"
        className="fill-foreground"
        style={{
          fontSize: 26,
          fontWeight: 700,
        }}
      >
        {(value * 100).toFixed(0)}%
      </text>

      <text
        x={cx}
        y={94}
        textAnchor="middle"
        className="fill-muted-foreground"
        style={{
          fontSize: 10,
        }}
      >
        confidence
      </text>
    </svg>
  );
}

/* ============================================================
   TRANSITION HEATMAP
   ============================================================ */

function TransitionHeatmap({
  regime,
}: {
  regime: RegimeObject;
}) {
  const matrix = regime.transition_probs?.matrix;
  const labels = regime.transition_probs?.hmm_state_labels;

  if (!matrix || !labels) {
    return (
      <p className="text-sm text-muted-foreground">
        No transition matrix available.
      </p>
    );
  }

  const stateIndices = Object.keys(labels)
    .map(Number)
    .sort((a, b) => a - b);

  /*
   * Keep the heatmap intentionally compact.
   *
   * Previously the SVG used width="100%", which caused the
   * entire matrix to stretch across the card.
   */
  const cell = 58;

  const margin = {
    top: 48,
    left: 105,
  };

  const size = stateIndices.length;

  const svgWidth = margin.left + size * cell;
  const svgHeight = margin.top + size * cell + 8;

  return (
    <div className="flex w-full justify-center">
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="h-auto w-full max-w-[560px]"
        role="img"
        aria-label="HMM transition probability matrix"
      >
        {/* Column labels */}
        {stateIndices.map((s, ci) => (
          <text
            key={`col-${s}`}
            x={
              margin.left +
              ci * cell +
              cell / 2
            }
            y={margin.top - 14}
            textAnchor="middle"
            style={{
              fontSize: 9,
              fontWeight: 500,
              fill: "#9fb2c4",
            }}
          >
            {labels[String(s)]}
          </text>
        ))}

        {/* Rows */}
        {stateIndices.map((rowState, ri) => (
          <g key={`row-${rowState}`}>
            {/* Row label */}
            <text
              x={margin.left - 12}
              y={
                margin.top +
                ri * cell +
                cell / 2 +
                3
              }
              textAnchor="end"
              style={{
                fontSize: 9,
                fontWeight: 500,
                fill: "#d3dbdd",
              }}
            >
              {labels[String(rowState)]}
            </text>

            {/* Matrix cells */}
            {stateIndices.map((colState, ci) => {
              const p =
                matrix[rowState]?.[colState] ?? 0;

              const x =
                margin.left +
                ci * cell;

              const y =
                margin.top +
                ri * cell;

              return (
                <g
                  key={`${rowState}-${colState}`}
                >
                  <rect
                    x={x + 2}
                    y={y + 2}
                    width={cell - 4}
                    height={cell - 4}
                    rx={9}
                    fill="#075056"
                    fillOpacity={
                      p > 0
                        ? Math.max(0.08, p)
                        : 0.025
                    }
                    className="transition-all duration-200"
                  >
                    <title>
                      {labels[String(rowState)]} →{" "}
                      {labels[String(colState)]}:{" "}
                      {(p * 100).toFixed(1)}%
                    </title>
                  </rect>

                  <text
                    x={
                      x +
                      cell / 2
                    }
                    y={
                      y +
                      cell / 2 +
                      4
                    }
                    textAnchor="middle"
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      fill:
                        p >= 0.5
                          ? "#ffffff"
                          : "#d3dbdd",
                    }}
                  >
                    {(p * 100).toFixed(0)}%
                  </text>
                </g>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}
/* ============================================================
   STATISTICS
   ============================================================ */

function StatsTable({
  items,
}: {
  items: RegimeStatisticsItem[];
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[#d3dbdd]/45">
        No regime history yet.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-[#d3dbdd]/10">
          <TableHead className="text-[#d3dbdd]/50">
            Regime
          </TableHead>

          <TableHead className="text-[#d3dbdd]/50">
            Duration (bars)
          </TableHead>

          <TableHead className="text-[#d3dbdd]/50">
            Avg Return
          </TableHead>

          <TableHead className="text-[#d3dbdd]/50">
            Avg Volatility
          </TableHead>

          <TableHead className="text-[#d3dbdd]/50">
            Avg Sharpe
          </TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {items.map((item) => (
          <TableRow
            key={item.regime_label}
            className="border-[#d3dbdd]/10"
          >
            <TableCell>
              <Badge
                className="rounded-lg border-0"
                style={{
                  background:
                    REGIME_COLORS[
                      item.regime_label
                    ],
                  color: "white",
                }}
              >
                {item.regime_label}
              </Badge>
            </TableCell>

            <TableCell>
              {item.duration_days}
            </TableCell>

            <TableCell>
              {item.avg_return === null
                ? "—"
                : `${(
                    item.avg_return * 100
                  ).toFixed(2)}%`}
            </TableCell>

            <TableCell>
              {item.avg_volatility === null
                ? "—"
                : `${(
                    item.avg_volatility * 100
                  ).toFixed(2)}%`}
            </TableCell>

            <TableCell>
              {item.avg_sharpe === null
                ? "—"
                : item.avg_sharpe.toFixed(2)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/* ============================================================
   COMPATIBILITY ALERTS
   ============================================================ */

function CompatibilityAlerts({
  alerts,
}: {
  alerts: StrategyCompatibilityAlert[];
}) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-[#075056]/30 bg-[#075056]/10 px-4 py-3">
        <p className="text-sm text-[#d3dbdd]/65">
          Every active strategy is compatible
          with the current regime.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((a) => (
        <li
          key={a.strategy_id}
          className="
            flex items-center justify-between
            rounded-xl
            border border-[#c40707]/30
            bg-[#c40707]/10
            px-4 py-3
            text-sm
          "
        >
          <Link
            href={`/admin/strategies/${a.strategy_id}/backtest-results`}
            className="
              font-medium
              text-[#d3dbdd]
              transition-colors
              hover:text-white
              hover:underline
            "
          >
            {a.strategy_name}
          </Link>

          <span className="text-[#d3dbdd]/50">
            {a.compatibility_sharpe === null
              ? "no data for this regime"
              : `Sharpe ${a.compatibility_sharpe.toFixed(
                  2,
                )}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ============================================================
   REGIME MONITOR PAGE
   ============================================================ */

export default function RegimeMonitorPage() {
  const [symbol, setSymbol] =
    useState("AAPL");

  const [points, setPoints] =
    useState<RegimePoint[] | null>(null);

  const [current, setCurrent] =
    useState<RegimeObject | null>(null);

  const [stats, setStats] =
    useState<RegimeStatisticsItem[]>([]);

  const [alerts, setAlerts] =
    useState<StrategyCompatibilityAlert[]>([]);

  const [error, setError] =
    useState<string | null>(null);

  const [busy, setBusy] =
    useState(false);

  /*
   * UI-only state.
   *
   * This does not replace `symbol`.
   * It does not affect API calls.
   * It simply tells CrossAssetRegime which
   * asset should become visually dominant
   * after Load timeline succeeds.
   */
  const [activeSymbol, setActiveSymbol] =
    useState<string | null>(null);

  const [liveRegime, setLiveRegime] =
    useState<RegimeLabel | null>(null);

  const [justUpdated, setJustUpdated] =
    useState(false);

  const { subscribe } = useWebSocket();

  const liveTimer =
    useRef<ReturnType<typeof setTimeout>>();

  /* ==========================================================
     WEBSOCKET
     ========================================================== */

  useEffect(() => {
    const unsub = subscribe(
      "regime_update",
      (event: WSEvent) => {
        if (
          String(event.symbol) !==
          symbol.trim().toUpperCase()
        ) {
          return;
        }

        setLiveRegime(
          String(event.new_regime) as RegimeLabel,
        );

        setJustUpdated(true);

        clearTimeout(liveTimer.current);

        liveTimer.current = setTimeout(
          () => setJustUpdated(false),
          3000,
        );
      },
    );

    return () => {
      unsub();
      clearTimeout(liveTimer.current);
    };
  }, [subscribe, symbol]);

  const displayedRegime =
    liveRegime ??
    current?.regime_label ??
    null;

  /* ==========================================================
     LOAD
     ========================================================== */

  async function load() {
    setLiveRegime(null);
    setError(null);
    setBusy(true);

    const sym = symbol
      .trim()
      .toUpperCase();

    /*
     * If input is cleared and Load is clicked,
     * remove the visual focus.
     */
    if (!sym) {
      setActiveSymbol(null);
    }

    try {
      const [
        history,
        cur,
        statsResp,
        alertsResp,
      ] = await Promise.all([
        getRegimeHistory(sym),
        getCurrentRegime(sym),
        getRegimeStatistics(sym),
        getCompatibilityAlerts(sym),
      ]);

      setPoints(history.points);
      setCurrent(cur);
      setStats(statsResp.items);
      setAlerts(alertsResp.alerts);

      /*
       * Only highlight after REST request
       * succeeds.
       */
      setActiveSymbol(sym);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load",
      );
    } finally {
      setBusy(false);
    }
  }

  /* ==========================================================
     RE-RUN DETECTION
     ========================================================== */

  async function rerun() {
    setError(null);
    setBusy(true);

    try {
      await triggerRegimeDetection(
        symbol.trim().toUpperCase(),
      );

      /*
       * Detection is async.
       * Give worker time to finish.
       */
      setTimeout(load, 2500);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to trigger detection",
      );

      setBusy(false);
    }
  }

  /* ==========================================================
     SYMBOL CHANGE
     ========================================================== */

  function handleSymbolChange(
    value: string,
  ) {
    setSymbol(value);

    /*
     * Immediately remove visual selection
     * when input is cleared.
     *
     * No API call.
     */
    if (!value.trim()) {
      setActiveSymbol(null);
    }
  }

  /* ==========================================================
     UI
     ========================================================== */

  return (
    <>
      {/* ======================================================
          REGIME MONITOR + MARKET STATE
          ====================================================== */}

      <div
        className="
          mb-4
          grid
          grid-cols-1
          gap-4
          lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.7fr)]
        "
      >
        {/* ====================================================
            REGIME MONITOR
            ==================================================== */}

        <Card
          className="
            overflow-hidden
            rounded-2xl
            border-[#d3dbdd]/10
            bg-[#16232b]
            shadow-none
          "
        >
          <CardHeader className="pb-5">
            <CardTitle
              className="
                text-2xl
                font-semibold
                tracking-tight
                text-[#d3dbdd]
              "
            >
              Regime Monitor
            </CardTitle>

            <CardDescription
              className="
                mt-1
                max-w-3xl
                text-sm
                leading-6
                text-[#d3dbdd]/50
              "
            >
              Ensemble regime timeline
              (HMM · PELT · GMM · GARCH)
              with a fast-triggering Crisis
              override.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-6">
            {/* ----------------------------------------------
                CONTROLS
                ---------------------------------------------- */}

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label
                  className="
                    text-xs
                    font-medium
                    text-[#d3dbdd]/55
                  "
                >
                  Symbol
                </Label>

                <Input
                  name="symbol"
                  value={symbol}
                  onChange={(e) =>
                    handleSymbolChange(
                      e.target.value,
                    )
                  }
                  className="
                    h-11
                    w-44
                    rounded-xl
                    border-[#d3dbdd]/10
                    bg-black/30
                    text-[#d3dbdd]
                    placeholder:text-[#d3dbdd]/25
                    focus-visible:border-[#075056]
                    focus-visible:ring-[#075056]/30
                  "
                  placeholder="AAPL"
                />
              </div>

              <Button
                onClick={load}
                data-testid="load-timeline"
                disabled={busy}
                className="
                  h-11
                  rounded-xl
                  bg-[#074068]
                  px-5
                  font-semibold
                  text-[#d3dbdd]
                  shadow-none
                  transition-all
                  duration-200
                  hover:bg-[#074068]/85
                  hover:shadow-[0_8px_24px_rgba(7,64,104,0.22)]
                  active:scale-[0.98]
                "
              >
                {busy ? "Loading…" : "Load timeline"}
              </Button>

              <Button
                variant="outline"
                onClick={rerun}
                disabled={busy}
                className="
                  h-11
                  rounded-xl
                  border-[#d3dbdd]/10
                  bg-transparent
                  px-5
                  font-semibold
                  text-[#d3dbdd]/80
                  transition-all
                  duration-200
                  hover:border-[#074068]/60
                  hover:bg-[#074068]/10
                  hover:text-[#d3dbdd]
                  active:scale-[0.98]
                "
              >
                Re-run detection
              </Button>
            </div>

            {/* ----------------------------------------------
                ACTIVE SYMBOL
                ---------------------------------------------- */}

            <AnimatePresence>
              {activeSymbol && (
                <motion.div
                  initial={{
                    opacity: 0,
                    y: -6,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  exit={{
                    opacity: 0,
                    y: -4,
                  }}
                  className="
                    flex
                    items-center
                    gap-2
                    text-xs
                    text-[#d3dbdd]/45
                  "
                >
                  <motion.span
                    animate={{
                      scale: [1, 1.25, 1],
                      opacity: [0.6, 1, 0.6],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                    }}
                    className="
                      h-1.5
                      w-1.5
                      rounded-full
                      bg-[#72d6b1]
                    "
                  />

                  Monitoring

                  <span
                    className="
                      font-semibold
                      text-[#d3dbdd]/75
                    "
                  >
                    {activeSymbol}
                  </span>

                  <span>
                    — selected asset is highlighted
                    below.
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ----------------------------------------------
                ERROR
                ---------------------------------------------- */}

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{
                    opacity: 0,
                    y: -4,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  exit={{
                    opacity: 0,
                    y: -4,
                  }}
                  className="
                    rounded-xl
                    border
                    border-[#c40707]/30
                    bg-[#c40707]/10
                    px-4
                    py-3
                    text-sm
                    text-[#c40707]
                  "
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* ====================================================
            MARKET STATE / SYNCHRONIZATION CARD
            ==================================================== */}

        <Card
          className="
            relative
            overflow-hidden
            rounded-2xl
            border-[#075056]/30
            bg-[#075056]/10
            shadow-none
          "
        >
          {/* Decorative rings */}

          <div
            className="
              pointer-events-none
              absolute
              -right-16
              -top-16
              h-40
              w-40
              rounded-full
              border
              border-[#075056]/20
            "
          />

          <div
            className="
              pointer-events-none
              absolute
              -right-8
              -top-8
              h-24
              w-24
              rounded-full
              border
              border-[#075056]/15
            "
          />

          <CardHeader className="relative pb-3">
            <div className="flex items-center justify-between">
              <CardTitle
                className="
                  text-base
                  font-semibold
                  text-[#d3dbdd]
                "
              >
                Market state
              </CardTitle>

              <motion.div
                animate={{
                  scale: [1, 1.15, 1],
                  opacity: [0.55, 1, 0.55],
                }}
                transition={{
                  duration: 2.4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="
                  h-2.5
                  w-2.5
                  rounded-full
                  bg-[#72d6b1]
                "
              />
            </div>

            <CardDescription
              className="
                text-xs
                leading-5
                text-[#d3dbdd]/45
              "
            >
              Cross-asset regime alignment
            </CardDescription>
          </CardHeader>

          <CardContent
            className="
              relative
              flex
              min-h-[170px]
              flex-col
              justify-between
            "
          >
            <AnimatePresence mode="wait">
              {activeSymbol ? (
                <motion.div
                  key="synchronized"
                  initial={{
                    opacity: 0,
                    y: 10,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  exit={{
                    opacity: 0,
                    y: -10,
                  }}
                  transition={{
                    duration: 0.3,
                  }}
                >
                  <p
                    className="
                      text-lg
                      font-semibold
                      text-[#d3dbdd]
                    "
                  >
                    Markets are synchronized
                  </p>

                  <p
                    className="
                      mt-2
                      max-w-xs
                      text-sm
                      leading-6
                      text-[#d3dbdd]/50
                    "
                  >
                    All tracked assets are
                    currently in the same
                    regime.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="waiting"
                  initial={{
                    opacity: 0,
                    y: 10,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  exit={{
                    opacity: 0,
                    y: -10,
                  }}
                  transition={{
                    duration: 0.3,
                  }}
                >
                  <p
                    className="
                      text-lg
                      font-semibold
                      text-[#d3dbdd]
                    "
                  >
                    Awaiting timeline
                  </p>

                  <p
                    className="
                      mt-2
                      max-w-xs
                      text-sm
                      leading-6
                      text-[#d3dbdd]/50
                    "
                  >
                    Load a symbol to compare
                    its regime against the
                    tracked assets.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <div
              className="
                mt-6
                flex
                items-center
                gap-2
              "
            >
              <span
                className="
                  inline-flex
                  h-7
                  items-center
                  rounded-full
                  border
                  border-[#72d6b1]/20
                  bg-[#72d6b1]/10
                  px-2.5
                  text-[10px]
                  font-medium
                  uppercase
                  tracking-[0.12em]
                  text-[#72d6b1]
                "
              >
                {activeSymbol
                  ? "Synchronized"
                  : "Monitoring"}
              </span>

              {activeSymbol && (
                <span
                  className="
                    text-[11px]
                    text-[#d3dbdd]/35
                  "
                >
                  {activeSymbol}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ======================================================
          CROSS-ASSET REGIMES
          ====================================================== */}

      <div className="mb-4">
        <CrossAssetRegime
          activeSymbol={symbol}
          timelineLoaded={
            (points?.length ?? 0) > 0
          }
        />
      </div>

      {/* ======================================================
          CURRENT STATUS
          ====================================================== */}

      {current && (
        <div
          className="
            mb-4
            grid
            grid-cols-1
            gap-4
            lg:grid-cols-3
          "
        >
          {/* ----------------------------------------------
              CURRENT STATUS
              ---------------------------------------------- */}

          <Card
            className="
              rounded-2xl
              border-[#d3dbdd]/10
              bg-[#16232b]
              shadow-none
            "
          >
            <CardHeader>
              <CardTitle
                className="
                  text-base
                  font-semibold
                  text-[#d3dbdd]
                "
              >
                Current Status
              </CardTitle>
            </CardHeader>

            <CardContent
              className="
                flex
                flex-col
                items-center
                gap-2
              "
            >
              <ConfidenceGauge
                value={
                  current.confidence_score
                }
                color={
                  REGIME_COLORS[
                    current.regime_label
                  ]
                }
              />

              <AnimatePresence mode="wait">
                <motion.div
                  key={
                    displayedRegime ??
                    current.regime_label
                  }
                  initial={{
                    opacity: 0,
                    y: -8,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  exit={{
                    opacity: 0,
                    y: 8,
                  }}
                  transition={{
                    duration: 0.3,
                  }}
                >
                  <Badge
                    className="
                      rounded-lg
                      border-0
                    "
                    style={{
                      background:
                        REGIME_COLORS[
                          displayedRegime ??
                            current.regime_label
                        ],
                      color: "white",
                    }}
                  >
                    {displayedRegime ??
                      current.regime_label}
                  </Badge>
                </motion.div>
              </AnimatePresence>

              {justUpdated && (
                <span
                  className="
                    animate-pulse
                    font-mono
                    text-xs
                    text-green-400
                  "
                  data-testid="regime-live-badge"
                >
                  ● LIVE
                </span>
              )}
            </CardContent>
          </Card>

          {/* ----------------------------------------------
              TRANSITION PROBABILITIES
              ---------------------------------------------- */}

          <Card
            className="
              rounded-2xl
              border-[#d3dbdd]/10
              bg-[#16232b]
              shadow-none
              lg:col-span-2
            "
          >
            <CardHeader>
              <CardTitle
                className="
                  text-base
                  font-semibold
                  text-[#d3dbdd]
                "
              >
                Transition Probabilities
              </CardTitle>

              <CardDescription
                className="
                  text-xs
                  text-[#d3dbdd]/45
                "
              >
                HMM state-transition matrix
              </CardDescription>
            </CardHeader>

            <CardContent>
              <TransitionHeatmap
                regime={current}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ======================================================
          TIMELINE
          ====================================================== */}

      {points &&
        points.length > 0 && (
          <Card
            className="
              mb-4
              overflow-hidden
              rounded-2xl
              border-[#d3dbdd]/10
              bg-[#16232b]
              shadow-none
            "
          >
            <CardHeader>
              <CardTitle
                className="
                  text-base
                  font-semibold
                  text-[#d3dbdd]
                "
              >
                12-Month Timeline
              </CardTitle>

              <CardDescription
                className="
                  text-xs
                  text-[#d3dbdd]/45
                "
              >
                Historical regime progression
                for{" "}
                {activeSymbol ?? symbol}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <RegimeTimeline
                points={points}
              />
            </CardContent>
          </Card>
        )}

      {/* ======================================================
          EMPTY TIMELINE
          ====================================================== */}

      {points &&
        points.length === 0 && (
          <motion.div
            initial={{
              opacity: 0,
            }}
            animate={{
              opacity: 1,
            }}
            className="
              mb-4
              rounded-2xl
              border
              border-dashed
              border-[#d3dbdd]/10
              bg-[#16232b]/60
              px-6
              py-10
              text-center
            "
          >
            <p
              className="
                text-sm
                font-medium
                text-[#d3dbdd]/55
              "
            >
              No regime data yet
            </p>

            <p
              className="
                mt-1
                text-xs
                text-[#d3dbdd]/30
              "
            >
              Ingest data for this symbol
              or click "Re-run detection".
            </p>
          </motion.div>
        )}

      {/* ======================================================
          STATISTICS + COMPATIBILITY
          ====================================================== */}

      <div
        className="
          grid
          grid-cols-1
          gap-4
          lg:grid-cols-2
        "
      >
        {/* ----------------------------------------------
            REGIME STATISTICS
            ---------------------------------------------- */}

        <Card
          className="
            rounded-2xl
            border-[#d3dbdd]/10
            bg-[#16232b]
            shadow-none
          "
        >
          <CardHeader>
            <CardTitle
              className="
                text-base
                font-semibold
                text-[#d3dbdd]
              "
            >
              Regime Statistics
            </CardTitle>

            <CardDescription
              className="
                text-xs
                text-[#d3dbdd]/45
              "
            >
              Duration / avg return / avg
              volatility / avg Sharpe per
              regime
            </CardDescription>
          </CardHeader>

          <CardContent>
            <StatsTable items={stats} />
          </CardContent>
        </Card>

        {/* ----------------------------------------------
            COMPATIBILITY
            ---------------------------------------------- */}

        <Card
          className="
            rounded-2xl
            border-[#d3dbdd]/10
            bg-[#16232b]
            shadow-none
          "
        >
          <CardHeader>
            <CardTitle
              className="
                text-base
                font-semibold
                text-[#d3dbdd]
              "
            >
              Strategy Compatibility Alerts
            </CardTitle>

            <CardDescription
              className="
                text-xs
                text-[#d3dbdd]/45
              "
            >
              Active strategies not validated
              for the current regime
            </CardDescription>
          </CardHeader>

          <CardContent>
            <CompatibilityAlerts
              alerts={alerts}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}