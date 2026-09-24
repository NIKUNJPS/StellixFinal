/** Types mirroring backend app/schemas/signal.py (Batch 26 Part B). */

export type SignalType = "BUY" | "SELL" | "HOLD";

export interface SignalItem {
  strategy_id: string;
  strategy_name: string;
  symbol: string | null;
  signal_type: SignalType | null;
  /** The ADR-0008-corrected validated composite — a validated robustness score, never
   * a live prediction of future performance. */
  robustness_score: number | null;
  regime_at_signal: string | null;
  evaluated_at: string | null;
  last_evaluated_at: string | null;
  rule_snapshot: Record<string, unknown> | null;
  /** Present only when a signal could not be computed (e.g. no market data yet). */
  unavailable_reason: string | null;
}

export interface SignalListResponse {
  count: number;
  items: SignalItem[];
}
