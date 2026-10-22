"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BrainCircuit, Database, Dna, FileCode2, Gauge, Network } from "lucide-react";

import { CodePanel, DSL_SAMPLE, RECURRING_SQL, ValidationGate } from "@/components/marketing/artifacts";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Hero entrance wrapper
// ---------------------------------------------------------------------------

export function HeroRise({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// The research loop — six steps, click/hover to inspect
// ---------------------------------------------------------------------------

const LOOP = [
  {
    name: "Data",
    icon: Database,
    title: "Ingest and engineer, with no look-ahead.",
    body: "OHLCV arrives through a pluggable provider interface. 15+ indicators — RSI, MACD, ATR, Bollinger, realized vol, autocorrelation — are computed so that every feature at time T only sees data at T and earlier. A dedicated test asserts it.",
    tag: "temporal isolation",
  },
  {
    name: "Regime",
    icon: Gauge,
    title: "Every bar gets a market context.",
    body: "A Gaussian HMM, PELT change-point detection, a Gaussian mixture and a GARCH(1,1) model vote on one of six regimes. A self-consistency-weighted majority picks the label, and a Crisis override fires the moment conditional volatility spikes.",
    tag: "4-model ensemble",
  },
  {
    name: "Strategy",
    icon: FileCode2,
    title: "Rules as structured data, not opaque code.",
    body: "Entry and exit logic is a strict JSON tree that a human can write, the research assistant can draft, and the genetic algorithm can mutate — one representation, no translation layer.",
    tag: "JSON rule DSL",
  },
  {
    name: "Validation",
    icon: BrainCircuit,
    title: "Five tests, scored per regime, enforced in code.",
    body: "Walk-forward, regime cross-validation, Monte-Carlo, persistence and stress tests combine into one robustness score. Below 0.70 a strategy cannot be promoted to active — the gate is a rule, not a convention.",
    tag: "robustness ≥ 0.70",
  },
  {
    name: "Memory",
    icon: Network,
    title: "Pass or fail, the result is kept for good.",
    body: "Every outcome is written to an append-only record and linked into Research Memory — the regime it was tested in, what killed it, and who authored the idea behind it.",
    tag: "append-only + memory",
  },
  {
    name: "Evolution",
    icon: Dna,
    title: "The survivors breed the next generation.",
    body: "A DEAP genetic algorithm with adaptive-sigma mutation and elitism backtests every individual through the regime-aware engine. The fittest are registered as new candidates with MUTATED_FROM lineage back to their parents.",
    tag: "lineage recorded",
  },
];

export function ResearchLoop() {
  const [active, setActive] = useState(0);
  const step = LOOP[active]!;
  const Icon = step.icon;

  return (
    <div className="mt-14 grid gap-6 lg:grid-cols-[1fr_1.05fr] lg:gap-10">
      <ol className="relative grid gap-2" role="tablist" aria-label="Research loop steps">
        <span aria-hidden className="absolute bottom-10 left-[38.5px] top-6 w-px bg-line-strong" />
        {LOOP.map((s, i) => {
          const StepIcon = s.icon;
          const on = i === active;
          return (
            <li key={s.name}>
              <button
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "relative flex w-full items-center gap-4 rounded-2xl border px-3 py-3 text-left transition-all duration-200",
                  on ? "border-line bg-paper-raised shadow-[0_12px_30px_-18px_rgba(14,18,32,0.35)]" : "border-transparent hover:bg-paper-raised/60",
                )}
              >
                <span
                  className={cn(
                    "relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-2 font-code text-[11px] font-semibold transition-colors",
                    on ? "border-brand bg-brand text-white" : "border-line-strong bg-paper text-ink-3",
                  )}
                  style={{ marginLeft: 12 }}
                >
                  {i + 1}
                </span>
                <span className="flex-1">
                  <span className={cn("block text-[16px] font-semibold", on ? "text-ink" : "text-ink-2")}>{s.name}</span>
                </span>
                <StepIcon className={cn("mr-2 h-[18px] w-[18px]", on ? "text-brand" : "text-ink-3")} />
              </button>
            </li>
          );
        })}
        <li className="pl-[58px] pt-1 font-code text-[12px] text-ink-3">↺ memory seeds the next turn of the loop</li>
      </ol>

      <div className="relative overflow-hidden rounded-3xl border border-line bg-paper-raised p-7 sm:p-10" role="tabpanel">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand-soft/60 blur-3xl" />
        <motion.div key={step.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="relative">
          <div className="flex items-center justify-between">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint text-brand">
              <Icon className="h-6 w-6" />
            </span>
            <span className="font-code text-[12px] text-ink-3">
              step {String(active + 1).padStart(2, "0")} / 06
            </span>
          </div>
          <h3 className="mt-8 font-editorial text-[clamp(1.5rem,2.4vw,2rem)] leading-[1.08] tracking-[-0.015em] text-ink">{step.title}</h3>
          <p className="mt-5 text-[16px] leading-[1.75] text-ink-2">{step.body}</p>
          <span className="mt-7 inline-flex rounded-md border border-brand/20 bg-brand-tint px-2.5 py-1 font-code text-[12px] font-medium text-brand">
            {step.tag}
          </span>
        </motion.div>
        <div className="relative mt-10 flex gap-1.5" aria-hidden>
          {LOOP.map((s, i) => (
            <span key={s.name} className={cn("h-1 flex-1 rounded-full transition-colors", i <= active ? "bg-brand" : "bg-paper-sunken")} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proof tabs (dark band)
// ---------------------------------------------------------------------------

const PROOF_TABS = [
  {
    id: "dsl",
    label: "Strategy DSL",
    caption: "Strategies are structured data. The same tree is authored by people, drafted by the assistant, and mutated by the genetic algorithm.",
  },
  {
    id: "sql",
    label: "Memory query",
    caption: "Research Memory is derived from ordinary PostgreSQL tables, so every answer traces back to rows you can audit. Here is one of its five questions, asked of the source table.",
  },
  {
    id: "gate",
    label: "Validation gate",
    caption: "Five weighted methods produce one robustness score. Sample strategy shown — the amber line marks the 0.70 promotion threshold.",
  },
] as const;

export function ProofTabs() {
  const [tab, setTab] = useState<(typeof PROOF_TABS)[number]["id"]>("dsl");
  const current = PROOF_TABS.find((t) => t.id === tab)!;
  return (
    <div className="mt-12">
      <div className="inline-flex flex-wrap gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1" role="tablist">
        {PROOF_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors",
              tab === t.id ? "bg-white text-ink" : "text-white/75 hover:text-white",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div role="tabpanel">
          {tab === "dsl" && <CodePanel code={DSL_SAMPLE} language="json" filename="strategy.entry_rules.json" />}
          {tab === "sql" && <CodePanel code={RECURRING_SQL} language="sql" filename="recurring_failure_modes.sql" />}
          {tab === "gate" && (
            <div className="rounded-2xl border border-white/10 bg-ink-panel p-6 sm:p-8">
              <ValidationGate dark />
            </div>
          )}
        </div>
        <p className="text-[16px] leading-[1.75] text-white/80">{current.caption}</p>
      </div>
    </div>
  );
}
