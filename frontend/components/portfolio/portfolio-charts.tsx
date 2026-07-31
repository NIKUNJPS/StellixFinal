"use client";

/**
 * Portfolio recharts (Batch 20), isolated behind a dynamic import so the recharts
 * bundle stays off the initial load (only this page and backtest-results use it).
 * Two modes: the combined equity area chart, and the regime-specialisation donut.
 */

import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { EquityPoint } from "@/lib/portfolio-types";

type DonutDatum = { name: string; value: number; color: string };

export default function PortfolioCharts(
  props:
    | { kind: "equity"; data: EquityPoint[] }
    | { kind: "donut"; data: DonutDatum[] },
) {
  if (props.kind === "equity") {
    if (props.data.length === 0) {
      return (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No equity history yet.
        </p>
      );
    }
    return (
      <div
        role="img"
        aria-label={`Combined equal-weighted portfolio equity curve, ${props.data.length} daily points, normalised to 1.0 at start.`}
      >
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={props.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="timestamp" tick={false} stroke="hsl(var(--muted-foreground))" />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground))"
              domain={["auto", "auto"]}
              width={44}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                fontSize: 12,
              }}
              formatter={(v: number) => [v.toFixed(4), "equity"]}
            />
            <Area type="monotone" dataKey="value" stroke="#0066FF" fill="#0066FF" fillOpacity={0.15} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const total = props.data.reduce((s, d) => s + d.value, 0);
  return (
    <div
      role="img"
      aria-label={`Regime specialisation donut: ${props.data
        .map((d) => `${d.name} ${d.value}`)
        .join(", ")}.`}
    >
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={props.data}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
            label={(e: { name: string; value: number }) =>
              `${e.name} (${Math.round((100 * e.value) / total)}%)`
            }
            labelLine={false}
          >
            {props.data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              fontSize: 12,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
