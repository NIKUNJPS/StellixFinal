"use client";

import Link from "next/link";
import { Figtree } from "next/font/google";
import { motion } from "framer-motion";

import { DemoRequestModal } from "@/components/marketing/demo-modal";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
});

export function HeroSection() {
  return (
    <section
      className={`${figtree.variable} relative overflow-hidden bg-[#08080D] py-3 font-[family-name:var(--font-figtree)] sm:py-5 lg:py-7`}
    >
      {/* OUTER CONTAINER */}
      <div className="mx-auto w-full max-w-[1800px] px-3 sm:px-5 lg:px-7">
        {/* INNER HERO CARD */}
        <div className="relative min-h-[calc(100vh-56px)] overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#0D0D15] sm:rounded-[32px] lg:min-h-[calc(100vh-64px)] lg:rounded-[36px]">
          {/* BACKGROUND ATMOSPHERE */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {/* Bottom-left purple glow */}
            <div className="absolute -bottom-[300px] -left-[250px] h-[850px] w-[850px] rounded-full bg-[#522A6F]/45 blur-[180px]" />

            {/* Right-side subtle purple glow */}
            <div className="absolute right-[-180px] top-[5%] h-[600px] w-[600px] rounded-full bg-[#6E5CE6]/12 blur-[180px]" />

            {/* Soft center atmosphere */}
            <div className="absolute left-1/2 top-[15%] h-[450px] w-[800px] -translate-x-1/2 rounded-full bg-white/[0.025] blur-[150px]" />

            {/* Grid */}
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
                `,
                backgroundSize: "90px 90px",
              }}
            />

            {/* Top subtle fade */}
            <div className="absolute inset-x-0 top-0 h-[25%] bg-gradient-to-b from-black/20 to-transparent" />

            {/* Bottom fade */}
            <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-[#0D0D15] via-[#0D0D15]/70 to-transparent" />
          </div>

          {/* CONTENT */}
          <div className="relative z-10 flex min-h-[calc(100vh-56px)] flex-col justify-between px-7 py-8 sm:px-10 sm:py-10 lg:min-h-[calc(100vh-64px)] lg:px-16 lg:py-12 xl:px-20">
            {/* TOP META */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.7,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <motion.span
                  animate={{
                    opacity: [0.6, 1, 0.6],
                    scale: [1, 1.2, 1],
                  }}
                  transition={{
                    duration: 2.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="h-2 w-2 rounded-full bg-[#A79CFF] shadow-[0_0_20px_#A79CFF]"
                />

                <div className="hidden h-px w-8 bg-[#A79CFF]/50 sm:block" />

                <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#CFC8FF] sm:text-[10px] lg:text-[11px]">
                  Institutional Research Infrastructure
                </span>
              </div>

              <span className="hidden text-[9px] font-medium uppercase tracking-[0.2em] text-white/25 sm:block">
                Stellix Labs / 001
              </span>
            </motion.div>

            {/* MAIN HERO AREA */}
            <div className="flex flex-1 flex-col justify-center py-14 lg:py-16">
              {/* Eyebrow */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.7,
                  delay: 0.1,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="mb-8 flex items-center gap-3"
              >
                <span className="h-px w-9 bg-[#A79CFF]/70" />

                <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#A79CFF]">
                  Research should remember
                </span>
              </motion.div>

              {/* HEADLINE */}
              <div className="max-w-[1250px]">
                <motion.h1 className="text-[clamp(3.8rem,8vw,9rem)] font-medium leading-[0.88] tracking-[-0.065em]">
                  <motion.span
                    initial={{ opacity: 0, y: 55 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.85,
                      delay: 0.16,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="block text-white"
                  >
                    Your best research
                  </motion.span>

                  <motion.span
                    initial={{ opacity: 0, y: 55 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.85,
                      delay: 0.28,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="block text-white/65"
                  >
                    is the strategies that
                  </motion.span>

                  <motion.span
                    initial={{ opacity: 0, y: 55 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.9,
                      delay: 0.4,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="block"
                  >
                    <span className="text-white">FAILED</span>
                    <span className="text-[#FBCF4F]">.</span>
                  </motion.span>
                </motion.h1>
              </div>

              {/* DESCRIPTION */}
              <motion.p
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.75,
                  delay: 0.65,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="mt-9 max-w-[650px] text-[16px] leading-[1.8] text-white/70 sm:text-[18px]"
              >
                The only platform that preserves failure intelligence, detects
                regime shifts, and compounds institutional memory.
              </motion.p>

              {/* BUTTONS */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.75,
                  delay: 0.78,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="mt-10 flex flex-wrap items-center gap-4"
              >
                <DemoRequestModal
                  label="Request Demo"
                  className="inline-flex h-14 items-center justify-center rounded-full bg-[#FBCF4F] px-8 text-[14px] font-semibold text-[#0D0D15] transition-all duration-300 hover:scale-[1.04] hover:bg-[#FFE08A] hover:shadow-[0_0_40px_rgba(251,207,79,0.2)]"
                />

                <Link
                  href="#how"
                  className="group inline-flex h-14 items-center gap-3 rounded-full border border-white/[0.16] px-8 text-[14px] font-medium text-white transition-all duration-300 hover:border-[#A79CFF]/70 hover:bg-[#522A6F]/25"
                >
                  See how it works

                  <span className="text-[#A79CFF] transition-transform duration-300 group-hover:translate-x-1">
                    →
                  </span>
                </Link>
              </motion.div>
            </div>

            {/* BOTTOM SECTION */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 1,
                delay: 1.05,
              }}
              className="border-t border-white/[0.08] pt-6"
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                {/* Process */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-[10px] font-semibold uppercase tracking-[0.2em] sm:text-[11px]">
                  <span className="text-white/55">Failure</span>

                  <span className="text-[#A79CFF]">→</span>

                  <span className="text-white/55">Understand</span>

                  <span className="text-[#A79CFF]">→</span>

                  <span className="text-white/55">Remember</span>

                  <span className="text-[#A79CFF]">→</span>

                  <span className="text-[#FBCF4F]">Evolve</span>
                </div>

                {/* Philosophy */}
                <p className="text-[9px] font-medium uppercase tracking-[0.18em] text-white/30 sm:text-[10px]">
                  Failure becomes infrastructure.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}