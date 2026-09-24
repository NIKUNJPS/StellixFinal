"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { MacroSeries } from "@/lib/market-research-types";

/** The latest yield for each maturity, plotted left (short) to right (long) — the
 * standard "yield curve" view, not a time series. */
export function YieldCurveChart({ series }: { series: MacroSeries[] }) {
  const points = series
    .filter((s) => s.status === "ok" && s.latest_value !== null)
    .map((s) => ({ maturity: s.label, yield: s.latest_value as number, asOf: s.latest_date }));

  if (points.length === 0) {
    return <p className="py-10 text-center text-xs text-[#666A76]">No yield curve data available.</p>;
  }

  return (
    <div role="img" aria-label={`Treasury yield curve across ${points.length} maturities`}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="maturity" tick={{ fontSize: 11, fill: "#808495" }} stroke="rgba(255,255,255,0.08)" />
          <YAxis
            tick={{ fontSize: 11, fill: "#808495" }}
            stroke="rgba(255,255,255,0.08)"
            width={40}
            unit="%"
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{ background: "#0D0F14", border: "1px solid rgba(255,255,255,0.08)", fontSize: 12 }}
            formatter={(v: number) => [`${v.toFixed(2)}%`, "Yield"]}
          />
          <Line type="monotone" dataKey="yield" stroke="#38BDF8" strokeWidth={2} dot={{ r: 3, fill: "#38BDF8" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
