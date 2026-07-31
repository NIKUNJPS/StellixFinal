"use client";

/**
 * Page 01 — Landing (Cold Precision redesign).
 *
 * White, high-contrast, editorial-serif headlines, electric-blue #0066FF used
 * sparingly. The hero animates on load (the only on-load motion on the page);
 * every other section reveals on scroll through the shared motion primitives.
 * Copy: hero/villain/CTA lines from the redesign spec; card/pillar/workflow
 * copy from the approved Batch 15 content (lib/marketing/content.ts).
 */

import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  ArrowRight,
  DoorOpen,
  GitBranch,
  LineChart,
  Network,
  RefreshCcw,
  ShieldCheck,
  Skull,
  TimerReset,
  TrendingDown,
  Dna,
  FlaskConical,
  Activity,
} from "lucide-react";

import {
  CountUp,
  DrawingLine,
  EASE_ENTRANCE,
  RevealOnScroll,
  StaggerChildren,
  StaggerItem,
} from "@/components/marketing/motion";
import { DemoRequestModal } from "@/components/marketing/demo-modal";
import { TerminalCard } from "@/components/marketing/terminal-card";
import {
  FEATURE_CARDS,
  PILLARS,
  PROBLEM_CARDS,
  WORKFLOW_STEPS,
} from "@/lib/marketing/content";

// ---------------------------------------------------------------------------
// Static data + module-level variants (never recreated in render)
// ---------------------------------------------------------------------------
const HERO_STATS = [
  { value: 4, label: "detection algorithms" },
  { value: 8, label: "graph edge types" },
  { value: 5, label: "validation methods" },
] as const;

const HERO_LINE: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_ENTRANCE } },
};

const HERO_STAGGER: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

// Word-by-word hero (Batch 20). The line wrapper is a nested stagger container so
// its words cascade at 0.08s; each word rises 20px with the entrance ease. GPU-only
// (opacity + y transform), so it holds 60fps.
const HERO_LINE_WRAP: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const HERO_WORD: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_ENTRANCE } },
};

const HERO_FADE: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_ENTRANCE } },
};

const PROBLEM_ICONS = [DoorOpen, TrendingDown, RefreshCcw, TimerReset] as const;

const FEATURE_ICONS: Record<string, typeof Activity> = {
  "regime-detection": Activity,
  backtesting: LineChart,
  validation: ShieldCheck,
  failure: Skull,
  graph: Network,
  evolution: Dna,
};

// Real artifacts per pillar (the falsifiable-mechanism receipts).
const PILLAR_ARTIFACTS: Record<string, { title: string; body: string }> = {
  regime: {
    title: "ensemble vote — one bar, four detectors",
    body: `hmm=Bear  pelt=Bear  gmm=High-Vol  garch=CRISIS
→ ensemble: CRISIS (fast override) · conf 0.81
labels: Bull · Bear · High-Vol · Low-Vol · Sideways · Crisis`,
  },
  failure: {
    title: "failures table — append-only by role grant",
    body: `REVOKE UPDATE, DELETE ON failures FROM stellix_app;

{ "regime_at_failure": "Low-Volatility",
  "trigger_condition": "drawdown_breach",
  "feature_attribution": [
    { "feature": "realized_vol_20", "shap": 0.41 } ] }`,
  },
  memory: {
    title: "recurring_failure_modes — one of five named queries",
    body: `MATCH (s:Strategy)-[e:FAILED_IN]->(r:Regime)
WITH r.regime_label AS regime,
     e.trigger_condition AS trigger, count(e) AS n
WHERE n >= 3
RETURN regime, trigger, n ORDER BY n DESC`,
  },
};

const TARGET_SEGMENTS = [
  {
    name: "Hedge Funds",
    benefits: [
      "Research that survives PM and analyst turnover",
      "Every Sharpe split across six regimes before allocation",
      "A permanent map of what already failed, and why",
    ],
  },
  {
    name: "Proprietary Trading Firms",
    benefits: [
      "Stop rediscovering blown-up strategies across desks",
      "Four automatic failure triggers with SHAP autopsies",
      "Lineage for every evolved strategy variant",
    ],
  },
  {
    name: "Crypto Funds",
    benefits: [
      "Regime-conditioning for markets that flip overnight",
      "Fast-triggering Crisis override in the ensemble",
      "24/7 data ingestion with strict temporal isolation",
    ],
  },
  {
    name: "Asset Managers",
    benefits: [
      "A compliance-grade audit trail on every decision",
      "A 0.70 robustness gate no one can talk around",
      "Kill switch and approval workflow built in",
    ],
  },
] as const;

// ---------------------------------------------------------------------------
export default function LandingPage() {
  const reduced = useReducedMotion();

  return (
    <>
      {/* ================= HERO ================= */}
      <section className="relative bg-white">
        <div className="container grid min-h-[calc(100vh-4rem)] items-center gap-14 py-16 lg:grid-cols-[3fr_2fr] lg:gap-10 lg:py-12">
          <motion.div
            initial={reduced ? false : "hidden"}
            animate="visible"
            variants={HERO_STAGGER}
          >
            <motion.p
              variants={HERO_FADE}
              className="mb-5 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#0066FF]"
            >
              Institutional Research Infrastructure
            </motion.p>

            {/* Word-by-word entrance (Batch 20): each word rises with an 0.08s
                stagger. Words are the animated units; the two <span className="block">
                wrappers keep the original two-line layout and the blue "failed."
                accent. HERO_WORD inherits its stagger from the parent HERO_STAGGER
                via HERO_LINE_WRAP, so it still short-circuits under reduced motion. */}
            <h1 className="font-display text-5xl font-normal leading-[1.05] tracking-tight text-[#000000] sm:text-6xl lg:text-[72px]">
              <motion.span variants={HERO_LINE_WRAP} className="block">
                {"Your best research is".split(" ").map((w, i) => (
                  <motion.span key={i} variants={HERO_WORD} className="inline-block">
                    {w}
                    {i < 3 ? " " : ""}
                  </motion.span>
                ))}
              </motion.span>
              <motion.span variants={HERO_LINE_WRAP} className="block">
                {"the strategies that".split(" ").map((w, i) => (
                  <motion.span key={i} variants={HERO_WORD} className="inline-block">
                    {w}
                    {" "}
                  </motion.span>
                ))}
                <motion.span variants={HERO_WORD} className="inline-block text-[#0066FF]">
                  failed.
                </motion.span>
              </motion.span>
            </h1>

            <motion.p
              variants={HERO_FADE}
              className="mt-6 max-w-xl text-xl leading-relaxed text-[#64748B]"
            >
              The only platform that preserves failure intelligence, detects regime
              shifts, and compounds institutional memory.
            </motion.p>

            <motion.div variants={HERO_FADE} className="mt-9 flex flex-wrap items-center gap-6">
              <motion.div
                whileHover={reduced ? undefined : { scale: 1.02 }}
                whileTap={reduced ? undefined : { scale: 0.98 }}
                className="inline-flex"
              >
                <DemoRequestModal className="inline-flex h-12 items-center rounded-md bg-[#0066FF] px-7 text-[15px] font-medium text-white transition-colors duration-200 hover:bg-[#003399]">
                  Request Demo
                </DemoRequestModal>
              </motion.div>
              <Link
                href="#how"
                className="group inline-flex items-center gap-1.5 text-[15px] font-medium text-[#0A0F1E] transition-colors hover:text-[#0066FF]"
              >
                See how it works
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </motion.div>

            <motion.dl variants={HERO_FADE} className="mt-14 flex flex-wrap gap-x-12 gap-y-6">
              {HERO_STATS.map((s) => (
                <div key={s.label}>
                  <dt className="sr-only">{s.label}</dt>
                  <dd className="font-display text-4xl text-[#000000]">
                    <CountUp to={s.value} />
                  </dd>
                  <dd className="mt-1 text-sm text-[#64748B]">{s.label}</dd>
                </div>
              ))}
            </motion.dl>
          </motion.div>

          <div className="lg:pl-2">
            <TerminalCard />
          </div>
        </div>
      </section>

      {/* ================= VILLAIN (dark) ================= */}
      <section className="bg-[#0A0F1E] py-24 sm:py-28">
        <div className="container">
          <RevealOnScroll>
            <h2 className="font-display max-w-3xl text-4xl font-normal leading-tight text-white sm:text-[52px] sm:leading-[1.1]">
              Institutional amnesia is costing you more than you know.
            </h2>
          </RevealOnScroll>
          <StaggerChildren className="mt-14 grid gap-5 sm:grid-cols-2" stagger={0.08}>
            {PROBLEM_CARDS.map((card, i) => {
              const Icon = PROBLEM_ICONS[i % PROBLEM_ICONS.length]!;
              return (
                <StaggerItem key={card.title}>
                  <article className="h-full rounded-lg border border-[#374151] border-l-4 border-l-[#0066FF] bg-[#111827] p-7">
                    <Icon className="h-5 w-5 text-[#0066FF]" aria-hidden />
                    <h3 className="mt-4 text-lg font-semibold text-white">{card.title}</h3>
                    <p className="mt-2.5 text-[15px] leading-relaxed text-[#9CA3AF]">{card.body}</p>
                  </article>
                </StaggerItem>
              );
            })}
          </StaggerChildren>
        </div>
      </section>

      {/* ================= THREE PILLARS ================= */}
      <section className="bg-white py-24 sm:py-28">
        <div className="container space-y-24">
          {PILLARS.map((pillar, i) => {
            const artifact = PILLAR_ARTIFACTS[pillar.id]!;
            const flipped = i % 2 === 1;
            return (
              <div
                key={pillar.id}
                className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
              >
                <RevealOnScroll
                  direction={flipped ? "right" : "left"}
                  duration={0.7}
                  className={flipped ? "lg:order-2" : ""}
                >
                  <div className="relative">
                    <span
                      aria-hidden
                      className="font-display pointer-events-none absolute -top-12 left-0 select-none text-[96px] leading-none text-[#F1F5F9]"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-display relative text-3xl font-normal text-[#0A0F1E] sm:text-4xl">
                      {pillar.name}
                    </h3>
                  </div>
                  <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[#64748B]">
                    {pillar.mechanism}
                  </p>
                </RevealOnScroll>
                <RevealOnScroll
                  direction={flipped ? "left" : "right"}
                  duration={0.7}
                  className={flipped ? "lg:order-1" : ""}
                >
                  <figure className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-[#F7F9FC]">
                    <figcaption className="border-b border-[#E2E8F0] px-4 py-2 text-[11px] uppercase tracking-[0.15em] text-[#64748B]">
                      {artifact.title}
                    </figcaption>
                    <pre className="font-code overflow-x-auto p-5 text-[12.5px] leading-relaxed text-[#0A0F1E]">
                      {artifact.body}
                    </pre>
                  </figure>
                </RevealOnScroll>
              </div>
            );
          })}
        </div>
      </section>

      {/* ================= FEATURE CARDS ================= */}
      <section className="bg-[#F7F9FC] py-24 sm:py-28">
        <div className="container">
          <RevealOnScroll>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#0066FF]">
              The platform
            </p>
            <h2 className="font-display mt-3 max-w-2xl text-4xl font-normal leading-tight text-[#0A0F1E]">
              Built for the full research lifecycle — not just the backtest.
            </h2>
          </RevealOnScroll>
          <StaggerChildren className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3" stagger={0.08}>
            {FEATURE_CARDS.map((f) => {
              const Icon = FEATURE_ICONS[f.id] ?? FlaskConical;
              return (
                <StaggerItem key={f.id}>
                  <article className="group h-full rounded-lg border border-[#E2E8F0] border-t-2 border-t-transparent bg-white p-7 transition-all duration-200 hover:-translate-y-0.5 hover:border-t-[#0066FF] hover:shadow-[0_12px_32px_rgba(0,0,102,0.08)]">
                    <Icon className="h-5 w-5 text-[#0066FF]" aria-hidden />
                    <h3 className="mt-4 text-base font-semibold text-[#0A0F1E]">{f.name}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#64748B]">{f.body}</p>
                  </article>
                </StaggerItem>
              );
            })}
          </StaggerChildren>
        </div>
      </section>

      {/* ================= WORKFLOW ================= */}
      <section id="how" className="bg-white py-24 sm:py-28">
        <div className="container">
          <RevealOnScroll>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#0066FF]">
              How it compounds
            </p>
            <h2 className="font-display mt-3 max-w-2xl text-4xl font-normal leading-tight text-[#0A0F1E]">
              One loop that gets smarter every time it turns.
            </h2>
          </RevealOnScroll>

          {/* Desktop: 6 across with self-drawing connectors */}
          <div className="mt-16 hidden lg:grid lg:grid-cols-[repeat(11,1fr)] lg:items-start">
            {WORKFLOW_STEPS.map((step, i) => (
              <div key={step.name} className="contents">
                <RevealOnScroll delay={i * 0.12} className="col-span-1 text-center">
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#0066FF] text-[15px] font-semibold text-white">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-sm font-semibold text-[#0A0F1E]">{step.name}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#64748B]">{step.body}</p>
                </RevealOnScroll>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <div className="col-span-1 flex items-center px-1 pt-5">
                    <DrawingLine
                      className="text-[#0066FF]/40"
                      delay={0.15 + i * 0.15}
                      duration={0.5}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Mobile: vertical stack */}
          <div className="mt-12 space-y-8 lg:hidden">
            {WORKFLOW_STEPS.map((step, i) => (
              <RevealOnScroll key={step.name} delay={i * 0.06} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0066FF] text-sm font-semibold text-white">
                    {i + 1}
                  </span>
                  {i < WORKFLOW_STEPS.length - 1 && (
                    <span className="mt-2 h-full w-px bg-[#E2E8F0]" aria-hidden />
                  )}
                </div>
                <div className="pb-2">
                  <h3 className="text-sm font-semibold text-[#0A0F1E]">{step.name}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[#64748B]">{step.body}</p>
                </div>
              </RevealOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ================= TARGET USERS ================= */}
      <section className="bg-[#F7F9FC] py-24 sm:py-28">
        <div className="container">
          <RevealOnScroll>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#0066FF]">
              Who it&apos;s for
            </p>
            <h2 className="font-display mt-3 max-w-2xl text-4xl font-normal leading-tight text-[#0A0F1E]">
              For teams whose edge is research, and whose risk is forgetting.
            </h2>
          </RevealOnScroll>
          <StaggerChildren className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" stagger={0.08}>
            {TARGET_SEGMENTS.map((u) => (
              <StaggerItem key={u.name}>
                <article className="flex h-full flex-col rounded-lg border border-[#E2E8F0] bg-white p-7">
                  <h3 className="text-base font-semibold text-[#0A0F1E]">{u.name}</h3>
                  <ul className="mt-4 flex-1 space-y-2.5">
                    {u.benefits.map((b) => (
                      <li key={b} className="flex gap-2 text-sm leading-snug text-[#64748B]">
                        <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0066FF]" aria-hidden />
                        {b}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/use-cases"
                    className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-[#0066FF] hover:text-[#003399]"
                  >
                    Learn more <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </article>
              </StaggerItem>
            ))}
          </StaggerChildren>
        </div>
      </section>

      {/* ================= CTA STRIP (dark) ================= */}
      <section className="bg-[#0A0F1E] py-28">
        <div className="container">
          <RevealOnScroll
            direction="scale"
            duration={0.7}
            className="mx-auto max-w-3xl text-center"
          >
            <h2 className="font-display text-4xl font-normal leading-tight text-white sm:text-[52px] sm:leading-[1.1]">
              Infrastructure designed to compound.
            </h2>
            <p className="mt-5 text-lg text-[#9CA3AF]">Start with a 30-minute technical demo.</p>
            <motion.div
              className="mt-9 inline-block"
              whileHover={reduced ? undefined : { scale: 1.02 }}
              whileTap={reduced ? undefined : { scale: 0.98 }}
            >
              <DemoRequestModal className="inline-flex h-12 items-center rounded-md border border-[#0066FF] bg-white px-8 text-[15px] font-medium text-[#0066FF] transition-colors duration-200 hover:bg-[#0066FF] hover:text-white">
                Request Demo
              </DemoRequestModal>
            </motion.div>
          </RevealOnScroll>
        </div>
      </section>
    </>
  );
}
