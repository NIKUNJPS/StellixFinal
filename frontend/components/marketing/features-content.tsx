"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FailureRecordMini,
  FitnessChartMini,
  LlmAuditRowMini,
  RegimeMetricTable,
  RegimeTimelineMini,
  ValidationComposite,
} from "@/components/marketing/feature-vizzes";
import { GraphMini } from "@/components/marketing/graph-mini";

type Module = { id: string; name: string; tagline: string; body: ReactNode; viz: ReactNode };

const MODULES: Module[] = [
  {
    id: "regime",
    name: "Regime Detection",
    tagline: "Nothing is ever measured context-free.",
    body: "Four independent models — a Gaussian HMM (hmmlearn), PELT change-point detection (ruptures), a Gaussian mixture (scikit-learn), and a GARCH(1,1) volatility model (arch) — each vote on the current regime. A self-consistency-weighted majority produces the label, with a fast-triggering Crisis override when conditional volatility spikes past an extreme percentile. Every bar carries a regime label and a confidence score.",
    viz: <RegimeTimelineMini />,
  },
  {
    id: "backtesting",
    name: "Regime-Aware Backtesting",
    tagline: "One blended Sharpe number is where strategies go to hide.",
    body: "Vectorized simulation via vectorbt reports Sharpe, Sortino, and Beta partitioned by regime, alongside a full per-trade record. A strategy with a strong overall number but a negative Crisis-regime Sharpe is visibly, immediately regime-fragile — no spreadsheet archaeology required.",
    viz: <RegimeMetricTable />,
  },
  {
    id: "validation",
    name: "Five-Method Validation",
    tagline: "A robustness score you can't argue with, because it's five tests, not one.",
    body: "Walk-Forward (30%), Regime Cross-Validation (30%), Monte-Carlo (20%), Persistence (10%), and Stress Test (10%) combine into a single composite robustness score. Below 0.50 is an automatic fail; 0.50–0.70 stays a candidate; above 0.70 is eligible for promotion to active. The gate is enforced in code, not by convention.",
    viz: <ValidationComposite />,
  },
  {
    id: "failure",
    name: "Failure Intelligence",
    tagline: "The feature no other platform ships.",
    body: "When a strategy fails, four triggers can catch it — drawdown breach, Sharpe decline, regime mismatch, or a manual flag. Each writes an immutable record: the regime it failed in, the performance metrics at failure, the full market context, and a SHAP attribution of the five features most responsible for the breakdown. The table is append-only; UPDATE and DELETE are revoked at the database role level.",
    viz: <FailureRecordMini />,
  },
  {
    id: "graph",
    name: "The Knowledge Graph",
    tagline: "Your firm's research, finally connected.",
    body: "Six node types (Strategy, Regime, Performance, Failure, ResearchNote, Researcher) and eight edge types turn scattered research into a traversable Neo4j graph. Five named queries ship out of the box: failed_strategies_by_regime, lineage, robust_across_regimes, recurring_failure_modes, and hypotheses_leading_to_active. Every query is tenant-scoped and fails closed if it forgets to filter by organization.",
    viz: <GraphMini />,
  },
  {
    id: "evolution",
    name: "The Evolution Engine",
    tagline: "Breed new strategies from the ones that survived.",
    body: "A DEAP genetic algorithm with tournament selection, adaptive-sigma mutation (the mutation step shrinks as the population converges), and elitism. Every individual is backtested every generation through the regime-aware engine, and the fittest final-generation survivors are registered as new candidate strategies — each with a MUTATED_FROM edge back to its parent, so lineage is never lost.",
    viz: <FitnessChartMini />,
  },
  {
    id: "llm",
    name: "The LLM Research Assistant",
    tagline: "An AI collaborator with five hard safeguards and zero execution authority.",
    body: "Claude drafts hypotheses, explains failures, and critiques strategies through forced structured tool-use — never free text scraped with regex. Five enforced safeguards: a price-forecast guard rejects forecasting prompts before the model is called; the assistant is statically proven to have zero ability to mutate a strategy; LLM-generated strategies are flagged for mandatory human review; every call is logged before it returns; and every numeric claim is cross-checked against the real record and badged if it doesn't match.",
    viz: <LlmAuditRowMini />,
  },
];

export function FeaturesContent() {
  return (
    <Tabs defaultValue="regime" className="mt-12">
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <TabsList className="flex h-auto w-full flex-col items-stretch gap-1 bg-transparent p-0">
          {MODULES.map((m) => (
            <TabsTrigger
              key={m.id}
              value={m.id}
              className="justify-start rounded-lg border border-transparent px-4 py-3 text-left text-sm data-[state=active]:border-accent/40 data-[state=active]:bg-accent/10 data-[state=active]:text-foreground"
            >
              {m.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {MODULES.map((m) => (
          <TabsContent key={m.id} value={m.id} className="mt-0">
            <div className="grid gap-8 rounded-2xl border border-border bg-card/30 p-6 sm:p-8 lg:grid-cols-2 lg:items-center">
              <div>
                <p className="text-sm font-medium text-accent">{m.tagline}</p>
                <h3 className="mt-2 font-display text-2xl font-semibold">{m.name}</h3>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{m.body}</p>
              </div>
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">{m.viz}</div>
            </div>
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
