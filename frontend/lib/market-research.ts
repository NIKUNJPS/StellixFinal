import { apiFetch, errorMessage } from "@/lib/api-client";
import type {
  ChartResponse,
  HeatmapResponse,
  MacroResponse,
  ScreenerResponse,
} from "@/lib/market-research-types";

export async function getMacroDashboard(): Promise<MacroResponse> {
  const res = await apiFetch("/market/macro");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load macro data"));
  return (await res.json()) as MacroResponse;
}

export async function getScreener(): Promise<ScreenerResponse> {
  const res = await apiFetch("/market/screener");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load screener"));
  return (await res.json()) as ScreenerResponse;
}

export async function getSectorHeatmap(): Promise<HeatmapResponse> {
  const res = await apiFetch("/market/heatmap");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load sector heatmap"));
  return (await res.json()) as HeatmapResponse;
}

export async function getChart(symbol: string, interval: string, range: string): Promise<ChartResponse> {
  const params = new URLSearchParams({ interval, range });
  const res = await apiFetch(`/market/chart/${encodeURIComponent(symbol)}?${params.toString()}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load chart"));
  return (await res.json()) as ChartResponse;
}
