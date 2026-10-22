import type { Metadata } from "next";
import { AppWindow, BrainCircuit, Database, HardDrive } from "lucide-react";

import { RegimeLegend, RegimeTape } from "@/components/marketing/artifacts";
import { Reveal } from "@/components/marketing/reveal";
import { ButtonLink, Card, CtaBand, PageHero, Section, SectionHeader, Tag } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Platform overview — four layers, one compounding loop",
  description:
    "How Stellix Labs turns raw market data into permanent, regime-conditioned research memory: a data layer, an intelligence layer, a memory layer and a multi-tenant application layer.",
};

const LAYERS = [
  {
    n: "01",
    icon: Database,
    name: "Data & features",
    why: "Garbage regimes in, garbage strategies out.",
    body: "OHLCV ingestion behind a pluggable provider interface and 15+ engineered indicators — RSI, MACD, ATR, Bollinger, realized volatility, autocorrelation — with strict temporal isolation: a feature at time T only ever sees T and earlier.",
    items: ["Pluggable providers", "15+ indicators", "Look-ahead test"],
  },
  {
    n: "02",
    icon: BrainCircuit,
    name: "Intelligence",
    why: "Where the research actually happens.",
    body: "Regime detection, regime-aware backtesting, five-method validation, failure intelligence, the evolution engine and the research assistant. None of them ever looks at performance without a regime attached.",
    items: ["Regime ensemble", "Validation gate", "Evolution engine", "Research assistant"],
  },
  {
    n: "03",
    icon: HardDrive,
    name: "Memory",
    why: "The part every other tool skips.",
    body: "PostgreSQL + TimescaleDB hold the relational and time-series truth. Research Memory links every strategy, failure, regime, note and researcher — rebuilt from that same database, so there is nothing else to run.",
    items: ["PostgreSQL 15", "TimescaleDB", "Research Memory"],
  },
  {
    n: "04",
    icon: AppWindow,
    name: "Application",
    why: "Multi-tenant from migration zero.",
    body: "A FastAPI backend and a Next.js workspace with role-aware views for researchers, risk managers, compliance and the CIO. Every row is scoped to an organization; a query with no tenant bound fails closed.",
    items: ["FastAPI", "Next.js", "Role-based views", "WebSocket events"],
  },
];

const LIFECYCLE = [
  ["Ingest", "Pull OHLCV for a symbol and window through a pluggable provider."],
  ["Engineer", "Compute 15+ trailing indicators with no-look-ahead guarantees."],
  ["Detect regimes", "Label every bar into one of six regimes via the four-model ensemble."],
  ["Author", "Write rules in the JSON DSL or draft a hypothesis with the assistant."],
  ["Backtest", "Simulate and read Sharpe, Sortino and Beta split by regime."],
  ["Validate", "Run the five-method gauntlet to produce one robustness score."],
  ["Gate", "Promote to active only above 0.70; everything else stays a candidate."],
  ["Monitor", "Watch live strategies for drawdown, Sharpe decline and regime mismatch."],
  ["Record failure", "On any trigger, write an immutable SHAP-attributed autopsy."],
  ["Evolve", "Breed survivors; register offspring with recorded lineage."],
];

const ROLES = [
  { role: "Researcher", body: "Author strategies, run backtests and validation, read failure autopsies and query Research Memory." },
  { role: "Risk manager", body: "Watch live strategies, regime mismatches and the portfolio — with the kill switch close at hand." },
  { role: "Compliance", body: "Review governance decisions, the LLM audit log and member access, then export the record." },
  { role: "CIO", body: "See the whole research book: what's promotable, what failed, and what the desk has learned." },
];

export default function ProductPage() {
  return (
    <>
      <PageHero
        eyebrow="Platform overview"
        title={
          <>
            Four layers. <em>One compounding</em> research loop.
          </>
        }
        intro="Stellix Labs isn't a backtester with features bolted on. It was designed from the first migration so that every result — especially every failure — becomes durable, queryable institutional memory."
      >
        <ButtonLink href="/contact" size="lg" arrow>
          Request a demo
        </ButtonLink>
        <ButtonLink href="/features" variant="secondary" size="lg">
          Explore features
        </ButtonLink>
      </PageHero>

      <Section>
        <SectionHeader
          eyebrow="The architecture, simply"
          title={
            <>
              Every layer has <em>one job.</em>
            </>
          }
          intro="Data flows up through the stack; memory flows back down into the next round of research."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-2">
          {LAYERS.map((l, i) => {
            const Icon = l.icon;
            return (
              <Reveal key={l.n} delay={i * 70}>
                <Card interactive className="h-full">
                  <div className="flex items-start justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-tint text-brand">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="font-code text-[12px] text-ink-3">Layer {l.n}</span>
                  </div>
                  <h3 className="mt-7 text-[22px] font-semibold tracking-[-0.01em] text-ink">{l.name}</h3>
                  <p className="mt-1 font-editorial text-[19px] text-brand">{l.why}</p>
                  <p className="mt-4 text-[15px] leading-[1.7] text-ink-2">{l.body}</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {l.items.map((it) => (
                      <Tag key={it}>{it}</Tag>
                    ))}
                  </div>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </Section>

      <Section tone="sunken">
        <SectionHeader
          eyebrow="The research lifecycle"
          title={
            <>
              From raw ticks to an evolved, <em>regime-validated</em> strategy.
            </>
          }
        />
        <ol className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
          {LIFECYCLE.map(([name, body], i) => (
            <li key={name} className="relative bg-paper-raised p-6">
              <span className={i === 6 ? "font-code text-[12px] font-semibold text-signal-text" : i === 8 ? "font-code text-[12px] font-semibold text-loss" : "font-code text-[12px] font-semibold text-brand"}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-[16px] font-semibold text-ink">{name}</h3>
              <p className="mt-2 text-[14px] leading-[1.65] text-ink-2">{body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 rounded-2xl border border-line bg-paper-raised p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[14px] font-semibold text-ink">Every step above runs with a regime attached</p>
            <RegimeLegend />
          </div>
          <RegimeTape className="mt-5" />
        </div>
      </Section>

      <Section>
        <SectionHeader
          eyebrow="One workspace, four seats"
          title={
            <>
              Each role sees <em>what it&apos;s accountable for.</em>
            </>
          }
          intro="Role-based routing gives every person a focused workspace — the same memory underneath, a different lens on top."
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r, i) => (
            <Reveal key={r.role} delay={i * 70}>
              <Card className="h-full">
                <Tag tone="brand">{r.role}</Tag>
                <p className="mt-5 text-[15px] leading-[1.7] text-ink-2">{r.body}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </Section>

      <div className="h-8 bg-paper" />
      <CtaBand />
    </>
  );
}
