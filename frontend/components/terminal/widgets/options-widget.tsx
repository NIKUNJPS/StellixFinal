"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorState, Loading, Segmented, SourceFooter, retryTerminal } from "@/components/terminal/widget-kit";
import { fmtBig, fmtNum, fmtPrice, terminalApi, type OptionRow } from "@/lib/terminal";

const COLS = ["Last", "Bid", "Ask", "Vol", "OI", "IV", "Δ", "Γ", "Θ", "ν"] as const;

function cells(r: OptionRow | undefined) {
  if (!r) return COLS.map(() => "");
  const g = r.greeks;
  return [
    fmtPrice(r.last),
    r.bid == null ? "—" : fmtPrice(r.bid),
    r.ask == null ? "—" : fmtPrice(r.ask),
    fmtBig(r.volume),
    fmtBig(r.open_interest),
    r.implied_volatility == null ? "—" : `${(r.implied_volatility * 100).toFixed(1)}%`,
    g ? fmtNum(g.delta, 3) : "—",
    g ? fmtNum(g.gamma, 4) : "—",
    g ? fmtNum(g.theta, 3) : "—",
    g ? fmtNum(g.vega, 3) : "—",
  ];
}

export default function OptionsWidget({ symbol }: { symbol: string }) {
  const [expiration, setExpiration] = useState<string | undefined>();
  const [band, setBand] = useState<"±10" | "±25" | "All">("±10");
  const q = useQuery({
    retry: retryTerminal,
    queryKey: ["terminal", "options", symbol, expiration],
    queryFn: () => terminalApi.options(symbol, expiration),
    refetchInterval: 60_000,
  });
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <Loading />;
  const d = q.data!.data;
  const strikes = Array.from(new Set([...d.calls, ...d.puts].map((r) => r.strike))).sort((a, b) => a - b);
  const spot = d.underlying_price;
  const atm = spot == null ? 0 : strikes.reduce((best, s, i) => (Math.abs(s - spot) < Math.abs((strikes[best] ?? s) - spot) ? i : best), 0);
  const half = band === "±10" ? 10 : band === "±25" ? 25 : strikes.length;
  const visible = strikes.slice(Math.max(0, atm - half), atm + half + 1);
  const calls = new Map(d.calls.map((r) => [r.strike, r]));
  const puts = new Map(d.puts.map((r) => [r.strike, r]));

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.04] px-2 py-1">
        <select
          aria-label="Expiration"
          value={d.expiration}
          onChange={(e) => setExpiration(e.target.value)}
          className="rounded border border-white/[0.08] bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-[#D4D5DB]"
        >
          {d.expirations.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <span className="font-mono text-[10px] text-[#9A9DA8]">
          {symbol} {fmtPrice(spot)}
        </span>
        <div className="ml-auto">
          <Segmented label="Strikes shown" options={["±10", "±25", "All"] as const} value={band} onChange={setBand} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[980px] border-collapse font-mono text-[10.5px]">
          <thead className="sticky top-0 bg-[#0B0D12] text-[#666A76]">
            <tr>
              <th colSpan={COLS.length} className="py-0.5 text-center text-[#34D399]">
                CALLS
              </th>
              <th className="px-2">Strike</th>
              <th colSpan={COLS.length} className="py-0.5 text-center text-[#F87171]">
                PUTS
              </th>
            </tr>
            <tr>
              {COLS.map((c) => (
                <th key={`c${c}`} className="px-1.5 py-0.5 text-right font-normal">
                  {c}
                </th>
              ))}
              <th />
              {COLS.map((c) => (
                <th key={`p${c}`} className="px-1.5 py-0.5 text-right font-normal">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((k) => {
              const c = calls.get(k);
              const p = puts.get(k);
              return (
                <tr key={k} className="border-t border-white/[0.03] text-[#D4D5DB]">
                  {cells(c).map((v, i) => (
                    <td key={`c${i}`} className={`px-1.5 py-0.5 text-right ${c?.in_the_money ? "bg-[#34D399]/[0.07]" : ""}`}>
                      {v}
                    </td>
                  ))}
                  <td className={`px-2 text-center font-semibold ${spot != null && Math.abs(k - spot) === Math.min(...visible.map((s) => Math.abs(s - spot))) ? "text-[#FBBF24]" : "text-[#F5F5F7]"}`}>
                    {fmtPrice(k)}
                  </td>
                  {cells(p).map((v, i) => (
                    <td key={`p${i}`} className={`px-1.5 py-0.5 text-right ${p?.in_the_money ? "bg-[#F87171]/[0.07]" : ""}`}>
                      {v}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <SourceFooter
        env={q.data}
        extra={
          <span title={d.greeks_model}>
            · Greeks: Black-Scholes, r = {(d.risk_free_rate * 100).toFixed(2)}% ({d.risk_free_source}); θ per day, ν per vol pt; “—” bid/ask = no live quote
          </span>
        }
      />
    </div>
  );
}
