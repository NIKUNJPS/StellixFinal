"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Building2,
  CandlestickChart,
  Check,
  Landmark,
  RadioTower,
  type LucideIcon,
} from "lucide-react";

import { RevealOnScroll } from "@/components/marketing/motion";

type AudienceTheme = {
  color: string;
  rgb: string;
  icon: LucideIcon;
};

type AudienceSegment = {
  name: string;
  label: string;
  description: string;
  benefits: readonly string[];
  theme: AudienceTheme;
};

const TARGET_SEGMENTS: readonly AudienceSegment[] = [
  {
    name: "Hedge Funds",
    label: "01 / RESEARCH ALPHA",
    description:
      "For investment teams where research quality and institutional memory directly compound the edge.",
    benefits: [
      "Research that survives PM and analyst turnover",
      "Every Sharpe split across six regimes before allocation",
      "A permanent map of what already failed, and why",
    ],
    theme: {
      color: "#A79CFF",
      rgb: "167,156,255",
      icon: CandlestickChart,
    },
  },
  {
    name: "Proprietary Trading Firms",
    label: "02 / STRATEGY INTELLIGENCE",
    description:
      "For trading organizations running multiple strategies, desks, researchers, and evolving systems.",
    benefits: [
      "Stop rediscovering blown-up strategies across desks",
      "Four automatic failure triggers with SHAP autopsies",
      "Lineage for every evolved strategy variant",
    ],
    theme: {
      color: "#7AB8FF",
      rgb: "122,184,255",
      icon: RadioTower,
    },
  },
  {
    name: "Crypto Funds",
    label: "03 / ADAPTIVE MARKETS",
    description:
      "For research environments where market structure can change faster than traditional workflows.",
    benefits: [
      "Regime-conditioning for markets that flip overnight",
      "Fast-triggering Crisis override in the ensemble",
      "24/7 data ingestion with strict temporal isolation",
    ],
    theme: {
      color: "#69D4AB",
      rgb: "105,212,171",
      icon: Building2,
    },
  },
  {
    name: "Asset Managers",
    label: "04 / GOVERNED RESEARCH",
    description:
      "For institutions where every research decision needs accountability, validation, and control.",
    benefits: [
      "A compliance-grade audit trail on every decision",
      "A 0.70 robustness gate no one can talk around",
      "Kill switch and approval workflow built in",
    ],
    theme: {
      color: "#F3C969",
      rgb: "243,201,105",
      icon: Landmark,
    },
  },
];

export function Audience() {
  return (
    <section
      id="audience"
      className="relative overflow-hidden bg-black py-8 sm:py-10 lg:py-12"
    >
      <div className="mx-auto w-full max-w-[1800px] px-3 sm:px-5 lg:px-7">
        {/* INNER CONTAINER */}

        <div className="relative overflow-hidden rounded-[34px] border border-white/[0.08] bg-[#08080B]">
          {/* BACKGROUND */}

          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[#08080B]" />

            {/* PURPLE GLOW */}

            <div
              className="absolute left-1/2 top-0 h-[650px] w-[1000px] -translate-x-1/2 rounded-full blur-[180px]"
              style={{
                background:
                  "radial-gradient(ellipse, rgba(167,156,255,0.11), transparent 68%)",
              }}
            />

            {/* GRID */}

            <div
              className="absolute inset-0 opacity-[0.025]"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)
                `,
                backgroundSize: "72px 72px",
              }}
            />
          </div>

          {/* CONTENT */}

          <div className="relative z-10 px-6 py-16 sm:px-10 sm:py-20 lg:px-14 lg:py-24">
            {/* HEADER */}

            <RevealOnScroll>
              <div className="mx-auto max-w-5xl text-center">
                <div className="flex items-center justify-center gap-4">
                  <span className="h-px w-10 bg-[#A79CFF]/40" />

                  <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#A79CFF]">
                    Who it&apos;s for
                  </p>

                  <span className="h-px w-10 bg-[#69D4AB]/40" />
                </div>

                <h2 className="mx-auto mt-7 max-w-5xl text-[clamp(3.4rem,5.8vw,6.5rem)] font-medium leading-[0.9] tracking-[-0.06em] text-[#F4F3F7]">
                  Built for teams
                  <br />

                  <span className="text-white/30">
                    that cannot afford to forget.
                  </span>
                </h2>

                <p className="mx-auto mt-8 max-w-3xl text-[16px] leading-relaxed text-white/55 sm:text-[17px]">
                  Different institutions. Different mandates. The same problem:
                  valuable research disappears when knowledge is not designed to
                  survive.
                </p>
              </div>
            </RevealOnScroll>

            {/* AUDIENCE CARDS */}

            <div className="mx-auto mt-16 grid max-w-[1550px] gap-6 sm:grid-cols-2 lg:mt-22 lg:grid-cols-4">
              {TARGET_SEGMENTS.map((segment, index) => (
                <RevealOnScroll
                  key={segment.name}
                  delay={index * 0.08}
                  className="h-full"
                >
                  <AudienceCard segment={segment} index={index} />
                </RevealOnScroll>
              ))}
            </div>

            {/* BOTTOM MESSAGE */}

            <RevealOnScroll delay={0.15}>
              <div className="mx-auto mt-16 max-w-4xl lg:mt-20">
                <div className="relative overflow-hidden rounded-[26px] border border-white/[0.08] bg-white/[0.025] px-7 py-7 text-center backdrop-blur-xl sm:px-12 sm:py-8">
                  <div className="absolute left-1/2 top-0 h-px w-[35%] -translate-x-1/2 bg-gradient-to-r from-transparent via-[#A79CFF] to-transparent opacity-60" />

                  <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#A79CFF]">
                    One Intelligence Layer
                  </p>

                  <p className="mx-auto mt-4 max-w-3xl text-[15px] leading-relaxed text-white/55 sm:text-[16px]">
                    Stellix gives research organizations a shared system for
                    preserving knowledge, understanding failure, validating
                    strategies, and improving what comes next.
                  </p>
                </div>
              </div>
            </RevealOnScroll>
          </div>
        </div>
      </div>
    </section>
  );
}

type AudienceCardProps = {
  segment: AudienceSegment;
  index: number;
};

function AudienceCard({
  segment,
  index,
}: AudienceCardProps) {
  const Icon = segment.theme.icon;

  const category = segment.label.split(" / ")[1] ?? "";

  return (
    <Link
      href="/use-cases"
      className="group block h-full"
      aria-label={`Learn more about Stellix for ${segment.name}`}
    >
      <motion.article
        whileHover={{
          y: -6,
        }}
        transition={{
          duration: 0.3,
          ease: "easeOut",
        }}
        className="relative flex h-full min-h-[470px] flex-col overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#101016]/95 p-7 backdrop-blur-xl transition-colors duration-300 hover:border-white/[0.18] sm:p-8"
      >
        {/* TOP ACCENT */}

        <div
          className="absolute inset-x-8 top-0 h-px opacity-80"
          style={{
            background: `linear-gradient(
              90deg,
              transparent,
              ${segment.theme.color},
              transparent
            )`,
          }}
        />

        {/* SUBTLE GLOW */}

        <div
          className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full opacity-0 blur-[90px] transition-opacity duration-500 group-hover:opacity-100"
          style={{
            backgroundColor: `rgba(${segment.theme.rgb},0.15)`,
          }}
        />

        {/* HEADER */}

        <div className="relative flex items-start justify-between">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl border"
            style={{
              borderColor: `rgba(${segment.theme.rgb},0.45)`,
              backgroundColor: `rgba(${segment.theme.rgb},0.09)`,
            }}
          >
            <Icon
              className="h-6 w-6"
              style={{
                color: segment.theme.color,
              }}
            />
          </div>

          <span
            className="text-[11px] font-semibold tracking-[0.18em]"
            style={{
              color: segment.theme.color,
            }}
          >
            0{index + 1}
          </span>
        </div>

        {/* TITLE */}

        <div className="relative mt-8">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.22em]"
            style={{
              color: segment.theme.color,
            }}
          >
            {category}
          </p>

          <h3 className="mt-3 text-[25px] font-semibold tracking-[-0.04em] text-white sm:text-[27px]">
            {segment.name}
          </h3>
        </div>

        {/* DESCRIPTION */}

        <p className="relative mt-5 text-[14px] leading-relaxed text-white/50 sm:text-[15px]">
          {segment.description}
        </p>

        {/* BENEFITS */}

        <ul className="relative mt-8 space-y-5">
          {segment.benefits.map((benefit) => (
            <li
              key={benefit}
              className="flex items-start gap-3.5 text-[14px] leading-relaxed text-white/65 sm:text-[15px]"
            >
              {/* CHECKBOX */}

              <span
                className="mt-[3px] flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[5px] border"
                style={{
                  borderColor: `rgba(${segment.theme.rgb},0.7)`,
                  backgroundColor: `rgba(${segment.theme.rgb},0.13)`,
                  boxShadow: `0 0 16px rgba(${segment.theme.rgb},0.10)`,
                }}
              >
                <Check
                  className="h-3.5 w-3.5"
                  strokeWidth={3}
                  style={{
                    color: segment.theme.color,
                  }}
                />
              </span>

              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        {/* FOOTER */}

        <div className="relative mt-auto flex items-center gap-3 pt-10">
          <span
            className="h-px flex-1"
            style={{
              background: `linear-gradient(
                90deg,
                rgba(${segment.theme.rgb},0.5),
                transparent
              )`,
            }}
          />

          <span
            className="text-[9px] font-semibold uppercase tracking-[0.18em] opacity-70 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              color: segment.theme.color,
            }}
          >
            Explore
          </span>

          <ArrowUpRight
            className="h-[18px] w-[18px] transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1"
            style={{
              color: segment.theme.color,
            }}
          />
        </div>
      </motion.article>
    </Link>
  );
}