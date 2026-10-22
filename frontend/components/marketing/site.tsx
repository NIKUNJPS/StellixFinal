import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Public-site primitives for the light "paper & ink" theme. Every marketing
 * page and the auth screens compose from these so spacing, type scale and
 * colour pairings stay identical everywhere. Colours come from the `paper`,
 * `ink`, `line`, `brand` and `signal` Tailwind palettes (tailwind.config.ts).
 */

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1240px] px-5 sm:px-8", className)}>{children}</div>;
}

export function Eyebrow({
  children,
  className,
  tone = "brand",
}: {
  children: ReactNode;
  className?: string;
  tone?: "brand" | "ink" | "light";
}) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2.5 font-code text-[11px] font-medium uppercase tracking-[0.18em]",
        tone === "brand" && "text-brand",
        tone === "ink" && "text-ink-3",
        tone === "light" && "text-brand-bright",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "light" ? "bg-signal" : "bg-brand",
        )}
      />
      {children}
    </p>
  );
}

/** Manrope headline. Use <em> inside for the gradient brand accent (see `.light-site em` in globals.css). */
export function Display({
  children,
  as: Tag = "h2",
  size = "lg",
  className,
}: {
  children: ReactNode;
  as?: "h1" | "h2" | "h3";
  size?: "xl" | "lg" | "md";
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        "font-editorial text-balance text-ink",
        size === "xl" && "text-[clamp(2.6rem,5.4vw,4.6rem)] font-bold leading-[1.02] tracking-[-0.045em]",
        size === "lg" && "text-[clamp(2rem,3.6vw,3rem)] font-bold leading-[1.08] tracking-[-0.035em]",
        size === "md" && "text-[clamp(1.6rem,2.5vw,2.1rem)] font-semibold leading-[1.15] tracking-[-0.025em]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Lede({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-pretty text-[17px] leading-[1.7] text-ink-2 sm:text-lg", className)}>{children}</p>;
}

export function SectionHeader({
  eyebrow,
  title,
  intro,
  align = "left",
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Display className="mt-5">{title}</Display>
      {intro && <Lede className={cn("mt-5", align === "center" && "mx-auto")}>{intro}</Lede>}
    </div>
  );
}

export function Section({
  children,
  id,
  className,
  tone = "paper",
}: {
  children: ReactNode;
  id?: string;
  className?: string;
  tone?: "paper" | "raised" | "sunken" | "ink";
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative scroll-mt-24 py-20 sm:py-28",
        tone === "paper" && "bg-paper",
        tone === "raised" && "border-y border-line bg-paper-raised",
        tone === "sunken" && "bg-paper-sunken",
        tone === "ink" && "bg-ink-night text-white",
        className,
      )}
    >
      <Container>{children}</Container>
    </section>
  );
}

const BUTTON_BASE =
  "group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-ui font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50";

const BUTTON_VARIANTS = {
  primary:
    "bg-brand text-white shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_24px_-8px_rgba(75,63,209,0.55)] hover:bg-brand-hover hover:shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_12px_28px_-8px_rgba(75,63,209,0.6)]",
  secondary: "border border-line-strong bg-paper-raised text-ink hover:border-ink hover:bg-white",
  ghost: "text-ink-2 hover:bg-ink/[0.05] hover:text-ink",
  ink: "bg-ink text-white hover:bg-ink-panel",
  light: "bg-white text-ink hover:bg-brand-tint",
  outlineLight: "border border-white/25 text-white hover:border-white/60 hover:bg-white/[0.06]",
} as const;

const BUTTON_SIZES = {
  sm: "h-9 px-4 text-[13px]",
  md: "h-11 px-5 text-[14px]",
  lg: "h-[52px] px-7 text-[15px]",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

export function buttonClass(variant: ButtonVariant = "primary", size: keyof typeof BUTTON_SIZES = "md", className?: string) {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  arrow = false,
  className,
  ...rest
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZES;
  arrow?: boolean;
  className?: string;
} & Omit<ComponentProps<typeof Link>, "href" | "className">) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
      {arrow && <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />}
    </Link>
  );
}

export function TextLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-1.5 font-semibold text-brand underline-offset-4 hover:text-brand-hover hover:underline",
        className,
      )}
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

export function Card({
  children,
  className,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-paper-raised p-6 shadow-[0_1px_2px_rgba(14,18,32,0.04)] sm:p-7",
        interactive &&
          "transition-all duration-300 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-[0_18px_40px_-20px_rgba(14,18,32,0.25)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Small mono tag, e.g. `FAILED_IN` or `append-only`. */
export function Tag({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "signal" | "loss" | "gain" | "dark";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-code text-[11px] font-medium leading-5",
        tone === "neutral" && "border-line bg-paper-sunken text-ink-2",
        tone === "brand" && "border-brand/20 bg-brand-tint text-brand",
        tone === "signal" && "border-signal/40 bg-signal-tint text-signal-text",
        tone === "loss" && "border-loss/20 bg-loss-tint text-loss",
        tone === "gain" && "border-gain/20 bg-gain-tint text-gain",
        tone === "dark" && "border-white/10 bg-white/[0.06] text-white/80",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Consistent hero for every inner page. */
export function PageHero({
  eyebrow,
  title,
  intro,
  children,
  aside,
}: {
  eyebrow: string;
  title: ReactNode;
  intro: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-paper">
      <div aria-hidden className="paper-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-brand-soft/50 blur-[120px]"
      />
      <Container className="relative pb-16 pt-16 sm:pb-24 sm:pt-24">
        <div className={cn(aside && "grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]")}>
          <div className="max-w-3xl">
            <Eyebrow>{eyebrow}</Eyebrow>
            <Display as="h1" size="xl" className="mt-6">
              {title}
            </Display>
            <Lede className="mt-7 max-w-2xl">{intro}</Lede>
            {children && <div className="mt-9 flex flex-wrap items-center gap-3">{children}</div>}
          </div>
          {aside}
        </div>
      </Container>
    </section>
  );
}

/** Closing call-to-action band shared by every page. */
export function CtaBand({
  title = (
    <>
      See what your firm already knows — <em>and has been forgetting.</em>
    </>
  ),
  intro = "A 30-minute walkthrough on one of your own failed strategies. We show you what Stellix would have recorded, and what your team would have learned from it.",
}: {
  title?: ReactNode;
  intro?: ReactNode;
}) {
  return (
    <section className="bg-paper px-3 pb-3 sm:px-5 sm:pb-5">
      <div className="relative overflow-hidden rounded-[28px] bg-ink-night px-6 py-20 text-center sm:px-10 sm:py-24">
        <div aria-hidden className="ink-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_70%)]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 left-1/2 h-[380px] w-[760px] -translate-x-1/2 rounded-full bg-brand/40 blur-[120px]" />
        <div className="relative mx-auto max-w-3xl">
          <Eyebrow tone="light" className="justify-center">
            Request a walkthrough
          </Eyebrow>
          <h2 className="mt-6 font-editorial text-[clamp(2rem,4.2vw,3.25rem)] font-normal leading-[1.03] tracking-[-0.02em] text-white text-balance [&_em]:text-brand-bright">
            {title}
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-white/75">{intro}</p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/contact" variant="light" size="lg" arrow>
              Request a demo
            </ButtonLink>
            <ButtonLink href="/register" variant="outlineLight" size="lg">
              Create a workspace
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
