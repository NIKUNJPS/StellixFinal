"use client";

/**
 * Cold Precision animation system (landing redesign).
 *
 * Reusable framer-motion primitives shared by every public page:
 *   <RevealOnScroll>  fade + 24px directional slide (or scale) on first view
 *   <StaggerChildren> stagger a list's <StaggerItem>s by 0.08s
 *   <CountUp>         animate a number 0 → target on first view
 *   <DrawingLine>     SVG line that draws itself via pathLength
 *
 * Viewport detection deliberately uses the project's own IntersectionObserver
 * hook (hooks/use-reveal) to flip framer's `animate` prop, NOT framer's
 * whileInView/useInView — those never fired in the embedded preview browser
 * (verified live: elements sat at opacity 0 while fully visible), while the raw
 * IO hook has been proven in this environment since Batch 15. framer still owns
 * every tween (easing, stagger, pathLength); IO only supplies the trigger.
 *
 * Rules (enforced here so pages can't drift): entrances use the [0.16, 1, 0.3, 1]
 * spring, 0.5s standard / 0.7s large, triggered once, and every primitive
 * short-circuits to a static render under prefers-reduced-motion.
 * Variants live at module level — never recreated inside a render.
 */

import { animate, motion, useReducedMotion, type Variants } from "framer-motion";
import { useEffect, useState } from "react";

import { useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

export const EASE_ENTRANCE = [0.16, 1, 0.3, 1] as const;

type Direction = "up" | "left" | "right" | "scale";

// One variant set per entrance direction, built once at module scope.
const REVEAL_VARIANTS: Record<Direction, Variants> = {
  up: { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } },
  left: { hidden: { opacity: 0, x: -24 }, visible: { opacity: 1, x: 0 } },
  right: { hidden: { opacity: 0, x: 24 }, visible: { opacity: 1, x: 0 } },
  scale: { hidden: { opacity: 0, scale: 0.97 }, visible: { opacity: 1, scale: 1 } },
};

export function RevealOnScroll({
  children,
  className,
  delay = 0,
  duration = 0.5,
  direction = "up",
}: {
  children: React.ReactNode;
  className?: string;
  /** seconds */
  delay?: number;
  duration?: number;
  direction?: Direction;
}) {
  const reduced = useReducedMotion();
  const { ref, visible } = useReveal<HTMLDivElement>({ threshold: 0.2 });
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      ref={ref}
      className={className}
      variants={REVEAL_VARIANTS[direction]}
      initial="hidden"
      animate={visible ? "visible" : "hidden"}
      transition={{ duration, delay, ease: EASE_ENTRANCE }}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// StaggerChildren / StaggerItem
// ---------------------------------------------------------------------------
const STAGGER_ITEM: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_ENTRANCE } },
};

export function StaggerChildren({
  children,
  className,
  stagger = 0.08,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  /** seconds between items (0.08 lists · 0.12 cards) */
  stagger?: number;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const { ref, visible } = useReveal<HTMLDivElement>({ threshold: 0.15 });
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={visible ? "visible" : "hidden"}
      transition={{ staggerChildren: stagger, delayChildren: delay }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={STAGGER_ITEM}>
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// CountUp — hero proof stats
// ---------------------------------------------------------------------------
export function CountUp({
  to,
  className,
  duration = 1.2,
}: {
  to: number;
  className?: string;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  const { ref, visible } = useReveal<HTMLSpanElement>({ threshold: 0.5 });
  const [value, setValue] = useState(reduced ? to : 0);

  useEffect(() => {
    if (!visible) return;
    if (reduced) {
      setValue(to);
      return;
    }
    const controls = animate(0, to, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [visible, reduced, to, duration]);

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DrawingLine — self-drawing SVG connector (workflow section)
// ---------------------------------------------------------------------------
export function DrawingLine({
  className,
  delay = 0,
  duration = 0.7,
  vertical = false,
}: {
  className?: string;
  delay?: number;
  duration?: number;
  vertical?: boolean;
}) {
  const reduced = useReducedMotion();
  const { ref, visible } = useReveal<HTMLSpanElement>({ threshold: 0.4 });
  const d = vertical ? "M 1 0 L 1 100" : "M 0 1 L 100 1";
  const viewBox = vertical ? "0 0 2 100" : "0 0 100 2";
  return (
    <span ref={ref} className={cn("block", vertical ? "h-full w-0.5" : "h-0.5 w-full", className)}>
      <svg viewBox={viewBox} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
        {reduced ? (
          <path d={d} stroke="currentColor" strokeWidth={2} fill="none" />
        ) : (
          <motion.path
            d={d}
            stroke="currentColor"
            strokeWidth={2}
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: visible ? 1 : 0 }}
            transition={{ duration, delay, ease: "easeOut" }}
          />
        )}
      </svg>
    </span>
  );
}
