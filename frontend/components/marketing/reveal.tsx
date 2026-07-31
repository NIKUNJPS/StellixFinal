"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ElementType, ReactNode } from "react";

import { EASE_ENTRANCE } from "@/components/marketing/motion";
import { useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

/**
 * Reveal-on-scroll (Batch 15 API, redesign internals). Same signature the
 * existing pages already use — `delay` in ms — now tweened by framer-motion but
 * *triggered* by the project's own IntersectionObserver hook (framer's
 * whileInView never fires in the embedded preview browser; see motion.tsx).
 * Renders static under prefers-reduced-motion.
 */

// Map of allowed tags → motion components, built once at module scope.
const MOTION_TAGS = {
  div: motion.div,
  li: motion.li,
  section: motion.section,
  article: motion.article,
  span: motion.span,
} as const;

type MotionTag = keyof typeof MOTION_TAGS;

const HIDDEN = { opacity: 0, y: 24 } as const;
const VISIBLE = { opacity: 1, y: 0 } as const;

export function Reveal({
  children,
  as = "div",
  className,
  delay = 0,
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** milliseconds (legacy Batch 15 unit, kept for call-site compatibility) */
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const { ref, visible } = useReveal<HTMLElement>({ threshold: 0.2 });
  const tag: MotionTag = typeof as === "string" && as in MOTION_TAGS ? (as as MotionTag) : "div";
  const MotionComponent = MOTION_TAGS[tag];

  if (reduced) {
    const StaticTag = tag as ElementType;
    return <StaticTag className={cn(className)}>{children}</StaticTag>;
  }

  return (
    <MotionComponent
      ref={ref as React.Ref<never>}
      className={cn(className)}
      initial={HIDDEN}
      animate={visible ? VISIBLE : HIDDEN}
      transition={{ duration: 0.5, delay: delay / 1000, ease: EASE_ENTRANCE }}
    >
      {children}
    </MotionComponent>
  );
}
