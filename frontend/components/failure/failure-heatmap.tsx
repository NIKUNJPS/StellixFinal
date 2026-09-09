"use client";

import * as d3 from "d3";
import { useMemo } from "react";

import { REGIME_ORDER } from "@/lib/regime-types";
import type { FailureHeatmapCell } from "@/lib/failure-types";

const CELL_W = 68;
const CELL_H = 34;
const MARGIN = { top: 28, right: 20, bottom: 12, left: 160 };

const PALETTE = {
  elevatedBg: "#14161B",
  borderSubtle: "rgba(255, 255, 255, 0.05)",
  textPrimary: "#F5F5F7",
  textSecondary: "#9A9DA8",
  textMuted: "#666A76",
  dangerLow: "rgba(228, 91, 91, 0.2)",
  dangerHigh: "#E45B5B",
};

/**
 * D3 strategy x regime failure-count heatmap (Page 10, Batch 12) — distinct
 * from FailureClusterChart (regime x trigger_condition bubbles, Batch 6).
 * Cell color intensity = failure count for that (strategy, regime) pair.
 */
export function FailureHeatmap({ cells }: { cells: FailureHeatmapCell[] }) {
  const { grid, colorScale, maxCount, width, height } = useMemo(() => {
    const strategyNames = Array.from(new Set(cells.map((c) => c.strategy_name))).sort();
    const countByKey = new Map(cells.map((c) => [`${c.strategy_id}|${c.regime_at_failure}`, c]));

    const max = d3.max(cells, (c) => c.count) ?? 1;
    const scale = d3
      .scaleSequential(d3.interpolateRgb(PALETTE.dangerLow, PALETTE.dangerHigh))
      .domain([1, Math.max(max, 1)]);

    const strategyIdByName = new Map(cells.map((c) => [c.strategy_name, c.strategy_id]));
    const gridRows = strategyNames.map((name) => {
      const strategyId = strategyIdByName.get(name) ?? name;
      return {
        name,
        cells: REGIME_ORDER.map((regime) => {
          const hit = countByKey.get(`${strategyId}|${regime}`);
          return { regime, count: hit?.count ?? 0 };
        }),
      };
    });

    return {
      grid: gridRows,
      colorScale: scale,
      maxCount: max,
      width: MARGIN.left + MARGIN.right + REGIME_ORDER.length * CELL_W,
      height: MARGIN.top + MARGIN.bottom + Math.max(gridRows.length, 1) * CELL_H,
    };
  }, [cells]);

  if (cells.length === 0) {
    return (
      <p className="font-mono text-xs" style={{ color: PALETTE.textMuted }}>
        No failures recorded yet.
      </p>
    );
  }

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Failure heatmap: strategy by regime"
      className="overflow-visible"
    >
      {/* Regime Column Headers */}
      {REGIME_ORDER.map((regime, ci) => (
        <text
          key={regime}
          x={MARGIN.left + ci * CELL_W + CELL_W / 2}
          y={MARGIN.top - 10}
          textAnchor="middle"
          className="font-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.04em",
            fill: PALETTE.textMuted,
          }}
        >
          {regime}
        </text>
      ))}

      {/* Rows */}
      {grid.map((row, ri) => (
        <g key={row.name}>
          {/* Strategy Name Label */}
          <text
            x={MARGIN.left - 14}
            y={MARGIN.top + ri * CELL_H + CELL_H / 2 + 4}
            textAnchor="end"
            className="font-mono font-medium"
            style={{
              fontSize: 11,
              fill: PALETTE.textSecondary,
            }}
          >
            {row.name.length > 20 ? `${row.name.slice(0, 19)}…` : row.name}
          </text>

          {/* Matrix Cells */}
          {row.cells.map((cell, ci) => {
            const hasFailures = cell.count > 0;
            const fillColor = hasFailures ? colorScale(cell.count) : PALETTE.elevatedBg;
            const strokeColor = hasFailures ? "rgba(228, 91, 91, 0.4)" : PALETTE.borderSubtle;

            return (
              <g key={`${row.name}-${cell.regime}`} className="transition-all duration-150 hover:opacity-90">
                <rect
                  x={MARGIN.left + ci * CELL_W + 1.5}
                  y={MARGIN.top + ri * CELL_H + 1.5}
                  width={CELL_W - 3}
                  height={CELL_H - 3}
                  rx={5}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={1}
                >
                  <title>
                    {row.name} · {cell.regime} · {cell.count} failure{cell.count === 1 ? "" : "s"}
                  </title>
                </rect>

                {hasFailures && (
                  <text
                    x={MARGIN.left + ci * CELL_W + CELL_W / 2}
                    y={MARGIN.top + ri * CELL_H + CELL_H / 2 + 4}
                    textAnchor="middle"
                    className="font-mono"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      fill: cell.count > maxCount / 2 ? "#FFFFFF" : PALETTE.textPrimary,
                      pointerEvents: "none",
                    }}
                  >
                    {cell.count}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}