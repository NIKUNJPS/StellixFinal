"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Dna,
  FlaskConical,
  NotebookText,
  TrendingUp,
} from "lucide-react";

import { useDashboardMetrics } from "@/hooks/use-dashboard-metrics";
import { cn } from "@/lib/utils";

export function SidebarCarousel() {
  const metrics = useDashboardMetrics();
  const [currentIndex, setCurrentIndex] = useState(0);

  const cards = [
    {
      id: "regime",
      label: "Current Market Regime",
      value: metrics.regimeLabel,
      sub: metrics.regimeSub,
      icon: Activity,
      accentColor: "#38BDF8",
      iconBg: "rgba(56, 189, 248, 0.12)",
      borderGlow: "rgba(56, 189, 248, 0.25)",
    },
    {
      id: "strategies",
      label: "Active Strategies",
      value: metrics.activeStrategiesCount,
      sub: "live research threads",
      icon: FlaskConical,
      accentColor: "#8E88C7",
      iconBg: "rgba(142, 136, 199, 0.12)",
      borderGlow: "rgba(142, 136, 199, 0.25)",
    },
    {
      id: "performance",
      label: "Avg Performance",
      value: metrics.avgPerformance,
      sub: "mean robustness score",
      icon: TrendingUp,
      accentColor: "#8E88C7",
      iconBg: "rgba(142, 136, 199, 0.12)",
      borderGlow: "rgba(142, 136, 199, 0.25)",
    },
    {
      id: "failures",
      label: "Failure Alerts",
      value: metrics.failureCount,
      sub: "logged constraint breaches",
      icon: AlertTriangle,
      accentColor: "#F87171",
      iconBg: "rgba(248, 113, 113, 0.12)",
      borderGlow: "rgba(248, 113, 113, 0.25)",
    },
    {
      id: "research",
      label: "Research Activity",
      value: metrics.researchCount,
      sub: "active quant logs",
      icon: NotebookText,
      accentColor: "#8E88C7",
      iconBg: "rgba(142, 136, 199, 0.12)",
      borderGlow: "rgba(142, 136, 199, 0.25)",
    },
    {
      id: "evolution",
      label: "Evolution Updates",
      value: metrics.evolutionCount,
      sub: "genetic optimizer runs",
      icon: Dna,
      accentColor: "#8E88C7",
      iconBg: "rgba(142, 136, 199, 0.12)",
      borderGlow: "rgba(142, 136, 199, 0.25)",
    },
  ];

  const currentCard = cards[currentIndex] ?? cards[0]!;
  const Icon = currentCard.icon;

  const handlePrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % cards.length);
  };

  return (
    <div
      data-testid="sidebar-carousel"
      className="group relative mx-2.5 my-3 flex flex-col justify-between overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/80 p-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.4)] backdrop-blur-xl transition-all duration-300 hover:border-white/[0.16]"
      style={{
        boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.08)",
      }}
    >
      {/* Ambient background glow matching current card accent */}
      <div
        className="pointer-events-none absolute -top-12 left-1/2 h-20 w-3/4 -translate-x-1/2 rounded-full opacity-20 blur-xl transition-all duration-500 group-hover:opacity-35"
        style={{ backgroundColor: currentCard.accentColor }}
      />

      {/* Card Content with Smooth Transition */}
      <div className="relative z-10 min-h-[96px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentCard.id}
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex flex-col justify-between h-full space-y-2.5"
          >
            {/* Top row: Label + Right controls (Icon + Prev/Next arrows) */}
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#808495] truncate max-w-[95px]">
                {currentCard.label}
              </span>

              <div className="flex items-center gap-1 shrink-0">
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-lg transition-transform duration-200 mr-0.5"
                  style={{
                    backgroundColor: currentCard.iconBg,
                    color: currentCard.accentColor,
                    border: `1px solid ${currentCard.borderGlow}`,
                  }}
                >
                  <Icon className="h-3 w-3" />
                </div>

                <button
                  type="button"
                  onClick={handlePrev}
                  aria-label="Previous summary card"
                  className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-[#9A9DA8] transition-all duration-150 hover:border-white/[0.18] hover:bg-white/[0.12] hover:text-[#F5F5F7] active:scale-95"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleNext}
                  aria-label="Next summary card"
                  className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-[#9A9DA8] transition-all duration-150 hover:border-white/[0.18] hover:bg-white/[0.12] hover:text-[#F5F5F7] active:scale-95"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Bottom row: Main metric value + subtext (Increased font sizes by +1) */}
            <div>
              <p
                className={cn(
                  "truncate font-bold tracking-tight text-[#F5F5F7]",
                  currentCard.value.length > 10 ? "text-xl" : "text-2xl",
                )}
              >
                {currentCard.value}
              </p>

              {currentCard.sub && (
                <p className="mt-0.5 truncate text-[11.5px] font-medium text-[#9A9DA8]">
                  {currentCard.sub}
                </p>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dots Indicator Bar */}
      <div className="relative z-10 mt-2.5 flex items-center justify-center gap-1.5 pt-1 border-t border-white/[0.05]">
        {cards.map((card, idx) => {
          const isActive = idx === currentIndex;
          return (
            <button
              key={card.id}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrentIndex(idx);
              }}
              aria-label={`Go to ${card.label}`}
              className={cn(
                "h-1 rounded-full transition-all duration-300",
                isActive
                  ? "w-4 bg-[#8E88C7] shadow-[0_0_8px_rgba(142,136,199,0.8)]"
                  : "w-1.5 bg-white/20 hover:bg-white/40",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
