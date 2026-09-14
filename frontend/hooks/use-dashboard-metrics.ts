"use client";

import { useEffect, useMemo, useState } from "react";
import { getCurrentRegime } from "@/lib/regime";
import { listStrategies } from "@/lib/strategy";
import { listFailures } from "@/lib/failure";
import { listResearchNotes } from "@/lib/research-note";
import { listEvolutionRuns } from "@/lib/evolution";
import { useAuthStore } from "@/store/auth-store";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";

export interface DashboardMetrics {
  regimeLabel: string;
  regimeSub: string;
  activeStrategiesCount: string;
  avgPerformance: string;
  failureCount: string;
  researchCount: string;
  evolutionCount: string;
  loading: boolean;
}

export function useDashboardMetrics(): DashboardMetrics {
  const { user, organization } = useAuthStore();
  const { subscribe } = useWebSocket();

  const [regimeLabel, setRegimeLabel] = useState<string>("—");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [activeStrategiesCount, setActiveStrategiesCount] = useState<string>("—");
  const [avgPerformance, setAvgPerformance] = useState<string>("—");
  const [failureCount, setFailureCount] = useState<string>("—");
  const [researchCount, setResearchCount] = useState<string>("—");
  const [evolutionCount, setEvolutionCount] = useState<string>("—");
  const [loading, setLoading] = useState<boolean>(true);

  const symbol = useMemo(
    () =>
      user?.preferences?.default_regime_filter ||
      organization?.benchmark_symbol ||
      "SPY",
    [user, organization],
  );

  useEffect(() => {
    if (!user || !organization) return;
    let active = true;

    (async () => {
      try {
        const [
          regime,
          strategyList,
          failures,
          research,
          evolutionRuns,
        ] = await Promise.all([
          getCurrentRegime(symbol).catch(() => null),
          listStrategies().catch(() => ({ items: [], total: 0 })),
          listFailures().catch(() => ({ items: [], total: 0 })),
          listResearchNotes({ limit: 1 }).catch(() => ({ items: [], total: 0 })),
          listEvolutionRuns().catch(() => ({ items: [], total: 0 })),
        ]);

        if (!active) return;

        if (regime) {
          setRegimeLabel(regime.regime_label);
          setConfidence(regime.confidence_score);
        }

        const activeStrats = strategyList.items.filter((s) => s.status === "active");
        setActiveStrategiesCount(String(activeStrats.length));

        const stratsWithRob = activeStrats.filter((s) => s.robustness_score !== null);
        if (stratsWithRob.length > 0) {
          const mean =
            stratsWithRob.reduce((sum, s) => sum + (s.robustness_score ?? 0), 0) /
            stratsWithRob.length;
          setAvgPerformance(mean.toFixed(2));
        } else {
          setAvgPerformance("—");
        }

        setFailureCount(String(failures.total));
        setResearchCount(String(research.total));
        setEvolutionCount(String(evolutionRuns.total));
        setLoading(false);
      } catch {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user, organization, symbol]);

  useEffect(() => {
    const unsubRegime = subscribe("regime_update", (event: WSEvent) => {
      if (String(event.symbol) !== symbol) return;
      if (event.new_regime) setRegimeLabel(String(event.new_regime));
      if (typeof event.confidence === "number") setConfidence(event.confidence);
    });

    const unsubFailure = subscribe("failure_alert", () => {
      setFailureCount((prev) => {
        const num = parseInt(prev, 10);
        return isNaN(num) ? "1" : String(num + 1);
      });
    });

    return () => {
      unsubRegime();
      unsubFailure();
    };
  }, [subscribe, symbol]);

  const regimeSub =
    regimeLabel !== "—"
      ? `${symbol} • ${confidence !== null ? `${(confidence * 100).toFixed(0)}% conf` : "live"}`
      : symbol;

  return {
    regimeLabel,
    regimeSub,
    activeStrategiesCount,
    avgPerformance,
    failureCount,
    researchCount,
    evolutionCount,
    loading,
  };
}
