"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";

/**
 * Global realtime alert surface (Batch 19). Mounted once inside the authenticated
 * shell; renders nothing, only side-effects (toasts). Uses sonner — the shadcn/ui
 * toast primitive this stack already follows — not react-hot-toast (the sketch's
 * choice, which isn't installed and would have added a second design language).
 */
export function RealtimeAlerts() {
  const { subscribe } = useWebSocket();
  const router = useRouter();

  useEffect(() => {
    const num = (v: unknown, fallback = 0): number =>
      typeof v === "number" ? v : fallback;
    const str = (v: unknown): string => (typeof v === "string" ? v : "");

    const unsubRegime = subscribe("regime_update", (event: WSEvent) => {
      const symbol = str(event.symbol);
      const newRegime = str(event.new_regime);
      if (event.severity === "critical") {
        toast.error(
          `🚨 ${symbol}: Regime → ${newRegime} (${Math.round(num(event.confidence) * 100)}% confident)`,
          { duration: 10000, action: { label: "View", onClick: () => router.push("/admin/regimes") } },
        );
      } else if (event.severity === "warning") {
        toast(`🌊 ${symbol}: ${str(event.old_regime)} → ${newRegime}`, {
          duration: 6000,
          action: { label: "View", onClick: () => router.push("/admin/regimes") },
        });
      }
    });

    const unsubFailure = subscribe("failure_alert", (event: WSEvent) => {
      toast.error(`💥 Strategy failed: ${str(event.strategy_name)} — ${str(event.trigger)}`, {
        duration: 12000,
        action: { label: "View", onClick: () => router.push("/admin/failures") },
      });
    });

    const unsubApproval = subscribe("approval_request", (event: WSEvent) => {
      toast(`📋 Ready for review: ${str(event.strategy_name)} (score ${num(event.robustness_score)})`, {
        duration: 15000,
        action: { label: "Review", onClick: () => router.push("/admin/strategies") },
      });
    });

    const unsubStatus = subscribe("strategy_status", (event: WSEvent) => {
      toast(`🔁 ${str(event.strategy_name)}: ${str(event.old_status)} → ${str(event.new_status)}`, {
        duration: 8000,
        action: { label: "View", onClick: () => router.push("/admin/strategies") },
      });
    });

    const unsubEvolution = subscribe("evolution_progress", (event: WSEvent) => {
      // Only the completion is a toast; intermediate generations drive progress UI
      // elsewhere, and toasting each one would be noise.
      if (num(event.pct_complete) === 100) {
        toast.success(`🧬 Evolution complete — best fitness ${num(event.best_fitness)}`, {
          duration: 8000,
        });
      }
    });

    return () => {
      unsubRegime();
      unsubFailure();
      unsubApproval();
      unsubStatus();
      unsubEvolution();
    };
  }, [subscribe, router]);

  return null;
}
