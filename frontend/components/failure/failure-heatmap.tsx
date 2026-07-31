"use client";

import * as d3 from "d3";
import { useMemo } from "react";

import { REGIME_ORDER } from "@/lib/regime-types";
import type { FailureHeatmapCell } from "@/lib/failure-types";

const CELL_W = 64;
const CELL_H = 32;
const MARGIN = { top: 24, right: 16, bottom: 8, left: 160 };

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
    const scale = d3.scaleSequential(d3.interpolateReds).domain([0, Math.max(max, 1)]);

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
    return <p className="text-sm text-muted-foreground">No failures recorded yet.</p>;
  }

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Failure heatmap: strategy by regime">
      {REGIME_ORDER.map((regime, ci) => (
        <text
          key={regime}
          x={MARGIN.left + ci * CELL_W + CELL_W / 2}
          y={MARGIN.top - 8}
          textAnchor="middle"
          style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
        >
          {regime}
        </text>
      ))}
      {grid.map((row, ri) => (
        <g key={row.name}>
          <text
            x={MARGIN.left - 10}
            y={MARGIN.top + ri * CELL_H + CELL_H / 2 + 4}
            textAnchor="end"
            style={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
          >
            {row.name.length > 20 ? `${row.name.slice(0, 19)}…` : row.name}
          </text>
          {row.cells.map((cell, ci) => (
            <g key={`${row.name}-${cell.regime}`}>
              <rect
                x={MARGIN.left + ci * CELL_W + 1}
                y={MARGIN.top + ri * CELL_H + 1}
                width={CELL_W - 2}
                height={CELL_H - 2}
                rx={3}
                fill={cell.count === 0 ? "hsl(var(--muted))" : colorScale(cell.count)}
                fillOpacity={cell.count === 0 ? 0.3 : 1}
              >
                <title>
                  {row.name} · {cell.regime} · {cell.count} failure{cell.count === 1 ? "" : "s"}
                </title>
              </rect>
              {cell.count > 0 && (
                <text
                  x={MARGIN.left + ci * CELL_W + CELL_W / 2}
                  y={MARGIN.top + ri * CELL_H + CELL_H / 2 + 4}
                  textAnchor="middle"
                  style={{ fontSize: 11, fontWeight: 600, fill: cell.count > maxCount / 2 ? "white" : "hsl(var(--foreground))" }}
                >
                  {cell.count}
                </text>
              )}
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}
