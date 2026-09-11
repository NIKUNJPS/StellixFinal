import type { Metadata } from "next";

import { DocsContent } from "@/components/marketing/docs-content";

export const metadata: Metadata = {
  title: "Documentation — API & Concepts",
  description:
    "API reference generated from the live OpenAPI schema, plus conceptual guides to regime detection, the strategy DSL, and the knowledge graph.",
};

export default function DocsPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#08080B] text-[#F4F3F7]">
      {/* ================= BACKGROUND ================= */}

      <div className="pointer-events-none absolute inset-0">
        {/* Grid */}

        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
            `,
            backgroundSize: "72px 72px",
          }}
        />

        {/* Purple atmosphere */}

        <div
          className="absolute -left-[20%] top-[5%] h-[700px] w-[700px] rounded-full blur-[180px]"
          style={{
            background:
              "radial-gradient(circle, rgba(167,156,255,0.12), transparent 68%)",
          }}
        />
      </div>

      <div className="relative mx-auto w-full max-w-[1300px] px-6 py-20 sm:px-10 sm:py-24 lg:px-16 lg:py-28">
        {/* ================= HEADER ================= */}

        <header className="max-w-4xl">
          {/* Eyebrow */}

          <div className="flex items-center gap-3">
            <span className="h-px w-9 bg-[#A79CFF]/50" />

            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#A79CFF]">
              Documentation
            </p>
          </div>

          {/* Heading */}

          <h1 className="mt-7 text-[clamp(3rem,5.5vw,6rem)] font-semibold leading-[0.92] tracking-[-0.06em] text-[#F4F3F7]">
            Concepts,
            <br />

            <span className="text-white/30">
              and a live API reference.
            </span>
          </h1>

          {/* Description */}

          <p className="mt-8 max-w-3xl text-[16px] leading-[1.85] text-white/50 sm:text-[17px]">
            The conceptual guides explain the{" "}
            <span className="font-medium text-white/80">why</span>; the API
            reference is generated from the running service&apos;s OpenAPI
            schema, so it can never drift from the real API.
          </p>
        </header>

        {/* ================= DIVIDER ================= */}

        <div className="mt-20 h-px w-full bg-gradient-to-r from-[#A79CFF]/40 via-white/[0.08] to-transparent" />

        {/* ================= DOCUMENTATION CONTENT ================= */}

        <section className="mt-16">
          <DocsContent />
        </section>
      </div>
    </main>
  );
}