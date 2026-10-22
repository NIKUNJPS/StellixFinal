import type { Metadata } from "next";

import { RegimeTape } from "@/components/marketing/artifacts";
import { Reveal } from "@/components/marketing/reveal";
import { ButtonLink, Card, CtaBand, Display, PageHero, Section, SectionHeader } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "About — why failed research is the asset",
  description:
    "Stellix Labs is built on one contrarian premise: the strategies that failed are a quant firm's most valuable research — if someone remembers why.",
};

const PRINCIPLES = [
  {
    n: "01",
    title: "No number without a regime.",
    body: "A Sharpe ratio measured across a bull market tells you about the market, not the strategy. Every result we store carries the context it was earned in.",
  },
  {
    n: "02",
    title: "The failure is the asset.",
    body: "Other tools optimise for finding what works and quietly discard the rest. We treat the discarded half as the most information-dense data a desk produces.",
  },
  {
    n: "03",
    title: "Memory has to be tamper-proof.",
    body: "A record that can be quietly edited isn't memory, it's a draft. Failure records are append-only by database permission — not by good intentions.",
  },
  {
    n: "04",
    title: "Show the artifact, not the adjective.",
    body: "We describe the product with the structures it actually runs on: the regime ensemble, the rule DSL, the memory model. If we can't point to it, we don't claim it.",
  },
  {
    n: "05",
    title: "AI assists. People decide.",
    body: "The research assistant can draft, explain and critique. It cannot change a strategy, and anything it generates waits for a human to review it.",
  },
  {
    n: "06",
    title: "Boring infrastructure, on purpose.",
    body: "PostgreSQL, TimescaleDB, Redis, FastAPI — and one database, not three. Research memory should outlast fashion, so we built it on tools that already have.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About Stellix Labs"
        title={
          <>
            We think the strategies that failed are <em>your best research.</em>
          </>
        }
        intro="Every quant firm runs thousands of experiments. Most are forgotten the week they fail — and with them, the map of what doesn't work and when. Stellix Labs exists to keep that map."
      >
        <ButtonLink href="/contact" size="lg" arrow>
          Talk to the team
        </ButtonLink>
        <ButtonLink href="/product" variant="secondary" size="lg">
          How the platform works
        </ButtonLink>
      </PageHero>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
          <div>
            <SectionHeader
              eyebrow="The premise"
              title={
                <>
                  Institutional amnesia is <em>the real risk.</em>
                </>
              }
            />
          </div>
          <div className="space-y-5 text-[17px] leading-[1.8] text-ink-2">
            <p>
              A senior researcher resigns. Two years of “we already tried that — it blows up in high-vol” leaves with them. Their
              replacement spends a quarter rediscovering the same trap, at the firm&apos;s expense.
            </p>
            <p>
              Backtesting tools were never designed to stop this. They run experiments and keep the winners. Stellix Labs is built
              on the opposite premise: <span className="font-semibold text-ink">record why every strategy broke, in which regime, and connect it to
              everything else your desk knows.</span>
            </p>
            <p>The result is research that compounds instead of resetting every time someone leaves.</p>
          </div>
        </div>
        <RegimeTape className="mt-16" />
      </Section>

      <Section tone="sunken">
        <SectionHeader eyebrow="How we build" title={<>Six principles we <em>won&apos;t trade away.</em></>} />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRINCIPLES.map((p, i) => (
            <Reveal key={p.n} delay={i * 60}>
              <Card className="h-full">
                <span className="font-code text-[12px] font-semibold text-brand">{p.n}</span>
                <h3 className="mt-4 text-[19px] font-semibold tracking-[-0.01em] text-ink">{p.title}</h3>
                <p className="mt-3 text-[15px] leading-[1.7] text-ink-2">{p.body}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section>
        <div className="mx-auto max-w-3xl text-center">
          <Display>
            “The cheapest alpha is <em>not losing the same trade twice.</em>”
          </Display>
          <p className="mt-6 font-code text-[12px] uppercase tracking-[0.18em] text-ink-3">The idea behind Stellix Labs</p>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
