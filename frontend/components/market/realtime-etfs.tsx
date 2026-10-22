"use client";

import { ArrowDownRight, ArrowUpRight, KeyRound, Radio, WifiOff } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

import { useClock } from "@/hooks/use-clock";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";
import { formatAge, getRealtimeEtfs, type RealtimeEtf, type RealtimeEtfFeed } from "@/lib/market";

const UP = "#34D399";
const DOWN = "#F87171";
const FLAT = "#9A9DA8";
// The streamer only pushes when a trade happens, so silence can't tell "stream died"
// from "quiet market". Re-read the heartbeat-backed status on this interval.
const STATUS_POLL_MS = 15_000;
// A trade older than this is labelled as such rather than presented as the live price.
const QUIET_AFTER_MS = 120_000;

const priceFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function changeColor(change: number | null): string {
  if (change === null || change === 0) return FLAT;
  return change > 0 ? UP : DOWN;
}

const EtfCard = memo(function EtfCard({ etf, live }: { etf: RealtimeEtf; live: boolean }) {
  const now = useClock();
  const previous = useRef(etf.last_price);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = etf.last_price;
    if (before === null || etf.last_price === null || before === etf.last_price) return;
    setFlash(etf.last_price > before ? "up" : "down");
    const timer = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(timer);
  }, [etf.last_price]);

  const color = changeColor(etf.change);
  const Arrow = (etf.change ?? 0) >= 0 ? ArrowUpRight : ArrowDownRight;
  const tradeAge = etf.last_trade_at ? now - new Date(etf.last_trade_at).getTime() : null;
  const quiet = tradeAge !== null && tradeAge > QUIET_AFTER_MS;

  return (
    <div
      className="rounded-2xl border bg-[#0D0F14]/80 p-4 transition-colors duration-700"
      style={{
        borderColor: flash === "up" ? `${UP}99` : flash === "down" ? `${DOWN}99` : "rgba(255,255,255,0.08)",
        backgroundColor: flash === "up" ? "rgba(52,211,153,0.10)" : flash === "down" ? "rgba(248,113,113,0.10)" : undefined,
      }}
      data-testid={`etf-card-${etf.symbol}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-base font-bold text-[#F5F5F7]">{etf.symbol}</p>
          <p className="truncate text-[11px] text-[#9A9DA8]" title={etf.name}>
            ETF · tracks {etf.tracks}
          </p>
        </div>
        {live && !quiet && etf.status === "ok" && (
          <span className="relative mt-1 flex h-2 w-2" aria-label="streaming">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#34D399] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#34D399]" />
          </span>
        )}
      </div>

      {etf.status === "ok" && etf.last_price !== null ? (
        <>
          <p className="mt-3 font-mono text-2xl font-bold tracking-tight text-[#F5F5F7]" data-testid="etf-price">
            {priceFormat.format(etf.last_price)}
          </p>
          {etf.change !== null && etf.change_pct !== null ? (
            <p className="mt-1 flex items-center gap-1 font-mono text-xs font-semibold" style={{ color }}>
              <Arrow className="h-3.5 w-3.5" />
              {etf.change >= 0 ? "+" : ""}
              {priceFormat.format(etf.change)} ({etf.change_pct >= 0 ? "+" : ""}
              {etf.change_pct.toFixed(2)}%)
            </p>
          ) : (
            <p className="mt-1 font-mono text-xs text-[#808495]">no previous close yet</p>
          )}
          <p className="mt-2 font-mono text-[10px] text-[#808495]" data-testid="etf-trade-age">
            last trade {formatAge(etf.last_trade_at, now)}
            {quiet && <span className="text-[#FBBF24]"> · no recent trades (market may be closed)</span>}
          </p>
        </>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#9A9DA8]">
          <WifiOff className="h-3.5 w-3.5" /> {etf.unavailable_reason ?? "No trade received yet"}
        </p>
      )}
    </div>
  );
});

export function RealtimeEtfs() {
  const [feed, setFeed] = useState<RealtimeEtfFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    let active = true;
    const load = () =>
      getRealtimeEtfs()
        .then((data) => {
          if (!active) return;
          setError(null);
          setFeed(data);
        })
        .catch((e) => active && setError(e instanceof Error ? e.message : "Real-time prices unavailable"));
    load();
    const timer = setInterval(load, STATUS_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(
    () =>
      subscribe("etf_ticks", (event: WSEvent) => {
        const etfs = event.etfs as RealtimeEtf[] | undefined;
        if (!Array.isArray(etfs)) return;
        setFeed((prev) => ({
          configured: true,
          stream_online: Boolean(event.stream_online),
          provider: String(event.provider ?? prev?.provider ?? ""),
          data_note: String(event.data_note ?? prev?.data_note ?? ""),
          generated_at: String(event.timestamp ?? new Date().toISOString()),
          etfs,
        }));
      }),
    [subscribe],
  );

  if (!feed) {
    return error ? (
      <section className="mb-8">
        <p className="rounded-2xl border border-[#F87171]/25 bg-[#F87171]/[0.08] p-4 text-xs text-[#F87171]">{error}</p>
      </section>
    ) : null;
  }

  const live = feed.configured && feed.stream_online;

  return (
    <section className="mb-8" data-testid="realtime-etfs" aria-labelledby="realtime-etfs-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#808495]">
            <Radio className="h-3.5 w-3.5 text-[#34D399]" /> Real-time
          </p>
          <h2 id="realtime-etfs-title" className="mt-1 text-lg font-bold tracking-tight text-[#F5F5F7]">
            US index ETFs
          </h2>
        </div>
        {feed.configured && (
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]" data-testid="etf-feed-note">
            <span
              className={`rounded-lg border px-2.5 py-1 ${
                live
                  ? "border-[#34D399]/30 bg-[#34D399]/10 text-[#34D399]"
                  : "border-[#FBBF24]/30 bg-[#FBBF24]/10 text-[#FBBF24]"
              }`}
              data-testid="etf-stream-status"
            >
              {live ? "Streaming · real-time trades" : "Stream offline · showing last trades received"}
            </span>
            <span className="rounded-lg border border-white/[0.08] bg-[#0F1117]/80 px-2.5 py-1 text-[#9A9DA8]">
              {feed.data_note} · source: {feed.provider}
            </span>
          </div>
        )}
      </div>

      {feed.configured ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {feed.etfs.map((etf) => (
            <EtfCard key={etf.symbol} etf={etf} live={live} />
          ))}
        </div>
      ) : (
        <div
          className="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-[#0D0F14]/80 p-4"
          data-testid="etf-not-configured"
        >
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#FBBF24]" />
          <div>
            <p className="text-sm font-semibold text-[#F5F5F7]">Real-time stream not configured</p>
            <p className="mt-1 text-xs leading-relaxed text-[#9A9DA8]">
              Real-time US ETF prices need a free Alpaca market-data key. An administrator adds{" "}
              <span className="font-mono">ALPACA_API_KEY_ID</span> and{" "}
              <span className="font-mono">ALPACA_API_SECRET_KEY</span> to the backend and starts the streamer. Until
              then, the delayed index quotes below are the only market prices shown.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export default RealtimeEtfs;
