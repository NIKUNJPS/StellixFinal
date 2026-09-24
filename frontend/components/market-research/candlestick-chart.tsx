"use client";

/**
 * Candlestick charting (Batch 28 Task 4) — lightweight-charts v5, isolated behind a
 * dynamic import (same reasoning as portfolio-charts.tsx: keep the bundle off pages
 * that don't chart). Three panes: price (candles + SMA/EMA/Bollinger/VWAP overlays),
 * RSI, MACD — all computed server-side by the SAME feature-engineering function
 * strategy backtesting uses (see app/services/market_chart.py).
 */

import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  LineSeries,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

import type { ChartResponse, IndicatorPoint } from "@/lib/market-research-types";

const OVERLAY_COLORS: Record<string, string> = {
  sma_20: "#38BDF8",
  sma_50: "#8E88C7",
  ema_12: "#34D399",
  ema_26: "#FBBF24",
  bollinger_upper: "#666A76",
  bollinger_lower: "#666A76",
  vwap_20: "#F87171",
};

function toLine(points: IndicatorPoint[]) {
  return points.map((p) => ({ time: (new Date(p.timestamp).getTime() / 1000) as UTCTimestamp, value: p.value }));
}

export default function CandlestickChart({ data }: { data: ChartResponse }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [overlays, setOverlays] = useState<Record<string, boolean>>({
    sma_20: true,
    sma_50: false,
    ema_12: false,
    ema_26: false,
    bollinger_upper: false,
    bollinger_lower: false,
    vwap_20: false,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#9A9DA8" },
      grid: { vertLines: { color: "rgba(255,255,255,0.05)" }, horzLines: { color: "rgba(255,255,255,0.05)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: false },
      height: 420,
      autoSize: true,
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(
      CandlestickSeries,
      { upColor: "#34D399", downColor: "#F87171", borderVisible: false, wickUpColor: "#34D399", wickDownColor: "#F87171" },
      0,
    );
    candleSeries.setData(
      data.candles.map((c) => ({
        time: (new Date(c.timestamp).getTime() / 1000) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    for (const [key, enabled] of Object.entries(overlays)) {
      if (!enabled) continue;
      const points = data.indicators[key as keyof typeof data.indicators];
      if (!points?.length) continue;
      const series = chart.addSeries(LineSeries, { color: OVERLAY_COLORS[key], lineWidth: 1 }, 0);
      series.setData(toLine(points));
    }

    // RSI pane
    if (data.indicators.rsi_14.length) {
      const rsiSeries = chart.addSeries(LineSeries, { color: "#8E88C7", lineWidth: 1 }, 1);
      rsiSeries.setData(toLine(data.indicators.rsi_14));
    }

    // MACD pane
    if (data.indicators.macd.length) {
      const macdSeries = chart.addSeries(LineSeries, { color: "#38BDF8", lineWidth: 1 }, 2);
      macdSeries.setData(toLine(data.indicators.macd));
      const signalSeries = chart.addSeries(LineSeries, { color: "#FBBF24", lineWidth: 1 }, 2);
      signalSeries.setData(toLine(data.indicators.macd_signal));
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, overlays]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {Object.keys(OVERLAY_COLORS).map((key) => (
          <button
            key={key}
            onClick={() => setOverlays((o) => ({ ...o, [key]: !o[key] }))}
            className="rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors"
            style={{
              borderColor: overlays[key] ? OVERLAY_COLORS[key] : "rgba(255,255,255,0.08)",
              color: overlays[key] ? OVERLAY_COLORS[key] : "#666A76",
              backgroundColor: overlays[key] ? `${OVERLAY_COLORS[key]}1A` : "transparent",
            }}
          >
            {key.replace(/_/g, " ")}
          </button>
        ))}
      </div>
      <div ref={containerRef} className="w-full overflow-hidden rounded-2xl border border-white/[0.08]" />
      <p className="mt-2 text-[10px] text-[#666A76]">
        Panes: Price (candles + overlays) · RSI (14) · MACD (12/26/9). VWAP is a rolling 20-bar volume-weighted
        average, not a true intraday session VWAP.
      </p>
    </div>
  );
}
