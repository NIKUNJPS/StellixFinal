/** Types mirroring backend app/schemas/llm.py + app/llm/schemas.py. */

export interface SuggestedParameter {
  name: string;
  value: number;
  min: number;
  max: number;
  type: string;
}

export interface HypothesisResult {
  hypothesis_text: string;
  rationale: string;
  suggested_parameters: SuggestedParameter[];
  suggested_regime_focus: string[];
}

export interface HypothesisRequest {
  symbol: string;
  user_prompt?: string | null;
}

export interface HypothesisResponse {
  hypothesis: HypothesisResult;
  research_note_id: string;
}

export interface NumericClaim {
  metric_name: string;
  claimed_value: number;
}

export interface StrategyCritique {
  strengths: string[];
  weaknesses: string[];
  overfitting_risks: string[];
  edge_cases: string[];
  numeric_claims: NumericClaim[];
}

export interface CritiqueResponse {
  critique: StrategyCritique;
  numeric_validation_passed: boolean | null;
}

export interface GraphSummary {
  summary_text: string;
  key_findings: string[];
}

export interface GraphSummaryResponse {
  query_name: string;
  summary: GraphSummary;
}

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  function_name: string;
  full_prompt: string;
  full_response: string;
  model_used: string;
  /** Batch 18: which provider lane served the call. Null on pre-router rows. */
  model_key: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: string | null;
  numeric_validation_passed: boolean | null;
  created_at: string;
  /** Batch 25: readable identity of the user who made the call (null = system call). */
  user_email: string | null;
  user_name: string | null;
}

export type ChatStakes = "low" | "medium" | "high";

export interface ChatStreamRequest {
  message: string;
  stakes?: ChatStakes;
}

/** One decoded SSE frame from POST /llm/chat/stream. */
export interface ChatStreamEvent {
  chunk?: string;
  /** The concrete model serving this response, e.g. "gemini-2.5-flash". */
  model?: string;
  error?: string;
  done: boolean;
}

export interface AuditLogListResponse {
  total: number;
  count: number;
  items: AuditLogEntry[];
}
