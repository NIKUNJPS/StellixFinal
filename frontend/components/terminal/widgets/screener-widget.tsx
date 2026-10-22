"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";

import { Change, ErrorState, Loading, TD, TH, retryTerminal } from "@/components/terminal/widget-kit";
import { fmtBig, fmtPct, fmtPrice, terminalApi, type ScreenerRow } from "@/lib/terminal";

type SortKey = "symbol" | "sector" | "last_price" | "change_pct" | "volume" | "market_cap";
const CAPS: { label: string; min: number; max: number }[] = [
  { label: "Any cap", min: 0, max: Infinity },
  { label: "Mega ≥ $200B", min: 200e9, max: Infinity },
  { label: "Large $10–200B", min: 10e9, max: 200e9 },
  { label: "Mid < $10B", min: 0, max: 10e9 },
];

export default function ScreenerWidget({ onSelect }: { onSelect: (s: string) => void }) {
  const q = useQuery({ retry: retryTerminal, queryKey: ["terminal", "screener"], queryFn: terminalApi.screener, refetchInterval: 120_000 });
  const [sector, setSector] = useState("All");
  const [cap, setCap] = useState(0);
  const [minChange, setMinChange] = useState("");
  const [minVolume, setMinVolume] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "market_cap", dir: -1 });

  const rows = useMemo(() => {
    const all = q.data?.rows ?? [];
    const c = CAPS[cap] ?? CAPS[0]!;
    const mc = minChange === "" ? null : Number(minChange);
    const mv = minVolume === "" ? null : Number(minVolume) * 1e6;
    return all
      .filter((r) => sector === "All" || r.sector === sector)
      .filter((r) => cap === 0 || (r.market_cap != null && r.market_cap >= c.min && r.market_cap < c.max))
      .filter((r) => mc == null || (r.change_pct != null && r.change_pct >= mc))
      .filter((r) => mv == null || (r.volume != null && r.volume >= mv))
      .sort((a, b) => {
        const av = a[sort.key] as number | string | null;
        const bv = b[sort.key] as number | string | null;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir;
      });
  }, [q.data, sector, cap, minChange, minVolume, sort]);

  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <Loading />;
  const sectors = ["All", ...Array.from(new Set(q.data!.rows.map((r) => r.sector))).sort()];

  const Header = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th className={`${TH} ${right ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : -1 }))}
        className="inline-flex items-center gap-0.5 hover:text-[#D4D5DB]"
      >
        {label}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />)}
      </button>
    </th>
  );
  const input = "rounded border border-white/[0.08] bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-[#D4D5DB] outline-none";

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.04] px-2 py-1">
        <select aria-label="Sector" value={sector} onChange={(e) => setSector(e.target.value)} className={input}>
          {sectors.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select aria-label="Market cap" value={cap} onChange={(e) => setCap(Number(e.target.value))} className={input}>
          {CAPS.map((c, i) => (
            <option key={c.label} value={i}>
              {c.label}
            </option>
          ))}
        </select>
        <input aria-label="Minimum % change" value={minChange} onChange={(e) => setMinChange(e.target.value)} placeholder="min chg %" inputMode="decimal" className={`${input} w-20`} />
        <input aria-label="Minimum volume, millions" value={minVolume} onChange={(e) => setMinVolume(e.target.value)} placeholder="min vol (M)" inputMode="decimal" className={`${input} w-20`} />
        <span className="ml-auto font-mono text-[10px] text-[#666A76]">
          {rows.length} / {q.data!.rows.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[560px]">
          <thead className="sticky top-0 bg-[#0B0D12]">
            <tr>
              <Header k="symbol" label="Symbol" />
              <Header k="sector" label="Sector" />
              <Header k="last_price" label="Last" right />
              <Header k="change_pct" label="Chg %" right />
              <Header k="volume" label="Volume" right />
              <Header k="market_cap" label="Mkt cap" right />
            </tr>
          </thead>
          <tbody>
            {rows.map((r: ScreenerRow) => (
              <tr key={r.symbol} onClick={() => onSelect(r.symbol)} className="cursor-pointer border-t border-white/[0.03] hover:bg-white/[0.03]">
                <td className={`${TD} font-semibold`} title={r.name}>
                  {r.symbol}
                </td>
                <td className={`${TD} truncate text-[#808495]`}>{r.sector}</td>
                <td className={`${TD} text-right`}>{r.status === "ok" ? fmtPrice(r.last_price) : "n/a"}</td>
                <td className={`${TD} text-right`}>
                  <Change value={r.change_pct}>{fmtPct(r.change_pct)}</Change>
                </td>
                <td className={`${TD} text-right text-[#808495]`}>{fmtBig(r.volume)}</td>
                <td className={`${TD} text-right`} title={r.shares_source ?? undefined}>
                  {fmtBig(r.market_cap)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="border-t border-white/[0.05] px-2 py-1 font-mono text-[9.5px] text-[#666A76]">
        {q.data!.universe_note} {q.data!.data_delay_note}. Market cap: {q.data!.market_cap_note ?? q.data!.market_cap_source}.
      </footer>
    </div>
  );
}
