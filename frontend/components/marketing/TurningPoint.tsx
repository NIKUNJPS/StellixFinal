"use client";

import { useRef } from "react";
import { Figtree } from "next/font/google";
import { motion, useScroll, useTransform } from "framer-motion";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
});

const INTELLIGENCE_NODES = [
  { label: "REGIME", value: "High Volatility", subtitle: "Market Context", angle: -90, tone: "#8B7CFF" },
  { label: "PERFORMANCE", value: "Sharpe 1.84", subtitle: "Risk Adjusted Return", angle: -18, tone: "#53CFA1" },
  { label: "FAILURE", value: "Liquidity Breakdown", subtitle: "Failure Captured", angle: 54, tone: "#D97788" },
  { label: "RESEARCH NOTE", value: "Hypothesis Invalidated", subtitle: "Institutional Memory", angle: 126, tone: "#D6A65A" },
  { label: "VALIDATION", value: "Walk Forward", subtitle: "Robustness Verified", angle: 198, tone: "#5F9BFF" },
];

export function TurningPoint() {
  const ref = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  /* Text animations */
  const q1Opacity = useTransform(scrollYProgress, [0.02, 0.1, 0.22, 0.3], [0, 1, 1, 0]);
  const q2Opacity = useTransform(scrollYProgress, [0.32, 0.4, 0.55, 0.63], [0, 1, 1, 0]);

  /* Graph completes by 90% and remains unchanged from 90% to 100% */
  const graphOpacity = useTransform(scrollYProgress, [0.63, 0.78, 0.9], [0, 1, 1]);
  const graphScale = useTransform(scrollYProgress, [0.63, 0.82, 0.9], [0.94, 1, 1]);
  const ringProgress = useTransform(scrollYProgress, [0.65, 0.82, 0.9], [0, 1, 1]);
  const coreOpacity = useTransform(scrollYProgress, [0.68, 0.78, 0.9], [0, 1, 1]);
  const coreScale = useTransform(scrollYProgress, [0.68, 0.8, 0.9], [0.86, 1, 1]);
  const nodesOpacity = useTransform(scrollYProgress, [0.74, 0.88, 0.9], [0, 1, 1]);
  const nodesScale = useTransform(scrollYProgress, [0.74, 0.88, 0.9], [0.86, 1, 1]);

  const center = 340;
  const radius = 250;

  return (
    <section
      className={`${figtree.variable} relative w-full bg-black p-3 sm:p-5 lg:p-7 font-[family-name:var(--font-figtree)]`}
    >
      {/* LARGE ROUNDED INNER CONTAINER */}
      <section
        ref={ref}
        className="relative h-[280svh] w-full overflow-visible rounded-[32px] border border-white/[0.06] bg-[#09090F] font-[family-name:var(--font-figtree)]"
      >
        <div className="sticky top-0 flex h-[100svh] w-full items-center justify-center overflow-hidden rounded-[32px]">
          {/* Background */}
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle at 50% 48%, rgba(82, 42, 111, 0.18), transparent 42%), radial-gradient(circle at 50% 50%, rgba(139, 124, 255, 0.05), transparent 72%)`,
              }}
            />

            <div
              className="absolute inset-0 opacity-[0.035]"
              style={{
                backgroundImage: `linear-gradient(rgba(255,255,255,0.45) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.45) 1px, transparent 1px)`,
                backgroundSize: "72px 72px",
              }}
            />

            <div className="absolute left-1/2 top-0 h-full w-px bg-gradient-to-b from-transparent via-[#8B7CFF]/10 to-transparent" />
            <div className="absolute left-0 top-1/2 h-px w-full bg-gradient-to-r from-transparent via-white/[0.025] to-transparent" />
          </div>

          {/* Question 1 */}
          <motion.div style={{ opacity: q1Opacity }} className="absolute z-30 flex w-full flex-col items-center px-6 text-center">
            <p className="mb-7 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/30">The Problem</p>

            <h2 className="max-w-5xl text-[clamp(3.4rem,7vw,7.2rem)] font-medium leading-[0.96] tracking-[-0.055em] text-[#F2F1F5]">
              What if failure
              <br />
              didn&apos;t disappear?
            </h2>

            <div className="mt-8">
              <p className="text-[15px] font-medium leading-relaxed text-white/35">Research learns from success.</p>
              <p className="text-[15px] font-medium leading-relaxed text-white/35">But failure is usually forgotten.</p>
            </div>
          </motion.div>

          {/* Question 2 */}
          <motion.div style={{ opacity: q2Opacity }} className="absolute z-30 flex w-full flex-col items-center px-6 text-center">
            <p className="mb-7 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/30">The Alternative</p>

            <h2 className="max-w-6xl text-[clamp(3.4rem,7vw,7.2rem)] font-medium leading-[0.96] tracking-[-0.055em] text-[#F2F1F5]">
              What if it became
              <br />
              <span className="bg-gradient-to-r from-[#AAA0FF] via-[#8B7CFF] to-[#7568DD] bg-clip-text text-transparent">infrastructure?</span>
            </h2>

            <div className="mt-8">
              <p className="text-[15px] font-medium leading-relaxed text-white/35">Preserved as intelligence.</p>
              <p className="text-[15px] font-medium leading-relaxed text-white/35">Reused by every future strategy.</p>
            </div>
          </motion.div>

          {/* Intelligence graph */}
          <motion.div
            style={{ opacity: graphOpacity, scale: graphScale }}
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          >
            <div className="relative h-[680px] w-[680px] scale-[0.65] sm:scale-[0.8] md:scale-90 lg:scale-100">
              <svg viewBox="0 0 680 680" className="absolute inset-0 h-full w-full overflow-visible">
                <defs>
                  <linearGradient id="orbitGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#8B7CFF" />
                    <stop offset="50%" stopColor="#7063D9" />
                    <stop offset="100%" stopColor="#53CFA1" />
                  </linearGradient>

                  <filter id="softGlow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

                  <radialGradient id="coreGlow">
                    <stop offset="0%" stopColor="#8B7CFF" stopOpacity="0.2" />
                    <stop offset="60%" stopColor="#8B7CFF" stopOpacity="0.05" />
                    <stop offset="100%" stopColor="#8B7CFF" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Outer orbit */}
                <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

                <motion.circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke="url(#orbitGradient)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  filter="url(#softGlow)"
                  style={{ pathLength: ringProgress, opacity: ringProgress }}
                />

                {/* Inner orbit */}
                <circle cx={center} cy={center} r="145" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="3 9" />

                <motion.circle
                  cx={center}
                  cy={center}
                  r="145"
                  fill="none"
                  stroke="rgba(139,124,255,0.45)"
                  strokeWidth="1"
                  strokeDasharray="3 9"
                  style={{ pathLength: ringProgress, opacity: ringProgress }}
                />

                {/* Core glow */}
                <motion.circle cx={center} cy={center} r="155" fill="url(#coreGlow)" style={{ opacity: coreOpacity }} />

                {/* Connections */}
                {INTELLIGENCE_NODES.map((node) => {
                  const rad = (node.angle * Math.PI) / 180;
                  const x = center + Math.cos(rad) * radius;
                  const y = center + Math.sin(rad) * radius;

                  return (
                    <motion.line
                      key={node.label}
                      x1={center}
                      y1={center}
                      x2={x}
                      y2={y}
                      stroke={node.tone}
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      style={{ pathLength: ringProgress, opacity: ringProgress }}
                    />
                  );
                })}
              </svg>

              {/* Central card */}
              <motion.div
                style={{ opacity: coreOpacity, scale: coreScale }}
                className="absolute left-1/2 top-1/2 z-30 w-[270px] -translate-x-1/2 -translate-y-1/2"
              >
                <div className="relative overflow-hidden rounded-[22px] border border-[#8B7CFF]/30 bg-[#101019]/95 px-6 py-6 shadow-[0_30px_100px_rgba(0,0,0,0.65)] backdrop-blur-xl">
                  <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#A79CFF]/80 to-transparent" />

                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#A69BFF]">Strategy</span>

                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#D97788]" />
                      <span className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#D97788]">Failed</span>
                    </div>
                  </div>

                  <h3 className="mt-6 text-[27px] font-medium leading-[1.02] tracking-[-0.045em] text-[#F2F1F5]">
                    Mean Reversion
                    <br />
                    Alpha
                  </h3>

                  <div className="mt-7 h-px w-full bg-white/[0.07]" />

                  <div className="mt-4">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/25">Intelligence Status</p>
                    <p className="mt-2 text-[13px] font-medium text-[#A79CFF]">Failure Preserved</p>
                  </div>
                </div>
              </motion.div>

              {/* Outer nodes */}
              {INTELLIGENCE_NODES.map((node) => {
                const rad = (node.angle * Math.PI) / 180;
                const posX = center + Math.cos(rad) * radius;
                const posY = center + Math.sin(rad) * radius;

                return (
                  <motion.div
                    key={node.label}
                    style={{ left: posX, top: posY, opacity: nodesOpacity, scale: nodesScale }}
                    className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                  >
                    <div
                      className="w-[210px] rounded-[18px] border bg-[#101019]/95 px-5 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
                      style={{ borderColor: `color-mix(in srgb, ${node.tone} 28%, transparent)` }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: node.tone, boxShadow: `0 0 10px ${node.tone}` }}
                        />
                        <span className="text-[8px] font-semibold uppercase tracking-[0.2em]" style={{ color: node.tone }}>
                          {node.label}
                        </span>
                      </div>

                      <p className="mt-4 text-[15px] font-medium leading-tight tracking-[-0.02em] text-white/85">{node.value}</p>
                      <p className="mt-2 text-[8px] font-medium uppercase tracking-[0.15em] text-white/28">{node.subtitle}</p>
                    </div>
                  </motion.div>
                );
              })}

              {/* Bottom label */}
              <motion.div
                style={{ opacity: nodesOpacity }}
                className="absolute bottom-[-42px] left-1/2 -translate-x-1/2 whitespace-nowrap"
              >
                <div className="flex items-center gap-3">
                  <span className="h-px w-10 bg-white/[0.08]" />
                  <span className="text-[8px] font-semibold uppercase tracking-[0.3em] text-white/20">Institutional Intelligence</span>
                  <span className="h-px w-10 bg-white/[0.08]" />
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>
    </section>
  );
}