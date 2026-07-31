"use client";

import { RotateCcw } from "lucide-react";

import { useReveal } from "@/hooks/use-reveal";
import { WORKFLOW_STEPS } from "@/lib/marketing/content";
import { cn } from "@/lib/utils";

/**
 * The compounding research loop — Data → Regime → Strategy → Validation → Memory
 * → Evolution (Batch 15). Connector lines "flow" once the section scrolls into
 * view (useReveal adds `flow-active`); each stage card fades/rises in sequence.
 */
export function WorkflowDiagram() {
  const { ref, visible } = useReveal<HTMLDivElement>({ threshold: 0.25 });

  return (
    <div ref={ref} className={cn("relative", visible && "flow-active")}>
      {/* Desktop: horizontal flow */}
      <div className="hidden lg:block">
        <div className="relative flex items-stretch">
          {WORKFLOW_STEPS.map((step, i) => (
            <div key={step.name} className="relative flex-1">
              {i < WORKFLOW_STEPS.length - 1 && (
                <svg
                  className="absolute right-0 top-7 h-4 w-full translate-x-1/2"
                  viewBox="0 0 100 8"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <line
                    className="flow-line"
                    x1="0"
                    y1="4"
                    x2="100"
                    y2="4"
                    stroke="#0066FF"
                    strokeWidth="1.5"
                    strokeDasharray="4 6"
                    strokeLinecap="round"
                    opacity={0.7}
                  />
                </svg>
              )}
              <div
                className={cn(
                  "reveal flex flex-col items-center px-3 text-center",
                  visible && "is-visible",
                )}
                style={{ transitionDelay: `${i * 90}ms` }}
              >
                <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-accent/40 bg-background text-lg font-semibold text-accent">
                  {i + 1}
                </div>
                <p className="mt-4 font-display text-base font-semibold">{step.name}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex items-center justify-center gap-2 text-sm text-accent">
          <RotateCcw className="h-4 w-4" />
          <span>Each turn of the loop is seeded by the memory of the last — including every failure.</span>
        </div>
      </div>

      {/* Mobile: vertical flow */}
      <div className="space-y-0 lg:hidden">
        {WORKFLOW_STEPS.map((step, i) => (
          <div key={step.name} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-background text-sm font-semibold text-accent">
                {i + 1}
              </div>
              {i < WORKFLOW_STEPS.length - 1 && <div className="w-px flex-1 bg-accent/30" />}
            </div>
            <div className={cn("reveal pb-8", visible && "is-visible")} style={{ transitionDelay: `${i * 60}ms` }}>
              <p className="font-display text-base font-semibold">{step.name}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
