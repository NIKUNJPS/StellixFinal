"use client";

import { Search } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { getChart } from "@/lib/market-research";
import type { ChartResponse } from "@/lib/market-research-types";

const CandlestickChart = dynamic(() => import("./candlestick-chart"), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-2xl border border-white/[0.06] bg-[#0F1117]/70" />,
});

const INTERVALS = [
  { value: "1d", label: "Daily" },
  { value: "1wk", label: "Weekly" },
  { value: "1mo", label: "Monthly" },
];
const RANGES = [
  { value: "6mo", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "2y", label: "2Y" },
  { value: "5y", label: "5Y" },
];

export function ChartPanel({ initialSymbol = "SPY" }: { initialSymbol?: string }) {
  const [symbolInput, setSymbolInput] = useState(initialSymbol);
  const [symbol, setSymbol] = useState(initialSymbol);
  const [interval, setInterval_] = useState("1d");
  const [range, setRange] = useState("1y");
  const [data, setData] = useState<ChartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSymbolInput(initialSymbol);
    setSymbol(initialSymbol);
  }, [initialSymbol]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getChart(symbol, interval, range)
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Failed to load chart"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [symbol, interval, range]);

  return (
    <Card className="rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl">
      <CardContent className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (symbolInput.trim()) setSymbol(symbolInput.trim().toUpperCase());
            }}
            className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#0F1117] px-2.5 py-1.5"
          >
            <Search className="h-3.5 w-3.5 text-[#666A76]" />
            <input
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              placeholder="Symbol"
              className="w-24 bg-transparent font-mono text-xs uppercase text-[#F5F5F7] outline-none"
            />
            <button
              type="submit"
              className="rounded-lg px-2 py-0.5 text-[10px] font-semibold text-[#8E88C7] hover:bg-[#8E88C7]/10"
            >
              Go
            </button>
          </form>
          <div className="flex gap-1 rounded-xl border border-white/[0.08] bg-[#0F1117] p-1">
            {INTERVALS.map((i) => (
              <button
                key={i.value}
                onClick={() => setInterval_(i.value)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                  interval === i.value ? "bg-[#8E88C7]/20 text-[#8E88C7]" : "text-[#9A9DA8] hover:text-[#F5F5F7]"
                }`}
              >
                {i.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-xl border border-white/[0.08] bg-[#0F1117] p-1">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                  range === r.value ? "bg-[#8E88C7]/20 text-[#8E88C7]" : "text-[#9A9DA8] hover:text-[#F5F5F7]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {data && (
            <span className="ml-auto rounded-lg border border-white/[0.08] bg-[#0F1117]/80 px-2.5 py-1 font-mono text-[10px] text-[#9A9DA8]">
              {data.data_delay_note}
            </span>
          )}
        </div>

        {error && (
          <p className="rounded-xl border border-[#F87171]/25 bg-[#F87171]/[0.08] p-4 text-xs text-[#F87171]">{error}</p>
        )}
        {!error && loading && !data && (
          <div className="h-[420px] animate-pulse rounded-2xl border border-white/[0.06] bg-[#0F1117]/70" />
        )}
        {!error && data && <CandlestickChart data={data} />}
      </CardContent>
    </Card>
  );
}
