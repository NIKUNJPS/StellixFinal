/** Types mirroring backend app/schemas/strategy.py. */

export type StrategyStatus = "draft" | "candidate" | "active" | "failed" | "retired";
export type StrategyCreator = "human" | "llm_generated" | "ga_engine";

export interface Condition {
  indicator: string;
  comparator: string;
  value?: number;
  value_ref?: string;
}

export interface RuleGroup {
  operator: "AND" | "OR";
  conditions: Condition[];
}

export interface RiskConstraints {
  max_drawdown_pct: number;
  max_position_size_pct: number;
  stop_loss_pct: number;
}

export interface StrategyListItem {
  id: string;
  name: string;
  status: StrategyStatus;
  creator: StrategyCreator;
  version: string;
  robustness_score: number | null;
  regime_compatibility: Record<string, number | null> | null;
  created_at: string;
  updated_at: string;
}

export interface StrategyList {
  total: number;
  count: number;
  items: StrategyListItem[];
}

export const INDICATORS = [
  "close",
  "rsi_14",
  "sma_20",
  "sma_50",
  "ema_12",
  "ema_26",
  "macd",
  "macd_signal",
  "atr_14",
  "bollinger_upper",
  "bollinger_lower",
  "realized_vol_20",
  "log_return",
] as const;

export const COMPARATORS = [
  "<",
  "<=",
  ">",
  ">=",
  "==",
  "!=",
  "crosses_above",
  "crosses_below",
] as const;

export const STATUS_COLORS: Record<StrategyStatus, string> = {
  draft: "#64748b",
  candidate: "#f59e0b",
  active: "#16a34a",
  failed: "#dc2626",
  retired: "#475569",
};

export interface StrategyRead {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  version: string;
  creator: StrategyCreator;
  created_by_user_id: string | null;
  status: StrategyStatus;
  parameters: Record<string, unknown>;
  entry_rules: Record<string, unknown>;
  exit_rules: Record<string, unknown>;
  risk_constraints: Record<string, unknown>;
  robustness_score: number | null;
  regime_compatibility: Record<string, number | null> | null;
  parent_strategy_id: string | null;
  inspired_by_note_id: string | null;
  requires_review: boolean;
  created_at: string;
  updated_at: string;
}

export interface PerformanceSnapshotRead {
  regime_label: string;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  win_rate: number | null;
  profit_factor: number | null;
  calmar_ratio: number | null;
  trade_count: number;
  period_start: string | null;
  period_end: string | null;
  // Batch 12
  sortino_ratio: number | null;
  beta_vs_benchmark: number | null;
  annualized_return: number | null;
  volatility: number | null;
}

export interface StrategyDetailResponse {
  strategy: StrategyRead;
  versions: unknown[];
  performance: PerformanceSnapshotRead[];
}
