"use client";

import { ArrowRight, Clock, Minus, Signal as SignalIcon, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { useClock } from "@/hooks/use-clock";
import { useCan, usePermissionsLoaded, useSystemRoleKey } from "@/hooks/use-permissions";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";
import { formatAge } from "@/lib/market";
import { getSignals } from "@/lib/signals";
import type { SignalItem, SignalType } from "@/lib/signal-types";

/* -------------------------------------------------------------------------- */
/*                                  STYLES                                    */
/* -------------------------------------------------------------------------- */

const SIGNAL_STYLE: Record<SignalType, { color: string; bg: string; border: string; Icon: typeof TrendingUp }> = {
  BUY: { color: "#34D399", bg: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.28)", Icon: TrendingUp },
  SELL: { color: "#F87171", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.28)", Icon: TrendingDown },
  HOLD: { color: "#FBBF24", bg: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.28)", Icon: Minus },
};

/** Approval queue lives at a different path per system role; a custom role or a
 * research-only role (Researcher, Quant Engineer) has no approval authority, so no
 * link is offered for them. */
function approvalQueueHref(roleKey: string | null): string | null {
  switch (roleKey) {
    case "risk_manager":
      return "/risk-manager/governance";
    case "cio":
      return "/cio/governance";
    case "compliance_officer":
      return "/compliance/governance";
    case "admin":
      return "/admin/governance";
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                               SIGNAL CARD                                  */
/* -------------------------------------------------------------------------- */

function SignalCard({ item, highlighted }: { item: SignalItem; highlighted: boolean }) {
  const now = useClock();

  if (!item.signal_type) {
    return (
      <Card className="rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#F5F5F7]">{item.strategy_name}</p>
              <p className="mt-0.5 font-mono text-[10px] text-[#808495]">{item.symbol ?? "no symbol"}</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-[#9A9DA8]">{item.unavailable_reason ?? "Signal not yet available."}</p>
        </CardContent>
      </Card>
    );
  }

  const style = SIGNAL_STYLE[item.signal_type];
  const Icon = style.Icon;

  return (
    <Card
      className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl transition-shadow duration-700"
      style={
        highlighted
          ? { boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.08), 0 0 0 1px ${style.color}, 0 0 24px ${style.color}55` }
          : { boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.08)" }
      }
      data-testid={`signal-card-${item.strategy_id}`}
    >
      <div
        className="pointer-events-none absolute -top-16 left-1/2 h-24 w-3/4 -translate-x-1/2 rounded-full opacity-20 blur-2xl"
        style={{ backgroundColor: style.color }}
      />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#F5F5F7]">{item.strategy_name}</p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#808495]">{item.symbol}</p>
          </div>
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: style.bg, color: style.color, border: `1px solid ${style.border}` }}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>

        <div className="mt-4 flex items-baseline gap-2">
          <span
            className="rounded-lg border px-2.5 py-1 font-mono text-lg font-bold tracking-tight"
            style={{ color: style.color, borderColor: style.border, backgroundColor: style.bg }}
            data-testid="signal-type"
          >
            {item.signal_type}
          </span>
          {item.regime_at_signal && (
            <span className="font-mono text-[11px] text-[#9A9DA8]">in {item.regime_at_signal}</span>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#666A76]">Validated robustness score</p>
            <p className="mt-0.5 font-mono text-sm font-semibold text-[#F5F5F7]">
              {item.robustness_score != null ? item.robustness_score.toFixed(3) : "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="flex items-center justify-end gap-1 font-mono text-[10px] text-[#808495]">
              <Clock className="h-3 w-3" />
              {item.last_evaluated_at ? formatAge(item.last_evaluated_at, now) : "never"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*                                MAIN PAGE                                   */
/* -------------------------------------------------------------------------- */

function SignalsPageContent() {
  const [items, setItems] = useState<SignalItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const { subscribe, connected } = useWebSocket();
  const roleKey = useSystemRoleKey();
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let active = true;
    getSignals()
      .then((data) => active && setItems(data.items))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Failed to load signals"));
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      subscribe("strategy_signal", (event: WSEvent) => {
        const strategyId = String(event.strategy_id ?? "");
        const signalType = event.signal_type as SignalType | undefined;
        if (!strategyId || !signalType) return;
        setItems((prev) => {
          if (!prev) return prev;
          const idx = prev.findIndex((i) => i.strategy_id === strategyId);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = {
            ...next[idx]!,
            signal_type: signalType,
            regime_at_signal: (event.regime as string | null) ?? next[idx]!.regime_at_signal,
            robustness_score:
              typeof event.robustness_score === "number" ? event.robustness_score : next[idx]!.robustness_score,
            evaluated_at: String(event.timestamp ?? new Date().toISOString()),
            last_evaluated_at: String(event.timestamp ?? new Date().toISOString()),
          };
          return next;
        });
        setHighlightedId(strategyId);
        clearTimeout(highlightTimer.current);
        highlightTimer.current = setTimeout(() => setHighlightedId(null), 2500);
      }),
    [subscribe],
  );

  useEffect(() => () => clearTimeout(highlightTimer.current), []);

  const approvalHref = useMemo(() => approvalQueueHref(roleKey), [roleKey]);

  return (
    <div className="relative min-h-full bg-[#07080B] px-1 py-1 text-[#F5F5F7]">
      <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-[#5C568E]/10 blur-[120px]" />
      <div className="pointer-events-none absolute top-40 right-10 h-72 w-72 rounded-full bg-[#38BDF8]/5 blur-[100px]" />

      {error && (
        <div className="mb-6 rounded-2xl border border-[#F87171]/25 bg-[#F87171]/10 p-4 text-xs font-medium text-[#F87171] backdrop-blur-md">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8E88C7] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8E88C7]" />
            </span>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#808495]">
              Research Signals • Research Mode
            </p>
          </div>
          <h1 className="mt-1.5 flex items-center gap-2 text-3xl font-extrabold tracking-tight text-[#F5F5F7]">
            <SignalIcon className="h-7 w-7 text-[#8E88C7]" /> Signals
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-[#9A9DA8]">
            Buy/Sell/Hold, derived deterministically from your organization&apos;s own validated strategy rules.
          </p>
        </div>

        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-2 font-mono text-xs font-semibold backdrop-blur-md ${
            connected ? "border-[#34D399]/30 text-[#34D399]" : "border-white/[0.08] text-[#808495]"
          }`}
          style={{ boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.08)" }}
          title={connected ? "New signals arrive over your realtime connection" : "Realtime connection offline — reload for newer signals"}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-[#34D399]" : "bg-[#666A76]"}`} />
          {connected ? "push updates on" : "push updates off"}
        </div>
      </div>

      {/* Loading */}
      {items === null && !error && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[180px] animate-pulse rounded-2xl border border-white/[0.06] bg-[#0F1117]/70" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {items !== null && items.length === 0 && (
        <Card className="rounded-2xl border border-white/[0.08] bg-[#0D0F14]/70 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl">
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-[#808495]">
              <SignalIcon className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-[#F5F5F7]">No strategies have cleared activation yet</p>
            <p className="max-w-md text-xs text-[#9A9DA8]">
              Signals only appear for strategies that have passed the full validation suite and been approved through
              governance. Once one clears that bar, its Buy/Sell/Hold signal shows up here automatically.
            </p>
            {approvalHref && (
              <Link
                href={approvalHref}
                className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-[#8E88C7]/30 bg-[#8E88C7]/10 px-4 py-2 text-xs font-semibold text-[#8E88C7] transition-colors hover:bg-[#8E88C7]/20"
              >
                Go to approval queue <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* Signal grid */}
      {items !== null && items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <SignalCard key={item.strategy_id} item={item} highlighted={highlightedId === item.strategy_id} />
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <p className="mt-8 text-center text-[11px] text-[#666A76]">
        Signals are generated from your organization&apos;s own validated strategy rules. Not investment advice.
      </p>
    </div>
  );
}

export default function SignalsPage() {
  const canView = useCan("signals.view");
  const permissionsLoaded = usePermissionsLoaded();

  return (
    <DashboardShell>
      {!permissionsLoaded ? (
        <div className="flex min-h-[50vh] items-center justify-center">
          <p className="text-sm text-[#9A9DA8]">Loading…</p>
        </div>
      ) : canView ? (
        <SignalsPageContent />
      ) : (
        <div className="flex min-h-[50vh] items-center justify-center">
          <p className="text-sm text-[#9A9DA8]">You do not have permission to view research signals.</p>
        </div>
      )}
    </DashboardShell>
  );
}
