import type { Metadata } from "next";
import { Check, Minus, Plus } from "lucide-react";

import { PricingCards } from "@/components/marketing/pricing-cards";
import { Container, CtaBand, Display, Eyebrow, Lede, Section, SectionHeader } from "@/components/marketing/site";
import { COMPARISON_ROWS, PRICING_FAQ } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Pricing — Starter, Pro and Enterprise",
  description:
    "Plans for solo researchers through institutional teams. Every plan includes regime detection, validation, failure intelligence and Research Memory.",
};

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto h-4 w-4 text-brand" strokeWidth={2.5} aria-label="Included" />;
  if (value === false) return <Minus className="mx-auto h-4 w-4 text-line-strong" aria-label="Not included" />;
  return <span className="text-ink-2">{value}</span>;
}

export default function PricingPage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="paper-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
        <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-brand-soft/50 blur-[120px]" />
        <Container className="relative pb-20 pt-16 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow className="justify-center">Pricing</Eyebrow>
            <Display as="h1" size="xl" className="mt-6">
              Priced for the research, <em>not the seat count.</em>
            </Display>
            <Lede className="mx-auto mt-6 max-w-2xl">
              Start small and scale when your strategy library does. Every plan includes the full research loop — and failed
              strategies never count against your limit.
            </Lede>
          </div>
          <div className="mt-14">
            <PricingCards />
          </div>
        </Container>
      </section>

      <Section tone="paper">
        <SectionHeader eyebrow="Compare plans" title={<>Every capability, <em>side by side.</em></>} />
        <div className="mt-12 overflow-x-auto rounded-2xl border border-line bg-paper-raised">
          <table className="w-full min-w-[640px] text-[14.5px]">
            <thead className="border-b border-line bg-paper-sunken/70">
              <tr>
                <th scope="col" className="px-5 py-4 text-left font-code text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">Capability</th>
                {["Starter", "Pro", "Enterprise"].map((h) => (
                  <th key={h} scope="col" className="px-5 py-4 text-center text-[14px] font-semibold text-ink">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.capability} className="hover:bg-paper">
                  <th scope="row" className="px-5 py-3.5 text-left font-medium text-ink">
                    {row.capability}
                  </th>
                  <td className="px-5 py-3.5 text-center"><Cell value={row.starter} /></td>
                  <td className="bg-brand-tint/40 px-5 py-3.5 text-center"><Cell value={row.pro} /></td>
                  <td className="px-5 py-3.5 text-center"><Cell value={row.enterprise} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <SectionHeader eyebrow="FAQ" title={<>Questions, <em>answered plainly.</em></>} />
          <div className="divide-y divide-line rounded-2xl border border-line bg-paper-raised">
            {PRICING_FAQ.map((item) => (
              <details key={item.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[16px] font-semibold text-ink">
                  {item.q}
                  <Plus className="h-4 w-4 shrink-0 text-brand transition-transform duration-200 group-open:rotate-45" />
                </summary>
                <p className="mt-3 text-[15px] leading-[1.7] text-ink-2">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </Section>

      <div className="h-4 bg-paper-sunken" />
      <div className="bg-paper pt-16 sm:pt-20">
        <CtaBand
          title={
            <>
              Not sure which plan fits? <em>Ask a quant, not a sales script.</em>
            </>
          }
        />
      </div>
    </>
  );
}
