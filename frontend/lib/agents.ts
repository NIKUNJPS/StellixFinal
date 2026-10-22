import { apiFetch, errorMessage } from "@/lib/api-client";
import type {
  AgentAnalysisDetail,
  AgentAnalysisListResponse,
  AgentBacktestDetail,
  AgentBacktestListResponse,
  AnalystKey,
  DeskStatus,
  PortfolioInput,
  ScoreSummary,
} from "@/lib/agent-types";

async function json<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) throw new Error(await errorMessage(res, fallback));
  return (await res.json()) as T;
}

export async function getDeskStatus(): Promise<DeskStatus> {
  return json(await apiFetch("/agents/status"), "Failed to load agent desk status");
}

/** Queues a run; a 503 means the desk's LLM provider key is not configured. */
export async function startAnalysis(body: {
  ticker: string;
  trade_date?: string;
  selected_analysts: AnalystKey[];
  output_language?: string;
  portfolio?: PortfolioInput;
  /** A Market Terminal holdings portfolio of yours (instead of an inline book). */
  holdings_portfolio_id?: string;
}): Promise<{ analysis_id: string; task_id: string | null; message: string }> {
  return json(
    await apiFetch("/agents/analyses", { method: "POST", body: JSON.stringify(body) }),
    "Failed to start the analysis",
  );
}

/** Re-run a failed or stalled analysis; it resumes from the last finished agent. */
export async function retryAnalysis(id: string): Promise<{ analysis_id: string; message: string }> {
  return json(await apiFetch(`/agents/analyses/${id}/retry`, { method: "POST" }), "Failed to retry the analysis");
}

export async function listAnalyses(params: { ticker?: string; includeBacktests?: boolean; limit?: number } = {}) {
  const q = new URLSearchParams();
  if (params.ticker) q.set("ticker", params.ticker);
  if (params.includeBacktests) q.set("include_backtests", "true");
  q.set("limit", String(params.limit ?? 50));
  return json<AgentAnalysisListResponse>(await apiFetch(`/agents/analyses?${q}`), "Failed to load analyses");
}

export async function getAnalysis(id: string): Promise<AgentAnalysisDetail> {
  return json(await apiFetch(`/agents/analyses/${id}`), "Failed to load the analysis");
}

export async function getTrackRecord(ticker?: string): Promise<{ ticker: string | null; summary: ScoreSummary }> {
  const q = ticker ? `?ticker=${encodeURIComponent(ticker)}` : "";
  return json(await apiFetch(`/agents/track-record${q}`), "Failed to load the track record");
}

export async function settleNow(): Promise<{ task_id: string; message: string }> {
  return json(await apiFetch("/agents/settle", { method: "POST" }), "Failed to queue settlement");
}

export async function startBacktest(body: {
  tickers: string[];
  start_date: string;
  end_date: string;
  every_n_days: number;
  selected_analysts: AnalystKey[];
}): Promise<{ run_id: string; total_cells: number }> {
  return json(
    await apiFetch("/agents/backtests", { method: "POST", body: JSON.stringify(body) }),
    "Failed to start the backtest",
  );
}

export async function listBacktests(): Promise<AgentBacktestListResponse> {
  return json(await apiFetch("/agents/backtests"), "Failed to load backtests");
}

export async function getBacktest(id: string): Promise<AgentBacktestDetail> {
  return json(await apiFetch(`/agents/backtests/${id}`), "Failed to load the backtest");
}
