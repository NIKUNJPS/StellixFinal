"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BrainCircuit,
  FlaskConical,
  GitBranch,
  LineChart,
  Search,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { RevealOnScroll } from "@/components/marketing/motion";
import { WORKFLOW_STEPS } from "@/lib/marketing/content";

type Theme = {
  color: string;
  rgb: string;
  icon: LucideIcon;
};

const STEP_THEMES: Record<string, Theme> = {
  Research: { color: "#A79CFF", rgb: "167,156,255", icon: Search },
  Detect: { color: "#B69CFF", rgb: "182,156,255", icon: LineChart },
  Build: { color: "#69D4AB", rgb: "105,212,171", icon: FlaskConical },
  Validate: { color: "#7AB8FF", rgb: "122,184,255", icon: ShieldCheck },
  Learn: { color: "#E37B8B", rgb: "227,123,139", icon: BrainCircuit },
  Evolve: { color: "#F3C969", rgb: "243,201,105", icon: Sparkles },
};

const DEFAULT_THEME: Theme = {
  color: "#A79CFF",
  rgb: "167,156,255",
  icon: GitBranch,
};

function getTheme(name: string): Theme {
  return STEP_THEMES[name] ?? DEFAULT_THEME;
}

const INFINITY_POSITIONS = [
  { x: 20, y: 21 },
  { x: 4, y: 45 },
  { x: 20, y: 69 },
  { x: 65, y: 21 },
  { x: 80, y: 45 },
  { x: 68, y: 68 },
];

export function Loop() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const activeIndex = hoveredIndex ?? 0;

  const activeStep =
    WORKFLOW_STEPS[activeIndex] ?? WORKFLOW_STEPS[0];

  const activeTheme = getTheme(activeStep?.name ?? "");

  return (
    <section
      id="how"
      className="relative overflow-hidden bg-black py-8 sm:py-10 lg:py-12"
    >
      <div className="mx-auto w-full max-w-[1800px] px-3 sm:px-5 lg:px-7">
        <div className="relative overflow-hidden rounded-[34px] border border-white/[0.1] bg-[#08080B]">

          {/* BACKGROUND */}

          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[#08080B]" />

            <motion.div
              animate={{
                scale: hoveredIndex !== null ? 1.1 : 1,
                opacity: hoveredIndex !== null ? 0.95 : 0.7,
              }}
              transition={{ duration: 0.6 }}
              className="absolute left-1/2 top-1/2 h-[800px] w-[1100px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[180px]"
              style={{
                background: `radial-gradient(
                  ellipse,
                  rgba(${activeTheme.rgb},0.18),
                  transparent 68%
                )`,
              }}
            />

            <div
              className="absolute inset-0 opacity-[0.035]"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(255,255,255,0.45) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255,255,255,0.45) 1px, transparent 1px)
                `,
                backgroundSize: "72px 72px",
              }}
            />

            <div className="absolute left-[8%] right-[8%] top-1/2 h-px bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />
          </div>

          {/* HEADER */}

          <div className="relative z-10 px-6 pt-12 text-center sm:px-10 sm:pt-16 lg:pt-20">
            <RevealOnScroll>
              <div className="flex items-center justify-center gap-3">
                <span className="h-px w-8 bg-[#A79CFF]/60" />

                <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#A79CFF]">
                  How it compounds
                </p>

                <span className="h-px w-8 bg-[#69D4AB]/60" />
              </div>

              <h2 className="mx-auto mt-6 max-w-4xl text-[clamp(3rem,5.5vw,6rem)] font-medium leading-[0.9] tracking-[-0.06em] text-[#F4F3F7]">
                One loop.
                <br />

                <span className="text-white/35">
                  Smarter every turn.
                </span>
              </h2>

              <p className="mx-auto mt-7 max-w-xl text-[14px] leading-relaxed text-white/65">
                Every research cycle leaves behind intelligence that improves
                the next one.
              </p>
            </RevealOnScroll>
          </div>

          {/* INFINITY SYSTEM */}

          <div className="relative z-10 mx-auto mt-14 max-w-[1500px] px-4 pb-20 sm:px-8">
            <div className="relative mx-auto h-[650px] w-full max-w-[1250px] sm:h-[700px] lg:h-[720px]">

              {/* INFINITY SVG */}

              <svg
                viewBox="0 0 1200 700"
                className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                fill="none"
              >
                <defs>
                  <filter id="infinityGlow">
                    <feGaussianBlur
                      stdDeviation="7"
                      result="blur"
                    />

                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

                  <filter id="softGlow">
                    <feGaussianBlur stdDeviation="18" />
                  </filter>

                  <linearGradient
                    id="infinityGradient"
                    x1="120"
                    y1="350"
                    x2="1080"
                    y2="350"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop
                      offset="0%"
                      stopColor="#A79CFF"
                      stopOpacity="0.65"
                    />

                    <stop
                      offset="50%"
                      stopColor={activeTheme.color}
                      stopOpacity="1"
                    />

                    <stop
                      offset="100%"
                      stopColor="#69D4AB"
                      stopOpacity="0.65"
                    />
                  </linearGradient>
                </defs>

                {/* SOFT BACKING GLOW */}

                <motion.path
                  d="
                    M 145 350
                    C 145 180, 340 135, 500 250
                    C 555 290, 575 325, 600 350
                    C 625 375, 645 410, 700 450
                    C 860 565, 1055 520, 1055 350
                    C 1055 180, 860 135, 700 250
                    C 645 290, 625 325, 600 350
                    C 575 375, 555 410, 500 450
                    C 340 565, 145 520, 145 350
                  "
                  stroke={`rgba(${activeTheme.rgb},0.2)`}
                  strokeWidth="34"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#softGlow)"
                  animate={{
                    opacity: hoveredIndex !== null ? 1 : 0.7,
                  }}
                  transition={{ duration: 0.5 }}
                />

                {/* STRONG MAIN PATH */}

                <motion.path
                  d="
                    M 145 350
                    C 145 180, 340 135, 500 250
                    C 555 290, 575 325, 600 350
                    C 625 375, 645 410, 700 450
                    C 860 565, 1055 520, 1055 350
                    C 1055 180, 860 135, 700 250
                    C 645 290, 625 325, 600 350
                    C 575 375, 555 410, 500 450
                    C 340 565, 145 520, 145 350
                  "
                  stroke="url(#infinityGradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#infinityGlow)"
                  animate={{
                    pathLength: [0.95, 1, 0.95],
                    opacity: [0.75, 1, 0.75],
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />

                {/* VISIBLE FLOW CHECKS */}

                <motion.path
                  d="
                    M 145 350
                    C 145 180, 340 135, 500 250
                    C 555 290, 575 325, 600 350
                    C 625 375, 645 410, 700 450
                    C 860 565, 1055 520, 1055 350
                    C 1055 180, 860 135, 700 250
                    C 645 290, 625 325, 600 350
                    C 575 375, 555 410, 500 450
                    C 340 565, 145 520, 145 350
                  "
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth="1.4"
                  strokeDasharray="7 16"
                  strokeLinecap="round"
                  animate={{
                    strokeDashoffset: [0, -160],
                  }}
                  transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />

                {/* SECOND SIGNAL LAYER */}

                <motion.path
                  d="
                    M 145 350
                    C 145 180, 340 135, 500 250
                    C 555 290, 575 325, 600 350
                    C 625 375, 645 410, 700 450
                    C 860 565, 1055 520, 1055 350
                    C 1055 180, 860 135, 700 250
                    C 645 290, 625 325, 600 350
                    C 575 375, 555 410, 500 450
                    C 340 565, 145 520, 145 350
                  "
                  stroke={activeTheme.color}
                  strokeWidth="2"
                  strokeDasharray="3 34"
                  strokeLinecap="round"
                  filter="url(#infinityGlow)"
                  animate={{
                    strokeDashoffset: [0, -220],
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
              </svg>

              {/* INSTITUTIONAL MEMORY CENTER */}

              <motion.div
                animate={{
                  scale: hoveredIndex !== null ? 1.06 : 1,
                  borderColor: `rgba(${activeTheme.rgb},0.65)`,
                  boxShadow: `0 0 90px rgba(${activeTheme.rgb},0.22)`,
                }}
                transition={{ duration: 0.4 }}
                className="absolute left-[45%] top-[40%] z-30 flex h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border bg-[#0D0D13]/95 text-center backdrop-blur-xl sm:h-[170px] sm:w-[170px]"
              >
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full border"
                  style={{
                    borderColor: `rgba(${activeTheme.rgb},0.45)`,
                    backgroundColor: `rgba(${activeTheme.rgb},0.1)`,
                  }}
                >
                  <BrainCircuit
                    className="h-5 w-5"
                    style={{
                      color: activeTheme.color,
                    }}
                  />
                </div>

                <span
                  className="mt-4 text-[8px] font-semibold uppercase tracking-[0.24em]"
                  style={{
                    color: activeTheme.color,
                  }}
                >
                  Institutional
                </span>

                <span className="mt-1 text-[14px] font-semibold tracking-[-0.02em] text-white">
                  Memory
                </span>
              </motion.div>

              {/* SIX STAGES */}

              {WORKFLOW_STEPS.map((step, index) => {
                const theme = getTheme(step.name);
                const Icon = theme.icon;

                const position =
                  INFINITY_POSITIONS[index] ??
                  INFINITY_POSITIONS[0]!;

                const isActive = activeIndex === index;

                return (
                  <motion.div
                    key={`${step.name}-${index}`}
                    className="absolute z-40"
                    style={{
                      left: `${position.x}%`,
                      top: `${position.y}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    animate={{
                      scale: isActive ? 1.08 : 1,
                      y: isActive ? -7 : 0,
                    }}
                    transition={{
                      duration: 0.35,
                    }}
                  >
                    <motion.article
                      animate={{
                        borderColor: isActive
                          ? `rgba(${theme.rgb},0.85)`
                          : "rgba(255,255,255,0.16)",

                        boxShadow: isActive
                          ? `0 25px 90px rgba(${theme.rgb},0.2)`
                          : "0 20px 65px rgba(0,0,0,0.5)",
                      }}
                      className="relative flex h-[88px] w-[160px] cursor-pointer items-center gap-4 overflow-hidden rounded-[26px] border bg-[#101016]/95 px-5 backdrop-blur-xl sm:h-[96px] sm:w-[185px]"
                    >
                      {/* TOP ACCENT */}

                      <motion.div
                        animate={{
                          opacity: isActive ? 1 : 0.55,
                          scaleX: isActive ? 1 : 0.65,
                        }}
                        className="absolute inset-x-6 top-0 h-px origin-center"
                        style={{
                          background: `linear-gradient(
                            90deg,
                            transparent,
                            ${theme.color},
                            transparent
                          )`,
                        }}
                      />

                      {/* ICON */}

                      <motion.div
                        animate={{
                          rotate: isActive
                            ? [0, 6, -6, 0]
                            : 0,

                          scale: isActive ? 1.08 : 1,
                        }}
                        transition={{
                          duration: 0.5,
                        }}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border"
                        style={{
                          borderColor: `rgba(${theme.rgb},0.5)`,
                          backgroundColor: `rgba(${theme.rgb},0.12)`,
                        }}
                      >
                        <Icon
                          className="h-[18px] w-[18px]"
                          style={{
                            color: theme.color,
                          }}
                        />
                      </motion.div>

                      {/* NAME */}

                      <h3 className="text-[14px] font-semibold tracking-[-0.025em] text-white sm:text-[15px]">
                        {step.name}
                      </h3>

                      {/* NUMBER */}

                      <span
                        className="absolute right-4 top-4 text-[8px] font-semibold tracking-[0.18em]"
                        style={{
                          color: isActive
                            ? theme.color
                            : "rgba(255,255,255,0.42)",
                        }}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      {/* ACTIVE INDICATOR */}

                      <motion.span
                        animate={{
                          opacity: isActive ? 1 : 0.35,
                          scale: isActive ? 1 : 0.7,
                        }}
                        transition={{
                          duration: 0.25,
                        }}
                        className="absolute bottom-4 right-4 h-1.5 w-1.5 rounded-full"
                        style={{
                          backgroundColor: theme.color,
                          boxShadow: `0 0 12px ${theme.color}`,
                        }}
                      />
                    </motion.article>
                  </motion.div>
                );
              })}
            </div>

            {/* HOVER DESCRIPTION BOX */}

            <div className="mx-auto mt-5 max-w-3xl">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeIndex}
                  initial={{
                    opacity: 0,
                    y: 14,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  exit={{
                    opacity: 0,
                    y: -10,
                  }}
                  transition={{
                    duration: 0.3,
                  }}
                  className="rounded-2xl border border-white/[0.12] bg-white/[0.035] px-6 py-5 text-center shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl"
                >
                  <div className="flex items-center justify-center gap-3">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: activeTheme.color,
                        boxShadow: `0 0 16px ${activeTheme.color}`,
                      }}
                    />

                    <span
                      className="text-[9px] font-semibold uppercase tracking-[0.24em]"
                      style={{
                        color: activeTheme.color,
                      }}
                    >
                      Stage {String(activeIndex + 1).padStart(2, "0")} ·{" "}
                      {activeStep?.name}
                    </span>
                  </div>

                  <p className="mx-auto mt-3 max-w-xl text-[13px] leading-relaxed text-white/70">
                    {activeStep?.body ?? ""}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* FLOW INDICATORS */}

            <div className="mt-10 flex items-center justify-center gap-3">
              {WORKFLOW_STEPS.map((step, index) => {
                const theme = getTheme(step.name);
                const isActive = activeIndex === index;

                return (
                  <motion.div
                    key={`${step.name}-indicator`}
                    animate={{
                      width: isActive ? 30 : 8,
                      opacity: isActive ? 1 : 0.55,
                    }}
                    transition={{
                      duration: 0.3,
                    }}
                    className="h-[3px] rounded-full"
                    style={{
                      backgroundColor: theme.color,
                      boxShadow: isActive
                        ? `0 0 12px ${theme.color}`
                        : "none",
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}