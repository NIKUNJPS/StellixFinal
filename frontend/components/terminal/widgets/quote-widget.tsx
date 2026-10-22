"use client";

import { useQuery } from "@tanstack/react-query";

import { Change, ErrorState, Flash, Loading, SourceFooter, retryTerminal } from "@/components/terminal/widget-kit";
import { fmtBig, fmtNum, fmtPct, fmtPrice, terminalApi } from "@/lib/terminal";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-white/[0.03] py-0.5">
      <span className="text-[10.5px] text-[#808495]">{label}</span>
      <span className="font-mono text-[11px] text-[#D4D5DB]">{children}</span>
    </div>
  );
}

export default function QuoteWidget({ symbol }: { symbol: string }) {
  const q = useQuery({ retry: retryTerminal, queryKey: ["terminal", "quote", symbol], queryFn: () => terminalApi.quote(symbol), refetchInterval: 30_000 });
  const sv = useQuery({ retry: retryTerminal, queryKey: ["terminal", "short", symbol], queryFn: () => terminalApi.shortVolume(symbol), staleTime: 3_600_000 });
  if (q.error) return <ErrorState error={q.error} />;
  if (!q.data) return <Loading />;
  const d = q.data!.data;
  const latestShort = sv.data?.data.sessions[0];
  const range52 =
    d.fifty_two_week_low != null && d.fifty_two_week_high != null && d.last != null && d.fifty_two_week_high > d.fifty_two_week_low
      ? ((d.last - d.fifty_two_week_low) / (d.fifty_two_week_high - d.fifty_two_week_low)) * 100
      : null;

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-2">
        <p className="truncate text-xs text-[#9A9DA8]">
          {d.name ?? d.symbol} · {d.exchange ?? "—"} · {d.currency ?? ""}
        </p>
        <div className="mt-1 flex items-baseline gap-2">
          <Flash value={d.last} className="text-2xl font-bold text-[#F5F5F7]">
            <span className="font-mono">{fmtPrice(d.last)}</span>
          </Flash>
          <Change value={d.change}>
            {d.change != null && d.change > 0 ? "+" : ""}
            {fmtPrice(d.change)} ({fmtPct(d.change_pct)})
          </Change>
        </div>
        {(d.sector || d.industry) && <p className="mt-0.5 text-[10px] text-[#666A76]">{[d.sector, d.industry].filter(Boolean).join(" · ")}</p>}
      </div>
      <div className="grid flex-1 grid-cols-1 gap-x-4 px-3 py-2 sm:grid-cols-2">
        <div>
          <Row label="Bid">{d.bid != null ? `${fmtPrice(d.bid)} × ${fmtBig(d.bid_size)}` : "no quote"}</Row>
          <Row label="Ask">{d.ask != null ? `${fmtPrice(d.ask)} × ${fmtBig(d.ask_size)}` : "no quote"}</Row>
          <Row label="Open">{fmtPrice(d.open)}</Row>
          <Row label="Day range">
            {fmtPrice(d.day_low)} – {fmtPrice(d.day_high)}
          </Row>
          <Row label="Prev close">{fmtPrice(d.previous_close)}</Row>
          <Row label="Volume">{fmtBig(d.volume)}</Row>
          <Row label="Avg volume">{fmtBig(d.average_volume)}</Row>
        </div>
        <div>
          {d.market_cap == null && d.total_assets != null ? (
            <Row label="Net assets (fund)">{fmtBig(d.total_assets)}</Row>
          ) : (
            <Row label="Market cap">{fmtBig(d.market_cap)}</Row>
          )}
          <Row label="P/E (ttm)">{fmtNum(d.pe_ratio)}</Row>
          <Row label="Fwd P/E">{fmtNum(d.forward_pe)}</Row>
          <Row label="EPS (ttm)">{fmtNum(d.eps)}</Row>
          <Row label="Div yield">{d.dividend_yield_pct != null ? `${fmtNum(d.dividend_yield_pct)}%` : "—"}</Row>
          <Row label="Beta">{fmtNum(d.beta)}</Row>
          <Row label="Shares out">{fmtBig(d.shares_outstanding)}</Row>
        </div>
        <div className="sm:col-span-2">
          <Row label="52-week range">
            {fmtPrice(d.fifty_two_week_low)} – {fmtPrice(d.fifty_two_week_high)}
          </Row>
          {range52 != null && (
            <div className="mt-1 h-1 rounded-full bg-white/[0.06]" aria-label={`${range52.toFixed(0)}% of the 52-week range`}>
              <div className="h-1 rounded-full bg-[#8E88C7]" style={{ width: `${Math.min(100, Math.max(0, range52))}%` }} />
            </div>
          )}
          <Row label="FINRA short vol (last session)">
            {latestShort ? `${fmtBig(latestShort.short_volume)} / ${fmtBig(latestShort.total_volume)} (${fmtNum(latestShort.short_ratio_pct, 1)}%)` : sv.isLoading ? "…" : "—"}
          </Row>
          {sv.data && sv.data.data.sessions.length > 1 && (
            <div className="mt-1 flex h-6 items-end gap-0.5" aria-label="Short-volume ratio, last sessions">
              {[...sv.data.data.sessions].reverse().map((s) => (
                <div
                  key={s.date}
                  title={`${s.date}: ${fmtNum(s.short_ratio_pct, 1)}% short`}
                  className="flex-1 rounded-sm bg-[#F87171]/50"
                  style={{ height: `${Math.max(4, s.short_ratio_pct ?? 0)}%` }}
                />
              ))}
            </div>
          )}
        </div>
        {d.summary && <p className="mt-2 line-clamp-4 text-[10.5px] leading-relaxed text-[#808495] sm:col-span-2">{d.summary}</p>}
      </div>
      <SourceFooter env={q.data} extra={latestShort ? <span>· short volume: FINRA Reg SHO</span> : null} />
    </div>
  );
}
