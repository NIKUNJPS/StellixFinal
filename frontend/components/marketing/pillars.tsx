"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BrainCircuit,
  Database,
  Maximize2,
  RotateCcw,
  X,
} from "lucide-react";

import { RevealOnScroll } from "@/components/marketing/motion";
import { PILLARS } from "@/lib/marketing/content";

const PILLAR_ARTIFACTS: Record<
  string,
  {
    title: string;
    body: string;
    signal: string;
    icon: typeof Activity;
    color: string;
    rgb: string;
  }
> = {
  regime: {
    title: "REGIME DETECTION ENGINE",
    body: `hmm=Bear  pelt=Bear  gmm=High-Vol  garch=CRISIS
→ ensemble: CRISIS (fast override) · conf 0.81
labels: Bull · Bear · High-Vol · Low-Vol · Sideways · Crisis`,
    signal: "MARKET CONTEXT DETECTED",
    icon: Activity,
    color: "#A79CFF",
    rgb: "167,156,255",
  },

  failure: {
    title: "FAILURE PRESERVATION LAYER",
    body: `REVOKE UPDATE, DELETE ON failures FROM stellix_app;

{ "regime_at_failure": "Low-Volatility",
  "trigger_condition": "drawdown_breach",
  "feature_attribution": [
    { "feature": "realized_vol_20", "shap": 0.41 } ] }`,
    signal: "FAILURE IMMUTABLY PRESERVED",
    icon: Database,
    color: "#E37B8B",
    rgb: "227,123,139",
  },

  memory: {
    title: "INSTITUTIONAL MEMORY GRAPH",
    body: `MATCH (s:Strategy)-[e:FAILED_IN]->(r:Regime)
WITH r.regime_label AS regime,
     e.trigger_condition AS trigger,
     count(e) AS n
WHERE n >= 3
RETURN regime, trigger, n ORDER BY n DESC`,
    signal: "KNOWLEDGE COMPOUNDING",
    icon: BrainCircuit,
    color: "#69D4AB",
    rgb: "105,212,171",
  },
};

const PILLAR_DISPLAY_NAMES: Record<string, string> = {
  regime: "Regime-Conditioning",
  failure: "Failure-as-Asset",
  memory: "Compounding Memory",
};

export function Pillars() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);

  const activePillar = activeId ?? hoveredId;

  return (
    <section className="relative bg-black py-6 sm:py-8 lg:py-10">
      <div className="mx-auto w-full max-w-[1800px] px-3 sm:px-5 lg:px-7">
        <div className="relative overflow-hidden rounded-[34px] border border-white/[0.08] bg-[#08080B]">
          {/* ================= BACKGROUND ================= */}

          <div className="pointer-events-none absolute inset-0">
            {/* Base */}
            <div className="absolute inset-0 bg-[#08080B]" />

            {/* LEFT PURPLE ATMOSPHERE */}
            <motion.div
              animate={{
                opacity:
                  activePillar === "regime"
                    ? 1
                    : activePillar
                    ? 0.35
                    : 0.7,
                scale: activePillar === "regime" ? 1.15 : 1,
              }}
              transition={{ duration: 0.6 }}
              className="absolute -left-[18%] top-[28%] h-[650px] w-[650px] rounded-full blur-[150px]"
              style={{
                background:
                  "radial-gradient(circle, rgba(167,156,255,0.22), transparent 68%)",
              }}
            />

            {/* CENTER RED ATMOSPHERE */}
            <motion.div
              animate={{
                opacity:
                  activePillar === "failure"
                    ? 1
                    : activePillar
                    ? 0.3
                    : 0.65,
                scale: activePillar === "failure" ? 1.2 : 1,
              }}
              transition={{ duration: 0.6 }}
              className="absolute left-1/2 top-[34%] h-[580px] w-[580px] -translate-x-1/2 rounded-full blur-[150px]"
              style={{
                background:
                  "radial-gradient(circle, rgba(227,123,139,0.18), transparent 68%)",
              }}
            />

            {/* RIGHT GREEN ATMOSPHERE */}
            <motion.div
              animate={{
                opacity:
                  activePillar === "memory"
                    ? 1
                    : activePillar
                    ? 0.35
                    : 0.7,
                scale: activePillar === "memory" ? 1.15 : 1,
              }}
              transition={{ duration: 0.6 }}
              className="absolute -right-[18%] top-[28%] h-[650px] w-[650px] rounded-full blur-[150px]"
              style={{
                background:
                  "radial-gradient(circle, rgba(105,212,171,0.18), transparent 68%)",
              }}
            />

            {/* Grid */}
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

            {/* Horizontal system line */}
            <div className="absolute left-[7%] right-[7%] top-[57%] h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

            {/* Corner details */}
            <div className="absolute left-8 top-8 h-16 w-16 border-l border-t border-white/[0.1]" />
            <div className="absolute right-8 top-8 h-16 w-16 border-r border-t border-white/[0.1]" />
            <div className="absolute bottom-8 left-8 h-16 w-16 border-b border-l border-white/[0.1]" />
            <div className="absolute bottom-8 right-8 h-16 w-16 border-b border-r border-white/[0.1]" />
          </div>

          {/* ================= HEADER ================= */}

          <div className="relative z-20 px-6 pt-12 text-center sm:px-10 sm:pt-16 lg:pt-20">
            <RevealOnScroll>
              <div className="flex items-center justify-center gap-3">
                <span className="h-px w-8 bg-[#A79CFF]/40" />

                <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#A79CFF]">
                  The Intelligence Architecture
                </p>

                <span className="h-px w-8 bg-[#69D4AB]/40" />
              </div>

              <h2 className="mx-auto mt-6 max-w-4xl text-[clamp(3rem,5.5vw,6rem)] font-semibold leading-[0.9] tracking-[-0.06em] text-[#F4F3F7]">
                Three systems.
                <br />

                <span className="font-medium text-white/30">
                  One intelligence.
                </span>
              </h2>

              <p className="mx-auto mt-7 max-w-xl text-[14px] font-normal leading-relaxed text-white/40">
                Three independent layers connected through a single research
                intelligence system.
              </p>
            </RevealOnScroll>
          </div>

          {/* ================= SYSTEM MAP ================= */}

          <div className="relative z-20 mx-auto mt-16 max-w-[1600px] px-5 pb-20 sm:px-8 lg:px-12">
            {/* CONNECTION SYSTEM */}

            <div className="pointer-events-none absolute left-[10%] right-[10%] top-[48%] hidden h-px lg:block">
              <motion.div
                animate={{
                  opacity:
                    activePillar === "regime" ||
                    activePillar === "failure"
                      ? [0.25, 1, 0.25]
                      : 0.35,
                }}
                transition={{
                  duration: 2,
                  repeat:
                    activePillar === "regime" ||
                    activePillar === "failure"
                      ? Infinity
                      : 0,
                }}
                className="absolute left-0 h-px w-1/2"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(167,156,255,0.7), rgba(227,123,139,0.7))",
                  boxShadow:
                    activePillar === "regime" ||
                    activePillar === "failure"
                      ? "0 0 20px rgba(200,130,200,0.7)"
                      : "none",
                }}
              />

              <motion.div
                animate={{
                  opacity:
                    activePillar === "failure" ||
                    activePillar === "memory"
                      ? [0.25, 1, 0.25]
                      : 0.35,
                }}
                transition={{
                  duration: 2,
                  repeat:
                    activePillar === "failure" ||
                    activePillar === "memory"
                      ? Infinity
                      : 0,
                }}
                className="absolute right-0 h-px w-1/2"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(227,123,139,0.7), rgba(105,212,171,0.7))",
                  boxShadow:
                    activePillar === "failure" ||
                    activePillar === "memory"
                      ? "0 0 20px rgba(150,200,170,0.6)"
                      : "none",
                }}
              />
            </div>

            {/* THREE CARDS */}

            <div className="relative grid items-center gap-8 lg:grid-cols-3 lg:gap-10 xl:gap-16">
              {PILLARS.map((pillar, index) => {
                const artifact = PILLAR_ARTIFACTS[pillar.id]!;
                const Icon = artifact.icon;

                const displayName =
                  PILLAR_DISPLAY_NAMES[pillar.id] ?? pillar.name;

                const isActive = activeId === pillar.id;
                const isHovered = hoveredId === pillar.id;
                const isFocused = isActive || isHovered;

                const isCenter = pillar.id === "failure";

                return (
                  <motion.div
                    key={pillar.id}
                    initial={{
                      opacity: 0,
                      y: 50,
                    }}
                    whileInView={{
                      opacity: 1,
                      y: 0,
                    }}
                    viewport={{
                      once: true,
                      amount: 0.25,
                    }}
                    transition={{
                      duration: 0.8,
                      delay: index * 0.12,
                    }}
                    animate={{
                      scale: isFocused ? 1.025 : 1,
                      y: isFocused
                        ? -12
                        : isCenter
                        ? -16
                        : 0,
                    }}
                    onMouseEnter={() => setHoveredId(pillar.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`relative ${
                      isCenter ? "lg:-mt-10" : ""
                    }`}
                  >
                    {/* EXTENDED COLOUR FIELD */}

                    <motion.div
                      animate={{
                        opacity: isFocused ? 1 : 0.45,
                        scale: isFocused ? 1.15 : 1,
                      }}
                      transition={{
                        duration: 0.5,
                      }}
                      className="pointer-events-none absolute -inset-x-16 -inset-y-20 rounded-[80px] blur-[70px]"
                      style={{
                        background: `radial-gradient(circle, rgba(${artifact.rgb}, ${
                          isFocused ? "0.22" : "0.10"
                        }), transparent 68%)`,
                      }}
                    />

                    {/* CARD */}

                    <motion.article
                      onClick={() =>
                        setActiveId(
                          activeId === pillar.id ? null : pillar.id
                        )
                      }
                      onDoubleClick={() => setInspectId(pillar.id)}
                      whileTap={{ scale: 0.98 }}
                      className="group relative min-h-[420px] cursor-pointer overflow-hidden rounded-[28px] border bg-[#101016]/90 p-7 shadow-[0_35px_100px_rgba(0,0,0,0.6)] backdrop-blur-2xl sm:p-8"
                      animate={{
                        borderColor: isFocused
                          ? `rgba(${artifact.rgb},0.65)`
                          : "rgba(255,255,255,0.09)",
                        boxShadow: isFocused
                          ? `0 30px 110px rgba(${artifact.rgb},0.12)`
                          : "0 35px 100px rgba(0,0,0,0.55)",
                      }}
                    >
                      {/* COLOR TOP EDGE */}

                      <motion.div
                        animate={{
                          opacity: isFocused ? 1 : 0.6,
                          scaleX: isFocused ? 1 : 0.65,
                        }}
                        className="absolute inset-x-10 top-0 h-px origin-center"
                        style={{
                          background: `linear-gradient(90deg, transparent, ${artifact.color}, transparent)`,
                          boxShadow: `0 0 18px ${artifact.color}`,
                        }}
                      />

                      {/* NUMBER */}

                      <div className="absolute right-7 top-7">
                        <span
                          className="text-[10px] font-semibold tracking-[0.25em]"
                          style={{
                            color: isFocused
                              ? artifact.color
                              : "rgba(255,255,255,0.18)",
                          }}
                        >
                          0{index + 1}
                        </span>
                      </div>

                      {/* ICON + STATUS */}

                      <div className="flex items-center gap-3">
                        <motion.div
                          animate={{
                            rotate: isFocused ? [0, 8, -8, 0] : 0,
                            scale: isFocused ? 1.08 : 1,
                          }}
                          transition={{
                            duration: 0.5,
                          }}
                          className="flex h-12 w-12 items-center justify-center rounded-2xl border"
                          style={{
                            borderColor: `rgba(${artifact.rgb},0.35)`,
                            backgroundColor: `rgba(${artifact.rgb},0.08)`,
                            boxShadow: isFocused
                              ? `0 0 30px rgba(${artifact.rgb},0.18)`
                              : "none",
                          }}
                        >
                          <Icon
                            className="h-5 w-5"
                            style={{
                              color: artifact.color,
                            }}
                          />
                        </motion.div>

                        <div>
                          <span
                            className="block text-[8px] font-semibold uppercase tracking-[0.24em]"
                            style={{
                              color: artifact.color,
                            }}
                          >
                            System online
                          </span>

                          <span className="mt-1 block text-[8px] font-normal uppercase tracking-[0.16em] text-white/20">
                            Intelligence layer
                          </span>
                        </div>
                      </div>

                      {/* TITLE */}

                      <h3
                        className="mt-10 text-[clamp(1.9rem,2.6vw,2.65rem)] font-bold leading-[0.95] tracking-[-0.06em]"
                        style={{
                          color: artifact.color,
                          textShadow: isFocused
                            ? `0 0 32px rgba(${artifact.rgb},0.22)`
                            : "none",
                        }}
                      >
                        {displayName}
                      </h3>

                      {/* DESCRIPTION */}

                      <p className="mt-5 min-h-[115px] text-[13px] font-normal leading-[1.8] text-white/50">
                        {pillar.mechanism}
                      </p>

                      {/* ACTIVE DATA */}

                      <AnimatePresence>
                        {isActive && (
                          <motion.div
                            initial={{
                              height: 0,
                              opacity: 0,
                              y: 10,
                            }}
                            animate={{
                              height: "auto",
                              opacity: 1,
                              y: 0,
                            }}
                            exit={{
                              height: 0,
                              opacity: 0,
                              y: 10,
                            }}
                            transition={{
                              duration: 0.4,
                            }}
                            className="overflow-hidden"
                          >
                            <div
                              className="mt-7 border-t pt-6"
                              style={{
                                borderColor: `rgba(${artifact.rgb},0.15)`,
                              }}
                            >
                              <p
                                className="text-[8px] font-semibold uppercase tracking-[0.2em]"
                                style={{
                                  color: artifact.color,
                                }}
                              >
                                {artifact.signal}
                              </p>

                              <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.07] bg-black/40">
                                <div className="border-b border-white/[0.06] px-4 py-3">
                                  <span className="text-[8px] font-medium uppercase tracking-[0.18em] text-white/30">
                                    Live artifact
                                  </span>
                                </div>

                                <pre className="overflow-x-auto p-4 text-[9px] font-normal leading-[1.75] text-white/75">
                                  {artifact.body}
                                </pre>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* BOTTOM */}

                      <div className="mt-8 flex items-center justify-between border-t border-white/[0.07] pt-5">
                        <span className="text-[8px] font-medium uppercase tracking-[0.2em] text-white/25">
                          {isActive
                            ? "Click to collapse"
                            : "Click to explore"}
                        </span>

                        <motion.div
                          animate={{
                            rotate: isFocused ? 45 : 0,
                            scale: isFocused ? 1.15 : 1,
                          }}
                        >
                          <Maximize2
                            className="h-4 w-4"
                            style={{
                              color: isFocused
                                ? artifact.color
                                : "rgba(255,255,255,0.25)",
                            }}
                          />
                        </motion.div>
                      </div>
                    </motion.article>

                    {/* BOTTOM SIGNAL */}

                    <motion.div
                      animate={{
                        opacity: isFocused ? 1 : 0.35,
                      }}
                      className="mt-5 flex items-center justify-center gap-3"
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          backgroundColor: artifact.color,
                          boxShadow: `0 0 12px ${artifact.color}`,
                        }}
                      />

                      <span
                        className="text-[8px] font-semibold uppercase tracking-[0.22em]"
                        style={{
                          color: artifact.color,
                        }}
                      >
                        {artifact.signal}
                      </span>
                    </motion.div>
                  </motion.div>
                );
              })}
            </div>

            {/* SYSTEM INSTRUCTION */}

            <div className="mt-16 flex items-center justify-center gap-4">
              <span className="h-px w-12 bg-gradient-to-r from-transparent to-white/[0.12]" />

              <span className="text-[8px] font-semibold uppercase tracking-[0.3em] text-white/20">
                Hover · Explore · Click · Lock · Double Click · Inspect
              </span>

              <span className="h-px w-12 bg-gradient-to-l from-transparent to-white/[0.12]" />
            </div>
          </div>
        </div>
      </div>

      {/* ================= IMMERSIVE INSPECTION ================= */}

      <AnimatePresence>
        {inspectId &&
          (() => {
            const pillar = PILLARS.find(
              (item) => item.id === inspectId
            )!;

            const artifact = PILLAR_ARTIFACTS[inspectId]!;
            const Icon = artifact.icon;

            const displayName =
              PILLAR_DISPLAY_NAMES[pillar.id] ?? pillar.name;

            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-2xl"
                onClick={() => setInspectId(null)}
              >
                {/* COLOR ATMOSPHERE */}

                <div
                  className="pointer-events-none absolute h-[700px] w-[700px] rounded-full blur-[160px]"
                  style={{
                    background: `rgba(${artifact.rgb},0.12)`,
                  }}
                />

                <motion.div
                  initial={{
                    scale: 0.9,
                    opacity: 0,
                    y: 35,
                  }}
                  animate={{
                    scale: 1,
                    opacity: 1,
                    y: 0,
                  }}
                  exit={{
                    scale: 0.9,
                    opacity: 0,
                    y: 35,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 150,
                    damping: 20,
                  }}
                  onClick={(event) => event.stopPropagation()}
                  className="relative w-full max-w-4xl overflow-hidden rounded-[32px] border border-white/[0.1] bg-[#0D0D13] p-8 shadow-[0_50px_160px_rgba(0,0,0,0.85)] sm:p-12"
                >
                  {/* TOP COLOR */}

                  <div
                    className="absolute inset-x-20 top-0 h-px"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${artifact.color}, transparent)`,
                    }}
                  />

                  <button
                    onClick={() => setInspectId(null)}
                    className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] text-white/40 transition hover:border-white/20 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  <div className="flex items-center gap-5">
                    <div
                      className="flex h-16 w-16 items-center justify-center rounded-2xl border"
                      style={{
                        borderColor: `rgba(${artifact.rgb},0.4)`,
                        backgroundColor: `rgba(${artifact.rgb},0.1)`,
                        boxShadow: `0 0 40px rgba(${artifact.rgb},0.12)`,
                      }}
                    >
                      <Icon
                        className="h-7 w-7"
                        style={{
                          color: artifact.color,
                        }}
                      />
                    </div>

                    <div>
                      <p
                        className="text-[9px] font-semibold uppercase tracking-[0.25em]"
                        style={{
                          color: artifact.color,
                        }}
                      >
                        Pillar 0{PILLARS.indexOf(pillar) + 1}
                      </p>

                      <h2
                        className="mt-2 text-3xl font-bold tracking-[-0.05em] sm:text-4xl"
                        style={{
                          color: artifact.color,
                        }}
                      >
                        {displayName}
                      </h2>
                    </div>
                  </div>

                  <p className="mt-10 max-w-2xl text-lg font-normal leading-relaxed text-white/60">
                    {pillar.mechanism}
                  </p>

                  <div className="mt-10 overflow-hidden rounded-2xl border border-white/[0.08] bg-black/40">
                    <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
                      <span
                        className="text-[9px] font-semibold uppercase tracking-[0.22em]"
                        style={{
                          color: artifact.color,
                        }}
                      >
                        {artifact.title}
                      </span>

                      <span className="text-[8px] uppercase tracking-[0.2em] text-white/20">
                        Intelligence artifact
                      </span>
                    </div>

                    <pre className="overflow-x-auto p-7 text-[12px] font-normal leading-[1.9] text-white/80">
                      {artifact.body}
                    </pre>
                  </div>

                  <div className="mt-8 flex items-center justify-between">
                    <span
                      className="text-[9px] font-semibold uppercase tracking-[0.2em]"
                      style={{
                        color: artifact.color,
                      }}
                    >
                      {artifact.signal}
                    </span>

                    <button
                      onClick={() => setInspectId(null)}
                      className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/35 transition hover:text-white"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Return to system
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
      </AnimatePresence>
    </section>
  );
}