import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Reveal } from "@/components/marketing/reveal";
import { Eyebrow } from "@/components/marketing/section";
import { UseCasesContent } from "@/components/marketing/use-cases-content";

export const metadata: Metadata = {
  title: "Use Cases — Hedge Funds, Prop Firms, Crypto, Banks, Asset Managers",
  description:
    "Five segments, five concrete scenarios where institutional memory and regime-conditioning change the outcome — not a restatement of the feature list.",
};

export default function UseCasesPage() {
  return (
    <main className="min-h-screen bg-[#08080B] font-[var(--font-figtree)] text-[#F4F3F7]">
      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* Background atmosphere */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
              `,
              backgroundSize: "90px 90px",
            }}
          />

          <div className="absolute left-[-10%] top-[-20%] h-[500px] w-[500px] rounded-full bg-[#522A6F]/15 blur-[180px]" />
        </div>

        <div className="container relative py-20 lg:py-28">
          <Reveal className="max-w-4xl">
            <Eyebrow>Use Cases</Eyebrow>

            <h1 className="mt-5 font-[var(--font-figtree)] text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-[#F4F3F7] sm:text-5xl lg:text-6xl">
              Different firms. The same forgetting problem.
            </h1>

            <p className="mt-7 max-w-2xl text-[17px] leading-[1.75] text-white/60 sm:text-[18px]">
              Whether your edge is speed, breadth, or discretion, it decays the
              same way — through amnesia. Here&apos;s what changes when it
              doesn&apos;t.
            </p>
          </Reveal>
        </div>
      </section>

      {/* USE CASES */}
      <div className="container pb-24 lg:pb-32">
        <UseCasesContent />
      </div>

      {/* CTA */}
      <section className="relative border-t border-white/[0.08]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#522A6F]/10 via-transparent to-transparent" />

        <div className="container relative py-24 text-center lg:py-28">
          <Reveal className="mx-auto max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#A79CFF]">
              Beyond the listed segments
            </p>

            <h2 className="mt-5 font-[var(--font-figtree)] text-3xl font-semibold leading-[1.15] tracking-[-0.04em] text-[#F4F3F7] sm:text-4xl lg:text-5xl">
              Your segment isn&apos;t listed?
              <br />
              The forgetting problem is universal.
            </h2>

            <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-white/50">
              See how Stellix Labs can preserve research intelligence across
              your organization.
            </p>

            <div className="mt-9">
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-xl bg-[#8B7CFF] px-6 py-3.5 text-[15px] font-semibold text-white transition-all duration-300 hover:bg-[#A79CFF] hover:shadow-[0_0_35px_rgba(139,124,255,0.3)]"
              >
                Request a demo on your own research questions
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}