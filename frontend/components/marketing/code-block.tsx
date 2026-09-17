"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

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
    <section className="relative w-full bg-[#08080B] py-20 sm:py-24 lg:py-32">
      {/* Subtle background grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
          `,
          backgroundSize: "72px 72px",
        }}
      />

      {/* Purple atmosphere */}
      <div
        className="pointer-events-none absolute left-[-20%] top-[25%] h-[600px] w-[600px] rounded-full blur-[160px]"
        style={{
          background:
            "radial-gradient(circle, rgba(82,42,111,0.22), transparent 68%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-[1100px] px-6 sm:px-8 lg:px-10">
        {/* Header */}

        <div className="max-w-3xl">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-[#A79CFF]/50" />

            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#A79CFF]">
              Use Cases
            </p>
          </div>

          <h1 className="mt-7 text-[clamp(2.8rem,5vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-[#F4F3F7]">
            Different firms.
            <br />

            <span className="text-white/35">
              The same forgetting problem.
            </span>
          </h1>

          <p className="mt-7 max-w-2xl text-[16px] leading-[1.75] text-white/50">
            Whether your edge is speed, breadth, or discretion, it decays the
            same way — through amnesia. Here&apos;s what changes when it doesn&apos;t.
          </p>
        </div>

        {/* Accordion */}

        <div className="mt-20 border-y border-white/[0.08]">
          {SEGMENTS.map((segment, index) => {
            const isOpen = open === index;

            return (
              <div
                key={segment.name}
                className={cn(
                  "relative border-b border-white/[0.08] last:border-b-0 transition-colors duration-300",
                  isOpen && "bg-white/[0.025]"
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : index)}
                  className="group flex w-full items-center justify-between gap-6 px-4 py-7 text-left sm:px-6 sm:py-8"
                  aria-expanded={isOpen}
                >
                  <div className="flex min-w-0 items-center gap-5 sm:gap-8">
                    {/* Number */}

                    <span
                      className={cn(
                        "shrink-0 text-[10px] font-semibold tracking-[0.2em] transition-colors duration-300",
                        isOpen
                          ? "text-[#A79CFF]"
                          : "text-white/25"
                      )}
                    >
                      0{index + 1}
                    </span>

                    <div>
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-baseline lg:gap-6">
                        <h2
                          className={cn(
                            "text-[24px] font-semibold tracking-[-0.035em] transition-colors sm:text-[30px]",
                            isOpen
                              ? "text-[#F4F3F7]"
                              : "text-white/70 group-hover:text-white"
                          )}
                        >
                          {segment.name}
                        </h2>

                        <p
                          className={cn(
                            "text-[13px] transition-colors sm:text-[14px]",
                            isOpen
                              ? "text-white/55"
                              : "text-white/35 group-hover:text-white/50"
                          )}
                        >
                          {segment.oneLiner}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Icon */}

                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-all duration-300",
                      isOpen
                        ? "border-[#A79CFF]/40 bg-[#A79CFF]/10 text-[#A79CFF]"
                        : "border-white/[0.1] text-white/40 group-hover:border-white/[0.2] group-hover:text-white/70"
                    )}
                  >
                    {isOpen ? (
                      <Minus className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </div>
                </button>

                {/* Expanded content */}

                <div
                  className={cn(
                    "grid transition-all duration-500 ease-out",
                    isOpen
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="ml-[40px] border-l border-[#A79CFF]/25 pb-10 pl-8 pr-4 sm:ml-[56px] sm:pl-12">
                      <div className="max-w-3xl">
                        <div className="flex items-center gap-3">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#A79CFF] shadow-[0_0_12px_rgba(167,156,255,0.8)]" />

                          <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-[#A79CFF]">
                            The Scenario
                          </span>
                        </div>

                        <p className="mt-6 text-[15px] leading-[1.9] text-white/60 sm:text-[16px]">
                          {segment.scenario}
                        </p>

                        <div className="mt-8 border-t border-white/[0.08] pt-6">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/30">
                            Fits Because
                          </p>

                          <p className="mt-3 text-[14px] leading-relaxed text-white/50">
                            {segment.fits}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}