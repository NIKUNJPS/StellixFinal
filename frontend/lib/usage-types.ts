/** Types mirroring backend app/api/routes/usage.py (Batch 21). */

export interface RateLimitCategory {
  limit: number;
  window_seconds: number;
  used: number;
  remaining: number;
  resets_in_seconds: number;
}

export interface RateLimitUsage {
  tier: string | null;
  rate_multiplier: number;
  endpoints: Record<string, RateLimitCategory>;
  // Intentionally optional: the backend omits this — no enforced monthly LLM budget
  // concept exists — so the UI only renders it if it ever appears.
  llm_budget?: {
    monthly_limit_usd: number;
    used_this_month_usd: number;
    pct_used: number;
    resets_in_days: number;
  } | null;
}
