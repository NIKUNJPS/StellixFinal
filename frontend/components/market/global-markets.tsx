"use client";

import { motion, type MotionValue, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Clock, Globe2, Move3d, WifiOff } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TiltSurface } from "@/components/dashboard/tilt-surface";
import { useClock } from "@/hooks/use-clock";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";
import { formatAge, getGlobalIndices, isQuoteFresh, type GlobalIndicesFeed, type IndexQuote } from "@/lib/market";

const UP = "#34D399";
const DOWN = "#F87171";
const FLAT = "#9A9DA8";

const numberFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function changeColor(change: number | null): string {
  if (change === null || change === 0) return FLAT;
  return change > 0 ? UP : DOWN;
}

function formatSession(date: string | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00Z`));
}

/* ------------------------------------------------------------------ cards -- */

const IndexCard = memo(function IndexCard({ quote, staleAfterSeconds }: { quote: IndexQuote; staleAfterSeconds: number }) {
  const now = useClock(); // only this card re-renders on each tick
  const fresh = isQuoteFresh(quote, staleAfterSeconds, now);
  const color = changeColor(quote.change);
  const Arrow = (quote.change ?? 0) >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <TiltSurface
      maxTilt={10}
      className="h-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/80 p-4 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]"
      testId={`market-card-${quote.symbol}`}
    >
      <div style={{ transform: "translateZ(24px)" }}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#F5F5F7]">{quote.name}</p>
            <p className="font-mono text-[10px] text-[#808495]">
              {quote.symbol} · {quote.region}
            </p>
          </div>
          {fresh && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }}
              aria-hidden
            />
          )}
        </div>

        {fresh ? (
          <>
            <p className="mt-3 font-mono text-2xl font-bold tracking-tight text-[#F5F5F7]" data-testid="market-value">
              {numberFormat.format(quote.last_price as number)}
            </p>
            <p className="mt-1 flex items-center gap-1 font-mono text-xs font-semibold" style={{ color }} data-testid="market-change">
              <Arrow className="h-3.5 w-3.5" />
              {(quote.change as number) >= 0 ? "+" : ""}
              {numberFormat.format(quote.change as number)} ({(quote.change_pct as number) >= 0 ? "+" : ""}
              {(quote.change_pct as number).toFixed(2)}%)
            </p>
            <p className="mt-2 flex items-center gap-1 font-mono text-[10px] text-[#808495]" data-testid="market-updated">
              <Clock className="h-3 w-3" />
              updated {formatAge(quote.fetched_at, now)}
              {quote.session_date && ` · session ${formatSession(quote.session_date)}`}
            </p>
          </>
        ) : (
          <div className="mt-3" data-testid="market-unavailable">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-[#9A9DA8]">
              <WifiOff className="h-4 w-4" /> Data unavailable
            </p>
            <p className="mt-1 line-clamp-2 text-[11px] text-[#666A76]">
              {quote.status === "ok"
                ? `Last refresh ${formatAge(quote.fetched_at, now)} is older than the ${Math.round(staleAfterSeconds / 60)}-minute freshness limit`
                : quote.unavailable_reason ?? "No recent quote"}
            </p>
          </div>
        )}
      </div>
    </TiltSurface>
  );
});

/* ------------------------------------------------------------- 3D skyline -- */

const BAR_W = 26;
const BAR_D = 26;
const GAP = 16;
const MAX_H = 120;

const SkylineColumn = memo(function SkylineColumn({
  quote,
  index,
  count,
  scale,
  fresh,
  labelRotateX,
  labelRotateZ,
}: {
  quote: IndexQuote;
  index: number;
  count: number;
  scale: number;
  fresh: boolean;
  labelRotateX: MotionValue<number>;
  labelRotateZ: MotionValue<number>;
}) {
  const [hover, setHover] = useState(false);
  const pct = fresh ? (quote.change_pct ?? 0) : 0;
  const height = fresh ? Math.max(4, Math.abs(pct) * scale) : 2;
  const sign = pct >= 0 ? 1 : -1;
  const color = fresh ? (pct >= 0 ? UP : DOWN) : "#3A3D46";
  const x = (index - (count - 1) / 2) * (BAR_W + GAP) - BAR_W / 2;
  const alpha = hover ? "FF" : "CC";

  return (
    <div
      className="absolute left-1/2 top-1/2"
      style={{ transformStyle: "preserve-3d", transform: `translate3d(${x}px, ${-BAR_D / 2}px, 0)` }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      {/* top (or bottom, for a falling index) */}
      <div
        className="absolute left-0 top-0"
        style={{
          width: BAR_W,
          height: BAR_D,
          background: `${color}${alpha}`,
          transform: `translateZ(${sign * height}px)`,
          boxShadow: hover ? `0 0 24px ${color}` : undefined,
        }}
      />
      {/* front face */}
      <div
        className="absolute left-0 top-0"
        style={{
          width: BAR_W,
          height,
          background: `linear-gradient(${sign > 0 ? "0deg" : "180deg"}, ${color}55, ${color}${alpha})`,
          transformOrigin: "0 0",
          transform: `translateY(${BAR_D}px) rotateX(${sign * 90}deg)`,
        }}
      />
      {/* side face */}
      <div
        className="absolute left-0 top-0"
        style={{
          width: height,
          height: BAR_D,
          background: `${color}77`,
          transformOrigin: "0 0",
          transform: `translateX(${BAR_W}px) rotateY(${-sign * 90}deg)`,
        }}
      />
      {/* billboard label: counter-rotated so it always faces the viewer */}
      <motion.div
        className="pointer-events-none absolute left-0 top-0 whitespace-nowrap text-center font-mono"
        style={{
          width: BAR_W,
          z: sign > 0 ? height + 14 : 14,
          rotateZ: labelRotateZ,
          rotateX: labelRotateX,
        }}
      >
        <span className={`block text-[9px] ${hover ? "text-[#F5F5F7]" : "text-[#9A9DA8]"}`}>
          {quote.symbol.replace("^", "")}
        </span>
        <span className="block text-[9px] font-semibold" style={{ color: fresh ? color : "#666A76" }}>
          {fresh ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "n/a"}
        </span>
      </motion.div>
    </div>
  );
});

const MarketSkyline = memo(function MarketSkyline({
  quotes,
  staleAfterSeconds,
}: {
  quotes: IndexQuote[];
  staleAfterSeconds: number;
}) {
  const now = useClock();
  const tiltRaw = useMotionValue(58);
  const spinRaw = useMotionValue(-24);
  const tilt = useSpring(tiltRaw, { stiffness: 120, damping: 20 });
  const spin = useSpring(spinRaw, { stiffness: 120, damping: 20 });
  const labelRotateZ = useTransform(spin, (v) => -v);
  const labelRotateX = useTransform(tilt, (v) => -v);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const freshness = quotes.map((q) => isQuoteFresh(q, staleAfterSeconds, now));
  const maxPct = Math.max(0.25, ...quotes.map((q, i) => (freshness[i] ? Math.abs(q.change_pct ?? 0) : 0)));
  const scale = MAX_H / maxPct;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.current) return;
      spinRaw.set(spinRaw.get() + (e.clientX - drag.current.x) * 0.4);
      tiltRaw.set(Math.min(75, Math.max(25, tiltRaw.get() - (e.clientY - drag.current.y) * 0.3)));
      drag.current = { x: e.clientX, y: e.clientY };
    },
    [spinRaw, tiltRaw],
  );
  const endDrag = useCallback(() => {
    drag.current = null;
  }, []);

  return (
    <div
      className="relative h-full min-h-[300px] cursor-grab touch-none select-none overflow-hidden rounded-2xl border border-white/[0.08] bg-[radial-gradient(ellipse_at_center,rgba(92,86,142,0.18),rgba(7,8,11,0.95)_70%)] active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => {
        tiltRaw.set(58);
        spinRaw.set(-24);
      }}
      role="img"
      aria-label="3D chart of today's percentage change for each global index"
      data-testid="market-skyline"
    >
      <p className="absolute left-4 top-3 z-10 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#808495]">
        <Move3d className="h-3.5 w-3.5 text-[#8E88C7]" /> Day change skyline · drag to rotate
      </p>
      <div className="absolute inset-0 [perspective:900px]">
        <motion.div
          className="absolute left-1/2 top-[58%] h-0 w-0"
          style={{ transformStyle: "preserve-3d", rotateX: tilt, rotateZ: spin }}
        >
          {/* floor grid */}
          <div
            className="absolute"
            style={{
              width: 480,
              height: 220,
              left: -240,
              top: -110,
              backgroundImage:
                "linear-gradient(rgba(142,136,199,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(142,136,199,0.18) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
              backgroundColor: "rgba(20,22,30,0.35)",
              border: "1px solid rgba(142,136,199,0.25)",
            }}
          />
          {quotes.map((quote, i) => (
            <SkylineColumn
              key={quote.symbol}
              quote={quote}
              index={i}
              count={quotes.length}
              scale={scale}
              fresh={freshness[i] ?? false}
              labelRotateX={labelRotateX}
              labelRotateZ={labelRotateZ}
            />
          ))}
        </motion.div>
      </div>
    </div>
  );
});

/* ----------------------------------------------------------------- widget -- */

/**
 * Batch 25: global index quotes on the dashboard.
 *
 * Honesty: the copy says "delayed" and shows when each quote was last refreshed and
 * which exchange session it belongs to — never "LIVE". Cards update in place from the
 * existing realtime socket (`market_quotes` events on the bridge's global scope), and
 * a card whose data goes stale flips to "Data unavailable" on its own even if no
 * further events arrive.
 */
export function GlobalMarkets() {
  const [feed, setFeed] = useState<GlobalIndicesFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { subscribe, connected } = useWebSocket();

  useEffect(() => {
    let active = true;
    getGlobalIndices()
      .then((data) => active && setFeed(data))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Market data unavailable"));
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      subscribe("market_quotes", (event: WSEvent) => {
        const quotes = event.quotes as IndexQuote[] | undefined;
        if (!Array.isArray(quotes)) return;
        setError(null);
        setFeed((prev) => ({
          provider: String(event.provider ?? prev?.provider ?? ""),
          is_realtime: Boolean(event.is_realtime),
          refresh_interval_seconds: Number(event.refresh_interval_seconds ?? prev?.refresh_interval_seconds ?? 120),
          stale_after_seconds: Number(event.stale_after_seconds ?? prev?.stale_after_seconds ?? 900),
          data_delay_note: String(event.data_delay_note ?? prev?.data_delay_note ?? ""),
          generated_at: String(event.timestamp ?? new Date().toISOString()),
          quotes,
        }));
      }),
    [subscribe],
  );

  const quotes = feed?.quotes ?? [];
  const intervalText = useMemo(() => {
    if (!feed) return "";
    const s = feed.refresh_interval_seconds;
    return s % 60 === 0 ? `every ${s / 60} min` : `every ${s}s`;
  }, [feed]);

  return (
    <section className="mb-8" data-testid="global-markets" aria-labelledby="global-markets-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#808495]">
            <Globe2 className="h-3.5 w-3.5 text-[#38BDF8]" /> Global Markets
          </p>
          <h2 id="global-markets-title" className="mt-1 text-lg font-bold tracking-tight text-[#F5F5F7]">
            Major indices
          </h2>
        </div>
        {feed && (
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]" data-testid="market-feed-note">
            <span className="rounded-lg border border-[#FBBF24]/30 bg-[#FBBF24]/10 px-2.5 py-1 text-[#FBBF24]">
              {feed.is_realtime ? "Real-time" : "Delayed"} · refreshed {intervalText}
            </span>
            <span className="rounded-lg border border-white/[0.08] bg-[#0F1117]/80 px-2.5 py-1 text-[#9A9DA8]">
              {feed.data_delay_note} · source: {feed.provider}
            </span>
            <span
              className={`rounded-lg border px-2.5 py-1 ${
                connected ? "border-[#34D399]/30 text-[#34D399]" : "border-white/[0.08] text-[#808495]"
              }`}
              title={connected ? "New quotes arrive over your realtime connection" : "Realtime connection offline — reload for newer quotes"}
            >
              {connected ? "push updates on" : "push updates off"}
            </span>
          </div>
        )}
      </div>

      {error && !feed && (
        <p className="rounded-2xl border border-[#F87171]/25 bg-[#F87171]/[0.08] p-4 text-xs text-[#F87171]">{error}</p>
      )}

      {!feed && !error ? (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-[132px] animate-pulse rounded-2xl border border-white/[0.06] bg-[#0F1117]/70" />
            ))}
          </div>
          <div className="h-[300px] animate-pulse rounded-2xl border border-white/[0.06] bg-[#0F1117]/70 lg:col-span-2" />
        </div>
      ) : (
        feed && (
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 lg:col-span-3">
              {quotes.map((quote) => (
                <IndexCard key={quote.symbol} quote={quote} staleAfterSeconds={feed.stale_after_seconds} />
              ))}
            </div>
            <div className="lg:col-span-2">
              <MarketSkyline quotes={quotes} staleAfterSeconds={feed.stale_after_seconds} />
            </div>
          </div>
        )
      )}
    </section>
  );
}

export default GlobalMarkets;
