/** Types mirroring backend app/schemas/strategy.py's Batch 12 Backtest Results additions. */

import type { PerformanceSnapshotRead } from "@/lib/strategy-types";

export interface TradeRecordRead {
  id: string;
  entry_timestamp: string;
  exit_timestamp: string;
  direction: string;
  entry_price: number;
  exit_price: number;
  pnl: number;
  return_pct: number;
  regime_at_entry: string | null;
}

export interface BacktestChartPoint {
  timestamp: string;
  value: number | null;
}

export interface BacktestChartSeries {
  equity_curve: BacktestChartPoint[];
  drawdown_series: BacktestChartPoint[];
  rolling_sharpe: BacktestChartPoint[];
}

export interface BacktestResultsResponse {
  strategy_id: string;
  has_run: boolean;
  aggregate: PerformanceSnapshotRead | null;
  per_regime: PerformanceSnapshotRead[];
  trades: TradeRecordRead[];
  charts: BacktestChartSeries | null;
}

export interface TopPerformerItem {
  strategy_id: string;
  name: string;
  sharpe_ratio: number | null;
  robustness_score: number | null;
  equity_curve: BacktestChartPoint[];
}

export interface TopPerformersResponse {
  items: TopPerformerItem[];
}
