"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";

import { Change, ErrorState, Flash, Loading, SourceFooter, TD, TH, retryTerminal } from "@/components/terminal/widget-kit";
import { fmtBig, fmtPct, fmtPrice, terminalApi } from "@/lib/terminal";

export default function WatchlistWidget({ activeSymbol, onSelect }: { activeSymbol: string; onSelect: (s: string) => void }) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lists = useQuery({ retry: retryTerminal, queryKey: ["terminal", "watchlists"], queryFn: terminalApi.watchlists });
  const list = lists.data?.[0];
  const symbols = list?.symbols ?? [];
  const quotes = useQuery({
    retry: retryTerminal,
    queryKey: ["terminal", "quotes", symbols.join(",")],
    queryFn: () => terminalApi.quotes(symbols),
    enabled: symbols.length > 0,
    refetchInterval: 15_000,
  });
  const save = useMutation({
    mutationFn: (next: string[]) => terminalApi.updateWatchlist(list!.id, { symbols: next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["terminal", "watchlists"] }),
    onError: (e) => setError(e instanceof Error ? e.message : "Could not save"),
  });

  if (lists.error) return <ErrorState error={lists.error} />;
  if (!lists.data) return <Loading />;
  const bySymbol = new Map((quotes.data?.data ?? []).map((q) => [q.symbol, q]));

  function add(e: React.FormEvent) {
    e.preventDefault();
    const s = input.trim().toUpperCase();
    setError(null);
    if (!s || symbols.includes(s)) return setInput("");
    save.mutate([...symbols, s]);
    setInput("");
  }

  return (
    <div className="flex h-full flex-col">
      <form onSubmit={add} className="flex gap-1 border-b border-white/[0.04] p-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add symbol"
          aria-label="Add symbol to watchlist"
          className="min-w-0 flex-1 rounded border border-white/[0.08] bg-black/30 px-2 py-1 font-mono text-[11px] uppercase outline-none focus:border-[#8E88C7]/60"
        />
        <button type="submit" className="rounded border border-white/[0.08] px-2 text-[#9A9DA8] hover:text-[#F5F5F7]" aria-label="Add">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </form>
      {error && <p className="px-2 py-1 text-[10px] text-[#F87171]">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-[#0B0D12]">
            <tr>
              <th className={TH}>Symbol</th>
              <th className={`${TH} text-right`}>Last</th>
              <th className={`${TH} text-right`}>Chg %</th>
              <th className={`${TH} text-right`}>Vol</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {symbols.map((s) => {
              const q = bySymbol.get(s);
              return (
                <tr
                  key={s}
                  onClick={() => onSelect(s)}
                  className={`cursor-pointer border-t border-white/[0.03] hover:bg-white/[0.03] ${s === activeSymbol ? "bg-[#8E88C7]/10" : ""}`}
                >
                  <td className={`${TD} font-semibold`}>{s}</td>
                  <td className={`${TD} text-right`}>
                    {q?.status === "unavailable" ? <span className="text-[#666A76]">n/a</span> : <Flash value={q?.last}>{fmtPrice(q?.last)}</Flash>}
                  </td>
                  <td className={`${TD} text-right`}>
                    <Change value={q?.change_pct}>{fmtPct(q?.change_pct)}</Change>
                  </td>
                  <td className={`${TD} text-right text-[#808495]`}>{fmtBig(q?.volume)}</td>
                  <td className="w-5 pr-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        save.mutate(symbols.filter((x) => x !== s));
                      }}
                      className="text-[#4B4F5C] hover:text-[#F87171]"
                      aria-label={`Remove ${s}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <SourceFooter env={quotes.data} />
    </div>
  );
}
