import type { Metadata } from "next";

import { DemoForm } from "@/components/marketing/demo-form";
import { Eyebrow } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Request a Demo",
  description: "See Stellix Labs on your own research questions. A 30-minute walkthrough, not a generic slide deck.",
};

export default function ContactPage() {
  return (
    <div className="container py-20 lg:py-24">
      <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Eyebrow>Request a Demo</Eyebrow>
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-[2.75rem]">
            Bring your hardest research question. We&apos;ll answer it live.
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground">
            Tell us a strategy that failed and you never fully understood. We&apos;ll show you what the platform
            would have recorded — the regime, the trigger, the responsible features — and how your team would never
            hit it blind again.
          </p>
          <p className="mt-8 text-sm text-muted-foreground">
            Not ready for a demo? Email us at{" "}
            <a href="mailto:hello@stellixlabs.com" className="text-accent hover:underline">
              hello@stellixlabs.com
            </a>
            .
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card/30 p-6 sm:p-8">
          <DemoForm />
        </div>
      </div>
    </div>
  );
}
