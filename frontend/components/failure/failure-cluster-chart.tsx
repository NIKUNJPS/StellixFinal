"use client";

import * as d3 from "d3";
import { useMemo } from "react";

import {
  TRIGGER_LABELS,
  type FailureCluster,
  type FailureTrigger,
} from "@/lib/failure-types";

const TRIGGERS: FailureTrigger[] = [
  "drawdown_breach",
  "sharpe_decline",
  "regime_mismatch",
  "manual",
];

const PALETTE = {
  textPrimary: "#F5F5F7",
  textSecondary: "#9A9DA8",
  textMuted: "#666A76",
  borderSubtle: "rgba(255, 255, 255, 0.05)",
  danger: "#E45B5B",
  warning: "#E5A84B",
  success: "#35C77A",
  manual: "#7B8092",
};

const THEME_TRIGGER_COLORS: Record<FailureTrigger, string> = {
  drawdown_breach: PALETTE.danger,
  sharpe_decline: PALETTE.warning,
  regime_mismatch: PALETTE.success,
  manual: PALETTE.manual,
};

/**
 * D3 bubble chart: failures grouped by regime (x) × trigger_condition (y); bubble area
 * ∝ cluster count, colored by trigger.
 */
export function FailureClusterChart({ clusters }: { clusters: FailureCluster[] }) {
  const width = 640;
  const height = 260;
  const margin = { top: 20, right: 24, bottom: 44, left: 130 };

  const { circles, xScale, yScale, regimes } = useMemo(() => {
    const regimeSet = Array.from(new Set(clusters.map((c) => c.regime_at_failure))).sort();
    const x = d3
      .scalePoint<string>()
      .domain(regimeSet.length ? regimeSet : ["—"])
      .range([margin.left, width - margin.right])
      .padding(0.5);
    const y = d3
      .scalePoint<string>()
      .domain(TRIGGERS)
      .range([margin.top, height - margin.bottom])
      .padding(0.6);
    const maxCount = d3.max(clusters, (c) => c.count) ?? 1;
    const r = d3.scaleSqrt().domain([0, maxCount]).range([0, 26]);
    const cs = clusters.map((c) => ({
      cx: x(c.regime_at_failure) ?? margin.left,
      cy: y(c.trigger_condition) ?? margin.top,
      radius: Math.max(r(c.count), 7),
      color: THEME_TRIGGER_COLORS[c.trigger_condition] ?? PALETTE.manual,
      count: c.count,
      label: `${c.regime_at_failure} · ${TRIGGER_LABELS[c.trigger_condition]} · ${c.count}`,
    }));
    return { circles: cs, xScale: x, yScale: y, regimes: regimeSet };
  }, [clusters]);

  if (clusters.length === 0) {
    return (
      <p className="font-mono text-xs" style={{ color: PALETTE.textMuted }}>
        No failure clusters yet.
      </p>
    );
  }

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Failure clusters"
      className="overflow-visible"
    >
      {/* Background Grid Lines */}
      {TRIGGERS.map((t) => {
        const yPos = yScale(t) ?? 0;
        return (
          <line
            key={`grid-y-${t}`}
            x1={margin.left}
            y1={yPos}
            x2={width - margin.right}
            y2={yPos}
            stroke={PALETTE.borderSubtle}
            strokeDasharray="3 3"
          />
        );
      })}

      {regimes.map((r) => {
        const xPos = xScale(r) ?? 0;
        return (
          <line
            key={`grid-x-${r}`}
            x1={xPos}
            y1={margin.top}
            x2={xPos}
            y2={height - margin.bottom}
            stroke={PALETTE.borderSubtle}
            strokeDasharray="3 3"
          />
        );
      })}

      {/* y-axis trigger labels */}
      {TRIGGERS.map((t) => (
        <text
          key={t}
          x={margin.left - 14}
          y={(yScale(t) ?? 0) + 4}
          textAnchor="end"
          className="font-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.04em",
            fill: PALETTE.textSecondary,
          }}
        >
          {TRIGGER_LABELS[t]}
        </text>
      ))}

      {/* x-axis regime labels */}
      {regimes.map((r) => (
        <text
          key={r}
          x={xScale(r) ?? 0}
          y={height - margin.bottom + 22}
          textAnchor="middle"
          className="font-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.04em",
            fill: PALETTE.textMuted,
          }}
        >
          {r}
        </text>
      ))}

      {/* Cluster Bubbles */}
      {circles.map((c, i) => (
        <g key={i} className="transition-transform duration-200 hover:scale-105">
          <circle
            cx={c.cx}
            cy={c.cy}
            r={c.radius}
            fill={c.color}
            fillOpacity={0.25}
            stroke={c.color}
            strokeWidth={1.5}
            style={{
              filter: `drop-shadow(0 0 6px ${c.color}40)`,
            }}
          >
            <title>{c.label}</title>
          </circle>

          <text
            x={c.cx}
            y={c.cy + 4}
            textAnchor="middle"
            className="font-mono"
            style={{
              fontSize: 10,
              fontWeight: 600,
              fill: PALETTE.textPrimary,
              pointerEvents: "none",
            }}
          >
            {c.count}
          </text>
        </g>
      ))}
    </svg>
  );
}