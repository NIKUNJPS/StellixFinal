import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Reveal } from "@/components/marketing/reveal";
import { Eyebrow, SectionHeading } from "@/components/marketing/section";
import { UseCasesContent } from "@/components/marketing/use-cases-content";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Use Cases — Hedge Funds, Prop Firms, Crypto, Banks, Asset Managers",
  description:
    "Five segments, five concrete scenarios where institutional memory and regime-conditioning change the outcome — not a restatement of the feature list.",
};

export default function UseCasesPage() {
  return (
    <>
      <div className="container py-20 lg:py-24">
        <Reveal className="max-w-3xl">
          <Eyebrow>Use Cases</Eyebrow>
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
            Different firms. The same forgetting problem.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            Whether your edge is speed, breadth, or discretion, it decays the same way — through amnesia. Here&apos;s
            what changes when it doesn&apos;t.
          </p>
        </Reveal>
        <UseCasesContent />
      </div>

      <section className="border-t border-border/60 bg-[#F7F9FC]">
        <div className="container py-20 text-center">
          <Reveal className="mx-auto max-w-2xl">
            <SectionHeading>Your segment isn&apos;t listed? The forgetting problem is universal.</SectionHeading>
            <div className="mt-8">
              <Link href="/contact" className={buttonVariants({ size: "lg" })}>
                Request a demo on your own research questions <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
