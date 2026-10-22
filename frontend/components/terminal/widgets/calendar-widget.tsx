"use client";

import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";

import { Change, ErrorState, Loading, Segmented, SourceFooter, TD, TH, retryTerminal } from "@/components/terminal/widget-kit";
import { fmtBig, fmtNum, fmtPct, terminalApi, type EconEvent } from "@/lib/terminal";

function changeText(e: EconEvent): string {
  if (e.change == null) return "";
  return e.change_kind === "pct_change" ? fmtPct(e.change) : `${e.change > 0 ? "+" : ""}${fmtNum(e.change, 1)}`;
}

function Economic() {
  const q = useQuery({ retry: retryTerminal, queryKey: ["terminal", "econ"], queryFn: terminalApi.econCalendar, staleTime: 3_600_000 });
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <Loading />;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-[#0B0D12]">
            <tr>
              <th className={TH}>Date</th>
              <th className={TH}>Release</th>
              <th className={`${TH} text-right`}>Latest</th>
              <th className={`${TH} text-right`}>Prior</th>
              <th className={`${TH} text-right`}>Chg</th>
            </tr>
          </thead>
          <tbody>
            {q.data!.data.map((e) => (
              <tr key={`${e.release_id}-${e.date}`} className={`border-t border-white/[0.03] ${e.date === today ? "bg-[#FBBF24]/10" : e.upcoming ? "" : "opacity-60"}`}>
                <td className={TD}>{e.date}</td>
                <td className={`${TD} max-w-[180px] truncate`} title={e.name}>
                  {e.link ? (
                    <a href={e.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {e.name}
                    </a>
                  ) : (
                    e.name
                  )}
                </td>
                <td className={`${TD} text-right`} title={e.latest_period ? `period ${e.latest_period}` : undefined}>
                  {fmtNum(e.latest_value)}
                </td>
                <td className={`${TD} text-right text-[#808495]`}>{fmtNum(e.prior_value)}</td>
                <td className={`${TD} text-right`}>
                  <Change value={e.change}>{changeText(e)}</Change>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SourceFooter env={q.data} extra={<span>· no consensus forecasts: no official free source</span>} />
    </div>
  );
}

function Earnings({ symbols, onSelect }: { symbols: string[]; onSelect: (s: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    retry: retryTerminal,
    queryKey: ["terminal", "earn", symbols.join(",")],
    queryFn: () => terminalApi.earningsCalendar(symbols),
    enabled: symbols.length > 0,
    staleTime: 3_600_000,
  });
  const hist = useQuery({ retry: retryTerminal, queryKey: ["terminal", "earn-hist", open], queryFn: () => terminalApi.earningsHistory(open!), enabled: !!open });
  if (symbols.length === 0) return <p className="p-3 text-xs text-[#808495]">Add symbols to your watchlist to see their earnings.</p>;
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <Loading />;
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-[#0B0D12]">
            <tr>
              <th className={TH}>Symbol</th>
              <th className={TH}>Next report</th>
              <th className={`${TH} text-right`}>EPS est.</th>
              <th className={`${TH} text-right`}>Range</th>
              <th className={`${TH} text-right`}>Rev est.</th>
            </tr>
          </thead>
          <tbody>
            {q.data!.data.map((r) => (
              <Fragment key={r.symbol}>
                <tr
                  onClick={() => setOpen(open === r.symbol ? null : r.symbol)}
                  onDoubleClick={() => onSelect(r.symbol)}
                  className="cursor-pointer border-t border-white/[0.03] hover:bg-white/[0.03]"
                  title="Click for history · double-click to focus"
                >
                  <td className={`${TD} font-semibold`}>{r.symbol}</td>
                  <td className={TD}>{r.next_date ?? "—"}</td>
                  <td className={`${TD} text-right`}>{fmtNum(r.eps_estimate)}</td>
                  <td className={`${TD} text-right text-[#808495]`}>{r.eps_low != null ? `${fmtNum(r.eps_low)}–${fmtNum(r.eps_high)}` : "—"}</td>
                  <td className={`${TD} text-right text-[#808495]`}>{fmtBig(r.revenue_estimate)}</td>
                </tr>
                {open === r.symbol && (
                  <tr>
                    <td colSpan={5} className="bg-white/[0.02] px-2 py-1">
                      {hist.error ? (
                        <ErrorState error={hist.error} />
                      ) : !hist.data ? (
                        <Loading />
                      ) : (
                        <table className="w-full">
                          <thead>
                            <tr>
                              <th className={TH}>Reported</th>
                              <th className={`${TH} text-right`}>Est.</th>
                              <th className={`${TH} text-right`}>Actual</th>
                              <th className={`${TH} text-right`}>Surprise</th>
                              <th className={`${TH} text-right`}>Next session</th>
                            </tr>
                          </thead>
                          <tbody>
                            {hist.data!.data.map((h) => (
                              <tr key={h.date}>
                                <td className={TD}>{h.date.slice(0, 10)}</td>
                                <td className={`${TD} text-right`}>{fmtNum(h.eps_estimate)}</td>
                                <td className={`${TD} text-right`}>{fmtNum(h.eps_actual)}</td>
                                <td className={`${TD} text-right`}>
                                  <Change value={h.surprise_pct}>{fmtPct(h.surprise_pct)}</Change>
                                </td>
                                <td className={`${TD} text-right`}>
                                  <Change value={h.next_session_move_pct}>{fmtPct(h.next_session_move_pct)}</Change>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <SourceFooter env={q.data} />
    </div>
  );
}

export default function CalendarWidget({ watchlist, onSelect }: { watchlist: string[]; onSelect: (s: string) => void }) {
  const [tab, setTab] = useState<"Economic" | "Earnings">("Economic");
  const equities = watchlist.filter((s) => !s.includes("-USD") && !s.startsWith("^") && !s.includes("="));
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/[0.04] px-2 py-1">
        <Segmented label="Calendar" options={["Economic", "Earnings"] as const} value={tab} onChange={setTab} />
      </div>
      <div className="min-h-0 flex-1">{tab === "Economic" ? <Economic /> : <Earnings symbols={equities} onSelect={onSelect} />}</div>
    </div>
  );
}
