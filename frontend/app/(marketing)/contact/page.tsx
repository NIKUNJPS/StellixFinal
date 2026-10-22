import type { Metadata } from "next";
import { CalendarClock, MessageSquareText, Microscope } from "lucide-react";

import { FailureRecordCard } from "@/components/marketing/artifacts";
import { DemoForm } from "@/components/marketing/demo-form";
import { Container, Display, Eyebrow, Lede } from "@/components/marketing/site";

export const metadata: Metadata = {
  title: "Request a demo",
  description:
    "Bring one strategy that failed. In 30 minutes we show you what Stellix Labs would have recorded — the regime, the trigger, the responsible features — on your own research.",
};

const STEPS = [
  { icon: MessageSquareText, title: "Tell us what broke", body: "A strategy, a regime, a hunch you never confirmed. A few lines is enough." },
  { icon: CalendarClock, title: "We reply within a business day", body: "A real person from the team schedules a 30-minute walkthrough." },
  { icon: Microscope, title: "We run the autopsy live", body: "Regime split, validation breakdown, failure record — on your question." },
];

export default function ContactPage() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="paper-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_left,black_15%,transparent_60%)]" />
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 h-[480px] w-[720px] rounded-full bg-brand-soft/50 blur-[120px]" />
      <Container className="relative grid gap-14 py-16 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Eyebrow>Request a demo</Eyebrow>
          <Display as="h1" size="lg" className="mt-6">
            Bring your hardest research question. <em>We&apos;ll answer it live.</em>
          </Display>
          <Lede className="mt-6">
            Tell us about a strategy that failed and you never fully understood. We&apos;ll show you what the platform would have
            recorded — and how your team would never hit it blind again.
          </Lede>

          <ol className="mt-10 space-y-5">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.title} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-paper-raised text-brand">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span>
                    <span className="block text-[15.5px] font-semibold text-ink">
                      <span className="mr-2 font-code text-[12px] text-ink-3">0{i + 1}</span>
                      {s.title}
                    </span>
                    <span className="mt-0.5 block text-[14.5px] leading-relaxed text-ink-2">{s.body}</span>
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="mt-12 hidden lg:block">
            <FailureRecordCard className="max-w-[440px] origin-top-left scale-[0.92]" />
          </div>

          <p className="mt-10 text-[14.5px] text-ink-2 lg:mt-0">
            Prefer email?{" "}
            <a href="mailto:hello@stellixlabs.com" className="font-semibold text-brand underline-offset-4 hover:underline">
              hello@stellixlabs.com
            </a>
          </p>
        </div>

        <div className="rounded-3xl border border-line bg-paper-raised p-6 shadow-[0_30px_70px_-40px_rgba(14,18,32,0.35)] sm:p-10">
          <h2 className="text-[24px] font-semibold tracking-[-0.015em] text-ink">Tell us about your research</h2>
          <p className="mt-2 text-[15px] text-ink-2">Context makes the walkthrough relevant to your team. Fields marked optional can be skipped.</p>
          <div className="mt-8 border-t border-line pt-8">
            <DemoForm />
          </div>
        </div>
      </Container>
    </section>
  );
}
