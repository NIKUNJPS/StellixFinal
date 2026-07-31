/**
 * Structured marketing content (Batch 15).
 *
 * The single source of reused, structured copy for the public site — nav links,
 * feature cards, pillars, pricing tiers, use-case segments, workflow steps, and
 * the real Neo4j graph schema. Prose-heavy sections live inline in their page
 * components. All text here is lifted verbatim from the approved
 * docs/landing-page-copy.md.
 */

export const NAV_LINKS = [
  { href: "/product", label: "Product" },
  { href: "/features", label: "Features" },
  { href: "/architecture", label: "Architecture" },
  { href: "/use-cases", label: "Use Cases" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
] as const;

export const PILLARS = [
  {
    id: "regime",
    name: "Regime-Conditioning",
    mechanism:
      "Every backtest is split into six market regimes — Bull, Bear, High-Volatility, Low-Volatility, Sideways, Crisis — by a four-model ensemble (a Gaussian HMM, PELT change-point detection, a Gaussian mixture, and a GARCH(1,1) volatility model voting by self-consistency) before a single Sharpe ratio reaches your screen, so a strategy that only worked because 2021 was a bull market is flagged as regime-fragile before it ever reaches your book.",
  },
  {
    id: "failure",
    name: "Failure-as-Asset",
    mechanism:
      "When a strategy fails we don't archive it, we perform an autopsy: every failure is written to an append-only, permission-locked table (UPDATE and DELETE are revoked at the PostgreSQL role level) recording the exact regime it broke in, which of four triggers killed it, and a SHAP attribution of the five features most responsible — and that record is immutable and permanent.",
  },
  {
    id: "memory",
    name: "Compounding Memory",
    mechanism:
      "Every strategy, failure, regime, and research note becomes a node in a Neo4j knowledge graph connected by eight relationship types (VALID_IN, FAILED_IN, MUTATED_FROM, ADAPTED_FROM, CAUSED_BY, INSPIRED_BY, EVALUATED_BY, AUTHORED_BY), so a question like “what recurring failure mode do our momentum strategies share in Crisis regimes?” is answered from years of your firm's accumulated research, not a fresh guess.",
  },
] as const;

export const PROBLEM_CARDS = [
  {
    title: "The knowledge walks out the door",
    body: "Your senior quant resigns Friday. Monday, two years of “we tried that — it blows up in high-vol” is gone. Your new hire spends Q1 rediscovering the exact mean-reversion trap that researcher already mapped in 2023.",
  },
  {
    title: "The backtest that lied",
    body: "A strategy posts a 2.1 Sharpe and goes to your book. It only ever traded through 2021's bull run. Nobody split the result by regime, so nobody saw it had never survived a single drawdown — until it did, live, with real capital.",
  },
  {
    title: "The same dead end, four times",
    body: "Four researchers, four years, independently build the same RSI-reversal system. All four die the same way in the same regime. Nothing recorded the first three failures, so the fourth was inevitable.",
  },
  {
    title: "Research with a half-life",
    body: "Every notebook cell, Slack thread, and “huh, that's odd” insight lives in someone's head or a folder nobody opens. Your firm's actual research IP decays at the speed of employee turnover.",
  },
] as const;

export const SOLUTION_STEPS = [
  {
    name: "Regime Detection",
    body: "A four-model ensemble labels every bar of market data into one of six regimes, so nothing is ever measured context-free.",
  },
  {
    name: "Regime-Aware Validation",
    body: "A five-method gauntlet scores robustness per regime and gates weak strategies before they reach production.",
  },
  {
    name: "Failure Intelligence",
    body: "Every failure gets a SHAP autopsy and an immutable, append-only record: the regime, the trigger, the responsible features.",
  },
  {
    name: "The Knowledge Graph",
    body: "Strategies, failures, regimes, and research notes become a connected Neo4j graph you can actually query.",
  },
  {
    name: "The Evolution Engine",
    body: "A genetic algorithm breeds new strategies from your survivors, with full parent-to-child lineage recorded in the graph.",
  },
] as const;

export const FEATURE_CARDS = [
  {
    id: "regime-detection",
    name: "Regime Detection",
    body: "HMM + PELT + GMM + GARCH ensemble, self-consistency-weighted, with a fast-triggering Crisis override. Six regimes, four independent votes, one confidence score per bar.",
  },
  {
    id: "backtesting",
    name: "Regime-Aware Backtesting",
    body: "Vectorized simulation (vectorbt) that reports Sharpe, Sortino, and Beta split by regime — plus per-trade records — so a single blended number can never hide a regime-fragile strategy.",
  },
  {
    id: "validation",
    name: "Five-Method Validation",
    body: "Walk-Forward, Regime Cross-Validation, Monte-Carlo, Persistence, and Stress Test combine into one robustness score. Below 0.70, a strategy can't be promoted to active. Full stop.",
  },
  {
    id: "failure",
    name: "Failure Intelligence",
    body: "Four detection triggers — drawdown breach, Sharpe decline, regime mismatch, manual — each producing an immutable failure record with SHAP feature attribution and full market context.",
  },
  {
    id: "graph",
    name: "The Knowledge Graph",
    body: "Six node types, eight edge types, five named institutional-memory queries. “Which hypotheses actually became live strategies?” is one graph traversal away.",
  },
  {
    id: "evolution",
    name: "The Evolution Engine",
    body: "A DEAP genetic algorithm with adaptive-sigma mutation and elitism. Every individual is backtested every generation; survivors are registered as new candidates with MUTATED_FROM lineage.",
  },
] as const;

export const WORKFLOW_STEPS = [
  { name: "Data", body: "Ingest OHLCV, engineer 15+ indicators with strict temporal isolation." },
  { name: "Regime", body: "Label every bar into six regimes via the four-model ensemble." },
  { name: "Strategy", body: "Author rules in a structured JSON DSL, or let the LLM assistant draft a hypothesis." },
  { name: "Validation", body: "Score robustness across five methods, per regime." },
  { name: "Memory", body: "Write every result — pass or fail — into the append-only record and the knowledge graph." },
  { name: "Evolution", body: "Breed the next generation from survivors; lineage is recorded automatically." },
] as const;

export const TARGET_USERS = [
  { name: "Hedge Funds", body: "Institutionalize alpha research so it survives PM and analyst turnover." },
  { name: "Proprietary Trading Firms", body: "Stop paying to rediscover the same blown-up strategies across desks." },
  { name: "Crypto Funds", body: "Regime-condition strategies for markets that change character overnight." },
  { name: "Asset Managers", body: "Auditable, regime-aware validation with a compliance-grade paper trail." },
] as const;

export const REGIMES = [
  { label: "Bull", color: "#16a34a" },
  { label: "Bear", color: "#dc2626" },
  { label: "High-Volatility", color: "#f59e0b" },
  { label: "Low-Volatility", color: "#0ea5e9" },
  { label: "Sideways", color: "#9333ea" },
  { label: "Crisis", color: "#ef4444" },
] as const;

export const GRAPH_NODES = [
  "Strategy",
  "Regime",
  "Performance",
  "Failure",
  "ResearchNote",
  "Researcher",
] as const;

export const GRAPH_EDGES = [
  { edge: "VALID_IN", from: "Strategy", to: "Regime", meaning: "Strategy has positive Sharpe in this regime" },
  { edge: "FAILED_IN", from: "Strategy", to: "Regime", meaning: "Strategy failed in this regime" },
  { edge: "MUTATED_FROM", from: "Strategy", to: "Strategy", meaning: "Genetic-algorithm offspring of a parent" },
  { edge: "ADAPTED_FROM", from: "Strategy", to: "Strategy", meaning: "Human- or LLM-derived from a parent" },
  { edge: "INSPIRED_BY", from: "Strategy", to: "ResearchNote", meaning: "Strategy originated from a research note" },
  { edge: "EVALUATED_BY", from: "Strategy", to: "Performance", meaning: "Regime-partitioned performance snapshot" },
  { edge: "CAUSED_BY", from: "Failure", to: "Performance", meaning: "The performance state at the moment of failure" },
  { edge: "AUTHORED_BY", from: "ResearchNote", to: "Researcher", meaning: "Who wrote the note" },
] as const;

export const TECH_STACK = [
  { layer: "API", tech: "FastAPI (async)", why: "Type-safe, OpenAPI-native, fast" },
  { layer: "Relational + time-series", tech: "PostgreSQL 15 + TimescaleDB", why: "One database for relational truth and hypertable time-series" },
  { layer: "Knowledge graph", tech: "Neo4j 5", why: "Native graph traversal for lineage and failure patterns" },
  { layer: "Cache / queue", tech: "Redis 7", why: "Rate limiting, caching, Celery broker" },
  { layer: "Background jobs", tech: "Celery", why: "Regime runs, GA evolution, validation suites" },
  { layer: "ORM / migrations", tech: "SQLAlchemy 2 (async) + Alembic", why: "Async ORM with structural tenant enforcement" },
  { layer: "Frontend", tech: "Next.js 14 + TypeScript", why: "Server components, strict typing" },
  { layer: "UI", tech: "Tailwind + shadcn/ui", why: "Accessible, production-grade components" },
  { layer: "Charts", tech: "Recharts · D3 · Cytoscape.js", why: "Standard charts, regime timeline, graph viewer" },
  { layer: "Observability", tech: "Prometheus · Grafana · Sentry · structlog", why: "Metrics, dashboards, error tracking, structured logs" },
] as const;

export type PricingTier = {
  id: "starter" | "pro" | "enterprise";
  name: string;
  monthly: number | null; // null = contact sales
  annualMonthly: number | null;
  blurb: string;
  features: string[];
  cta: string;
  highlight?: boolean;
};

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "starter",
    name: "Starter",
    monthly: 49,
    annualMonthly: 39,
    blurb: "For individual researchers and small teams getting their memory layer started.",
    features: [
      "Up to 25 active strategies",
      "Full six-regime detection & regime-aware backtesting",
      "Five-method validation with the robustness gate",
      "Failure intelligence & the knowledge graph",
      "1 organization, up to 3 users",
      "Community support",
    ],
    cta: "Start on Starter",
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 199,
    annualMonthly: 159,
    blurb: "For active quant teams running a growing strategy library and the evolution engine.",
    features: [
      "Unlimited active strategies",
      "Everything in Starter, plus:",
      "The Evolution Engine (genetic algorithm)",
      "The LLM research assistant (bring your own API key)",
      "Priority background-job queue",
      "Up to 15 users, API keys for programmatic access",
      "Email support",
    ],
    cta: "Upgrade to Pro",
    highlight: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthly: null,
    annualMonthly: null,
    blurb: "For institutions with compliance, scale, and deployment requirements.",
    features: [
      "Everything in Pro, plus:",
      "Unlimited users & organizations",
      "SSO / SAML, role-based governance, full audit export",
      "On-premise or VPC deployment",
      "Dedicated support & onboarding, SLA",
      "5× rate limits and dedicated infrastructure",
    ],
    cta: "Talk to sales",
  },
];

export const COMPARISON_ROWS = [
  { capability: "Active strategies", starter: "25", pro: "Unlimited", enterprise: "Unlimited" },
  { capability: "Six-regime detection", starter: true, pro: true, enterprise: true },
  { capability: "Regime-aware backtesting", starter: true, pro: true, enterprise: true },
  { capability: "Five-method validation", starter: true, pro: true, enterprise: true },
  { capability: "Failure intelligence", starter: true, pro: true, enterprise: true },
  { capability: "Knowledge graph & named queries", starter: true, pro: true, enterprise: true },
  { capability: "Evolution engine", starter: false, pro: true, enterprise: true },
  { capability: "LLM research assistant", starter: false, pro: true, enterprise: true },
  { capability: "Users", starter: "3", pro: "15", enterprise: "Unlimited" },
  { capability: "API access", starter: false, pro: true, enterprise: true },
  { capability: "SSO / SAML", starter: false, pro: false, enterprise: true },
  { capability: "Audit export & governance", starter: "Basic", pro: "Standard", enterprise: "Full" },
  { capability: "Deployment", starter: "Cloud", pro: "Cloud", enterprise: "Cloud / on-prem / VPC" },
  { capability: "Rate limits", starter: "1×", pro: "1×", enterprise: "5×" },
  { capability: "Support", starter: "Community", pro: "Email", enterprise: "Dedicated + SLA" },
] as const;

export const PRICING_FAQ = [
  {
    q: "What counts as an “active” strategy?",
    a: "Any strategy not in the retired state. Retiring a strategy frees a slot; its history stays in your graph forever.",
  },
  {
    q: "Do failed strategies count against my limit?",
    a: "No. Failure records are permanent memory, not active strategies — they never count against your cap.",
  },
  {
    q: "Can I bring my own LLM key?",
    a: "Yes. The research assistant uses your own Anthropic API key, so you control model spend directly.",
  },
  {
    q: "What happens if I downgrade?",
    a: "Your data is never deleted. If you exceed the new plan's active-strategy limit, you simply can't create new ones until you retire some — nothing existing is touched.",
  },
] as const;
