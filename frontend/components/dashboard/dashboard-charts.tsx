"use client";

import { memo, useCallback, useMemo, useState } from "react";
import {
  Brush,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TopPerformerItem } from "@/lib/backtest-types";
import { STATUS_COLORS } from "@/lib/strategy-types";

/**
 * Batch 25: the dashboard's Recharts charts, split into their own module so the page
 * lazy-loads Recharts (next/dynamic) instead of shipping it in the initial bundle, and
 * made interactive: toggle equity series from the legend, zoom with the brush, and
 * inspect lifecycle slices on hover.
 */

const LINE_COLORS = ["#8B5CF6", "#38BDF8", "#34D399", "#FBBF24", "#F43F5E"];

const tooltipStyle = {
  background: "rgba(13, 15, 20, 0.95)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: "0.875rem",
  color: "#F5F5F7",
  boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.8)",
  padding: "10px 14px",
};

export const EquityCurveChart = memo(function EquityCurveChart({ performers }: { performers: TopPerformerItem[] }) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  const data = useMemo(() => {
    const maxLen = Math.max(0, ...performers.map((p) => p.equity_curve.length));
    return Array.from({ length: maxLen }, (_, i) => {
      const row: Record<string, number | undefined> = { bar: i };
      for (const p of performers) row[p.name] = p.equity_curve[i]?.value ?? undefined;
      return row;
    });
  }, [performers]);

  const toggle = useCallback((name: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  if (data.length === 0) {
    return <p className="py-16 text-center text-xs text-[#666A76]">No backtested strategies yet.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Toggle strategies">
        {performers.map((p, i) => {
          const off = hidden.has(p.name);
          const color = LINE_COLORS[i % LINE_COLORS.length];
          return (
            <button
              key={p.strategy_id}
              type="button"
              onClick={() => toggle(p.name)}
              aria-pressed={!off}
              className={`flex max-w-[220px] items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-all ${
                off ? "border-white/[0.06] text-[#666A76]" : "border-white/[0.12] text-[#C9CBD3] hover:border-white/[0.25]"
              }`}
              title={`Sharpe ${p.sharpe_ratio?.toFixed(2) ?? "—"} · click to ${off ? "show" : "hide"}`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: off ? "#3A3D46" : color }} />
              <span className="truncate">{p.name}</span>
            </button>
          );
        })}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 10, left: -14, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.04)" vertical={false} />
          <XAxis dataKey="bar" tick={{ fontSize: 10, fill: "#808495" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#808495" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#808495" }} labelFormatter={(bar) => `Bar ${bar}`} />
          {performers.map((p, i) => (
            <Line
              key={p.strategy_id}
              type="monotone"
              dataKey={p.name}
              hide={hidden.has(p.name)}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              strokeWidth={2.2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
          <Brush dataKey="bar" height={20} stroke="#5C568E" fill="rgba(15,17,23,0.8)" travellerWidth={8} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

type StatusSlice = { status: string; count: number };

function ActiveSlice(props: {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  fill: string;
}) {
  return (
    <g>
      <Sector {...props} outerRadius={props.outerRadius + 8} />
      <Sector {...props} innerRadius={props.outerRadius + 11} outerRadius={props.outerRadius + 14} />
    </g>
  );
}

export const StatusDonut = memo(function StatusDonut({ slices }: { slices: StatusSlice[] }) {
  const [active, setActive] = useState(0);
  const total = useMemo(() => slices.reduce((sum, s) => sum + s.count, 0), [slices]);
  const current = slices[active] ?? slices[0];

  if (slices.length === 0) {
    return <p className="py-16 text-center text-xs text-[#666A76]">No strategies yet.</p>;
  }

  return (
    <div>
      <div className="relative">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="count"
            nameKey="status"
            innerRadius={72}
            outerRadius={104}
            paddingAngle={3}
            stroke="none"
            activeIndex={active}
            activeShape={ActiveSlice as never}
            onMouseEnter={(_, index) => setActive(index)}
            isAnimationActive={false}
          >
            {slices.map((entry) => (
              <Cell key={entry.status} fill={STATUS_COLORS[entry.status as keyof typeof STATUS_COLORS] ?? "#475569"} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {current && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-[#F5F5F7]">{current.count}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#9A9DA8]">{current.status}</span>
          <span className="font-mono text-[10px] text-[#666A76]">
            {total ? Math.round((current.count / total) * 100) : 0}% of {total}
          </span>
        </div>
      )}
      </div>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        {slices.map((s, i) => (
          <button
            key={s.status}
            type="button"
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] capitalize ${
              i === active ? "bg-white/[0.06] text-[#F5F5F7]" : "text-[#9A9DA8]"
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.status as keyof typeof STATUS_COLORS] }} />
            {s.status} {s.count}
          </button>
        ))}
      </div>
    </div>
  );
});
