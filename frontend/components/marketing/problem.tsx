"use client";

import { motion } from "framer-motion";
import {
  DoorOpen,
  TrendingDown,
  RefreshCcw,
  TimerReset,
  type LucideIcon,
} from "lucide-react";

import {
  RevealOnScroll,
  StaggerChildren,
  StaggerItem,
} from "@/components/marketing/motion";

import { PROBLEM_CARDS } from "@/lib/marketing/content";

const PROBLEM_ICONS: readonly LucideIcon[] = [
  DoorOpen,
  TrendingDown,
  RefreshCcw,
  TimerReset,
] as const;

export function Problem() {
  return (
    <section className="relative isolate overflow-hidden bg-black py-8 sm:py-10 lg:py-12">
      {/* OUTER CONTAINER — SAME AS LOOP */}

      <div className="mx-auto w-full max-w-[1800px] px-3 sm:px-5 lg:px-7">
        {/* INNER ROUNDED CONTAINER */}

        <div className="relative isolate overflow-hidden rounded-[34px] border border-white/[0.08] bg-[#08080B] py-28 sm:py-36">
          {/* Subtle grid checks */}

          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.42]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(139,123,232,0.055) 1px, transparent 1px),
                linear-gradient(90deg, rgba(139,123,232,0.055) 1px, transparent 1px)
              `,
              backgroundSize: "42px 42px",
            }}
          />

          {/* Purple gradient glow */}

          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 8% 18%, rgba(139,123,232,0.16), transparent 32%), radial-gradient(circle at 88% 72%, rgba(82,42,111,0.20), transparent 38%), linear-gradient(180deg, rgba(139,123,232,0.04), transparent 30%, rgba(82,42,111,0.08))",
            }}
          />

          {/* CONTENT */}

          <div className="container relative z-10">
            <RevealOnScroll>
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8B7BE8]">
                The problem
              </span>

              <h2
                className="mt-5 max-w-4xl text-4xl font-semibold leading-[1.08] text-[#f1f2f6] sm:text-[52px] lg:text-[62px]"
                style={{ fontFamily: "var(--font-figtree)" }}
              >
                Institutional amnesia is costing you more than you know.
              </h2>

              <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-[#858b99]">
                The problem is not a lack of research. It is what happens when
                valuable research disappears, failures go unrecorded, and teams
                are forced to learn the same lessons again.
              </p>
            </RevealOnScroll>

            <StaggerChildren
              className="relative mt-20 space-y-5"
              stagger={0.1}
            >
              {PROBLEM_CARDS.map((card, index) => {
                const Icon = PROBLEM_ICONS[index]!;
                const number = String(index + 1).padStart(2, "0");

                return (
                  <StaggerItem key={card.title}>
                    <motion.article
                      whileHover={{
                        y: -3,
                        borderColor: "rgba(139,123,232,0.55)",
                      }}
                      transition={{ duration: 0.25 }}
                      className="group relative overflow-hidden border border-[#242733] bg-[#0b0c12]/90 backdrop-blur-sm"
                    >
                      {/* Purple accent */}

                      <div className="absolute left-0 top-0 h-full w-[2px] bg-gradient-to-b from-[#8B7BE8] via-[#522A6F] to-transparent" />

                      {/* Grid inside card */}

                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 opacity-[0.22]"
                        style={{
                          backgroundImage: `
                            linear-gradient(rgba(139,123,232,0.05) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(139,123,232,0.05) 1px, transparent 1px)
                          `,
                          backgroundSize: "32px 32px",
                        }}
                      />

                      {/* Purple hover glow */}

                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                        style={{
                          background:
                            "radial-gradient(circle at 10% 50%, rgba(139,123,232,0.12), transparent 42%), linear-gradient(90deg, rgba(82,42,111,0.08), transparent 45%)",
                        }}
                      />

                      <div className="relative grid gap-7 p-7 sm:grid-cols-[90px_minmax(0,1fr)] sm:gap-10 sm:p-9 lg:grid-cols-[120px_minmax(0,1fr)_260px]">
                        {/* Story number */}

                        <div className="flex items-start gap-4 sm:block">
                          <span className="font-mono text-[11px] tracking-[0.2em] text-[#8B7BE8]">
                            {number}
                          </span>

                          <motion.div
                            className="mt-0 flex h-11 w-11 items-center justify-center border border-[#8B7BE8]/30 bg-[#8B7BE8]/[0.06] sm:mt-6"
                            whileHover={{ scale: 1.05 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Icon
                              className="h-[19px] w-[19px] text-[#8B7BE8]"
                              aria-hidden
                            />
                          </motion.div>
                        </div>

                        {/* Problem */}

                        <div>
                          <h3
                            className="text-[25px] font-semibold leading-tight text-[#eceef3] transition-colors duration-300 group-hover:text-[#c6bfff] sm:text-[30px]"
                            style={{
                              fontFamily: "var(--font-figtree)",
                            }}
                          >
                            {card.title}
                          </h3>

                          <p className="mt-5 max-w-3xl text-[15px] leading-[1.8] text-[#858b99] transition-colors duration-300 group-hover:text-[#9da3b2]">
                            {card.body}
                          </p>
                        </div>

                        {/* Consequence marker */}

                        <div className="flex items-end lg:justify-end">
                          <div className="border-t border-[#8B7BE8]/25 pt-4 transition-colors duration-300 group-hover:border-[#8B7BE8]/60 lg:w-full">
                            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#5f6472]">
                              Research consequence
                            </span>

                            <div className="mt-2 flex items-center gap-2">
                              <motion.span
                                className="h-1.5 w-1.5 rounded-full bg-[#8B7BE8]"
                                whileHover={{
                                  scale: 1.8,
                                  boxShadow:
                                    "0 0 12px rgba(139,123,232,0.9)",
                                }}
                              />

                              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#9d95dc]">
                                Knowledge lost
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bottom purple gradient */}

                      <div
                        aria-hidden
                        className="absolute bottom-0 left-0 h-px w-full"
                        style={{
                          background:
                            "linear-gradient(90deg, transparent, rgba(139,123,232,0.65), rgba(82,42,111,0.35), transparent)",
                        }}
                      />
                    </motion.article>
                  </StaggerItem>
                );
              })}
            </StaggerChildren>

            {/* Closing statement */}

            <RevealOnScroll direction="up" className="mt-14">
              <div className="border-l-2 border-[#8B7BE8] bg-[#8B7BE8]/[0.035] px-7 py-6 sm:px-9">
                <p
                  className="max-w-3xl text-[22px] leading-relaxed text-[#d8d6e5] sm:text-[26px]"
                  style={{ fontFamily: "var(--font-figtree)" }}
                >
                  Every forgotten failure becomes a future experiment waiting to
                  be repeated.
                </p>
              </div>
            </RevealOnScroll>
          </div>
        </div>
      </div>
    </section>
  );
}