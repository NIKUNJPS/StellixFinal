"use client";

/**
 * TerminalCard — the hero's signature element (Cold Precision redesign).
 *
 * A coded "Live Research Terminal", not a screenshot. Three panels — regime
 * detection, strategy status, knowledge-graph pulse — with an active focus that
 * cycles every 3 seconds. Entrance: scale(0.95)+fade over 0.7s, then it sits
 * quietly cycling. Strategy names/statuses mirror the real seeded demo tenant.
 * Under prefers-reduced-motion the card renders fully static (no cycling).
 */

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { EASE_ENTRANCE } from "@/components/marketing/motion";

const CYCLE_MS = 3000;

// Regime states the top row rotates through (labels match the real taxonomy).
const REGIMES = [
  { label: "HIGH-VOLATILITY", conf: 78 },
  { label: "LOW-VOLATILITY", conf: 91 },
  { label: "SIDEWAYS", conf: 64 },
] as const;

// Real strategy names from the seeded Meridian demo book.
const STRATEGIES = [
  { name: "QQQ Trend Rider", status: "ACTIVE", sharpe: "1.32" },
  { name: "SPY Oversold Bounce", status: "CANDIDATE", sharpe: "0.87" },
  { name: "SPY Golden Cross", status: "FAILED", sharpe: "-0.41" },
] as const;

const STATUS_STYLES: Record<(typeof STRATEGIES)[number]["status"], string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CANDIDATE: "bg-amber-50 text-amber-700 ring-amber-200",
  FAILED: "bg-red-50 text-red-700 ring-red-200",
};

// Tiny 6-node / 8-edge dot-graph (matches the real 6 node types / 8 edge types).
const GRAPH_NODES: Array<[number, number]> = [
  [12, 14], [44, 6], [78, 16], [22, 40], [58, 44], [86, 38],
];
const GRAPH_EDGES: Array<[number, number]> = [
  [0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 4], [4, 5], [2, 4],
];

export function TerminalCard() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0); // which panel has focus
  const [regimeIdx, setRegimeIdx] = useState(0);
  const [nodes, setNodes] = useState(847);
  const [edges, setEdges] = useState(2341);
  const [delta, setDelta] = useState(3);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % 3;
        if (next === 0) setRegimeIdx((r) => (r + 1) % REGIMES.length);
        if (next === 2) {
          const d = 2 + Math.floor(Math.random() * 3); // +2..+4
          setDelta(d);
          setNodes((n) => n + Math.max(1, d - 1));
          setEdges((e) => e + d);
        }
        return next;
      });
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [reduced]);

  const regime = REGIMES[regimeIdx % REGIMES.length]!;
  const focus = (i: number) => (reduced || active === i ? "opacity-100" : "opacity-55");

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.7, ease: EASE_ENTRANCE }}
      className="rounded-xl border border-[#E2E8F0] bg-white shadow-[0_4px_32px_rgba(0,0,102,0.08)]"
    >
      {/* Chrome */}
      <div className="flex items-center gap-2 border-b border-[#E2E8F0] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#E2E8F0]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#E2E8F0]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#E2E8F0]" />
        <span className="font-code ml-2 text-[11px] tracking-wide text-[#64748B]">
          stellix — live research terminal
        </span>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {/* Row 1 — Regime detection */}
        <div className={cn("rounded-lg border border-[#E2E8F0] p-3.5 transition-opacity duration-500", focus(0))}>
          <div className="font-code flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
            <span className="flex items-center gap-1.5 font-medium text-[#0066FF]">
              <span className="relative flex h-1.5 w-1.5">
                {!reduced && active === 0 && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0066FF] opacity-60" />
                )}
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#0066FF]" />
              </span>
              [LIVE]
            </span>
            <span className="text-[#64748B]">Current Regime:</span>
            <motion.span
              key={regime.label}
              initial={reduced ? false : { opacity: 0.4, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="font-semibold text-[#0A0F1E]"
            >
              {regime.label}
            </motion.span>
            <span className="text-[#64748B]">| Conf: {regime.conf}%</span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#E8F0FF]">
            <motion.div
              className="h-full rounded-full bg-[#0066FF]"
              initial={false}
              animate={{ width: `${regime.conf}%` }}
              transition={{ duration: reduced ? 0 : 0.7, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Row 2 — Strategy status */}
        <div className={cn("rounded-lg border border-[#E2E8F0] p-3.5 transition-opacity duration-500", focus(1))}>
          <p className="font-code mb-2 text-[10px] uppercase tracking-[0.15em] text-[#64748B]">
            Strategy status
          </p>
          <div className="space-y-1.5">
            {STRATEGIES.map((s) => {
              const failedGlow = s.status === "FAILED" && (reduced || active === 1);
              return (
                <div
                  key={s.name}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md border-l-2 py-1 pl-2.5 pr-1 transition-all duration-700",
                    failedGlow
                      ? "border-red-400 bg-red-50/60 shadow-[inset_2px_0_8px_rgba(220,38,38,0.12)]"
                      : "border-transparent",
                  )}
                >
                  <span className="truncate text-[12.5px] font-medium text-[#0A0F1E]">{s.name}</span>
                  <span className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "font-code rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1",
                        STATUS_STYLES[s.status],
                      )}
                    >
                      {s.status}
                    </span>
                    <span className="font-code w-11 text-right text-[12px] tabular-nums text-[#64748B]">
                      {s.sharpe}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Row 3 — Knowledge-graph pulse */}
        <div
          className={cn(
            "flex items-center justify-between gap-4 rounded-lg border border-[#E2E8F0] p-3.5 transition-opacity duration-500",
            focus(2),
          )}
        >
          <div className="font-code min-w-0 text-[12px] leading-relaxed">
            <p className="text-[10px] uppercase tracking-[0.15em] text-[#64748B]">Memory graph</p>
            <p className="mt-1 text-[#0A0F1E]">
              <span className="tabular-nums font-semibold">{nodes.toLocaleString()}</span>
              <span className="text-[#64748B]"> nodes · </span>
              <span className="tabular-nums font-semibold">{edges.toLocaleString()}</span>
              <span className="text-[#64748B]"> edges · </span>
              <span className="font-semibold text-[#0066FF]">+{delta} this cycle</span>
            </p>
          </div>
          <svg viewBox="0 0 100 52" className="h-12 w-24 shrink-0" aria-hidden>
            {GRAPH_EDGES.map(([a, b], i) => {
              const [x1, y1] = GRAPH_NODES[a]!;
              const [x2, y2] = GRAPH_NODES[b]!;
              // The last edge slowly redraws each time this panel takes focus —
              // the hero's single allowed slow looping pulse.
              const drawing = i === GRAPH_EDGES.length - 1 && !reduced;
              return drawing ? (
                <motion.line
                  key={`${i}-${active === 2 ? nodes : "idle"}`}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="#0066FF" strokeWidth={1.4}
                  initial={{ pathLength: 0, opacity: 0.4 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 2.4, ease: "easeInOut" }}
                />
              ) : (
                <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#B8D1FF" strokeWidth={1.2} />
              );
            })}
            {GRAPH_NODES.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i === 4 ? 3.4 : 2.6} fill={i === 4 ? "#0066FF" : "#0A0F1E"} />
            ))}
          </svg>
        </div>
      </div>
    </motion.div>
  );
}
