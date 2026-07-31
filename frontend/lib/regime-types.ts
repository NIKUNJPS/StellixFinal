/** Types mirroring backend app/schemas/regime.py (identical field names). */

export type RegimeLabel =
  | "Bull"
  | "Bear"
  | "High-Volatility"
  | "Low-Volatility"
  | "Sideways"
  | "Crisis";

export interface RegimePoint {
  timestamp: string;
  regime_label: RegimeLabel;
  confidence_score: number;
  model_votes: Record<string, string>;
}

export interface RegimeObject extends RegimePoint {
  transition_probs: { matrix?: number[][]; hmm_state_labels?: Record<string, string> } | null;
}

export interface RegimeHistory {
  symbol: string;
  count: number;
  points: RegimePoint[];
}

/** Locked color per regime — reused wherever the timeline is embedded. */
export const REGIME_COLORS: Record<RegimeLabel, string> = {
  Bull: "#16a34a",
  Bear: "#dc2626",
  "High-Volatility": "#f59e0b",
  "Low-Volatility": "#0ea5e9",
  Sideways: "#64748b",
  Crisis: "#9333ea",
};

export const REGIME_ORDER: RegimeLabel[] = [
  "Bull",
  "Bear",
  "High-Volatility",
  "Low-Volatility",
  "Sideways",
  "Crisis",
];

// --- Page 15 (Regime Monitor) aggregations, Batch 12 -----------------------
export interface RegimeStatisticsItem {
  regime_label: RegimeLabel;
  duration_days: number;
  avg_return: number | null;
  avg_volatility: number | null;
  avg_sharpe: number | null;
}

export interface RegimeStatisticsResponse {
  symbol: string;
  items: RegimeStatisticsItem[];
}

export interface StrategyCompatibilityAlert {
  strategy_id: string;
  strategy_name: string;
  compatibility_sharpe: number | null;
}

export interface StrategyCompatibilityAlertsResponse {
  symbol: string;
  current_regime: RegimeLabel | null;
  alerts: StrategyCompatibilityAlert[];
}
