"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

type Segment = { name: string; oneLiner: string; scenario: string; fits: string };

const SEGMENTS: Segment[] = [
  {
    name: "Hedge Funds",
    oneLiner: "Institutionalize alpha so it survives the org chart.",
    scenario:
      "A PM leaves and takes their book's intuition with them. With Stellix Labs, that intuition was already externalized: every strategy the PM built, every regime it thrived and failed in, and every research note behind it are nodes in a graph the next PM can query on day one — “show me every hypothesis that led to a live strategy in this book.”",
    fits: "Knowledge graph + failure intelligence + research notebook.",
  },
  {
    name: "Proprietary Trading Firms",
    oneLiner: "Stop paying twice for the same dead end.",
    scenario:
      "Desk A blows up a momentum strategy in a high-vol regime in March. Desk B, not knowing, ships a near-identical one in June. recurring_failure_modes would have surfaced the pattern the moment Desk B's strategy touched the graph — turning a repeated loss into a one-time lesson shared across every desk.",
    fits: "Cross-desk failure graph + regime-mismatch detection.",
  },
  {
    name: "Crypto Funds",
    oneLiner: "For markets that change character overnight.",
    scenario:
      "A strategy that prints in a low-volatility grind quietly becomes a liability the instant the market flips to Crisis. Because every backtest and every live strategy is regime-conditioned, a regime transition triggers a mismatch alert before the drawdown — not in the post-mortem.",
    fits: "Six-regime detection + regime-mismatch trigger + live monitoring.",
  },
  {
    name: "Investment Banks",
    oneLiner: "Regime-aware research with a compliance-grade paper trail.",
    scenario:
      "A model desk needs to prove why a strategy was approved, who approved it, and what validation it passed. Every promotion is gated on a five-method robustness score, every state change is written to an append-only audit log, and the whole record exports to a compliance PDF on demand.",
    fits: "Validation gate + audit log + compliance export + kill switch.",
  },
  {
    name: "Asset Managers",
    oneLiner: "Auditable validation your risk committee will actually trust.",
    scenario:
      "Instead of a single Sharpe ratio in a slide, your committee sees a strategy's performance across all six regimes, its five validation sub-scores, and its complete failure history if it has one — the difference between “trust me” and “here's the evidence.”",
    fits: "Regime-partitioned reporting + validation breakdown + failure records.",
  },
];

export function UseCasesContent() {
  const [open, setOpen] = useState(0);
  return (
    <div className="mt-12 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border">
      {SEGMENTS.map((s, i) => {
        const isOpen = open === i;
        return (
          <div key={s.name} className={cn(isOpen && "bg-card/30")}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? -1 : i)}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
              aria-expanded={isOpen}
            >
              <div>
                <span className="font-display text-lg font-semibold">{s.name}</span>
                <span className="ml-3 hidden text-sm text-accent sm:inline">{s.oneLiner}</span>
              </div>
              <Plus
                className={cn(
                  "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                  isOpen && "rotate-45",
                )}
              />
            </button>
            <div
              className={cn(
                "grid transition-all duration-300 ease-out",
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <div className="px-6 pb-6">
                  <p className="text-sm text-accent sm:hidden">{s.oneLiner}</p>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{s.scenario}</p>
                  <p className="mt-4 text-xs uppercase tracking-wider text-foreground/70">
                    Fits because:{" "}
                    <span className="font-normal normal-case tracking-normal text-muted-foreground">{s.fits}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
