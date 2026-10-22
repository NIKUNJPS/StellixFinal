import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";

import { siteFontClasses } from "@/app/fonts";
import { FailureRecordCard, RegimeLegend, RegimeTape } from "@/components/marketing/artifacts";
import { LogoMark } from "@/components/marketing/logo";
import { cn } from "@/lib/utils";

/**
 * Auth screens share the public site's light "paper & ink" theme so signing in
 * feels like the same product as the landing page. Form on the left; a
 * context panel on the right (hidden below lg).
 */

type AsideVariant = "signin" | "signup" | "utility";

const SIGNUP_STEPS = [
  { title: "Request your workspace", body: "Create the organization and its first admin account." },
  { title: "Confirm your email", body: "We send a verification link to the address you use." },
  { title: "Approval & first sign-in", body: "Our team reviews and activates the organization, then you're in." },
];

function Aside({ variant }: { variant: AsideVariant }) {
  return (
    <aside className="relative hidden overflow-hidden border-l border-line bg-paper-sunken lg:flex lg:flex-col">
      <div aria-hidden className="paper-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-[460px] w-[460px] rounded-full bg-brand-soft/70 blur-[110px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-20 h-[360px] w-[460px] rounded-full bg-signal-tint blur-[110px]" />

      <div className="relative flex flex-1 flex-col justify-center px-12 py-16 xl:px-20">
        {variant === "signup" ? (
          <>
            <p className="font-code text-[11px] font-medium uppercase tracking-[0.18em] text-brand">What happens next</p>
            <h2 className="mt-5 max-w-md font-editorial text-[36px] leading-[1.08] tracking-[-0.02em] text-ink">
              Your desk&apos;s memory <em className="text-brand">starts today.</em>
            </h2>
            <ol className="mt-10 max-w-md space-y-6">
              {SIGNUP_STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-brand bg-paper-raised font-code text-[12px] font-semibold text-brand">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-[16px] font-semibold text-ink">{s.title}</span>
                    <span className="mt-0.5 block text-[14.5px] leading-relaxed text-ink-2">{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-12 max-w-md rounded-2xl border border-line bg-paper-raised p-5">
              <p className="text-[13px] font-semibold text-ink">Every plan includes</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">
                Six-regime detection, five-method validation, failure intelligence and Research Memory.
              </p>
              <RegimeTape className="mt-4 h-2" />
            </div>
          </>
        ) : variant === "signin" ? (
          <>
            <p className="font-code text-[11px] font-medium uppercase tracking-[0.18em] text-brand">Welcome back</p>
            <h2 className="mt-5 max-w-md font-editorial text-[36px] leading-[1.08] tracking-[-0.02em] text-ink">
              Pick up exactly <em className="text-brand">where the research left off.</em>
            </h2>
            <div className="mt-10 max-w-[440px]">
              <FailureRecordCard />
            </div>
          </>
        ) : (
          <>
            <p className="font-code text-[11px] font-medium uppercase tracking-[0.18em] text-brand">Stellix Labs</p>
            <h2 className="mt-5 max-w-md font-editorial text-[36px] leading-[1.08] tracking-[-0.02em] text-ink">
              Research that remembers <em className="text-brand">why it failed.</em>
            </h2>
            <p className="mt-6 max-w-md text-[16px] leading-relaxed text-ink-2">
              Every strategy, regime and failure your team records stays private to your organization — and permanent.
            </p>
            <RegimeTape className="mt-10 max-w-md" />
            <RegimeLegend className="mt-5 max-w-md" />
          </>
        )}
      </div>
    </aside>
  );
}

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
  aside = "utility",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  aside?: AsideVariant;
}) {
  return (
    <div className={cn("light-site light-site-root min-h-screen font-ui antialiased", siteFontClasses)}>
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <main className="flex flex-col px-5 py-6 sm:px-10 lg:px-14 xl:px-20">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Stellix Labs home">
              <LogoMark className="h-8 w-8" />
              <span className="text-[17px] font-bold tracking-[-0.02em] text-ink">Stellix Labs</span>
            </Link>
            <Link href="/" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-medium text-ink-2 hover:bg-ink/[0.05] hover:text-ink">
              <ArrowLeft className="h-4 w-4" /> Back to site
            </Link>
          </div>

          <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-12">
            {eyebrow && <p className="font-code text-[11px] font-medium uppercase tracking-[0.18em] text-brand">{eyebrow}</p>}
            <h1 className="mt-4 font-editorial text-[38px] leading-[1.06] tracking-[-0.02em] text-ink [&_em]:text-brand">{title}</h1>
            {description && <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2">{description}</p>}
            <div className="mt-9">{children}</div>
            {footer && <div className="mt-8 border-t border-line pt-6 text-center text-[14.5px] text-ink-2">{footer}</div>}
          </div>

          <p className="text-center text-[12.5px] text-ink-3 lg:text-left">
            © 2026 Stellix Labs ·{" "}
            <Link href="/docs#privacy" className="hover:text-ink">
              Privacy
            </Link>{" "}
            ·{" "}
            <Link href="/security" className="hover:text-ink">
              Security
            </Link>
          </p>
        </main>
        <Aside variant={aside} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form primitives
// ---------------------------------------------------------------------------

export const authInputClass =
  "h-12 rounded-xl border-line-strong bg-paper-raised px-4 text-[15px] text-ink shadow-[0_1px_2px_rgba(14,18,32,0.04)] transition-shadow placeholder:text-ink-3 focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15 focus-visible:ring-offset-0 aria-[invalid=true]:border-loss";

export const authButtonClass =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-6 text-[15px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_10px_24px_-10px_rgba(75,63,209,0.6)] transition-all hover:bg-brand-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50";

export const authSecondaryButtonClass =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line-strong bg-paper-raised px-6 text-[15px] font-semibold text-ink transition-colors hover:border-ink disabled:pointer-events-none disabled:opacity-50";

export const authLinkClass = "font-semibold text-brand underline-offset-4 hover:text-brand-hover hover:underline";

export function AuthField({
  label,
  htmlFor,
  error,
  optional,
  hint,
  action,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  optional?: boolean;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[14px] font-semibold text-ink">
          {label}
          {optional && <span className="ml-1.5 text-[13px] font-normal text-ink-3">(optional)</span>}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <span className="text-[13px] font-medium text-loss" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="text-[13px] text-ink-3">{hint}</span>
      ) : null}
    </div>
  );
}

const ALERT_STYLES = {
  error: { box: "border-loss/25 bg-loss-tint text-loss", icon: XCircle },
  warning: { box: "border-signal/50 bg-signal-tint text-signal-text", icon: TriangleAlert },
  success: { box: "border-gain/25 bg-gain-tint text-gain", icon: CheckCircle2 },
  info: { box: "border-brand/20 bg-brand-tint text-brand", icon: Info },
} as const;

export function AuthAlert({
  tone,
  children,
  className,
}: {
  tone: keyof typeof ALERT_STYLES;
  children: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = ALERT_STYLES[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-[14px] font-medium", box, className)} role={tone === "error" ? "alert" : "status"}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 [&_p]:text-ink-2">{children}</div>
    </div>
  );
}
