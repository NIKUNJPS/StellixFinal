import type { Metadata } from "next";

import { DocsContent } from "@/components/marketing/docs-content";
import { ButtonLink, Container, Display, Eyebrow, Lede } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Documentation — concepts, quickstart and API",
  description:
    "Conceptual guides to regime detection, the strategy DSL, the validation gate and Research Memory, plus an API reference generated from the live OpenAPI schema.",
};

export default function DocsPage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="paper-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_left,black_15%,transparent_60%)]" />
        <Container className="relative flex flex-col gap-8 py-14 sm:py-20 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <Eyebrow>Documentation</Eyebrow>
            <Display as="h1" size="lg" className="mt-5">
              The <em>why</em>, the how, and a live API.
            </Display>
            <Lede className="mt-5">
              Concepts explain the reasoning behind each system. The API reference is generated from the running service, so it
              can never drift from the real API.
            </Lede>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="#quickstart" variant="secondary">
              Quickstart
            </ButtonLink>
            <ButtonLink href="/docs/api" arrow>
              API reference
            </ButtonLink>
          </div>
        </Container>
      </section>
      <Container className="py-14 sm:py-20">
        <DocsContent />
      </Container>
    </>
  );
}
