import type { Metadata } from "next";

import { FeaturesContent } from "@/components/marketing/features-content";
import { Reveal } from "@/components/marketing/reveal";
import { Eyebrow } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Features — Regime Detection, Failure Intelligence, Knowledge Graph & More",
  description:
    "Seven core modules, each shown with a real product artifact — a live regime timeline, a real failure record, an actual knowledge-graph traversal. No decorative icons.",
};

export default function FeaturesPage() {
  return (
    <div className="container py-20 lg:py-24">
      <Reveal className="max-w-3xl">
        <Eyebrow>Features</Eyebrow>
        <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
          Seven modules. Zero decorative screenshots.
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
          Every feature below is shown with a real artifact from the running product — a real regime timeline, a
          real validation breakdown, a real graph traversal. If we show it, it&apos;s live.
        </p>
      </Reveal>
      <FeaturesContent />
    </div>
  );
}
