"use client";

import { useQuery } from "@tanstack/react-query";
import { CandlestickSeries, ColorType, createChart, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

import { Change, ErrorState, Flash, Loading, Segmented, SourceFooter, TD, TH, retryTerminal } from "@/components/terminal/widget-kit";
import { fmtBig, fmtNum, fmtPct, fmtPrice, terminalApi, type Candle } from "@/lib/terminal";

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return <span className="text-[#4B4F5C]">—</span>;
  const w = 64;
  const h = 16;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`).join(" ");
  const up = (data[data.length - 1] ?? 0) >= (data[0] ?? 0);
  return (
    <svg width={w} height={h} aria-hidden>
      <polyline points={pts} fill="none" stroke={up ? "#34D399" : "#F87171"} strokeWidth={1.2} />
    </svg>
  );
}

function Candles({ candles }: { candles: Candle[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#9A9DA8", fontSize: 10 },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      timeScale: { timeVisible: true, borderColor: "rgba(255,255,255,0.08)" },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
    });
    const s = chart.addSeries(CandlestickSeries, { upColor: "#34D399", downColor: "#F87171", borderVisible: false, wickUpColor: "#34D399", wickDownColor: "#F87171" });
    s.setData(candles.map((c) => ({ time: c.t as UTCTimestamp, open: c.o!, high: c.h!, low: c.l!, close: c.c! })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles]);
  return <div ref={ref} className="h-full w-full" />;
}

function Detail({ symbol }: { symbol: string }) {
  const [interval, setInterval_] = useState<"15m" | "1h" | "4h" | "1d" | "1w">("1d");
  const k = useQuery({ retry: retryTerminal, queryKey: ["terminal", "crypto-k", symbol, interval], queryFn: () => terminalApi.cryptoHistory(symbol, interval), refetchInterval: 60_000 });
  const book = useQuery({ retry: retryTerminal, queryKey: ["terminal", "book", symbol], queryFn: () => terminalApi.orderbook(symbol), refetchInterval: 5_000 });
  const maxQty = Math.max(1e-12, ...(book.data?.data.bids ?? []).map((b) => b[1]), ...(book.data?.data.asks ?? []).map((a) => a[1]));
  return (
    <div className="grid h-full min-h-0 grid-cols-[1fr_180px] gap-1">
      <div className="flex min-h-0 flex-col">
        <div className="px-2 py-1">
          <Segmented label="Interval" options={["15m", "1h", "4h", "1d", "1w"] as const} value={interval} onChange={setInterval_} />
        </div>
        <div className="min-h-[160px] flex-1">{k.error ? <ErrorState error={k.error} /> : !k.data ? <Loading /> : <Candles candles={k.data!.data.candles} />}</div>
      </div>
      <div className="min-h-0 overflow-auto border-l border-white/[0.05] font-mono text-[10px]">
        {book.error ? (
          <ErrorState error={book.error} />
        ) : (
          <>
            <p className="px-2 py-1 text-[#666A76]">Order book {book.data?.data.pair}</p>
            {[...(book.data?.data.asks ?? [])].slice(0, 10).reverse().map(([p, qty]) => (
              <div key={`a${p}`} className="relative flex justify-between px-2">
                <div className="absolute inset-y-0 right-0 bg-[#F87171]/15" style={{ width: `${(qty / maxQty) * 100}%` }} />
                <span className="relative text-[#F87171]">{fmtPrice(p)}</span>
                <span className="relative text-[#9A9DA8]">{fmtNum(qty, 4)}</span>
              </div>
            ))}
            <div className="my-0.5 border-t border-white/[0.08]" />
            {(book.data?.data.bids ?? []).slice(0, 10).map(([p, qty]) => (
              <div key={`b${p}`} className="relative flex justify-between px-2">
                <div className="absolute inset-y-0 right-0 bg-[#34D399]/15" style={{ width: `${(qty / maxQty) * 100}%` }} />
                <span className="relative text-[#34D399]">{fmtPrice(p)}</span>
                <span className="relative text-[#9A9DA8]">{fmtNum(qty, 4)}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default function CryptoWidget() {
  const q = useQuery({ retry: retryTerminal, queryKey: ["terminal", "crypto"], queryFn: terminalApi.crypto, refetchInterval: 60_000 });
  const [selected, setSelected] = useState<string | null>(null);
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <Loading />;
  const d = q.data!.data;
  return (
    <div className="flex h-full flex-col">
      {d.global && (
        <div className="flex flex-wrap gap-x-4 border-b border-white/[0.04] px-2 py-1 font-mono text-[10px] text-[#9A9DA8]">
          <span>Mkt cap {fmtBig(d.global.total_market_cap_usd)}</span>
          <Change value={d.global.market_cap_change_pct_24h}>24h {fmtPct(d.global.market_cap_change_pct_24h)}</Change>
          <span>BTC dom {fmtNum(d.global.btc_dominance, 1)}%</span>
          <span>ETH dom {fmtNum(d.global.eth_dominance, 1)}%</span>
        </div>
      )}
      {selected ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <button type="button" onClick={() => setSelected(null)} className="px-2 py-1 text-left font-mono text-[10px] text-[#B7B2E6] hover:underline">
            ← back to board · {selected}
          </button>
          <div className="min-h-0 flex-1">
            <Detail symbol={selected} />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[520px]">
            <thead className="sticky top-0 bg-[#0B0D12]">
              <tr>
                <th className={TH}>#</th>
                <th className={TH}>Coin</th>
                <th className={`${TH} text-right`}>Price</th>
                <th className={`${TH} text-right`}>24h</th>
                <th className={`${TH} text-right`}>7d</th>
                <th className={`${TH} text-right`}>Mkt cap</th>
                <th className={TH}>7d</th>
              </tr>
            </thead>
            <tbody>
              {d.coins.map((c) => (
                <tr key={c.id} onClick={() => setSelected(c.symbol)} className="cursor-pointer border-t border-white/[0.03] hover:bg-white/[0.03]">
                  <td className={`${TD} text-[#666A76]`}>{c.rank ?? "—"}</td>
                  <td className={`${TD} font-semibold`} title={c.name}>
                    {c.symbol}
                  </td>
                  <td className={`${TD} text-right`}>
                    <Flash value={c.price}>{fmtPrice(c.price)}</Flash>
                  </td>
                  <td className={`${TD} text-right`}>
                    <Change value={c.change_pct_24h}>{fmtPct(c.change_pct_24h)}</Change>
                  </td>
                  <td className={`${TD} text-right`}>
                    <Change value={c.change_pct_7d}>{fmtPct(c.change_pct_7d)}</Change>
                  </td>
                  <td className={`${TD} text-right text-[#808495]`}>{fmtBig(c.market_cap)}</td>
                  <td className="px-2">
                    <Sparkline data={c.sparkline_7d} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SourceFooter env={q.data} extra={selected ? <span>· candles & book: Binance public market data</span> : null} />
    </div>
  );
}
