import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Bot,
  Building,
  Coins,
  FileLock2,
  Landmark,
  LineChart,
  ScrollText,
  Users,
} from "lucide-react";

import {
  FailureLedger,
  MemoryMap,
  PerRegimeTable,
} from "@/components/marketing/artifacts";
import { LiveHero } from "@/components/marketing/hero-live";
import { ProofTabs, ResearchLoop } from "@/components/marketing/home-interactive";
import { Reveal } from "@/components/marketing/reveal";
import {
  Card,
  CtaBand,
  Display,
  Eyebrow,
  Section,
  SectionHeader,
  Tag,
  TextLink,
} from "@/components/marketing/site";

export const metadata: Metadata = {
  title: { absolute: "Stellix Labs — Research that remembers why it failed" },
  description:
    "Stellix Labs records a permanent autopsy for every quant strategy that breaks — the market regime, the trigger, the features responsible — and compounds it into a research memory your whole desk can query.",
};

const PROBLEMS = [
  {
    n: "01",
    title: "Friday's resignation",
    body: "Your senior quant leaves on Friday. By Monday, two years of “we tried that — it blows up in high-vol” has left with them, and the new hire spends a quarter rediscovering it.",
  },
  {
    n: "02",
    title: "The 2.1 Sharpe that lied",
    body: "It looked great in aggregate. It had only ever traded a bull market. Nobody split the result by regime, so nobody saw it had never survived a drawdown — until it met one live.",
  },
  {
    n: "03",
    title: "The same dead end, four times",
    body: "Four researchers, four years, the same RSI-reversal idea. All four died the same way in the same regime. Nothing recorded the first three, so the fourth was inevitable.",
  },
  {
    n: "04",
    title: "Research with a half-life",
    body: "Notebook cells, Slack threads, the “huh, that's odd” moments — they live in heads and folders nobody opens. Your research IP decays at the speed of turnover.",
  },
];

const PILLARS = [
  {
    eyebrow: "01 · Regime-conditioning",
    title: (
      <>
        Context <em>before</em> conclusions.
      </>
    ),
    body: "Every backtest is split across six market regimes before a single Sharpe ratio reaches your screen. A strategy that only worked because the market went up is flagged as regime-fragile long before it reaches your book.",
    points: ["Bull · Bear · High-Vol · Low-Vol · Sideways · Crisis", "Four-model ensemble with a fast Crisis override", "A confidence score on every bar"],
    href: "/features#regime-detection",
    visual: <PerRegimeTable />,
  },
  {
    eyebrow: "02 · Failure as an asset",
    title: (
      <>
        Failures are <em>evidence</em>, not clutter.
      </>
    ),
    body: "When a strategy breaks, Stellix performs an autopsy instead of an archive. The regime it broke in, which of four triggers caught it, and a SHAP attribution of the five features most responsible — written to a table where UPDATE and DELETE are revoked at the database role.",
    points: ["Drawdown breach · Sharpe decline · regime mismatch · manual", "Immutable by permission, not by policy", "Failed strategies never count against your plan"],
    href: "/features#failure-intelligence",
    visual: <FailureLedger />,
  },
  {
    eyebrow: "03 · Compounding memory",
    title: (
      <>
        Memory that <em>compounds</em>.
      </>
    ),
    body: "Strategies, failures, regimes and research notes are linked into one Research Memory, built straight from PostgreSQL. “What failure mode do our momentum strategies share in Crisis?” is answered from years of your own research — not a fresh guess.",
    points: ["6 record types, 8 relationship types", "5 built-in research-memory questions", "Rebuilt from PostgreSQL — nothing extra to run"],
    href: "/architecture#research-memory",
    visual: <MemoryMap compact />,
  },
];

const AUDIENCES = [
  { icon: LineChart, name: "Hedge funds", body: "Alpha research that survives PM and analyst turnover." },
  { icon: Building, name: "Prop trading firms", body: "Stop funding the same blow-up on two different desks." },
  { icon: Coins, name: "Crypto funds", body: "Regime alerts for markets that change character overnight." },
  { icon: Landmark, name: "Banks & asset managers", body: "Validation your risk committee can audit, line by line." },
];

const TRUST = [
  { icon: Users, title: "Fail-closed multi-tenancy", body: "A query with no organization bound raises instead of leaking. Enforced in the ORM and in every Research Memory lookup." },
  { icon: FileLock2, title: "Append-only failure records", body: "UPDATE and DELETE are revoked at the PostgreSQL role level. History cannot be rewritten." },
  { icon: Bot, title: "AI with zero execution authority", body: "The research assistant drafts and critiques. It cannot mutate a strategy, and every call is logged first." },
  { icon: ScrollText, title: "A complete audit trail", body: "Every promotion, approval and kill-switch is recorded and exports to a compliance-ready report." },
];

export default function LandingPage() {
  return (
    <>
      <LiveHero />

      {/* ============================ PROBLEM ============================ */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeader
              eyebrow="The cost of forgetting"
              title={
                <>
                  Quant desks rarely lose their edge in the market. They lose it <em>in the handover.</em>
                </>
              }
              intro="Backtesters are built to find what works. None are built to remember what doesn't — so the hardest-won knowledge in your firm, the map of what fails and when, quietly evaporates."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {PROBLEMS.map((p, i) => (
              <Reveal key={p.n} delay={i * 80}>
                <Card interactive className="h-full">
                  <span className="font-code text-[12px] font-medium text-loss">{p.n}</span>
                  <h3 className="mt-4 text-[19px] font-semibold tracking-[-0.01em] text-ink">{p.title}</h3>
                  <p className="mt-3 text-[15px] leading-[1.7] text-ink-2">{p.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* ============================== LOOP ============================== */}
      <Section tone="sunken" id="how">
        <SectionHeader
          eyebrow="How it compounds"
          title={
            <>
              One research loop that gets sharper <em>every time a strategy dies.</em>
            </>
          }
          intro="Data is regime-labelled, becomes a strategy, is validated per regime and — win or lose — is written to memory. That memory seeds the next generation."
        />
        <ResearchLoop />
      </Section>

      {/* ============================ PILLARS ============================ */}
      <Section>
        <SectionHeader
          eyebrow="Why it's different"
          align="center"
          title={
            <>
              Three ideas no backtester <em>was built around.</em>
            </>
          }
        />
        <div className="mt-20 space-y-24 lg:space-y-32">
          {PILLARS.map((p, i) => (
            <div key={p.eyebrow} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
              <Reveal className={i % 2 === 1 ? "lg:order-2" : undefined}>
                <Eyebrow tone="ink">{p.eyebrow}</Eyebrow>
                <Display size="md" as="h3" className="mt-4">
                  {p.title}
                </Display>
                <p className="mt-5 text-[16.5px] leading-[1.75] text-ink-2">{p.body}</p>
                <ul className="mt-7 space-y-2.5">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-3 text-[15px] text-ink">
                      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      {pt}
                    </li>
                  ))}
                </ul>
                <TextLink href={p.href} className="mt-8">
                  Learn more
                </TextLink>
              </Reveal>
              <Reveal delay={120} className={i % 2 === 1 ? "lg:order-1" : undefined}>
                {p.visual}
              </Reveal>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================= PROOF ============================= */}
      <Section tone="ink" className="overflow-hidden">
        <div aria-hidden className="ink-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
        <div aria-hidden className="pointer-events-none absolute -right-40 top-0 h-[420px] w-[620px] rounded-full bg-brand/30 blur-[140px]" />
        <div className="relative max-w-3xl">
          <Eyebrow tone="light">Show, don&apos;t decorate</Eyebrow>
          <h2 className="mt-5 font-editorial text-[clamp(2rem,3.8vw,3.1rem)] font-normal leading-[1.04] tracking-[-0.02em] text-white text-balance">
            Built from artifacts <em className="text-brand-bright">you can inspect.</em>
          </h2>
          <p className="mt-5 text-[17px] leading-[1.7] text-white/80">
            No stock dashboards. These are the real structures the platform runs on — the rule language, the memory
            queries and the promotion gate.
          </p>
        </div>
        <div className="relative">
          <ProofTabs />
        </div>
      </Section>

      {/* ============================ AUDIENCE ============================ */}
      <Section>
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <SectionHeader
            eyebrow="Who it's for"
            title={
              <>
                For teams whose edge is research — <em>and whose risk is forgetting.</em>
              </>
            }
          />
          <TextLink href="/use-cases" className="shrink-0">
            Explore use cases
          </TextLink>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((a, i) => {
            const Icon = a.icon;
            return (
              <Reveal key={a.name} delay={i * 70}>
                <Link href="/use-cases" className="group block h-full">
                  <Card interactive className="flex h-full flex-col">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-tint text-brand">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-8 text-[18px] font-semibold text-ink">{a.name}</h3>
                    <p className="mt-2 flex-1 text-[15px] leading-[1.65] text-ink-2">{a.body}</p>
                    <ArrowUpRight className="mt-6 h-4 w-4 text-ink-3 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand" />
                  </Card>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </Section>

      {/* ============================== TRUST ============================== */}
      <Section tone="raised">
        <div className="grid gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <div>
            <SectionHeader
              eyebrow="Governance"
              title={
                <>
                  Built like infrastructure. <em>Governed like a bank.</em>
                </>
              }
              intro="Institutional memory is only worth keeping if nobody can quietly edit it. The guarantees below are structural — enforced by the database and the query layer, not by a policy document."
            />
            <div className="mt-8 flex flex-wrap gap-2">
              <Tag tone="brand">REVOKE UPDATE, DELETE</Tag>
              <Tag tone="brand">$organization_id</Tag>
              <Tag tone="signal">human review required</Tag>
            </div>
            <TextLink href="/security" className="mt-8">
              Read the security overview
            </TextLink>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
            {TRUST.map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.title} className="bg-paper-raised p-7">
                  <Icon className="h-5 w-5 text-brand" />
                  <h3 className="mt-5 text-[17px] font-semibold text-ink">{t.title}</h3>
                  <p className="mt-2 text-[14.5px] leading-[1.7] text-ink-2">{t.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      <div className="h-20 bg-paper sm:h-28" />
      <CtaBand />
    </>
  );
}
