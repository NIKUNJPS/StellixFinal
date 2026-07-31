/** Types mirroring backend validation schemas (app/schemas/strategy.py + method_details). */

export type ValidationClassification = "auto_fail" | "candidate" | "eligible_active";

export interface Histogram {
  counts: number[];
  edges: number[];
}

export interface MethodDetails {
  walk_forward?: {
    test_folds: number;
    passing: number;
    folds: Array<{
      fold: number;
      oos_sharpe: number | null;
      trade_count: number;
      passed: boolean;
      period_start: string | null;
      period_end: string | null;
    }>;
  };
  regime_cv?: {
    positive_count: number;
    primary_regimes: Record<
      string,
      { trade_count: number; sharpe_ratio: number | null; positive: boolean }
    >;
  };
  monte_carlo?: {
    n_simulations: number;
    tolerance: number;
    p95_drawdown: number;
    median_sharpe: number;
    drawdown_hist: Histogram;
    sharpe_hist: Histogram;
  };
  persistence?: { min_p: number | null; regimes: Record<string, Record<string, unknown>> };
  stress_test?: {
    applicable: boolean;
    windows?: Array<{ name: string; max_drawdown: number; score: number; trade_count: number }>;
  };
  sub_scores?: Record<string, number | null>;
  passes?: Record<string, boolean | null>;
  weights?: Record<string, number>;
  effective_weights?: Record<string, number>;
  stress_test_applicable?: boolean;
}

export interface ValidationResult {
  strategy_id: string;
  walk_forward_score: number | null;
  regime_cv_score: number | null;
  monte_carlo_score: number | null;
  persistence_score: number | null;
  stress_test_score: number | null;
  composite_score: number;
  classification: ValidationClassification;
  method_details: MethodDetails;
  created_at: string;
}

export const CLASSIFICATION_COLORS: Record<ValidationClassification, string> = {
  auto_fail: "#dc2626",
  candidate: "#f59e0b",
  eligible_active: "#16a34a",
};

export const METHOD_LABELS: Record<string, string> = {
  walk_forward: "Walk-Forward",
  regime_cv: "Regime CV",
  monte_carlo: "Monte Carlo",
  persistence: "Persistence",
  stress_test: "Stress Test",
};
