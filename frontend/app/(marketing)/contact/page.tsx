import type { Metadata } from "next";

import { DemoForm } from "@/components/marketing/demo-form";
import { Eyebrow } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Request a Demo",
  description:
    "See Stellix Labs on your own research questions. A 30-minute walkthrough, not a generic slide deck.",
};

export default function ContactPage() {
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

        <div className="absolute -left-[20%] top-[10%] h-[600px] w-[600px] rounded-full bg-[#522A6F]/20 blur-[180px]" />

        <div className="absolute -right-[15%] bottom-[5%] h-[500px] w-[500px] rounded-full bg-[#8B7CFF]/10 blur-[180px]" />
      </div>

      <div className="container relative py-20 lg:py-28">
        {/* Top accent */}
        <div className="mb-14 h-px w-full bg-gradient-to-r from-transparent via-[#8B7CFF]/40 to-transparent" />

        <div className="grid gap-16 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24">
          {/* Left Content */}
          <div className="lg:sticky lg:top-32 lg:self-start">
            <Eyebrow>Request a Demo</Eyebrow>

            <h1 className="mt-5 max-w-xl font-sans text-[clamp(2.5rem,4vw,4.5rem)] font-semibold leading-[1.08] tracking-[-0.045em] text-white">
              Bring your hardest research question. We&apos;ll answer it live.
            </h1>

            <p className="mt-7 max-w-xl text-[17px] leading-[1.8] text-white/65 sm:text-[18px]">
              Tell us a strategy that failed and you never fully understood.
              We&apos;ll show you what the platform would have recorded — the
              regime, the trigger, the responsible features — and how your team
              would never hit it blind again.
            </p>

            <div className="mt-10 border-l border-[#8B7CFF]/40 pl-6">
              <p className="text-[14px] leading-relaxed text-white/50">
                Not ready for a demo?
              </p>

              <a
                href="mailto:hello@stellixlabs.com"
                className="mt-2 inline-flex text-[15px] font-medium text-[#FBCF4F] transition-colors hover:text-white"
              >
                hello@stellixlabs.com
              </a>
            </div>
          </div>

          {/* Right Form */}
          <div className="relative">
            {/* Form heading */}
            <div className="mb-8">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-[#FBCF4F]" />

                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FBCF4F]">
                  Start the conversation
                </span>
              </div>

              <h2 className="mt-4 text-[28px] font-semibold tracking-[-0.035em] text-white sm:text-[32px]">
                Tell us about your research.
              </h2>

              <p className="mt-3 text-[16px] leading-relaxed text-white/60">
                Give us some context and we&apos;ll make the walkthrough relevant
                to your team.
              </p>
            </div>

            {/* Form container — not a floating white card */}
            <div className="border-t border-white/[0.12] pt-8">
              <DemoForm />
            </div>
          </div>
        </div>

        {/* Bottom line */}
        <div className="mt-20 h-px w-full bg-gradient-to-r from-transparent via-white/[0.12] to-transparent" />
      </div>
    </main>
  );
}