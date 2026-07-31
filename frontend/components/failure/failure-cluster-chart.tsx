"use client";

import * as d3 from "d3";
import { useMemo } from "react";

import {
  TRIGGER_COLORS,
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

/**
 * D3 bubble chart: failures grouped by regime (x) × trigger_condition (y); bubble area
 * ∝ cluster count, colored by trigger.
 */
export function FailureClusterChart({ clusters }: { clusters: FailureCluster[] }) {
  const width = 640;
  const height = 260;
  const margin = { top: 16, right: 16, bottom: 40, left: 120 };

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
      radius: Math.max(r(c.count), 6),
      color: TRIGGER_COLORS[c.trigger_condition],
      count: c.count,
      label: `${c.regime_at_failure} · ${TRIGGER_LABELS[c.trigger_condition]} · ${c.count}`,
    }));
    return { circles: cs, xScale: x, yScale: y, regimes: regimeSet };
  }, [clusters]);

  if (clusters.length === 0) {
    return <p className="text-sm text-muted-foreground">No failure clusters yet.</p>;
  }

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Failure clusters">
      {/* y-axis trigger labels */}
      {TRIGGERS.map((t) => (
        <text
          key={t}
          x={margin.left - 10}
          y={(yScale(t) ?? 0) + 4}
          textAnchor="end"
          style={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
        >
          {TRIGGER_LABELS[t]}
        </text>
      ))}
      {/* x-axis regime labels */}
      {regimes.map((r) => (
        <text
          key={r}
          x={xScale(r) ?? 0}
          y={height - margin.bottom + 20}
          textAnchor="middle"
          style={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
        >
          {r}
        </text>
      ))}
      {circles.map((c, i) => (
        <g key={i}>
          <circle cx={c.cx} cy={c.cy} r={c.radius} fill={c.color} fillOpacity={0.65} stroke={c.color}>
            <title>{c.label}</title>
          </circle>
          <text x={c.cx} y={c.cy + 4} textAnchor="middle" style={{ fontSize: 11, fontWeight: 600, fill: "white" }}>
            {c.count}
          </text>
        </g>
      ))}
    </svg>
  );
}
