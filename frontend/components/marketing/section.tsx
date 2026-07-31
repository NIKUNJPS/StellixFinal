import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Shared section scaffolding for the public site (Batch 15). */

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-accent",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function SectionHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    // Instrument Serif ships only weight 400 — font-normal avoids faux-bold.
    <h2
      className={cn(
        "font-display text-3xl font-normal leading-tight tracking-tight text-balance sm:text-4xl lg:text-[2.75rem]",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function SectionIntro({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground", className)}>
      {children}
    </p>
  );
}

export function Section({
  children,
  className,
  containerClassName,
  id,
}: {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("border-t border-border/60 py-20 sm:py-28", className)}>
      <div className={cn("container", containerClassName)}>{children}</div>
    </section>
  );
}
