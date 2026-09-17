"use client";

import { useMemo } from "react";

import {
  useBenchmarkSymbol,
  useCurrentRegimeQuery,
  useEvolutionCountQuery,
  useFailureCountQuery,
  usePlatformRealtimeSync,
  useResearchCountQuery,
  useStrategiesQuery,
} from "@/hooks/use-platform-queries";

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

/** KPI strings for the sidebar carousel. Reads the shared query cache (see
 * use-platform-queries.ts), so it adds no requests on pages that already load them. */
export function useDashboardMetrics(): DashboardMetrics {
  const symbol = useBenchmarkSymbol();
  usePlatformRealtimeSync();

  const regime = useCurrentRegimeQuery(symbol);
  const strategies = useStrategiesQuery();
  const failures = useFailureCountQuery();
  const research = useResearchCountQuery();
  const evolution = useEvolutionCountQuery();

  return useMemo(() => {
    const active = strategies.data?.items.filter((s) => s.status === "active") ?? [];
    const scored = active.filter((s) => s.robustness_score !== null);
    const avg = scored.length
      ? (scored.reduce((sum, s) => sum + (s.robustness_score ?? 0), 0) / scored.length).toFixed(2)
      : "—";
    const regimeData = regime.data ?? null;
    return {
      regimeLabel: regimeData?.regime_label ?? "—",
      regimeSub: regimeData ? `${symbol} • ${(regimeData.confidence_score * 100).toFixed(0)}% conf` : symbol,
      activeStrategiesCount: strategies.data ? String(active.length) : "—",
      avgPerformance: avg,
      failureCount: failures.data !== undefined ? String(failures.data) : "—",
      researchCount: research.data !== undefined ? String(research.data) : "—",
      evolutionCount: evolution.data !== undefined ? String(evolution.data) : "—",
      loading: strategies.isLoading || failures.isLoading,
    };
  }, [regime.data, strategies.data, strategies.isLoading, failures.data, failures.isLoading, research.data, evolution.data, symbol]);
}
