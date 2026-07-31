/** Types mirroring backend app/schemas/failure.py. */

export type FailureTrigger =
  | "drawdown_breach"
  | "sharpe_decline"
  | "regime_mismatch"
  | "manual";

export interface FeatureAttribution {
  feature_name: string;
  shap_value: number;
  direction: "positive" | "negative";
}

export interface FailureListItem {
  id: string;
  strategy_id: string;
  regime_at_failure: string;
  trigger_condition: FailureTrigger;
  failure_timestamp: string;
  llm_generated_explanation: string | null;
  llm_numeric_validation_passed: boolean | null;
  created_at: string;
}

export interface FailureList {
  total: number;
  count: number;
  items: FailureListItem[];
}

export interface Failure extends FailureListItem {
  strategy_version: string;
  performance_metrics_at_failure: Record<string, number | null>;
  feature_attribution: FeatureAttribution[] | null;
  market_context_snapshot: Record<string, unknown>;
  related_failure_ids: string[];
}

export interface FailureCluster {
  regime_at_failure: string;
  trigger_condition: FailureTrigger;
  count: number;
  failure_ids: string[];
}

export interface FailureClusters {
  clusters: FailureCluster[];
}

/** Strategy x regime failure-count matrix (Page 10's D3 heatmap, Batch 12) —
 * distinct from FailureClusters above (regime x trigger_condition, Batch 6). */
export interface FailureHeatmapCell {
  strategy_id: string;
  strategy_name: string;
  regime_at_failure: string;
  count: number;
}

export interface FailureHeatmapResponse {
  cells: FailureHeatmapCell[];
}

export const TRIGGER_COLORS: Record<FailureTrigger, string> = {
  drawdown_breach: "#dc2626",
  sharpe_decline: "#f59e0b",
  regime_mismatch: "#9333ea",
  manual: "#64748b",
};

export const TRIGGER_LABELS: Record<FailureTrigger, string> = {
  drawdown_breach: "Drawdown breach",
  sharpe_decline: "Sharpe decline",
  regime_mismatch: "Regime mismatch",
  manual: "Manual",
};
