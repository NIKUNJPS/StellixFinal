import type { Metadata } from "next";

import { DocsContent } from "@/components/marketing/docs-content";
import { Eyebrow } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Documentation — API & Concepts",
  description:
    "API reference generated from the live OpenAPI schema, plus conceptual guides to regime detection, the strategy DSL, and the knowledge graph.",
};

export default function DocsPage() {
  return (
    <div className="container py-16 lg:py-20">
      <div className="mb-12 max-w-3xl">
        <Eyebrow>Documentation</Eyebrow>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Concepts, and a live API reference.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          The conceptual guides explain the <em className="not-italic text-foreground">why</em>; the API reference is
          generated from the running service&apos;s OpenAPI schema, so it can never drift from the real API.
        </p>
      </div>
      <DocsContent />
    </div>
  );
}
