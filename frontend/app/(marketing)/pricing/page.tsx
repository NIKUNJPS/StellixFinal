import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";

import { PricingCards } from "@/components/marketing/pricing-cards";
import { Reveal } from "@/components/marketing/reveal";
import { Eyebrow, Section, SectionHeading } from "@/components/marketing/section";
import { COMPARISON_ROWS, PRICING_FAQ } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Pricing — Starter, Pro, and Enterprise Plans",
  description:
    "Transparent plans for solo researchers to institutional teams. Start on Starter, scale to Pro, or talk to us about Enterprise.",
};

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto h-4 w-4 text-accent" />;
  if (value === false) return <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />;
  return <span className="text-muted-foreground">{value}</span>;
}

export default function PricingPage() {
  return (
    <>
      <section className="border-b border-border/60">
        <div className="container py-20 text-center lg:py-24">
          <Reveal className="mx-auto max-w-2xl">
            <Eyebrow className="flex justify-center">Pricing</Eyebrow>
            <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
              Priced for the research, not the seat count.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Start small, scale when your strategy library does. Every plan includes the full research loop —
              regime detection, validation, failure intelligence, and the knowledge graph.
            </p>
          </Reveal>
          <div className="mt-14">
            <PricingCards />
          </div>
        </div>
      </section>

      <Section>
        <Reveal>
          <SectionHeading>Compare every plan.</SectionHeading>
        </Reveal>
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 pr-4 font-medium">Capability</th>
                <th className="py-3 px-4 text-center font-medium">Starter</th>
                <th className="py-3 px-4 text-center font-medium text-accent">Pro</th>
                <th className="py-3 px-4 text-center font-medium">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.capability} className="border-b border-border/50">
                  <td className="py-3 pr-4">{row.capability}</td>
                  <td className="py-3 px-4 text-center">
                    <Cell value={row.starter} />
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Cell value={row.pro} />
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Cell value={row.enterprise} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section className="bg-[#F7F9FC]">
        <Reveal>
          <SectionHeading>Pricing FAQ</SectionHeading>
        </Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {PRICING_FAQ.map((item) => (
            <Reveal key={item.q}>
              <div className="rounded-xl border border-border bg-card/40 p-6">
                <h3 className="font-medium">{item.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>
    </>
  );
}
