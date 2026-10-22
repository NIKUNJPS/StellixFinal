"use client";

import { useQuery } from "@tanstack/react-query";

import { Change, ErrorState, Flash, Loading, SourceFooter, TD, retryTerminal } from "@/components/terminal/widget-kit";
import { getMacroDashboard } from "@/lib/market-research";
import { fmtNum, fmtPct, fmtPrice, terminalApi } from "@/lib/terminal";

export default function MacroWidget({ onSelect }: { onSelect: (s: string) => void }) {
  const q = useQuery({ retry: retryTerminal, queryKey: ["terminal", "macro"], queryFn: terminalApi.macro, refetchInterval: 60_000 });
  // The Batch 28 FRED feed (yield curve, VIX): reused, not re-fetched a second way.
  const fred = useQuery({ retry: retryTerminal, queryKey: ["terminal", "fred-macro"], queryFn: getMacroDashboard, refetchInterval: 3_600_000 });
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <Loading />;
  const d = q.data!.data;
  const groups = Array.from(new Set(d.proxies.map((p) => p.group)));
  const curve = (fred.data?.series ?? []).filter((s) => s.group === "yield_curve");

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        {groups.map((g) => (
          <div key={g}>
            <p className="bg-white/[0.02] px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#666A76]">{g}</p>
            <table className="w-full">
              <tbody>
                {d.proxies
                  .filter((p) => p.group === g)
                  .map((p) => (
                    <tr key={p.symbol} onClick={() => onSelect(p.symbol)} className="cursor-pointer border-t border-white/[0.03] hover:bg-white/[0.03]">
                      <td className={TD}>{p.label}</td>
                      <td className={`${TD} text-right`}>{p.status === "ok" ? <Flash value={p.last}>{fmtPrice(p.last)}</Flash> : "n/a"}</td>
                      <td className={`${TD} w-20 text-right`}>
                        <Change value={p.change_pct}>{fmtPct(p.change_pct)}</Change>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
        <p className="bg-white/[0.02] px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#666A76]">ECB (official)</p>
        <table className="w-full">
          <tbody>
            {d.ecb.map((e) => (
              <tr key={e.key} className="border-t border-white/[0.03]">
                <td className={TD}>{e.label}</td>
                <td className={`${TD} text-right`}>{e.value == null ? <span title={e.error}>n/a</span> : `${fmtNum(e.value, 3)}%`}</td>
                <td className={`${TD} w-20 text-right text-[#666A76]`}>{e.date ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="bg-white/[0.02] px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#666A76]">US Treasury curve (FRED)</p>
        {fred.data && !fred.data.configured ? (
          <p className="px-2 py-1 text-[10px] text-[#FBBF24]">Not configured — set FRED_API_KEY.</p>
        ) : curve.length === 0 ? (
          <p className="px-2 py-1 text-[10px] text-[#666A76]">{fred.isLoading ? "Loading…" : "No data yet."}</p>
        ) : (
          <div className="flex items-end gap-1 px-2 py-1" aria-label="Treasury yield curve">
            {curve.map((s) => (
              <div key={s.series_id} className="flex flex-1 flex-col items-center" title={`${s.label}: ${fmtNum(s.latest_value, 2)}% (${s.latest_date ?? "n/a"})`}>
                <span className="font-mono text-[9px] text-[#D4D5DB]">{fmtNum(s.latest_value, 2)}</span>
                <div className="w-full rounded-sm bg-[#38BDF8]/50" style={{ height: `${Math.max(2, (s.latest_value ?? 0) * 8)}px` }} />
                <span className="font-mono text-[8.5px] text-[#666A76]">{s.label.replace(/Treasury|Constant|Maturity|yield/gi, "").trim()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <SourceFooter env={q.data} />
    </div>
  );
}
