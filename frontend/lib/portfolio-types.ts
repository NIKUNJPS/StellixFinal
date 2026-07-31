// Portfolio cross-strategy view (Batch 20). Mirrors app/schemas/portfolio.py.

export interface RiskAlert {
  severity: "critical" | "warning" | "info";
  kind: "concentration" | "correlation" | "drawdown";
  message: string;
}

export interface ConcentrationItem {
  strategy_id: string;
  name: string;
  weight_pct: number;
}

export interface RegimeExposureItem {
  regime: string;
  count: number;
  pct: number;
}

export interface EquityPoint {
  timestamp: string;
  value: number;
}

export interface PortfolioOverview {
  total_active_strategies: number;
  portfolio_sharpe: number | null;
  portfolio_max_drawdown: number | null;
  regime_exposure: RegimeExposureItem[];
  concentration: ConcentrationItem[];
  risk_alerts: RiskAlert[];
  combined_equity_curve: EquityPoint[];
  strategies_without_metrics: string[];
}

export interface CorrelationMatrix {
  labels: string[];
  // A cell can be null if the backend ever has to report an undefined
  // correlation (e.g. a numerical edge case) instead of fabricating a number.
  matrix: (number | null)[][];
  excluded: string[];
  days_used: number;
}
