"use client";

import { useQuery } from "@tanstack/react-query";

import { Change, ErrorState, Loading, TD, retryTerminal } from "@/components/terminal/widget-kit";
import { fmtPct, fmtPrice, terminalApi } from "@/lib/terminal";

export default function RecapWidget({ onSelect }: { onSelect: (s: string) => void }) {
  const q = useQuery({ retry: retryTerminal, queryKey: ["terminal", "recap"], queryFn: terminalApi.recap, refetchInterval: 300_000 });
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <Loading />;
  const d = q.data!;
  const Movers = ({ title, rows }: { title: string; rows: typeof d.gainers }) => (
    <div>
      <p className="px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#666A76]">{title}</p>
      <table className="w-full">
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol} onClick={() => onSelect(r.symbol)} className="cursor-pointer hover:bg-white/[0.03]">
              <td className={`${TD} font-semibold`}>{r.symbol}</td>
              <td className={`${TD} text-right`}>{fmtPrice(r.last_price)}</td>
              <td className={`${TD} text-right`}>
                <Change value={r.change_pct}>{fmtPct(r.change_pct)}</Change>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <p className="px-3 py-2 text-[12px] leading-relaxed text-[#D4D5DB]">{d.summary}</p>
        <div className="grid grid-cols-2 gap-1">
          <Movers title="Top gainers" rows={d.gainers} />
          <Movers title="Top losers" rows={d.losers} />
        </div>
        {d.sectors.length > 0 && (
          <div className="px-2 py-1">
            <p className="py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#666A76]">Sectors</p>
            {d.sectors.map((s) => {
              const w = Math.min(100, Math.abs(s.change_pct) * 25);
              return (
                <div key={s.sector} className="flex items-center gap-2 py-0.5 text-[10.5px]">
                  <span className="w-40 truncate text-[#9A9DA8]">{s.sector}</span>
                  <div className="relative h-2 flex-1 rounded bg-white/[0.04]">
                    <div
                      className="absolute top-0 h-2 rounded"
                      style={{ width: `${w / 2}%`, left: s.change_pct >= 0 ? "50%" : `${50 - w / 2}%`, background: s.change_pct >= 0 ? "#34D399" : "#F87171" }}
                    />
                  </div>
                  <Change value={s.change_pct}>{fmtPct(s.change_pct)}</Change>
                </div>
              );
            })}
          </div>
        )}
        {d.headlines.length > 0 && (
          <div className="px-2 py-1">
            <p className="py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#666A76]">Headlines</p>
            {d.headlines.map((h) => (
              <a key={h.link} href={h.link} target="_blank" rel="noopener noreferrer nofollow" className="block py-0.5 text-[11px] text-[#D4D5DB] hover:text-[#F5F5F7]">
                {h.title} <span className="font-mono text-[9.5px] text-[#666A76]">· {h.publisher}</span>
              </a>
            ))}
          </div>
        )}
      </div>
      <footer className="border-t border-white/[0.05] px-2 py-1 font-mono text-[9.5px] text-[#666A76]">
        {d.summary_method} {d.universe_note}
      </footer>
    </div>
  );
}
