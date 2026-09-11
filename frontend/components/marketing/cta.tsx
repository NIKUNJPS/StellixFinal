"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  BrainCircuit,
  Check,
  Database,
  GitBranch,
  ShieldCheck,
} from "lucide-react";

import { RevealOnScroll } from "@/components/marketing/motion";

import { DemoRequestModal } from "@/components/marketing/demo-modal";

export function CTA() {
  const reduced = useReducedMotion();

  return (
    <section
      id="cta"
      className="relative overflow-hidden bg-black py-8 sm:py-10 lg:py-12"
    >
      {/* OUTER CONTAINER */}

      <div className="mx-auto w-full max-w-[1800px] px-3 sm:px-5 lg:px-7">
        {/* INNER CTA */}

        <div className="relative min-h-[720px] overflow-hidden rounded-[34px] border border-white/[0.08] bg-[#08080B]">
          {/* BACKGROUND */}

          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[#08080B]" />

            {/* MAIN PURPLE ATMOSPHERE */}

            <div
              className="absolute left-1/2 top-[45%] h-[750px] w-[1100px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[180px]"
              style={{
                background:
                  "radial-gradient(ellipse, rgba(167,156,255,0.14), transparent 68%)",
              }}
            />

            {/* LEFT GLOW */}

            <div className="absolute -left-40 bottom-[-250px] h-[600px] w-[600px] rounded-full bg-[#A79CFF]/[0.07] blur-[180px]" />

            {/* RIGHT BLUE GLOW */}

            <div className="absolute -right-40 top-[-250px] h-[600px] w-[600px] rounded-full bg-[#7AB8FF]/[0.05] blur-[180px]" />

            {/* GRID */}

            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(255,255,255,0.45) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255,255,255,0.45) 1px, transparent 1px)
                `,
                backgroundSize: "72px 72px",
              }}
            />

            {/* TOP FADE */}

            <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/30 to-transparent" />

            {/* BOTTOM FADE */}

            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/40 to-transparent" />

            {/* CENTER LIGHT */}

            <div className="absolute left-1/2 top-0 h-px w-[45%] -translate-x-1/2 bg-gradient-to-r from-transparent via-[#A79CFF]/60 to-transparent" />
          </div>

          {/* DECORATIVE SYSTEM NODES */}

          <div className="pointer-events-none absolute inset-0 hidden lg:block">
            {/* LEFT NODE */}

            <motion.div
              animate={
                reduced
                  ? undefined
                  : {
                      y: [0, -8, 0],
                    }
              }
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute left-[10%] top-[32%] flex h-14 w-14 items-center justify-center rounded-2xl border border-[#A79CFF]/20 bg-[#A79CFF]/[0.04] backdrop-blur-xl"
            >
              <Database className="h-5 w-5 text-[#A79CFF]/70" />
            </motion.div>

            {/* RIGHT NODE */}

            <motion.div
              animate={
                reduced
                  ? undefined
                  : {
                      y: [0, 10, 0],
                    }
              }
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute right-[10%] top-[28%] flex h-14 w-14 items-center justify-center rounded-2xl border border-[#7AB8FF]/20 bg-[#7AB8FF]/[0.04] backdrop-blur-xl"
            >
              <GitBranch className="h-5 w-5 text-[#7AB8FF]/70" />
            </motion.div>

            {/* LEFT BOTTOM NODE */}

            <motion.div
              animate={
                reduced
                  ? undefined
                  : {
                      y: [0, 7, 0],
                    }
              }
              transition={{
                duration: 5.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute bottom-[22%] left-[18%] flex h-12 w-12 items-center justify-center rounded-xl border border-[#69D4AB]/20 bg-[#69D4AB]/[0.04] backdrop-blur-xl"
            >
              <ShieldCheck className="h-5 w-5 text-[#69D4AB]/70" />
            </motion.div>

            {/* RIGHT BOTTOM NODE */}

            <motion.div
              animate={
                reduced
                  ? undefined
                  : {
                      y: [0, -7, 0],
                    }
              }
              transition={{
                duration: 6.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute bottom-[20%] right-[18%] flex h-12 w-12 items-center justify-center rounded-xl border border-[#F3C969]/20 bg-[#F3C969]/[0.04] backdrop-blur-xl"
            >
              <BrainCircuit className="h-5 w-5 text-[#F3C969]/70" />
            </motion.div>

            {/* CONNECTION LINES */}

            <div className="absolute left-[13%] top-[35%] h-px w-[22%] rotate-[12deg] bg-gradient-to-r from-[#A79CFF]/20 to-transparent" />

            <div className="absolute right-[13%] top-[31%] h-px w-[22%] -rotate-[12deg] bg-gradient-to-l from-[#7AB8FF]/20 to-transparent" />
          </div>

          {/* CONTENT */}

          <div className="relative z-10 flex min-h-[720px] items-center justify-center px-6 py-20 sm:px-10 lg:px-14">
            <RevealOnScroll
              direction="scale"
              duration={0.7}
              className="mx-auto w-full max-w-5xl text-center"
            >
              {/* EYEBROW */}

              <div className="flex items-center justify-center gap-4">
                <span className="h-px w-10 bg-gradient-to-r from-transparent to-[#A79CFF]/50" />

                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#A79CFF]">
                  The next research cycle starts here
                </p>

                <span className="h-px w-10 bg-gradient-to-l from-transparent to-[#69D4AB]/50" />
              </div>

              {/* CENTRAL ICON */}

              <motion.div
                animate={
                  reduced
                    ? undefined
                    : {
                        y: [0, -5, 0],
                      }
                }
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="mx-auto mt-10 flex h-[72px] w-[72px] items-center justify-center rounded-[24px] border border-[#A79CFF]/30 bg-[#A79CFF]/[0.07] shadow-[0_0_80px_rgba(167,156,255,0.12)] backdrop-blur-xl"
              >
                <BrainCircuit className="h-8 w-8 text-[#A79CFF]" />
              </motion.div>

              {/* HEADLINE */}

              <h2 className="mx-auto mt-9 max-w-5xl text-[clamp(3.5rem,6vw,7rem)] font-medium leading-[0.9] tracking-[-0.065em] text-[#F4F3F7]">
                Infrastructure designed
                <br />

                <span className="text-white/30">
                  to compound.
                </span>
              </h2>

              {/* DESCRIPTION */}

              <p className="mx-auto mt-9 max-w-3xl text-[16px] leading-relaxed text-white/55 sm:text-[18px]">
                See how Stellix transforms research, regimes, validation,
                failure, and institutional memory into a continuously
                improving intelligence system.
              </p>

              {/* CTA BUTTON */}

              <motion.div
                className="mt-11 inline-block"
                whileHover={
                  reduced
                    ? undefined
                    : {
                        scale: 1.04,
                      }
                }
                whileTap={
                  reduced
                    ? undefined
                    : {
                        scale: 0.98,
                      }
                }
              >
                <DemoRequestModal
                  className="group inline-flex h-14 items-center gap-3 rounded-xl border border-[#A79CFF]/60 bg-[#F4F3F7] px-9 text-[15px] font-semibold text-[#09090D] shadow-[0_12px_50px_rgba(167,156,255,0.15)] transition-all duration-300 hover:border-[#A79CFF] hover:bg-[#A79CFF] hover:text-white hover:shadow-[0_18px_70px_rgba(167,156,255,0.25)]"
                  label="Request Demo"
                />
              </motion.div>

              {/* TRUST / WALKTHROUGH INFO */}

              <div className="mx-auto mt-11 flex flex-col items-center justify-center gap-5 sm:flex-row sm:gap-7">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-[19px] w-[19px] items-center justify-center rounded-[5px] border border-[#69D4AB]/50 bg-[#69D4AB]/[0.08]">
                    <Check
                      className="h-3 w-3 text-[#69D4AB]"
                      strokeWidth={3}
                    />
                  </span>

                  <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/35">
                    30 minute walkthrough
                  </span>
                </div>

                <span className="hidden h-4 w-px bg-white/[0.1] sm:block" />

                <div className="flex items-center gap-2.5">
                  <span className="flex h-[19px] w-[19px] items-center justify-center rounded-[5px] border border-[#A79CFF]/50 bg-[#A79CFF]/[0.08]">
                    <Check
                      className="h-3 w-3 text-[#A79CFF]"
                      strokeWidth={3}
                    />
                  </span>

                  <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/35">
                    Technical product demo
                  </span>
                </div>

                <span className="hidden h-4 w-px bg-white/[0.1] sm:block" />

                <div className="flex items-center gap-2.5">
                  <span className="flex h-[19px] w-[19px] items-center justify-center rounded-[5px] border border-[#7AB8FF]/50 bg-[#7AB8FF]/[0.08]">
                    <Check
                      className="h-3 w-3 text-[#7AB8FF]"
                      strokeWidth={3}
                    />
                  </span>

                  <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/35">
                    Built for research teams
                  </span>
                </div>
              </div>

              {/* BOTTOM LINE */}

              <div className="mx-auto mt-14 flex items-center justify-center gap-5">
                <span className="h-px w-16 bg-gradient-to-r from-transparent to-white/[0.15]" />

                <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/20">
                  Research should outlive the researcher
                </span>

                <span className="h-px w-16 bg-gradient-to-l from-transparent to-white/[0.15]" />
              </div>
            </RevealOnScroll>
          </div>
        </div>
      </div>
    </section>
  );
}