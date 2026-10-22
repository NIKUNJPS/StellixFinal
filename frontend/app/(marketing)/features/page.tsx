import type { Metadata } from "next";
import { Check, ShieldAlert } from "lucide-react";

import {
  FailureRecordCard,
  MemoryMap,
  PerRegimeTable,
  RegimeLegend,
  RegimeTape,
  ValidationGate,
} from "@/components/marketing/artifacts";
import { Reveal } from "@/components/marketing/reveal";
import { ButtonLink, CtaBand, Display, Eyebrow, PageHero, Tag } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Features — regime detection, failure intelligence, Research Memory",
  description:
    "Seven modules, each shown with a real product artifact: regime detection, regime-aware backtesting, five-method validation, failure intelligence, Research Memory, the evolution engine and a governed research assistant.",
};

function RegimeVisual() {
  const votes = [
    ["Gaussian HMM", "Bear"],
    ["PELT change-points", "High-Vol"],
    ["Gaussian mixture", "Bear"],
    ["GARCH(1,1)", "Bear"],
  ];
  return (
    <div className="rounded-2xl border border-line bg-paper-raised p-6">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-ink">Ensemble vote · bar 2026-03-06</p>
        <Tag tone="gain">confidence 0.75</Tag>
      </div>
      <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
        {votes.map(([model, vote]) => (
          <li key={model} className="flex items-center justify-between px-4 py-2.5 text-[14px]">
            <span className="text-ink-2">{model}</span>
            <span className="font-code text-[13px] font-semibold text-ink">{vote}</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-[12px] font-medium text-ink-3">Sample 12-month regime tape</p>
      <RegimeTape className="mt-2" />
      <RegimeLegend className="mt-4" />
    </div>
  );
}

function EvolutionVisual() {
  const best = [0.42, 0.51, 0.58, 0.63, 0.67, 0.71, 0.73, 0.76, 0.77, 0.79, 0.8, 0.81];
  const mean = [0.21, 0.29, 0.36, 0.42, 0.47, 0.52, 0.55, 0.59, 0.61, 0.63, 0.64, 0.66];
  const toPath = (arr: number[]) => arr.map((v, i) => `${i === 0 ? "M" : "L"} ${20 + i * 40} ${200 - v * 200}`).join(" ");
  return (
    <div className="rounded-2xl border border-line bg-paper-raised p-6">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-ink">Fitness over generations</p>
        <div className="flex gap-4 text-[12px] text-ink-2">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-brand" /> best</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-ink-3" /> mean</span>
        </div>
      </div>
      <svg viewBox="0 0 480 210" className="mt-4 h-auto w-full" role="img" aria-label="Sample fitness curve rising across twelve generations">
        {[0.25, 0.5, 0.75].map((y) => (
          <line key={y} x1="20" x2="460" y1={200 - y * 200} y2={200 - y * 200} stroke="#E4E1D9" strokeDasharray="3 4" />
        ))}
        <path d={toPath(mean)} fill="none" stroke="#5E6679" strokeWidth="2" />
        <path d={toPath(best)} fill="none" stroke="#4B3FD1" strokeWidth="2.5" />
        {best.map((v, i) => (
          <circle key={i} cx={20 + i * 40} cy={200 - v * 200} r="3" fill="#FFFFFF" stroke="#4B3FD1" strokeWidth="2" />
        ))}
      </svg>
      <div className="mt-4 flex flex-wrap gap-2">
        <Tag tone="brand">MUTATED_FROM</Tag>
        <Tag>tournament selection</Tag>
        <Tag>elitism</Tag>
      </div>
    </div>
  );
}

function AssistantVisual() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper-raised">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <span className="font-code text-[12px] font-semibold text-ink">llm_audit_log · #8812</span>
        <Tag tone="signal">human review required</Tag>
      </div>
      <div className="space-y-4 px-5 py-5 text-[14px]">
        <div>
          <p className="font-code text-[11px] uppercase tracking-wider text-ink-3">Prompt</p>
          <p className="mt-1 text-ink">Why did Momentum 12-1 fail in February?</p>
        </div>
        <div>
          <p className="font-code text-[11px] uppercase tracking-wider text-ink-3">Structured response</p>
          <p className="mt-1 leading-relaxed text-ink-2">
            Regime mismatch: validated in Bull/Low-Vol, deployed into High-Vol. Max drawdown{" "}
            <span className="rounded bg-gain-tint px-1 font-code text-gain">−11.2% ✓</span> matches the failure record.
          </p>
        </div>
        <div className="flex items-start gap-2.5 rounded-xl border border-loss/20 bg-loss-tint px-3.5 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-loss" />
          <p className="text-[13px] text-ink">
            <span className="font-semibold">Blocked before the model was called:</span> “Where will SPY close on Friday?” — price
            forecasting is refused by design.
          </p>
        </div>
      </div>
    </div>
  );
}

const MODULES = [
  {
    id: "regime-detection",
    name: "Regime detection",
    tagline: "Nothing is ever measured context-free.",
    body: "Four independent models — a Gaussian HMM, PELT change-point detection, a Gaussian mixture and a GARCH(1,1) volatility model — vote on the current regime. A self-consistency-weighted majority produces the label, with a fast Crisis override when conditional volatility spikes past an extreme percentile.",
    bullets: ["Six regimes on every bar", "A confidence score per label", "Crisis override that doesn't wait for a majority"],
    visual: <RegimeVisual />,
  },
  {
    id: "backtesting",
    name: "Regime-aware backtesting",
    tagline: "One blended Sharpe is where strategies go to hide.",
    body: "Vectorized simulation reports Sharpe, Sortino and Beta partitioned by regime, alongside a full per-trade record. A strategy with a strong headline number but a negative Crisis Sharpe is visibly fragile — no spreadsheet archaeology required.",
    bullets: ["Metrics split across all six regimes", "Per-trade records", "Fragility visible at a glance"],
    visual: <PerRegimeTable />,
  },
  {
    id: "validation",
    name: "Five-method validation",
    tagline: "A robustness score that is five tests, not one.",
    body: "Walk-forward (30%), regime cross-validation (30%), Monte-Carlo (20%), persistence (10%) and stress testing (10%) combine into a composite score. Below 0.50 fails; 0.50–0.70 stays a candidate; above 0.70 may be promoted. The gate is enforced in code.",
    bullets: ["Weighted composite score", "Promotion threshold at 0.70", "Every sub-score kept for audit"],
    visual: (
      <div className="rounded-2xl border border-line bg-paper-raised p-6">
        <ValidationGate />
      </div>
    ),
  },
  {
    id: "failure-intelligence",
    name: "Failure intelligence",
    tagline: "The module no other platform ships.",
    body: "Four triggers can catch a failing strategy — drawdown breach, Sharpe decline, regime mismatch or a manual flag. Each writes an immutable record: the regime it failed in, the metrics at failure, the market context, and a SHAP attribution of the five features most responsible.",
    bullets: ["Four detection triggers", "SHAP top-5 attribution", "UPDATE and DELETE revoked at the role level"],
    visual: <FailureRecordCard />,
  },
  {
    id: "research-memory",
    name: "Research Memory",
    tagline: "Your firm's research, finally connected.",
    body: "Six record types and eight relationship types connect scattered research into one memory, derived from PostgreSQL and rebuilt on a schedule so it never drifts from the database. Five questions ship out of the box — failed strategies by regime, evolutionary lineage, robust across regimes, recurring failure modes, and the hypotheses that became live strategies.",
    bullets: ["5 built-in research-memory questions", "Interactive lineage explorer", "Tenant-scoped by construction"],
    visual: <MemoryMap compact />,
  },
  {
    id: "evolution",
    name: "The evolution engine",
    tagline: "Breed new strategies from the ones that survived.",
    body: "A DEAP genetic algorithm with tournament selection, adaptive-sigma mutation and elitism. Every individual is backtested every generation through the regime-aware engine; the fittest are registered as candidates with a MUTATED_FROM edge to their parent.",
    bullets: ["Adaptive mutation step", "Regime-aware fitness", "Lineage never lost"],
    visual: <EvolutionVisual />,
  },
  {
    id: "assistant",
    name: "Research assistant",
    tagline: "An AI collaborator with zero execution authority.",
    body: "Claude drafts hypotheses, explains failures and critiques strategies through structured tool-use. Five safeguards are enforced: a price-forecast guard, no ability to mutate a strategy, mandatory human review of generated strategies, logging before every response, and numeric claims cross-checked against the record.",
    bullets: ["Forecast prompts refused up front", "Every call logged before it returns", "Numbers verified against real records"],
    visual: <AssistantVisual />,
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="Features"
        title={
          <>
            Seven modules. <em>Zero decorative</em> screenshots.
          </>
        }
        intro="Every feature below is shown with an artifact that mirrors what the running product produces — a regime vote, a per-regime backtest, a validation breakdown, a sealed failure record."
      >
        <ButtonLink href="/register" size="lg" arrow>
          Create a workspace
        </ButtonLink>
        <ButtonLink href="/pricing" variant="secondary" size="lg">
          See pricing
        </ButtonLink>
      </PageHero>

      <div className="sticky top-[72px] z-30 border-b border-line bg-paper/90 backdrop-blur-xl">
        <nav className="mx-auto flex w-full max-w-[1240px] gap-1 overflow-x-auto px-5 py-2.5 [scrollbar-width:none] sm:px-8 [&::-webkit-scrollbar]:hidden" aria-label="Feature modules">
          {MODULES.map((m, i) => (
            <a
              key={m.id}
              href={`#${m.id}`}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:bg-ink/[0.05] hover:text-ink"
            >
              <span className="mr-1.5 font-code text-[11px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              {m.name}
            </a>
          ))}
        </nav>
      </div>

      {MODULES.map((m, i) => (
        <section
          key={m.id}
          id={m.id}
          className={i % 2 === 0 ? "scroll-mt-32 bg-paper py-20 sm:py-28" : "scroll-mt-32 border-y border-line bg-paper-raised py-20 sm:py-28"}
        >
          <div className="mx-auto grid w-full max-w-[1240px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
            <Reveal className={i % 2 === 1 ? "lg:order-2" : undefined}>
              <Eyebrow tone="ink">Module {String(i + 1).padStart(2, "0")}</Eyebrow>
              <Display size="md" className="mt-4">
                {m.name}
              </Display>
              <p className="mt-2 font-editorial text-[22px] leading-snug text-brand">{m.tagline}</p>
              <p className="mt-6 text-[16.5px] leading-[1.75] text-ink-2">{m.body}</p>
              <ul className="mt-7 space-y-3">
                {m.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-3 text-[15px] text-ink">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={120} className={i % 2 === 1 ? "lg:order-1" : undefined}>
              {m.visual}
            </Reveal>
          </div>
        </section>
      ))}

      <div className="h-20 bg-paper" />
      <CtaBand />
    </>
  );
}
