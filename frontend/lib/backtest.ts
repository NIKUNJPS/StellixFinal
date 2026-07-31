import { apiFetch, errorMessage } from "@/lib/api-client";
import type { BacktestResultsResponse, TopPerformersResponse } from "@/lib/backtest-types";

export async function getBacktestResults(strategyId: string): Promise<BacktestResultsResponse> {
  const res = await apiFetch(`/strategies/${strategyId}/backtest-results`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load backtest results"));
  return (await res.json()) as BacktestResultsResponse;
}

export async function getTopPerformers(limit = 5): Promise<TopPerformersResponse> {
  const res = await apiFetch(`/strategies/top-performers?limit=${limit}`);
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load top performers"));
  return (await res.json()) as TopPerformersResponse;
}
