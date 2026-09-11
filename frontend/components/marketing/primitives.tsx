import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ---------- Reveal ---------- */

export function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
  once = true,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduced ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-12% 0px -12% 0px" }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ---------- Section scaffolding ---------- */

export function SectionLabel({ children, tone = "muted" }: { children: ReactNode; tone?: Tone }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn("h-px w-8", toneBg[tone])} />
      <span className="label-mono">{children}</span>
    </div>
  );
}

export function Section({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("relative w-full", className)}>
      {children}
    </section>
  );
}

/* ---------- Semantic state tokens ---------- */

export type Tone = "active" | "candidate" | "failed" | "memory" | "signal" | "muted";

export const toneText: Record<Tone, string> = {
  active: "text-active",
  candidate: "text-candidate",
  failed: "text-failed",
  memory: "text-memory",
  signal: "text-signal",
  muted: "text-muted-foreground",
};

export const toneBg: Record<Tone, string> = {
  active: "bg-active",
  candidate: "bg-candidate",
  failed: "bg-failed",
  memory: "bg-memory",
  signal: "bg-signal",
  muted: "bg-border",
};

export const toneVar: Record<Tone, string> = {
  active: "var(--state-active)",
  candidate: "var(--state-candidate)",
  failed: "var(--state-failed)",
  memory: "var(--state-memory)",
  signal: "var(--state-signal)",
  muted: "var(--muted-foreground)",
};

export function StatePill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-2 border px-2 py-[3px] font-mono text-[10px] tracking-[0.16em] uppercase"
      style={{
        color: toneVar[tone],
        borderColor: `color-mix(in oklab, ${toneVar[tone]} 40%, transparent)`,
        background: `color-mix(in oklab, ${toneVar[tone]} 10%, transparent)`,
      }}
    >
      <span className="h-1 w-1 rounded-full" style={{ background: toneVar[tone] }} />
      {children}
    </span>
  );
}

/* ---------- Animated number ---------- */

export function Counter({
  value,
  decimals = 0,
  className,
  prefix = "",
  suffix = "",
}: {
  value: number;
  decimals?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || started) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    if (reduced) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
      onComplete: () => setDisplay(value),
    });
    return () => controls.stop();
  }, [started, value, reduced]);


  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/* ---------- Buttons ---------- */

export function PrimaryButton({
  children,
  className,
  href = "#demo",
}: {
  children: ReactNode;
  className?: string;
  href?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "group relative inline-flex items-center gap-3 overflow-hidden border border-foreground/80 bg-foreground px-6 py-3 font-mono text-[11px] tracking-[0.18em] text-background uppercase transition-colors hover:bg-transparent hover:text-foreground",
        className,
      )}
    >
      {children}
    </a>
  );
}

export function GhostButton({
  children,
  className,
  href = "#terminal",
}: {
  children: ReactNode;
  className?: string;
  href?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex items-center gap-2 border border-border px-6 py-3 font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase transition-colors hover:border-foreground/40 hover:text-foreground",
        className,
      )}
    >
      {children}
    </a>
  );
}

/* ---------- Hooks ---------- */

export function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => setH(true), []);
  return h;
}

export function useTicker(active = true, fps = 30) {
  const [t, setT] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!active || reduced) return;
    const id = window.setInterval(() => setT((v) => v + 1), 1000 / fps);
    return () => window.clearInterval(id);
  }, [active, fps, reduced]);
  return t;
}
