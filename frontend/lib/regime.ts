import { apiFetch, errorMessage } from "@/lib/api-client";
import type {
  RegimeHistory,
  RegimeObject,
  RegimeStatisticsResponse,
  StrategyCompatibilityAlertsResponse,
} from "@/lib/regime-types";

export async function getRegimeHistory(symbol: string): Promise<RegimeHistory> {
  const res = await apiFetch(`/regimes/history?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load regime history"));
  return (await res.json()) as RegimeHistory;
}

export async function getCurrentRegime(symbol: string): Promise<RegimeObject | null> {
  const res = await apiFetch(`/regimes/current?symbol=${encodeURIComponent(symbol)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load current regime"));
  return (await res.json()) as RegimeObject;
}

export async function triggerRegimeDetection(symbol: string): Promise<void> {
  const res = await apiFetch("/regimes/detect", {
    method: "POST",
    body: JSON.stringify({ symbol }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to trigger detection"));
}

// --- Cross-asset regime divergence (Batch 22) ------------------------------- //
export interface CrossAssetRegime {
  as_of: string;
  requested_symbols: string[];
  assets: Record<string, { regime: string; confidence: number; detected_at: string }>;
  divergences: Array<{ asset_a: string; asset_b: string | null; type: string; message: string }>;
  synchronized: boolean;
  insufficient_data: boolean;
}

export async function getCrossAssetRegime(symbols?: string): Promise<CrossAssetRegime> {
  const qs = symbols ? `?symbols=${encodeURIComponent(symbols)}` : "";
  const res = await apiFetch(`/regimes/cross-asset${qs}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load cross-asset regimes"));
  return (await res.json()) as CrossAssetRegime;
}

export async function getRegimeStatistics(symbol: string): Promise<RegimeStatisticsResponse> {
  const res = await apiFetch(`/regimes/statistics?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load regime statistics"));
  return (await res.json()) as RegimeStatisticsResponse;
}

export async function getCompatibilityAlerts(symbol: string): Promise<StrategyCompatibilityAlertsResponse> {
  const res = await apiFetch(`/regimes/compatibility-alerts?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load compatibility alerts"));
  return (await res.json()) as StrategyCompatibilityAlertsResponse;
}
