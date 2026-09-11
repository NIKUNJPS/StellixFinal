"use client";

import { useState } from "react";
import { ArrowUpRight, Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

type Segment = {
  name: string;
  oneLiner: string;
  scenario: string;
  fits: string;
};

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
    <section className="relative overflow-hidden border-y border-white/[0.08] bg-[#0B0B10] font-[var(--font-figtree)]">
      {/* Subtle grid */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.025]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
            `,
            backgroundSize: "80px 80px",
          }}
        />
      </div>

      {/* Purple atmosphere */}
      <div className="pointer-events-none absolute left-[-20%] top-[20%] h-[500px] w-[500px] rounded-full bg-[#522A6F]/10 blur-[180px]" />

      <div className="relative">
        {SEGMENTS.map((segment, index) => {
          const isOpen = open === index;

          return (
            <div
              key={segment.name}
              className={cn(
                "relative border-b border-white/[0.08] last:border-b-0 transition-colors duration-300",
                isOpen && "bg-white/[0.015]",
              )}
            >
              {/* Active indicator */}
              <div
                className={cn(
                  "absolute left-0 top-0 h-full w-[2px] transition-all duration-300",
                  isOpen
                    ? "bg-[#8B7CFF] opacity-100"
                    : "bg-transparent opacity-0",
                )}
              />

              <button
                type="button"
                onClick={() => setOpen(isOpen ? -1 : index)}
                className="group flex w-full items-start gap-5 px-6 py-8 text-left sm:px-10 sm:py-10 lg:px-14 lg:py-11"
                aria-expanded={isOpen}
              >
                {/* Number */}
                <span
                  className={cn(
                    "mt-2 w-10 shrink-0 text-[11px] font-semibold tracking-[0.2em]",
                    isOpen
                      ? "text-[#A79CFF]"
                      : "text-white/40 group-hover:text-white/60",
                  )}
                >
                  0{index + 1}
                </span>

                {/* Main text */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-baseline lg:gap-10">
                    <h3
                      className={cn(
                        "font-[var(--font-figtree)] text-[clamp(1.75rem,2.8vw,2.6rem)] font-semibold leading-[1.05] tracking-[-0.045em] transition-colors",
                        isOpen
                          ? "text-[#F4F3F7]"
                          : "text-white/85 group-hover:text-white",
                      )}
                    >
                      {segment.name}
                    </h3>

                    <p
                      className={cn(
                        "max-w-xl text-[15px] leading-relaxed sm:text-[16px]",
                        isOpen
                          ? "text-white/65"
                          : "text-white/50 group-hover:text-white/65",
                      )}
                    >
                      {segment.oneLiner}
                    </p>
                  </div>
                </div>

                {/* Icon */}
                <div
                  className={cn(
                    "mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all duration-300",
                    isOpen
                      ? "border-[#8B7CFF]/60 bg-[#8B7CFF]/15 text-[#A79CFF]"
                      : "border-white/[0.14] text-white/60 group-hover:border-white/30 group-hover:text-white",
                  )}
                >
                  {isOpen ? (
                    <Minus className="h-5 w-5" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}
                </div>
              </button>

              {/* Expanded content */}
              <div
                className={cn(
                  "grid transition-all duration-500 ease-out",
                  isOpen
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="overflow-hidden">
                  <div className="pb-10 pl-[5.25rem] pr-6 sm:pb-12 sm:pl-[7.5rem] sm:pr-12 lg:pb-14 lg:pl-[10.5rem] lg:pr-20">
                    <div className="max-w-4xl border-l border-[#8B7CFF]/35 pl-7 sm:pl-10">
                      {/* Scenario label */}
                      <div className="flex items-center gap-3">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#8B7CFF]" />

                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#A79CFF]">
                          The scenario
                        </span>
                      </div>

                      {/* Scenario */}
                      <p className="mt-6 text-[16px] leading-[1.85] text-white/80 sm:text-[17px]">
                        {segment.scenario}
                      </p>

                      {/* Fits */}
                      <div className="mt-8 border-t border-white/[0.1] pt-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-7">
                          <div className="flex shrink-0 items-center gap-2">
                            <ArrowUpRight className="h-4 w-4 text-[#A79CFF]" />

                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A79CFF]">
                              Fits because
                            </span>
                          </div>

                          <p className="text-[15px] leading-relaxed text-white/65">
                            {segment.fits}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}