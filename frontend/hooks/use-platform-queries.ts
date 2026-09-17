"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";
import { getTopPerformers } from "@/lib/backtest";
import { listEvolutionRuns } from "@/lib/evolution";
import { getFailureHeatmap, listFailures } from "@/lib/failure";
import { getCurrentRegime, getRegimeHistory } from "@/lib/regime";
import type { RegimeObject } from "@/lib/regime-types";
import { listResearchNotes } from "@/lib/research-note";
import { listStrategies } from "@/lib/strategy";
import { useAuthStore } from "@/store/auth-store";

/**
 * Batch 25 performance: shared, cached server state for the dashboard and the sidebar
 * carousel. Both used to fetch the same five endpoints independently — and the sidebar
 * remounts with every page's DashboardShell, so every navigation re-downloaded the
 * strategy list and 200 full failure rows just to show two counts. One query key per
 * resource now means one request, deduplicated across components and cached across
 * navigations; realtime events patch or invalidate the cache instead of refetching
 * everything.
 */
export const platformKeys = {
  strategies: ["strategies", "list"] as const,
  failureCount: ["failures", "count"] as const,
  failureHeatmap: ["failures", "heatmap"] as const,
  researchCount: ["research-notes", "count"] as const,
  evolutionCount: ["evolution-runs", "count"] as const,
  topPerformers: ["strategies", "top-performers"] as const,
  currentRegime: (symbol: string) => ["regimes", "current", symbol] as const,
  regimeHistory: (symbol: string) => ["regimes", "history", symbol] as const,
};

const STALE_MS = 60_000;

function useSignedIn(): boolean {
  const user = useAuthStore((s) => s.user);
  const organization = useAuthStore((s) => s.organization);
  return !!user && !!organization;
}

/** The symbol the dashboard is anchored on: user preference, then org benchmark. */
export function useBenchmarkSymbol(): string {
  const preferred = useAuthStore((s) => s.user?.preferences?.default_regime_filter);
  const benchmark = useAuthStore((s) => s.organization?.benchmark_symbol);
  return preferred || benchmark || "SPY";
}

export function useStrategiesQuery() {
  return useQuery({ queryKey: platformKeys.strategies, queryFn: listStrategies, enabled: useSignedIn(), staleTime: STALE_MS });
}

export function useFailureCountQuery() {
  return useQuery({
    queryKey: platformKeys.failureCount,
    // limit=1: only `total` is needed, not the rows.
    queryFn: async () => (await listFailures(1)).total,
    enabled: useSignedIn(),
    staleTime: STALE_MS,
  });
}

export function useFailureHeatmapQuery() {
  return useQuery({ queryKey: platformKeys.failureHeatmap, queryFn: getFailureHeatmap, enabled: useSignedIn(), staleTime: STALE_MS });
}

export function useResearchCountQuery() {
  return useQuery({
    queryKey: platformKeys.researchCount,
    queryFn: async () => (await listResearchNotes({ limit: 1 })).total,
    enabled: useSignedIn(),
    staleTime: STALE_MS,
  });
}

export function useEvolutionCountQuery() {
  return useQuery({
    queryKey: platformKeys.evolutionCount,
    queryFn: async () => (await listEvolutionRuns()).total,
    enabled: useSignedIn(),
    staleTime: STALE_MS,
  });
}

export function useTopPerformersQuery() {
  return useQuery({
    queryKey: platformKeys.topPerformers,
    queryFn: async () => (await getTopPerformers(5)).items,
    enabled: useSignedIn(),
    staleTime: STALE_MS,
  });
}

export function useCurrentRegimeQuery(symbol: string) {
  return useQuery({
    queryKey: platformKeys.currentRegime(symbol),
    queryFn: () => getCurrentRegime(symbol),
    enabled: useSignedIn(),
    staleTime: STALE_MS,
  });
}

export function useRegimeHistoryQuery(symbol: string) {
  return useQuery({
    queryKey: platformKeys.regimeHistory(symbol),
    queryFn: async () => (await getRegimeHistory(symbol)).points,
    enabled: useSignedIn(),
    staleTime: STALE_MS,
  });
}

/**
 * Keeps the shared cache in step with realtime events. Mount once per page that shows
 * these queries (the dashboard and the sidebar both call it; subscriptions are cheap
 * and the cache writes are idempotent).
 */
export function usePlatformRealtimeSync(): void {
  const { subscribe } = useWebSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubRegime = subscribe("regime_update", (event: WSEvent) => {
      const symbol = String(event.symbol);
      queryClient.setQueryData<RegimeObject | null>(platformKeys.currentRegime(symbol), (prev) =>
        prev
          ? {
              ...prev,
              regime_label: String(event.new_regime) as RegimeObject["regime_label"],
              confidence_score: typeof event.confidence === "number" ? event.confidence : prev.confidence_score,
            }
          : prev,
      );
      void queryClient.invalidateQueries({ queryKey: platformKeys.regimeHistory(symbol) });
    });
    const unsubFailure = subscribe("failure_alert", () => {
      void queryClient.invalidateQueries({ queryKey: ["failures"] });
      void queryClient.invalidateQueries({ queryKey: platformKeys.strategies });
    });
    const unsubStatus = subscribe("strategy_status", () => {
      void queryClient.invalidateQueries({ queryKey: ["strategies"] });
    });
    return () => {
      unsubRegime();
      unsubFailure();
      unsubStatus();
    };
  }, [subscribe, queryClient]);
}
