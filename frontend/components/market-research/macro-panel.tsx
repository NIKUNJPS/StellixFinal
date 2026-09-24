"use client";

import { Landmark } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";
import { getMacroDashboard } from "@/lib/market-research";
import type { MacroResponse, MacroSeries } from "@/lib/market-research-types";

import { YieldCurveChart } from "./yield-curve-chart";

function SeriesCard({ series }: { series: MacroSeries }) {
  const notConfigured = series.status === "not_configured";
  return (
    <Card className="rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl">
      <CardContent className="p-5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#808495]">
          {series.label}
        </p>
        {notConfigured ? (
          <p className="mt-3 text-xs text-[#666A76]">FRED not configured</p>
        ) : series.status !== "ok" ? (
          <p className="mt-3 text-xs text-[#F87171]">{series.error ?? "Unavailable"}</p>
        ) : (
          <>
            <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-[#F5F5F7]">
              {series.latest_value?.toFixed(2)}
              <span className="ml-1 text-sm font-medium text-[#808495]">{series.unit}</span>
            </p>
            <p className="mt-1 text-[11px] text-[#666A76]">as of {series.latest_date}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function MacroPanel() {
  const [data, setData] = useState<MacroResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    let active = true;
    getMacroDashboard()
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Failed to load macro data"));
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      subscribe("macro_update", (event: WSEvent) => {
        const series = event.series as MacroSeries[] | undefined;
        if (!Array.isArray(series)) return;
        setData((prev) => ({
          configured: Boolean(event.configured ?? prev?.configured),
          source: String(event.source ?? prev?.source ?? "FRED"),
          refresh_interval_seconds: Number(event.refresh_interval_seconds ?? prev?.refresh_interval_seconds ?? 86400),
          data_delay_note: String(event.data_delay_note ?? prev?.data_delay_note ?? ""),
          generated_at: String(event.timestamp ?? new Date().toISOString()),
          series,
        }));
      }),
    [subscribe],
  );

  const yieldCurve = useMemo(() => data?.series.filter((s) => s.group === "yield_curve") ?? [], [data]);
  const indicators = useMemo(() => data?.series.filter((s) => s.group === "volatility") ?? [], [data]);

  if (error && !data) {
    return <p className="rounded-2xl border border-[#F87171]/25 bg-[#F87171]/[0.08] p-4 text-xs text-[#F87171]">{error}</p>;
  }
  if (!data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[104px] animate-pulse rounded-2xl border border-white/[0.06] bg-[#0F1117]/70" />
        ))}
      </div>
    );
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#808495]">
            <Landmark className="h-3.5 w-3.5 text-[#38BDF8]" /> Macro Dashboard
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-[#F5F5F7]">Treasury Yield Curve &amp; VIX</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
          <span className="rounded-lg border border-white/[0.08] bg-[#0F1117]/80 px-2.5 py-1 text-[#9A9DA8]">
            Source: {data.source}
          </span>
          <span className="rounded-lg border border-[#FBBF24]/30 bg-[#FBBF24]/10 px-2.5 py-1 text-[#FBBF24]">
            {data.data_delay_note}
          </span>
        </div>
      </div>

      {!data.configured ? (
        <Card className="rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0">
          <CardContent className="p-6 text-center">
            <p className="text-sm font-semibold text-[#F5F5F7]">FRED not configured</p>
            <p className="mt-1 text-xs text-[#9A9DA8]">
              Set <code className="text-[#8E88C7]">FRED_API_KEY</code> to enable the macro dashboard — free key at{" "}
              fredaccount.stlouisfed.org.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-4 rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl">
            <CardContent className="p-5">
              <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#808495]">
                Treasury Yield Curve
              </p>
              <YieldCurveChart series={yieldCurve} />
            </CardContent>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {indicators.map((s) => (
              <SeriesCard key={s.series_id} series={s} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
