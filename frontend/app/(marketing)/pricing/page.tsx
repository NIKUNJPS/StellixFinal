import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";

import { PricingCards } from "@/components/marketing/pricing-cards";
import { Reveal } from "@/components/marketing/reveal";
import { Eyebrow } from "@/components/marketing/section";
import { COMPARISON_ROWS, PRICING_FAQ } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Pricing — Starter, Pro, and Enterprise Plans",
  description:
    "Transparent plans for solo researchers to institutional teams. Start on Starter, scale to Pro, or talk to us about Enterprise.",
};

function Cell({ value }: { value: string | boolean }) {
  if (value === true) {
    return <Check className="mx-auto h-4 w-4 text-[#FBCF4F]" />;
  }

  if (value === false) {
    return <Minus className="mx-auto h-4 w-4 text-white/20" />;
  }

  return <span className="text-white/65">{value}</span>;
}

export default function PricingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#09090F] font-sans text-white">
      {/* Background atmosphere */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
            `,
            backgroundSize: "80px 80px",
          }}
        />

        <div className="absolute -left-[20%] top-[5%] h-[650px] w-[650px] rounded-full bg-[#522A6F]/20 blur-[200px]" />

        <div className="absolute -right-[20%] top-[20%] h-[600px] w-[600px] rounded-full bg-[#FBCF4F]/[0.04] blur-[220px]" />

        <div className="absolute bottom-0 left-[30%] h-[500px] w-[500px] rounded-full bg-[#8B7CFF]/10 blur-[200px]" />
      </div>

      {/* ================= HERO ================= */}

      <section className="relative">
        <div className="container py-24 text-center lg:py-32">
          <Reveal className="mx-auto max-w-3xl">
            <Eyebrow className="flex justify-center">
              Pricing
            </Eyebrow>

            <h1 className="mt-5 text-[clamp(2.7rem,5vw,5.2rem)] font-semibold leading-[1.05] tracking-[-0.055em] text-white">
              Built for research that needs to outlive the researcher.
            </h1>

            <p className="mx-auto mt-7 max-w-2xl text-[17px] leading-[1.8] text-white/65 sm:text-[18px]">
              Start small, scale when your strategy library does. Every plan
              helps preserve research intelligence — from regime detection and
              validation to failure intelligence and institutional memory.
            </p>
          </Reveal>

          <div className="mt-16">
            <PricingCards />
          </div>
        </div>
      </section>

      {/* ================= COMPARISON ================= */}

      <section className="relative border-t border-white/[0.08]">
        <div className="container py-24 lg:py-28">
          <Reveal className="max-w-2xl">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-[#FBCF4F]" />

              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#FBCF4F]">
                Compare
              </span>
            </div>

            <h2 className="mt-5 text-[clamp(2.2rem,4vw,3.8rem)] font-semibold tracking-[-0.045em] text-white">
              Everything, side by side.
            </h2>

            <p className="mt-5 text-[17px] leading-relaxed text-white/60">
              See exactly how each plan expands your research infrastructure.
            </p>
          </Reveal>

          <div className="mt-14 overflow-x-auto border-t border-white/[0.12]">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-white/[0.12]">
                  <th className="py-6 pr-6 text-[12px] font-semibold uppercase tracking-[0.16em] text-white/50">
                    Capability
                  </th>

                  <th className="px-5 py-6 text-center text-[12px] font-semibold uppercase tracking-[0.14em] text-white/50">
                    Starter
                  </th>

                  <th className="px-5 py-6 text-center text-[12px] font-semibold uppercase tracking-[0.14em] text-white/50">
                    Pro
                  </th>

                  <th className="px-5 py-6 text-center text-[12px] font-semibold uppercase tracking-[0.14em] text-[#FBCF4F]">
                    Enterprise
                  </th>
                </tr>
              </thead>

              <tbody>
                {COMPARISON_ROWS.map((row, index) => (
                  <tr
                    key={row.capability}
                    className="border-b border-white/[0.07] transition-colors hover:bg-white/[0.025]"
                  >
                    <td className="py-5 pr-6 text-[15px] text-white/85">
                      <div className="flex items-center gap-4">
                        <span className="text-[11px] font-medium text-white/25">
                          {String(index + 1).padStart(2, "0")}
                        </span>

                        {row.capability}
                      </div>
                    </td>

                    <td className="px-5 py-5 text-center">
                      <Cell value={row.starter} />
                    </td>

                    <td className="px-5 py-5 text-center">
                      <Cell value={row.pro} />
                    </td>

                    <td className="bg-[#FBCF4F]/[0.025] px-5 py-5 text-center">
                      <Cell value={row.enterprise} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ================= FAQ ================= */}

      <section className="relative border-t border-white/[0.08]">
        <div className="container py-24 lg:py-28">
          <Reveal className="max-w-2xl">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-[#FBCF4F]" />

              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#FBCF4F]">
                FAQ
              </span>
            </div>

            <h2 className="mt-5 text-[clamp(2.2rem,4vw,3.8rem)] font-semibold tracking-[-0.045em] text-white">
              Questions before you decide.
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-x-16 gap-y-0 md:grid-cols-2">
            {PRICING_FAQ.map((item, index) => (
              <Reveal key={item.q}>
                <div className="border-t border-white/[0.1] py-8">
                  <div className="flex gap-4">
                    <span className="mt-1 text-[11px] font-semibold tracking-[0.16em] text-[#FBCF4F]">
                      0{index + 1}
                    </span>

                    <div>
                      <h3 className="text-[18px] font-medium tracking-[-0.02em] text-white">
                        {item.q}
                      </h3>

                      <p className="mt-4 text-[15px] leading-[1.8] text-white/60">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}