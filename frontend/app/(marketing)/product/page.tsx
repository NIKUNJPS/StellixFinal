import type { Metadata } from "next";

import { ArchitectureDiagram } from "@/components/marketing/architecture-diagram";
import { Reveal } from "@/components/marketing/reveal";
import { Eyebrow, Section, SectionHeading, SectionIntro } from "@/components/marketing/section";
import { TECH_STACK } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "How It Works — The Four-Layer Research Architecture",
  description:
    "A four-layer system — Data, Intelligence, Memory, Application — that turns raw market data into permanent, regime-conditioned, queryable research knowledge.",
};

const LAYER_CARDS = [
  {
    name: "Data",
    why: "Garbage regimes in, garbage strategies out.",
    body: "Clean, temporally honest features are the foundation everything else stands on.",
  },
  {
    name: "Intelligence",
    why: "Where research actually happens.",
    body: "Six services that never look at performance without a regime attached.",
  },
  {
    name: "Memory",
    why: "The part every other tool skips.",
    body: "Two databases, one purpose: nothing valuable is ever forgotten.",
  },
  {
    name: "Application",
    why: "Multi-tenant from migration zero.",
    body: "Every row is scoped to an organization; a query with no tenant bound fails closed rather than leaking.",
  },
];

const WORKFLOW_TIMELINE = [
  { step: "Ingest", body: "Pull OHLCV for a symbol and window through a pluggable data provider." },
  { step: "Engineer", body: "Compute 15+ trailing indicators with strict no-look-ahead guarantees." },
  { step: "Detect regimes", body: "Label every bar into one of six regimes via the four-model ensemble." },
  { step: "Author", body: "Write a strategy in the JSON rule DSL, or draft a hypothesis with the LLM assistant." },
  { step: "Backtest", body: "Simulate per regime; get Sharpe/Sortino/Beta split by market context." },
  { step: "Validate", body: "Run the five-method gauntlet; produce a single robustness score." },
  { step: "Gate", body: "Promote to active only above 0.70 robustness; everything else stays a candidate." },
  { step: "Monitor", body: "Watch live strategies for drawdown breach, Sharpe decline, and regime mismatch." },
  { step: "Record failure", body: "On any trigger, write an immutable SHAP-attributed autopsy to the graph." },
  { step: "Evolve", body: "Seed a genetic algorithm from survivors; register the fittest offspring with recorded lineage." },
];

export default function ProductPage() {
  return (
    <>
      <section className="border-b border-border/60">
        <div className="container py-20 lg:py-24">
          <Reveal className="max-w-3xl">
            <Eyebrow>Product Overview</Eyebrow>
            <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
              Four layers. One compounding research loop.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
              Stellix Labs is not a backtester with extra features bolted on. It&apos;s a four-layer system designed
              from the first migration so that every result — especially every failure — becomes durable
              institutional memory.
            </p>
          </Reveal>
        </div>
      </section>

      <Section>
        <Reveal>
          <SectionHeading>Hover any layer to see what&apos;s inside.</SectionHeading>
          <SectionIntro>
            Each band highlights its services on hover. The blue connectors are the data flow between layers.
          </SectionIntro>
        </Reveal>
        <div className="mt-10 grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-6">
            <ArchitectureDiagram variant="interactive" />
          </div>
          <div className="space-y-4">
            {LAYER_CARDS.map((c, i) => (
              <Reveal key={c.name} delay={i * 60}>
                <div className="rounded-xl border border-border bg-card/40 p-5">
                  <div className="flex items-baseline gap-3">
                    <span className="font-display text-lg font-semibold">{c.name}</span>
                    <span className="text-sm italic text-accent">{c.why}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      <Section className="bg-[#F7F9FC]">
        <Reveal>
          <Eyebrow>The Research Lifecycle</Eyebrow>
          <SectionHeading>From raw ticks to an evolved, regime-validated strategy — the full path.</SectionHeading>
        </Reveal>
        <ol className="mt-12 space-y-3">
          {WORKFLOW_TIMELINE.map((t, i) => (
            <Reveal key={t.step} delay={(i % 4) * 40} as="li">
              <div className="flex items-start gap-4 rounded-lg border border-border/70 bg-card/30 p-4">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/15 text-sm font-semibold text-accent">
                  {i + 1}
                </span>
                <div>
                  <span className="font-medium">{t.step}</span>
                  <span className="text-muted-foreground"> — {t.body}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </ol>
      </Section>

      <Section>
        <Reveal>
          <SectionHeading>Built on a locked, boring-on-purpose stack.</SectionHeading>
        </Reveal>
        <div className="mt-8 flex flex-wrap gap-2.5">
          {TECH_STACK.map((t) => (
            <span
              key={t.layer}
              className="rounded-full border border-border bg-card/40 px-4 py-2 text-sm text-muted-foreground"
            >
              {t.tech}
            </span>
          ))}
        </div>
      </Section>
    </>
  );
}
