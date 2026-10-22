import type { Metadata } from "next";
import { Building, Coins, Landmark, LineChart, PieChart } from "lucide-react";

import { Reveal } from "@/components/marketing/reveal";
import { ButtonLink, CtaBand, PageHero, Section, Tag } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Use cases — hedge funds, prop firms, crypto, banks, asset managers",
  description:
    "Five kinds of firm, five concrete scenarios where institutional memory and regime-conditioning change the outcome.",
};

const SEGMENTS = [
  {
    icon: LineChart,
    name: "Hedge funds",
    oneLiner: "Institutionalize alpha so it survives the org chart.",
    before: "A PM leaves and takes their book's intuition with them. The replacement inherits positions, not reasoning.",
    after:
      "Every strategy the PM built, every regime it thrived and failed in, and every research note behind it are already linked in Research Memory. The next PM asks “show me every hypothesis that led to a live strategy in this book” on day one.",
    fits: ["Research Memory", "Failure intelligence", "Research notebook"],
  },
  {
    icon: Building,
    name: "Proprietary trading firms",
    oneLiner: "Stop paying twice for the same dead end.",
    before: "Desk A blows up a momentum strategy in a high-vol regime in March. Desk B, not knowing, ships a near-identical one in June.",
    after:
      "recurring_failure_modes surfaces the pattern the moment Desk B's strategy is recorded — turning a repeated loss into a one-time lesson shared across every desk.",
    fits: ["Cross-desk failure memory", "Regime-mismatch detection"],
  },
  {
    icon: Coins,
    name: "Crypto funds",
    oneLiner: "For markets that change character overnight.",
    before: "A strategy that prints in a low-volatility grind quietly becomes a liability the instant the market flips to Crisis.",
    after:
      "Because every backtest and every live strategy is regime-conditioned, a regime transition raises a mismatch alert before the drawdown — not in the post-mortem.",
    fits: ["Six-regime detection", "Mismatch trigger", "Live monitoring"],
  },
  {
    icon: Landmark,
    name: "Investment banks",
    oneLiner: "Regime-aware research with a compliance-grade paper trail.",
    before: "A model desk has to prove why a strategy was approved, who approved it, and what validation it passed — from email threads.",
    after:
      "Every promotion is gated on a five-method robustness score, every state change lands in an append-only audit log, and the whole record exports to a compliance report on demand.",
    fits: ["Validation gate", "Audit log", "Compliance export", "Kill switch"],
  },
  {
    icon: PieChart,
    name: "Asset managers",
    oneLiner: "Validation your risk committee will actually trust.",
    before: "The committee is shown a single Sharpe ratio on a slide and asked to take it on faith.",
    after:
      "They see performance across all six regimes, the five validation sub-scores, and the complete failure history — the difference between “trust me” and “here's the evidence.”",
    fits: ["Per-regime reporting", "Validation breakdown", "Failure records"],
  },
];

export default function UseCasesPage() {
  return (
    <>
      <PageHero
        eyebrow="Use cases"
        title={
          <>
            Different firms. <em>The same forgetting</em> problem.
          </>
        }
        intro="Whether your edge is speed, breadth or discretion, it decays the same way — through amnesia. Here's what changes when it doesn't."
      >
        <ButtonLink href="/contact" size="lg" arrow>
          Talk about your desk
        </ButtonLink>
      </PageHero>

      <Section>
        <div className="space-y-5">
          {SEGMENTS.map((s, i) => {
            const Icon = s.icon;
            return (
              <Reveal key={s.name} delay={60}>
                <article
                  id={s.name.toLowerCase().replace(/\s+/g, "-")}
                  className="grid scroll-mt-28 gap-8 rounded-3xl border border-line bg-paper-raised p-7 sm:p-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14"
                >
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-tint text-brand">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="font-code text-[12px] text-ink-3">{String(i + 1).padStart(2, "0")} / 05</span>
                    </div>
                    <h2 className="mt-7 text-[26px] font-semibold tracking-[-0.015em] text-ink">{s.name}</h2>
                    <p className="mt-2 font-editorial text-[24px] leading-snug text-brand">{s.oneLiner}</p>
                    <div className="mt-6 flex flex-wrap gap-2">
                      {s.fits.map((f) => (
                        <Tag key={f}>{f}</Tag>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-line bg-paper p-6">
                      <p className="font-code text-[11px] font-medium uppercase tracking-[0.14em] text-loss">Without memory</p>
                      <p className="mt-3 text-[15px] leading-[1.7] text-ink-2">{s.before}</p>
                    </div>
                    <div className="rounded-2xl border border-brand/20 bg-brand-tint/60 p-6">
                      <p className="font-code text-[11px] font-medium uppercase tracking-[0.14em] text-brand">With Stellix</p>
                      <p className="mt-3 text-[15px] leading-[1.7] text-ink">{s.after}</p>
                    </div>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </Section>

      <CtaBand
        title={
          <>
            Your segment isn&apos;t listed? <em>Forgetting is universal.</em>
          </>
        }
        intro="Bring one strategy that failed and you never fully understood. We'll show you what the platform would have recorded."
      />
    </>
  );
}
