/** Conceptual documentation content (Batch 15), lifted from the approved copy.
 *  Prose lives here so the Docs page's client-side search can index it. The API
 *  reference is fetched live from the running service, not stored here. */

export type DocSection = {
  id: string;
  category: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  code?: { language: "json" | "cypher"; label: string; content: string };
};

export const DOC_CATEGORIES = [
  "Getting Started",
  "Core Concepts",
  "API Reference",
  "Guides",
] as const;

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "introduction",
    category: "Getting Started",
    title: "Introduction",
    paragraphs: [
      "Stellix Labs is organized around a single idea: no performance number means anything without a regime attached, and no result is worth keeping unless it's remembered — including the failures.",
      "This documentation covers both the why (core concepts) and the how (a live API reference generated from the running service). If you're evaluating the platform, start with Regime Detection and The Knowledge Graph — they're what make Stellix Labs different from a backtester.",
    ],
  },
  {
    id: "quickstart",
    category: "Getting Started",
    title: "Quickstart",
    paragraphs: [
      "From zero to your first regime detection in four steps. The onboarding wizard walks a new organization through exactly this flow, but each step is a plain API call you can make yourself.",
    ],
    bullets: [
      "Register your organization with POST /auth/register. This returns 202 Accepted and creates the org in a pending-approval state — no token is issued yet.",
      "A Stellix operator approves the organization (enterprise onboarding is deliberately gated, not self-serve).",
      "Log in with POST /auth/login to receive a 15-minute access token, then send it as an Authorization: Bearer header.",
      "Ingest data (POST /data/ingest for a symbol like SPY), then POST /regimes/detect and read the result from GET /regimes/current — your first regime is now stored and tenant-scoped.",
    ],
  },
  {
    id: "authentication",
    category: "Getting Started",
    title: "Authentication",
    paragraphs: [
      "The API accepts two credential types. Interactive clients use short-lived JWT access tokens (15-minute expiry) paired with a rotated, httpOnly refresh cookie. Programmatic clients use API keys (prefix slx_), which carry explicit scopes and are stored only as SHA-256 hashes — the raw key is shown once, at creation.",
      "Registration is a request, not an instant sign-in: POST /auth/register returns 202 and leaves the organization pending approval, so no token exists until an operator activates the account. Once active, POST /auth/login returns the access token; a suspended or terminated organization is refused at the login boundary and, thereafter, on every request by the org-status gate.",
      "Every authenticated request is scoped to exactly one organization; a request with no tenant context can never read another organization's data — the isolation is enforced structurally, not by convention.",
    ],
  },
  {
    id: "websocket-events",
    category: "Core Concepts",
    title: "Real-time WebSocket events",
    paragraphs: [
      "Connect to GET /ws/{org_id}/{user_id}?token=<access token> to receive live events for your organization. Authentication is the same access token you use for REST; the org you receive events for is taken from the verified token, not the URL, so you can only ever subscribe to your own tenant's stream.",
      "Each message is a typed envelope. Handle events by their type field — new types can be added without breaking existing clients.",
    ],
    bullets: [
      "regime_update — a symbol's detected regime changed (carries symbol, old and new regime, confidence).",
      "failure_alert — a live strategy tripped a failure trigger (drawdown, Sharpe decline, regime mismatch, or manual flag).",
      "evolution_progress — a genetic-algorithm run advanced a generation (generation, max_generations, best/avg fitness).",
      "strategy_status — a strategy moved through its lifecycle (e.g. candidate → active).",
    ],
  },
  {
    id: "rate-limits",
    category: "Getting Started",
    title: "Rate limits",
    paragraphs: [
      "Limits are per organization and enforced with a token-bucket algorithm (a short burst up to the bucket's capacity is allowed, then a steady refill — not a hard window cliff). The Enterprise tier multiplies every limit below by 5×; Starter and Pro use the base values.",
      "A throttled request returns 429 with a Retry-After header. Your live consumption for every category is available at GET /usage/rate-limits, and the Settings → Usage page renders it with progress bars.",
    ],
    bullets: [
      "Global (per user): 100 requests / minute.",
      "Market-data ingestion: 10 / hour.",
      "Backtests: 30 / hour.",
      "Validations: 20 / hour.",
      "Evolution runs: 5 / hour.",
      "LLM calls: 50 / hour.",
    ],
  },
  {
    id: "first-backtest",
    category: "Getting Started",
    title: "Your first backtest",
    paragraphs: [
      "Ingest OHLCV for a symbol, let the feature engine compute its indicators, run regime detection, then author a strategy in the JSON rule DSL and submit it for a regime-aware backtest. The result comes back partitioned by regime — never as a single blended number.",
    ],
  },
  {
    id: "regime-detection",
    category: "Core Concepts",
    title: "Regime Detection",
    paragraphs: [
      "Every bar of market data is assigned one of six regimes — Bull, Bear, High-Volatility, Low-Volatility, Sideways, Crisis — by an ensemble of four independent models.",
      "The four votes are combined by a self-consistency-weighted majority, so a model that has been unreliable recently counts for less. A Crisis override fires immediately when GARCH conditional volatility crosses an extreme percentile, because in a crisis you can't wait for a majority to agree. Each bar's label carries a confidence score equal to the fraction of models that agreed with the final call.",
    ],
    bullets: [
      "HMM (Gaussian hidden Markov model) captures persistent regime states and transition probabilities.",
      "PELT change-point detection finds structural breaks in the series.",
      "GMM (Gaussian mixture) clusters bars by their statistical fingerprint.",
      "GARCH(1,1) models conditional volatility and drives the Crisis override.",
    ],
  },
  {
    id: "strategy-dsl",
    category: "Core Concepts",
    title: "The Strategy DSL",
    paragraphs: [
      "A strategy's logic is a strict JSON tree, not code. Each leaf is a condition — {indicator, comparator, value} (or value_ref to compare two indicator series) — combined with AND / OR operators that may nest arbitrarily.",
      "Comparators include the standard < <= > >= == != plus two genuine two-bar window operators, crosses_above and crosses_below. Because the DSL is structured data, the same strategy representation can be authored by a human, drafted by the LLM assistant, and evolved by the genetic algorithm — no translation layer required.",
    ],
    code: {
      language: "json",
      label: "entry_rules.json",
      content: `{"operator": "AND",
 "conditions": [
   {"indicator": "rsi_14", "comparator": "<", "value": 30},
   {"indicator": "close", "comparator": "crosses_above", "value_ref": "sma_50"}]}`,
    },
  },
  {
    id: "validation-gate",
    category: "Core Concepts",
    title: "The Validation Gate",
    paragraphs: [
      "A strategy earns a single composite robustness score from five weighted methods: Walk-Forward (30%), Regime Cross-Validation (30%), Monte-Carlo (20%), Persistence (10%), and Stress Test (10%). Below 0.50 auto-fails; 0.50–0.70 stays a candidate; above 0.70 becomes eligible for promotion to active. The gate is enforced in code — you cannot promote an under-robust strategy by clicking harder.",
    ],
  },
  {
    id: "failure-intelligence",
    category: "Core Concepts",
    title: "Failure Intelligence",
    paragraphs: [
      "A live strategy can fail via four triggers: drawdown breach, Sharpe decline, regime mismatch, or a manual flag. Each writes an immutable record — the regime it failed in, the performance metrics at failure, the full market context, and a SHAP attribution of the five features most responsible. The failures table is append-only: UPDATE and DELETE are revoked at the PostgreSQL role level, so a failure record can never be quietly rewritten.",
    ],
  },
  {
    id: "knowledge-graph",
    category: "Core Concepts",
    title: "The Knowledge Graph",
    paragraphs: [
      "Your research is stored twice: as rows in PostgreSQL (the source of truth) and as a connected graph in Neo4j (the memory). Six node types and eight edge types let you ask questions no relational query expresses cleanly — “trace the full lineage of this evolved strategy back to the research note that inspired its ancestor,” or “which regimes cause recurring failures across all my momentum strategies.”",
      "Five named queries ship ready to use, and every one is tenant-scoped at the query-builder level so it's structurally impossible to read another organization's graph.",
    ],
    code: {
      language: "cypher",
      label: "recurring_failure_modes.cypher",
      content: `MATCH (s:Strategy)-[:FAILED_IN]->(r:Regime)
WHERE s.organization_id = $organization_id
MATCH (f:Failure {organization_id: $organization_id})-[:CAUSED_BY]->(p:Performance)
RETURN r.regime_label, f.trigger_condition, count(*) AS occurrences
ORDER BY occurrences DESC`,
    },
  },
  {
    id: "guide-regime-backtest",
    category: "Guides",
    title: "Reading a regime-partitioned backtest",
    paragraphs: [
      "A backtest result reports Sharpe, Sortino, and Beta both overall and split across the six regimes. The tell for a fragile strategy is a strong overall Sharpe alongside a negative Crisis- or Bear-regime Sharpe — a strategy that only ever worked in benign conditions. Always read the regime split before the headline number.",
    ],
  },
  {
    id: "guide-graph-queries",
    category: "Guides",
    title: "Querying your knowledge graph",
    paragraphs: [
      "The five named queries — failed_strategies_by_regime, lineage, robust_across_regimes, recurring_failure_modes, and hypotheses_leading_to_active — cover the highest-value institutional-memory questions. Each takes your organization context implicitly and returns only your data.",
    ],
  },
];
