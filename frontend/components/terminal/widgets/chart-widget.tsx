"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  type IChartApi,
  LineSeries,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";

import { ErrorState, Loading, Segmented, SourceFooter, retryTerminal } from "@/components/terminal/widget-kit";
import { changeColor, fmtBig, fmtPct, fmtPrice, terminalApi, type ChartRange, type History, type Point } from "@/lib/terminal";

const RANGES: readonly ChartRange[] = ["1D", "5D", "1M", "3M", "6M", "1Y", "5Y", "MAX"];
const TYPES = ["Candles", "Bars", "Line", "Area"] as const;
type ChartType = (typeof TYPES)[number];
type Overlay = "sma_20" | "sma_50" | "ema_12" | "ema_26" | "bollinger" | "vwap";
const OVERLAYS: { key: Overlay; label: string; color: string }[] = [
  { key: "sma_20", label: "SMA20", color: "#38BDF8" },
  { key: "sma_50", label: "SMA50", color: "#8E88C7" },
  { key: "ema_12", label: "EMA12", color: "#34D399" },
  { key: "ema_26", label: "EMA26", color: "#FBBF24" },
  { key: "bollinger", label: "BB", color: "#666A76" },
  { key: "vwap", label: "VWAP", color: "#F472B6" },
];
const UP = "#34D399";
const DOWN = "#F87171";

const t = (s: number) => s as UTCTimestamp;
const line = (pts: Point[]) => pts.map((p) => ({ time: t(p.t), value: p.v }));

interface Legend {
  time: number;
  o: number | null;
  h: number | null;
  l: number | null;
  c: number | null;
  v: number | null;
  values: Record<string, number | undefined>;
}

function PriceChart({ data, type, overlays, rsi, macd }: { data: History; type: ChartType; overlays: Set<Overlay>; rsi: boolean; macd: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [legend, setLegend] = useState<Legend | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart: IChartApi = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#9A9DA8", fontSize: 10, panes: { separatorColor: "rgba(255,255,255,0.06)" } },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: data.intraday, secondsVisible: false },
    });

    const ohlc = data.candles
      .filter((c) => c.o != null && c.h != null && c.l != null && c.c != null)
      .map((c) => ({ time: t(c.t), open: c.o!, high: c.h!, low: c.l!, close: c.c! }));
    const main =
      type === "Candles"
        ? chart.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN })
        : type === "Bars"
          ? chart.addSeries(BarSeries, { upColor: UP, downColor: DOWN })
          : type === "Line"
            ? chart.addSeries(LineSeries, { color: "#8E88C7", lineWidth: 2 })
            : chart.addSeries(AreaSeries, { lineColor: "#8E88C7", topColor: "rgba(142,136,199,0.35)", bottomColor: "rgba(142,136,199,0)" });
    if (type === "Candles" || type === "Bars") main.setData(ohlc);
    else main.setData(ohlc.map((b) => ({ time: b.time, value: b.close })));

    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volume.setData(
      data.candles
        .filter((c) => c.v != null && c.c != null && c.o != null)
        .map((c) => ({ time: t(c.t), value: c.v!, color: c.c! >= c.o! ? "rgba(52,211,153,0.35)" : "rgba(248,113,113,0.35)" })),
    );

    const legendSeries: { key: string; series: ReturnType<IChartApi["addSeries"]> }[] = [];
    const addLine = (key: string, pts: Point[], color: string, pane = 0, dashed = false) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: 1, lineStyle: dashed ? 2 : 0, priceLineVisible: false, lastValueVisible: false }, pane);
      s.setData(line(pts));
      legendSeries.push({ key, series: s });
    };
    for (const o of OVERLAYS) {
      if (!overlays.has(o.key)) continue;
      if (o.key === "bollinger") {
        addLine("BB upper", data.indicators.bollinger_upper, o.color, 0, true);
        addLine("BB lower", data.indicators.bollinger_lower, o.color, 0, true);
      } else if (o.key === "vwap") {
        addLine(data.vwap_label, data.indicators.vwap, o.color);
      } else {
        addLine(o.label, data.indicators[o.key], o.color);
      }
    }
    let pane = 1;
    if (rsi) {
      addLine("RSI14", data.indicators.rsi_14, "#FBBF24", pane);
      pane += 1;
    }
    if (macd) {
      addLine("MACD", data.indicators.macd, "#38BDF8", pane);
      addLine("Signal", data.indicators.macd_signal, "#F87171", pane);
      pane += 1;
    }
    const panes = chart.panes();
    if (panes.length > 1) {
      panes.forEach((pane, i) => pane.setStretchFactor(i === 0 ? 3 : 1));
    }
    chart.timeScale().fitContent();

    const byTime = new Map(data.candles.map((c) => [c.t, c]));
    const onMove = (p: MouseEventParams) => {
      if (!p.time) return setLegend(null);
      const c = byTime.get(p.time as number);
      if (!c) return;
      const values: Record<string, number | undefined> = {};
      for (const { key, series } of legendSeries) {
        const d = p.seriesData.get(series) as { value?: number } | undefined;
        values[key] = d?.value;
      }
      setLegend({ time: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v, values });
    };
    chart.subscribeCrosshairMove(onMove);
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
    };
  }, [data, type, overlays, rsi, macd]);

  const last = data.candles[data.candles.length - 1];
  const shown = legend ?? (last ? { time: last.t, o: last.o, h: last.h, l: last.l, c: last.c, v: last.v, values: {} } : null);
  return (
    <div className="relative h-full min-h-[220px]">
      {shown && (
        <div className="pointer-events-none absolute left-2 top-1 z-10 flex flex-wrap gap-x-2 font-mono text-[10px] text-[#9A9DA8]">
          <span>{new Date(shown.time * 1000).toLocaleString(undefined, data.intraday ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "medium" })}</span>
          <span>O {fmtPrice(shown.o)}</span>
          <span>H {fmtPrice(shown.h)}</span>
          <span>L {fmtPrice(shown.l)}</span>
          <span style={{ color: changeColor((shown.c ?? 0) - (shown.o ?? 0)) }}>C {fmtPrice(shown.c)}</span>
          <span>Vol {fmtBig(shown.v)}</span>
          {Object.entries(shown.values).map(([k, v]) => (
            <span key={k}>
              {k} {v == null ? "—" : fmtPrice(v)}
            </span>
          ))}
        </div>
      )}
      <div ref={ref} className="absolute inset-0 pt-4" />
    </div>
  );
}

export default function ChartWidget({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<ChartRange>("6M");
  const [type, setType] = useState<ChartType>("Candles");
  const [overlays, setOverlays] = useState<Set<Overlay>>(new Set(["sma_20", "sma_50"]));
  const [rsi, setRsi] = useState(false);
  const [macd, setMacd] = useState(false);
  const intraday = range === "1D" || range === "5D" || range === "1M";
  const q = useQuery({
    retry: retryTerminal,
    queryKey: ["terminal", "history", symbol, range],
    queryFn: () => terminalApi.history(symbol, range),
    refetchInterval: intraday ? 60_000 : 15 * 60_000,
  });
  const overlaysKey = useMemo(() => new Set(overlays), [overlays]);
  const d = q.data?.data;
  const first = d?.candles.find((c) => c.c != null)?.c ?? null;
  const last = d?.candles[d.candles.length - 1]?.c ?? null;
  const rangeChange = first && last ? ((last - first) / first) * 100 : null;

  const toggle = (k: Overlay) =>
    setOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.04] px-2 py-1">
        <span className="font-mono text-xs font-semibold text-[#F5F5F7]">{symbol}</span>
        {rangeChange != null && (
          <span className="font-mono text-[10px]" style={{ color: changeColor(rangeChange) }}>
            {fmtPct(rangeChange)} over {range}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Segmented label="Range" options={RANGES} value={range} onChange={setRange} />
          <Segmented label="Chart type" options={TYPES} value={type} onChange={setType} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 px-2 py-1">
        {OVERLAYS.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={overlays.has(o.key)}
            onClick={() => toggle(o.key)}
            className={`rounded border px-1.5 font-mono text-[9.5px] ${overlays.has(o.key) ? "border-white/20 text-[#F5F5F7]" : "border-white/[0.06] text-[#666A76]"}`}
            style={overlays.has(o.key) ? { color: o.color } : undefined}
          >
            {o.label}
          </button>
        ))}
        {[
          ["RSI", rsi, setRsi],
          ["MACD", macd, setMacd],
        ].map(([label, on, set]) => (
          <button
            key={label as string}
            type="button"
            aria-pressed={on as boolean}
            onClick={() => (set as (v: boolean) => void)(!(on as boolean))}
            className={`rounded border px-1.5 font-mono text-[9.5px] ${on ? "border-white/20 text-[#F5F5F7]" : "border-white/[0.06] text-[#666A76]"}`}
          >
            {label as string}
          </button>
        ))}
        {d && <span className="ml-auto font-mono text-[9.5px] text-[#666A76]">{d.interval} bars</span>}
      </div>
      <div className="min-h-0 flex-1">
        {q.error ? <ErrorState error={q.error} /> : !q.data ? <Loading /> : d ? <PriceChart data={d} type={type} overlays={overlaysKey} rsi={rsi} macd={macd} /> : null}
      </div>
      <SourceFooter env={q.data} />
    </div>
  );
}
