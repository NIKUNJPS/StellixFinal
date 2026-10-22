/** Multi-agent desk (Batch 30, ADR 0009). Field names mirror backend/app/schemas/agent_desk.py. */

export type AgentRunStatus = "queued" | "running" | "completed" | "failed";
export type AgentRating = "Buy" | "Overweight" | "Hold" | "Underweight" | "Sell" | "REVIEW";
export type AnalystKey = "market" | "social" | "news" | "fundamentals";

export interface ProgressStage {
  stage: string;
  at: string;
}

export interface AgentAnalysisSummary {
  id: string;
  ticker: string;
  trade_date: string;
  asset_type: string;
  status: AgentRunStatus;
  rating: AgentRating | null;
  trader_action: string | null;
  regime_at_analysis: string | null;
  regime_confidence: number | null;
  selected_analysts: AnalystKey[];
  llm_provider: string;
  deep_model: string;
  quick_model: string;
  backtest_run_id: string | null;
  requested_by_user_id: string | null;
  progress: ProgressStage[];
  expected_stages: string[];
  llm_call_count: number;
  settled_alpha: number | null;
  settled_raw_return: number | null;
  benchmark: string | null;
  holding_days: number | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface Lesson {
  ticker: string;
  trade_date: string;
  regime: string | null;
  rating: string | null;
  raw_return: number | null;
  alpha: number | null;
  benchmark: string | null;
  holding_days: number | null;
  reflection: string | null;
}

export interface RegimeContext {
  regime?: string | null;
  regime_confidence?: number | null;
  regime_as_of?: string | null;
  regime_path?: { regime: string; start: string; end: string; bars: number }[];
  strategies?: {
    name: string;
    status: string;
    robustness_score: number | null;
    sharpe_in_current_regime: number | null;
    sharpe_by_regime: Record<string, number | null>;
  }[];
  failures?: { strategy: string; regime: string; trigger: string; at: string; explanation: string | null }[];
  regime_failure_triggers?: { trigger: string; count: number }[];
  lessons_same_ticker?: Lesson[];
  lessons_same_regime?: Lesson[];
  instrument_text?: string;
  past_context_text?: string;
}

export interface AgentReports {
  market_report?: string;
  sentiment_report?: string;
  news_report?: string;
  fundamentals_report?: string;
  investment_plan?: string;
  trader_investment_plan?: string;
  final_trade_decision?: string;
  investment_debate?: { bull_history?: string; bear_history?: string; judge_decision?: string };
  risk_debate?: {
    aggressive_history?: string;
    conservative_history?: string;
    neutral_history?: string;
    judge_decision?: string;
  };
}

export interface PortfolioPosition {
  ticker: string;
  quantity: number;
  average_price?: number | null;
}

/** TradingAgents' PortfolioContext. `positions: []` is a flat book; omitting it is "no context". */
export interface PortfolioInput {
  cash?: number | null;
  currency?: string | null;
  positions: PortfolioPosition[];
}

export interface AgentAnalysisDetail extends AgentAnalysisSummary {
  config_snapshot: Record<string, unknown>;
  portfolio: PortfolioInput | null;
  regime_context: RegimeContext;
  reports: AgentReports;
  time_horizon: string | null;
  position_sizing: string | null;
  research_note_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  settled_resolution_date: string | null;
  settled_reflection: string | null;
  settled_at: string | null;
}

export interface AgentAnalysisListResponse {
  count: number;
  items: AgentAnalysisSummary[];
}

export interface DeskStatus {
  configured: boolean;
  reason: string | null;
  provider: string;
  deep_model: string;
  quick_model: string;
  max_debate_rounds: number;
  max_risk_rounds: number;
  holding_days: number;
  backtest_max_cells: number;
  framework: string;
  analysts: AnalystKey[];
  pipeline: string[];
  supported_providers: string[];
  output_language: string;
  fundamentals_vendors: string;
  sec_edgar_enabled: boolean;
  sec_edgar_user_agent_set: boolean;
  jev_screening_enabled: boolean;
  checkpoint_enabled: boolean;
}

export interface ScoreGroup {
  regime?: string;
  rating?: string;
  n: number;
  mean_alpha: number | null;
  hit_rate: number | null;
}

export interface ScoreSummary {
  by_regime_rating?: ScoreGroup[];
  by_rating?: ScoreGroup[];
  by_regime?: ScoreGroup[];
  overall?: ScoreGroup;
  scored_cells?: number;
  unscored_cells?: number;
}

export interface AgentBacktestSummary {
  id: string;
  tickers: string[];
  trade_dates: string[];
  selected_analysts: AnalystKey[];
  status: AgentRunStatus;
  total_cells: number;
  completed_cells: number;
  failed_cells: number;
  summary: ScoreSummary;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface AgentBacktestDetail extends AgentBacktestSummary {
  cells: AgentAnalysisSummary[];
}

export interface AgentBacktestListResponse {
  count: number;
  items: AgentBacktestSummary[];
}

export interface AgentProgressEvent {
  analysis_id: string;
  backtest_run_id: string | null;
  ticker: string;
  stage: string | null;
  status: AgentRunStatus;
  rating: AgentRating | null;
  stages_done: number | null;
  stages_total: number | null;
}
