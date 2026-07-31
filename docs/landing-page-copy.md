# Stellix Labs — Public Site Copy (Batch 15a)

> **Status: APPROVED (2026-07-10) — Batch 15b builds pixels around this copy verbatim.**
>
> This document is the single source of truth for all on-page copy across the 8
> public pages. Batch 15b builds pixels around **this copy verbatim** — copy
> drives layout, not the reverse. Do not paraphrase or regenerate any text here
> during the build step.
>
> **Grounding rule:** every mechanism sentence below is tied to a real artifact
> that exists in this codebase (a real regime bucket, a real validation method,
> a real Neo4j edge type, a real Cypher query). Nothing here is aspirational
> marketing. If a claim can't be traced to shipped code, it isn't in this doc.
> There are deliberately **no fabricated testimonials, customer logos, or
> metrics** — the proof is the product's real artifacts (schema, queries,
> mini-graph), per the Batch 15b design direction.

---

## 0. Strategy Foundation (the framework, applied)

### 0.1 The One Sentence

> **Stellix Labs is the only platform that remembers why your strategies failed — and gets smarter every time one does.**

Every word of the homepage serves this one claim. Anything that doesn't is cut.

### 0.2 The "Only Stellix Labs Could Say This" test

The homepage headline must be false for QuantConnect, Backtrader, Zipline, or a
homegrown notebook stack. Those tools **run** backtests and **discard** the ones
that fail. Stellix Labs is built on the opposite premise: the failed strategy is
the asset. Any headline a Backtrader user could nod along to is rejected and
rewritten.

- ❌ Rejected: "Backtest smarter. Trade with confidence." (any tool)
- ❌ Rejected: "AI-powered quantitative research platform." (any tool + hype)
- ✅ Accepted: "Your best research is the strategies that failed. We're the only platform that remembers them." (only true of a failure-memory-graph product)

### 0.3 The Villain (named concretely)

The enemy is **institutional amnesia** — a quant firm's research knowledge lives
in employees' heads and dies with their tenure. Named as a specific scenario,
not an abstraction:

> Your senior quant resigns on Friday. By Monday, two years of *"we already
> tried that — it blows up in high-volatility regimes"* has walked out the door.
> Your new hire spends her first quarter rediscovering the exact mean-reversion
> trap that researcher already mapped in 2023.

### 0.4 Proof of Mechanism — one falsifiable sentence per pillar

| Pillar | Mechanism sentence (real, falsifiable) |
|---|---|
| **Regime-Conditioning** | Every backtest is split into **six market regimes** — Bull, Bear, High-Volatility, Low-Volatility, Sideways, Crisis — by a **four-model ensemble** (a Gaussian HMM, PELT change-point detection, a Gaussian mixture, and a GARCH(1,1) volatility model voting by self-consistency) **before a single Sharpe ratio reaches your screen**, so a strategy that only worked because 2021 was a bull market is flagged as regime-fragile before it ever reaches your book. |
| **Failure-as-Asset** | When a strategy fails we don't archive it, we perform an autopsy: every failure is written to an **append-only, permission-locked table** (`UPDATE` and `DELETE` are *revoked at the PostgreSQL role level*, migration 0006) recording the exact regime it broke in, which of four triggers killed it, and a **SHAP attribution of the five features most responsible** — and that record is immutable and permanent. |
| **Compounding Memory** | Every strategy, failure, regime, and research note becomes a node in a **Neo4j knowledge graph** connected by **eight relationship types** (`VALID_IN`, `FAILED_IN`, `MUTATED_FROM`, `ADAPTED_FROM`, `CAUSED_BY`, `INSPIRED_BY`, `EVALUATED_BY`, `AUTHORED_BY`), so a question like *"what recurring failure mode do our momentum strategies share in Crisis regimes?"* is answered from years of your firm's accumulated research, not a fresh guess. |

### 0.5 Voice & tone

Institutional, precise, quietly contrarian. We write like a senior quant, not a
growth marketer. Concrete nouns and real numbers over adjectives. **Banned
words:** revolutionary, cutting-edge, seamless, powerful, game-changing,
next-generation, unlock, supercharge, "AI-driven" as a standalone claim.

### 0.6 Real artifacts inventory (for the "show, don't decorate" sections)

These real product artifacts are used *as* the visuals in Batch 15b, replacing
stock icons:

- **Strategy rule DSL** (real JSON, rendered as a monospace block):
  ```json
  {"operator": "AND",
   "conditions": [
     {"indicator": "rsi_14", "comparator": "<", "value": 30},
     {"indicator": "close", "comparator": "crosses_above", "value_ref": "sma_50"}]}
  ```
- **A real named Cypher query** (`recurring_failure_modes`), rendered as a
  monospace block on the Architecture page.
- **The 6 node / 8 edge Neo4j schema**, rendered as an interactive diagram.
- **A regime timeline mini-chart** built from real sample regime labels.
- **The 5-method validation composite** shown as a real weighted breakdown.

---

## PAGE 01 — Landing (`/`)

**SEO title:** Stellix Labs — The Institutional Memory Layer for Quant Research
**Meta description:** The only quant research platform that records *why* every strategy failed, in which market regime, and compounds that memory so your team never rediscovers the same dead end twice.
**OG title:** Your failed strategies are your most valuable research. Stellix Labs remembers them.

### Navbar
Logo: **STELLIX LABS**
Links: Product · Features · Architecture · Use Cases · Pricing · Docs
Ghost button: **Log in**
Primary button: **Request a demo**

### Hero
**Eyebrow:** THE INSTITUTIONAL MEMORY LAYER FOR QUANTITATIVE RESEARCH

**H1:** Your best research is the strategies that failed.
We're the only platform that remembers them.

**Sub-headline:** Stellix Labs captures *why* a strategy broke, *in which of six
market regimes*, and feeds that knowledge into a living graph — so your team
compounds institutional memory instead of rediscovering the same dead ends every
time someone leaves.

**Primary CTA:** Request a demo
**Secondary CTA:** See how it works ↓

**Hero visual (build note):** the animated four-layer architecture diagram —
Data → Intelligence → Memory → Application — with cyan data-flow lines pulsing
along the paths. This *is* the hero. No gradient blob.

### Villain / Problem section
**Section eyebrow:** THE PROBLEM
**Section headline:** Every quant firm is quietly deleting its most valuable research.
**Section intro:** Backtesting tools are built to find what works. None of them
are built to remember what doesn't — so the hardest-won knowledge in your firm,
the map of what *fails* and *when*, evaporates on a rolling basis.

**Problem card 1 — The knowledge walks out the door**
Your senior quant resigns Friday. Monday, two years of *"we tried that — it
blows up in high-vol"* is gone. Your new hire spends Q1 rediscovering the exact
mean-reversion trap that researcher already mapped in 2023.

**Problem card 2 — The backtest that lied**
A strategy posts a 2.1 Sharpe and goes to your book. It only ever traded through
2021's bull run. Nobody split the result by regime, so nobody saw it had never
survived a single drawdown — until it did, live, with real capital.

**Problem card 3 — The same dead end, four times**
Four researchers, four years, independently build the same RSI-reversal system.
All four die the same way in the same regime. Nothing recorded the first three
failures, so the fourth was inevitable.

**Problem card 4 — Research with a half-life**
Every notebook cell, Slack thread, and *"huh, that's odd"* insight lives in
someone's head or a folder nobody opens. Your firm's actual research IP decays at
the speed of employee turnover.

### Solution section
**Section eyebrow:** THE STELLIX APPROACH
**Section headline:** Five systems that turn every strategy — especially the failures — into permanent, queryable knowledge.

1. **Regime Detection** — A four-model ensemble labels every bar of market data
   into one of six regimes, so nothing is ever measured context-free.
2. **Regime-Aware Validation** — A five-method gauntlet scores robustness *per
   regime* and gates weak strategies before they reach production.
3. **Failure Intelligence** — Every failure gets a SHAP autopsy and an
   immutable, append-only record: the regime, the trigger, the responsible
   features.
4. **The Knowledge Graph** — Strategies, failures, regimes, and research notes
   become a connected Neo4j graph you can actually query.
5. **The Evolution Engine** — A genetic algorithm breeds new strategies from
   your survivors, with full parent-to-child lineage recorded in the graph.

### Feature cards (6)
**Section eyebrow:** THE PLATFORM
**Section headline:** Built for the full research lifecycle — not just the backtest.

1. **Regime Detection**
   HMM + PELT + GMM + GARCH ensemble, self-consistency-weighted, with a
   fast-triggering Crisis override. Six regimes, four independent votes, one
   confidence score per bar.

2. **Regime-Aware Backtesting**
   Vectorized simulation (vectorbt) that reports Sharpe, Sortino, and Beta
   *split by regime* — plus per-trade records — so a single blended number can
   never hide a regime-fragile strategy.

3. **Five-Method Validation**
   Walk-Forward, Regime Cross-Validation, Monte-Carlo, Persistence, and Stress
   Test combine into one robustness score. Below 0.70, a strategy can't be
   promoted to active. Full stop.

4. **Failure Intelligence**
   Four detection triggers — drawdown breach, Sharpe decline, regime mismatch,
   manual — each producing an immutable failure record with SHAP feature
   attribution and full market context.

5. **The Knowledge Graph**
   Six node types, eight edge types, five named institutional-memory queries.
   *"Which hypotheses actually became live strategies?"* is one graph traversal
   away.

6. **The Evolution Engine**
   A DEAP genetic algorithm with adaptive-sigma mutation and elitism. Every
   individual is backtested every generation; survivors are registered as new
   candidates with `MUTATED_FROM` lineage.

### Interactive workflow section
**Section eyebrow:** HOW IT COMPOUNDS
**Section headline:** One loop that gets smarter every time it turns.
**Section intro:** Data flows in, gets regime-labeled, becomes a strategy, is
validated per regime, and — win *or lose* — is written to memory. That memory
then seeds the next generation. Each failure makes the loop smarter.

**Animated flow (build note — animate connecting lines on scroll-into-view):**
`Data → Regime → Strategy → Validation → Memory → Evolution ↺`

- **Data** — Ingest OHLCV, engineer 15+ indicators with strict temporal isolation.
- **Regime** — Label every bar into six regimes via the four-model ensemble.
- **Strategy** — Author rules in a structured JSON DSL, or let the LLM assistant draft a hypothesis.
- **Validation** — Score robustness across five methods, per regime.
- **Memory** — Write every result — pass or fail — into the append-only record and the knowledge graph.
- **Evolution** — Breed the next generation from survivors; lineage is recorded automatically.

### Target-user cards (4)
**Section eyebrow:** WHO IT'S FOR
**Section headline:** For teams whose edge is research, and whose risk is forgetting.

- **Hedge Funds** — Institutionalize alpha research so it survives PM and analyst turnover.
- **Proprietary Trading Firms** — Stop paying to rediscover the same blown-up strategies across desks.
- **Crypto Funds** — Regime-condition strategies for markets that change character overnight.
- **Asset Managers** — Auditable, regime-aware validation with a compliance-grade paper trail.

### Closing CTA band
**Headline:** See what your firm already knows — and has been forgetting.
**Sub-line:** A 30-minute walkthrough on your own research questions. No slides that could describe any other tool.
**Primary CTA:** Request a demo
**Secondary CTA:** Read the architecture →

### Footer
**Tagline line:** Regime-conditioned. Failure-aware. Compounding over time.
- **Product:** Overview · Features · Architecture · Pricing
- **Developers:** Documentation · API Reference · Knowledge Graph Schema
- **Company:** Use Cases · Request a Demo · Contact
- **Legal:** Privacy Policy · Terms of Service
**Copyright:** © 2026 Stellix Labs. The institutional memory layer for quantitative research.

---

## PAGE 02 — Product Overview (`/product`)

**SEO title:** How Stellix Labs Works — The Four-Layer Research Architecture
**Meta description:** A four-layer system — Data, Intelligence, Memory, Application — that turns raw market data into permanent, regime-conditioned, queryable research knowledge.

### Hero
**Eyebrow:** PRODUCT OVERVIEW
**H1:** Four layers. One compounding research loop.
**Sub-headline:** Stellix Labs is not a backtester with extra features bolted on.
It's a four-layer system designed from the first migration so that every result —
especially every failure — becomes durable institutional memory.

### Interactive architecture diagram
**Build note:** interactive SVG; hovering a layer highlights its services and dims the rest.
**Section headline:** Hover any layer to see what's inside.

- **Layer 1 — Data & Feature Engineering.** OHLCV ingestion behind a pluggable
  provider interface, 15+ engineered indicators (RSI, MACD, ATR, Bollinger,
  realized vol, autocorrelation), with *inviolable temporal isolation* — every
  feature at time *T* uses only data at *T* and earlier, asserted by a dedicated
  look-ahead test.
- **Layer 2 — The Intelligence Layer.** Regime detection, regime-aware
  backtesting, five-method validation, failure intelligence, the evolution
  engine, and the LLM research assistant.
- **Layer 3 — The Memory Layer.** PostgreSQL + TimescaleDB for time-series and
  relational truth, and a Neo4j knowledge graph for the relationships between
  every research artifact.
- **Layer 4 — The Application Layer.** A multi-tenant FastAPI backend and a
  Next.js dashboard — regime monitor, backtest viewer, failure heatmap,
  knowledge-graph explorer, governance panel.

### System layer cards (4)
Same four layers as above, restated as scannable cards with a one-line "why it
matters" each:
1. **Data** — *Garbage regimes in, garbage strategies out.* Clean, temporally honest features are the foundation everything else stands on.
2. **Intelligence** — *Where research actually happens.* Six services that never look at performance without a regime attached.
3. **Memory** — *The part every other tool skips.* Two databases, one purpose: nothing valuable is ever forgotten.
4. **Application** — *Multi-tenant from migration zero.* Every row is scoped to an organization; a query with no tenant bound fails closed rather than leaking.

### 10-step workflow timeline
**Section eyebrow:** THE RESEARCH LIFECYCLE
**Section headline:** From raw ticks to an evolved, regime-validated strategy — the full path.

1. **Ingest** — Pull OHLCV for a symbol and window through a pluggable data provider.
2. **Engineer** — Compute 15+ trailing indicators with strict no-look-ahead guarantees.
3. **Detect regimes** — Label every bar into one of six regimes via the four-model ensemble.
4. **Author** — Write a strategy in the JSON rule DSL, or draft a hypothesis with the LLM assistant.
5. **Backtest** — Simulate per regime; get Sharpe/Sortino/Beta split by market context.
6. **Validate** — Run the five-method gauntlet; produce a single robustness score.
7. **Gate** — Promote to *active* only above 0.70 robustness; everything else stays a candidate.
8. **Monitor** — Watch live strategies for drawdown breach, Sharpe decline, and regime mismatch.
9. **Record failure** — On any trigger, write an immutable SHAP-attributed autopsy to the graph.
10. **Evolve** — Seed a genetic algorithm from survivors; register the fittest offspring with recorded lineage.

### Tech stack strip
**Section headline:** Built on a locked, boring-on-purpose stack.
FastAPI · PostgreSQL 15 + TimescaleDB · Neo4j 5 · Redis 7 · Celery · SQLAlchemy 2 (async) · Next.js 14 · TypeScript · Tailwind + shadcn/ui · Recharts · D3 · Cytoscape.js

---

## PAGE 03 — Features (`/features`)

**SEO title:** Features — Regime Detection, Failure Intelligence, Knowledge Graph & More
**Meta description:** Seven core modules, each shown with a real product artifact — a live regime timeline, a real failure record, an actual knowledge-graph traversal. No decorative icons.

### Hero
**Eyebrow:** FEATURES
**H1:** Seven modules. Zero decorative screenshots.
**Sub-headline:** Every feature below is shown with a real artifact from the
running product — a real regime timeline, a real validation breakdown, a real
graph traversal. If we show it, it's live.

### Module 1 — Regime Detection
**Tagline:** Nothing is ever measured context-free.
**Body:** Four independent models — a Gaussian HMM (`hmmlearn`), PELT
change-point detection (`ruptures`), a Gaussian mixture (`scikit-learn`), and a
GARCH(1,1) volatility model (`arch`) — each vote on the current regime. A
self-consistency-weighted majority produces the label, with a fast-triggering
Crisis override when conditional volatility spikes past an extreme percentile.
Every bar carries a regime label *and* a confidence score.
**Real mini-viz:** a live 12-month regime timeline colored by the six regimes.

### Module 2 — Regime-Aware Backtesting
**Tagline:** One blended Sharpe number is where strategies go to hide.
**Body:** Vectorized simulation via `vectorbt` reports Sharpe, Sortino, and Beta
*partitioned by regime*, alongside a full per-trade record. A strategy with a
strong overall number but a negative Crisis-regime Sharpe is visibly, immediately
regime-fragile — no spreadsheet archaeology required.
**Real mini-viz:** a per-regime metric table (Bull/Bear/Crisis columns).

### Module 3 — Five-Method Validation
**Tagline:** A robustness score you can't argue with, because it's five tests, not one.
**Body:** Walk-Forward (30%), Regime Cross-Validation (30%), Monte-Carlo (20%),
Persistence (10%), and Stress Test (10%) combine into a single composite
robustness score. Below 0.50 is an automatic fail; 0.50–0.70 stays a candidate;
above 0.70 is eligible for promotion to active. The gate is enforced in code, not
by convention.
**Real mini-viz:** the weighted five-bar composite breakdown.

### Module 4 — Failure Intelligence
**Tagline:** The feature no other platform ships.
**Body:** When a strategy fails, four triggers can catch it — drawdown breach,
Sharpe decline, regime mismatch, or a manual flag. Each writes an immutable
record: the regime it failed in, the performance metrics at failure, the full
market context, and a SHAP attribution of the five features most responsible for
the breakdown. The table is append-only; `UPDATE` and `DELETE` are revoked at the
database role level.
**Real mini-viz:** a real failure record card + a strategy-×-regime failure heatmap.

### Module 5 — The Knowledge Graph
**Tagline:** Your firm's research, finally connected.
**Body:** Six node types (Strategy, Regime, Performance, Failure, ResearchNote,
Researcher) and eight edge types turn scattered research into a traversable
Neo4j graph. Five named queries ship out of the box:
`failed_strategies_by_regime`, `lineage`, `robust_across_regimes`,
`recurring_failure_modes`, and `hypotheses_leading_to_active`. Every query is
tenant-scoped and fails closed if it forgets to filter by organization.
**Real mini-viz:** a small live Cytoscape.js graph of strategies, failures, and regimes.

### Module 6 — The Evolution Engine
**Tagline:** Breed new strategies from the ones that survived.
**Body:** A DEAP genetic algorithm with tournament selection, adaptive-sigma
mutation (the mutation step shrinks as the population converges), and elitism.
Every individual is backtested every generation through the regime-aware engine,
and the fittest final-generation survivors are registered as new candidate
strategies — each with a `MUTATED_FROM` edge back to its parent, so lineage is
never lost.
**Real mini-viz:** a fitness-over-generations line chart from a real run.

### Module 7 — The LLM Research Assistant
**Tagline:** An AI collaborator with five hard safeguards and zero execution authority.
**Body:** Claude drafts hypotheses, explains failures, and critiques strategies
through forced structured tool-use — never free text scraped with regex. Five
enforced safeguards: a price-forecast guard rejects forecasting prompts *before*
the model is called; the assistant is statically proven to have zero ability to
mutate a strategy; LLM-generated strategies are flagged for mandatory human
review; every call is logged before it returns; and every numeric claim is
cross-checked against the real record and badged if it doesn't match.
**Real mini-viz:** an audit-log row showing prompt, response, and the numeric-validation badge.

---

## PAGE 04 — Architecture (`/architecture`)

**SEO title:** Architecture — Multi-Tenant, Fail-Closed, Graph-Backed by Design
**Meta description:** The full technical architecture: a fail-closed multi-tenancy model, a Neo4j knowledge-graph schema of 6 nodes and 8 edges, and a locked, async, boring-on-purpose stack.

### Hero
**Eyebrow:** ARCHITECTURE
**H1:** For the evaluator who reads the schema before the pitch.
**Sub-headline:** No hand-waving. This page shows the real multi-tenancy model,
the real graph schema, and the real stack — the technical assets that are hardest
for a competitor to copy, shown rather than hidden.

### Interactive layer diagram
**Build note:** the four-layer diagram again, this time with layer-filter buttons
(Data / Intelligence / Memory / Application) that isolate each layer's services.

### Multi-tenancy section
**Section headline:** Multi-tenant from the first migration — and fail-closed.
**Body:** Every table that holds client data carries an `organization_id` from
migration one. A SQLAlchemy loader-criteria listener injects the tenant filter
into *every* ORM query automatically; a query against tenant data with no
organization bound doesn't silently return everything — it raises. Neo4j has no
row-level security, so every single Cypher query filters by `$organization_id`
through a helper that *refuses to run* a query that doesn't reference it. Tenant
isolation is structural, not a convention someone has to remember.

### Knowledge-graph schema reference
**Section headline:** The graph schema — 6 nodes, 8 edges.
**Build note:** render the real schema as an interactive node/edge diagram.

**Nodes:** `Strategy` · `Regime` · `Performance` · `Failure` · `ResearchNote` · `Researcher`

**Edges:**
| Edge | From → To | Meaning |
|---|---|---|
| `VALID_IN` | Strategy → Regime | Strategy has positive Sharpe in this regime |
| `FAILED_IN` | Strategy → Regime | Strategy failed in this regime |
| `MUTATED_FROM` | Strategy → Strategy | Genetic-algorithm offspring of a parent |
| `ADAPTED_FROM` | Strategy → Strategy | Human- or LLM-derived from a parent |
| `INSPIRED_BY` | Strategy → ResearchNote | Strategy originated from a research note |
| `EVALUATED_BY` | Strategy → Performance | Regime-partitioned performance snapshot |
| `CAUSED_BY` | Failure → Performance | The performance state at the moment of failure |
| `AUTHORED_BY` | ResearchNote → Researcher | Who wrote the note |

**Real query block (rendered as monospace):**
```cypher
// recurring_failure_modes — failure patterns shared across strategies
MATCH (s:Strategy)-[:FAILED_IN]->(r:Regime)
WHERE s.organization_id = $organization_id
MATCH (f:Failure {organization_id: $organization_id})-[:CAUSED_BY]->(p:Performance)
RETURN r.regime_label, f.trigger_condition, count(*) AS occurrences
ORDER BY occurrences DESC
```

### Strategy DSL section
**Section headline:** Strategies are structured data, not opaque code.
**Body:** A strategy's entry and exit logic is a strict, machine-evaluable *and*
machine-generatable JSON tree — which is exactly why the genetic algorithm can
evolve it and the LLM can draft it. The `crosses_above` / `crosses_below`
comparators are genuine two-bar windows, not single-row approximations.
```json
{"operator": "AND",
 "conditions": [
   {"indicator": "rsi_14", "comparator": "<", "value": 30},
   {"indicator": "close", "comparator": "crosses_above", "value_ref": "sma_50"}]}
```

### Full tech stack table
**Section headline:** The locked stack.
| Layer | Technology | Why |
|---|---|---|
| API | FastAPI (async) | Type-safe, OpenAPI-native, fast |
| Relational + time-series | PostgreSQL 15 + TimescaleDB | One database for relational truth and hypertable time-series |
| Knowledge graph | Neo4j 5 | Native graph traversal for lineage and failure patterns |
| Cache / queue | Redis 7 | Rate limiting, caching, Celery broker |
| Background jobs | Celery | Regime runs, GA evolution, validation suites |
| ORM / migrations | SQLAlchemy 2 (async) + Alembic | Async ORM with structural tenant enforcement |
| Frontend | Next.js 14 (App Router) + TypeScript | Server components, strict typing |
| UI | Tailwind + shadcn/ui | Accessible, production-grade components |
| Charts | Recharts · D3 · Cytoscape.js | Standard charts, regime timeline, graph viewer |
| Observability | Prometheus · Grafana · Sentry · structlog | Metrics, dashboards, error tracking, structured logs |

---

## PAGE 05 — Use Cases (`/use-cases`)

**SEO title:** Use Cases — Hedge Funds, Prop Firms, Crypto, Banks, Asset Managers
**Meta description:** Five segments, five concrete scenarios where institutional memory and regime-conditioning change the outcome — not a restatement of the feature list.

### Hero
**Eyebrow:** USE CASES
**H1:** Different firms. The same forgetting problem.
**Sub-headline:** Whether your edge is speed, breadth, or discretion, it decays
the same way — through amnesia. Here's what changes when it doesn't.

### Segment 1 — Hedge Funds
**One-liner:** Institutionalize alpha so it survives the org chart.
**Scenario:** A PM leaves and takes their book's intuition with them. With Stellix
Labs, that intuition was already externalized: every strategy the PM built, every
regime it thrived and failed in, and every research note behind it are nodes in a
graph the next PM can query on day one — *"show me every hypothesis that led to a
live strategy in this book."*
**Fits because:** knowledge graph + failure intelligence + research notebook.

### Segment 2 — Proprietary Trading Firms
**One-liner:** Stop paying twice for the same dead end.
**Scenario:** Desk A blows up a momentum strategy in a high-vol regime in March.
Desk B, not knowing, ships a near-identical one in June. `recurring_failure_modes`
would have surfaced the pattern the moment Desk B's strategy touched the graph —
turning a repeated loss into a one-time lesson shared across every desk.
**Fits because:** cross-desk failure graph + regime-mismatch detection.

### Segment 3 — Crypto Funds
**One-liner:** For markets that change character overnight.
**Scenario:** A strategy that prints in a low-volatility grind quietly becomes a
liability the instant the market flips to Crisis. Because every backtest and every
live strategy is regime-conditioned, a regime transition triggers a mismatch alert
*before* the drawdown — not in the post-mortem.
**Fits because:** six-regime detection + regime-mismatch trigger + live monitoring.

### Segment 4 — Investment Banks
**One-liner:** Regime-aware research with a compliance-grade paper trail.
**Scenario:** A model desk needs to prove *why* a strategy was approved, who
approved it, and what validation it passed. Every promotion is gated on a
five-method robustness score, every state change is written to an append-only
audit log, and the whole record exports to a compliance PDF on demand.
**Fits because:** validation gate + audit log + compliance export + kill switch.

### Segment 5 — Asset Managers
**One-liner:** Auditable validation your risk committee will actually trust.
**Scenario:** Instead of a single Sharpe ratio in a slide, your committee sees a
strategy's performance across all six regimes, its five validation sub-scores, and
its complete failure history if it has one — the difference between "trust me" and
"here's the evidence."
**Fits because:** regime-partitioned reporting + validation breakdown + failure records.

### Closing band
**Headline:** Your segment isn't listed? The forgetting problem is universal.
**CTA:** Request a demo on your own research questions.

---

## PAGE 06 — Pricing (`/pricing`)

**SEO title:** Pricing — Starter, Pro, and Enterprise Plans
**Meta description:** Transparent plans for solo researchers to institutional teams. Start on Starter, scale to Pro, or talk to us about Enterprise.

### Hero
**Eyebrow:** PRICING
**H1:** Priced for the research, not the seat count.
**Sub-headline:** Start small, scale when your strategy library does. Every plan
includes the full research loop — regime detection, validation, failure
intelligence, and the knowledge graph.

**Billing toggle:** Monthly · Annual *(save 20%)*
**Build note:** the toggle recalculates prices live — it is not a static mockup.

### Tier cards (3)

**Starter — $49/mo** *(or $39/mo billed annually)*
For individual researchers and small teams getting their memory layer started.
- Up to **25 active strategies**
- Full six-regime detection & regime-aware backtesting
- Five-method validation with the robustness gate
- Failure intelligence & the knowledge graph
- 1 organization, up to 3 users
- Community support
**CTA:** Start on Starter → *(wires to real Stripe Checkout)*

**Pro — $199/mo** *(or $159/mo billed annually)* — **Most popular**
For active quant teams running a growing strategy library and the evolution engine.
- **Unlimited active strategies**
- Everything in Starter, plus:
- The Evolution Engine (genetic algorithm)
- The LLM research assistant (bring your own API key)
- Priority background-job queue
- Up to 15 users, API keys for programmatic access
- Email support
**CTA:** Upgrade to Pro → *(wires to real Stripe Checkout)*

**Enterprise — Contact Sales**
For institutions with compliance, scale, and deployment requirements.
- Everything in Pro, plus:
- Unlimited users & organizations
- SSO / SAML, role-based governance, full audit export
- On-premise or VPC deployment
- Dedicated support & onboarding, SLA
- **5× rate limits** and dedicated infrastructure
**CTA:** Talk to sales → *(routes to the contact form, no self-serve checkout)*

### Feature comparison table
**Section headline:** Compare every plan.
| Capability | Starter | Pro | Enterprise |
|---|---|---|---|
| Active strategies | 25 | Unlimited | Unlimited |
| Six-regime detection | ✓ | ✓ | ✓ |
| Regime-aware backtesting | ✓ | ✓ | ✓ |
| Five-method validation | ✓ | ✓ | ✓ |
| Failure intelligence | ✓ | ✓ | ✓ |
| Knowledge graph & named queries | ✓ | ✓ | ✓ |
| Evolution engine | — | ✓ | ✓ |
| LLM research assistant | — | ✓ | ✓ |
| Users | 3 | 15 | Unlimited |
| API access | — | ✓ | ✓ |
| SSO / SAML | — | — | ✓ |
| Audit export & governance | Basic | Standard | Full |
| Deployment | Cloud | Cloud | Cloud / on-prem / VPC |
| Rate limits | 1× | 1× | 5× |
| Support | Community | Email | Dedicated + SLA |

### Pricing FAQ
- **What counts as an "active" strategy?** Any strategy not in the *retired*
  state. Retiring a strategy frees a slot; its history stays in your graph
  forever.
- **Do failed strategies count against my limit?** No. Failure records are
  permanent memory, not active strategies — they never count against your cap.
- **Can I bring my own LLM key?** Yes. The research assistant uses your own
  Anthropic API key, so you control model spend directly.
- **What happens if I downgrade?** Your data is never deleted. If you exceed the
  new plan's active-strategy limit, you simply can't create new ones until you
  retire some — nothing existing is touched.

---

## PAGE 07 — Documentation (`/docs`)

**SEO title:** Documentation — Stellix Labs API & Concepts
**Meta description:** API reference generated from the live OpenAPI schema, plus conceptual guides to regime detection, the strategy DSL, and the knowledge graph.

### Layout
Sticky left sidebar navigation · client-side full-text search over doc content ·
MDX content with syntax-highlighted code blocks. The API reference is rendered
from the **live `/openapi.json`** so it can never drift from the real API.

### Sidebar sections
- **Getting Started**
  - Introduction
  - Authentication (JWT + API keys)
  - Your first backtest
- **Core Concepts**
  - Regime Detection
  - The Strategy DSL
  - The Validation Gate
  - Failure Intelligence
  - The Knowledge Graph
- **API Reference** *(generated from OpenAPI)*
  - Auth · Data · Regimes · Strategies · Failures · Evolution · Graph · LLM · Billing
- **Guides**
  - Reading a regime-partitioned backtest
  - Querying your knowledge graph
  - Running the evolution engine

### Conceptual guide — Introduction (full copy)
Stellix Labs is organized around a single idea: **no performance number means
anything without a regime attached, and no result is worth keeping unless it's
remembered — including the failures.** This documentation covers both the *why*
(core concepts) and the *how* (a live API reference generated from the running
service). If you're evaluating the platform, start with **Regime Detection** and
**The Knowledge Graph** — they're what make Stellix Labs different from a
backtester.

### Conceptual guide — Regime Detection (full copy)
Every bar of market data is assigned one of six regimes — **Bull, Bear,
High-Volatility, Low-Volatility, Sideways, Crisis** — by an ensemble of four
independent models:
- **HMM** (Gaussian hidden Markov model) captures persistent regime states and
  transition probabilities.
- **PELT** change-point detection finds structural breaks in the series.
- **GMM** (Gaussian mixture) clusters bars by their statistical fingerprint.
- **GARCH(1,1)** models conditional volatility and drives the Crisis override.

The four votes are combined by a self-consistency-weighted majority, so a model
that has been unreliable recently counts for less. A Crisis override fires
immediately when GARCH conditional volatility crosses an extreme percentile,
because in a crisis you can't wait for a majority to agree. Each bar's label
carries a **confidence score** equal to the fraction of models that agreed with
the final call.

### Conceptual guide — The Strategy DSL (full copy)
A strategy's logic is a strict JSON tree, not code. Each leaf is a condition —
`{indicator, comparator, value}` (or `value_ref` to compare two indicator
series) — combined with `AND` / `OR` operators that may nest arbitrarily.
```json
{"operator": "AND",
 "conditions": [
   {"indicator": "rsi_14", "comparator": "<", "value": 30},
   {"indicator": "close", "comparator": "crosses_above", "value_ref": "sma_50"}]}
```
Comparators include the standard `< <= > >= == !=` plus two genuine two-bar
window operators, `crosses_above` and `crosses_below`. Because the DSL is
structured data, the *same* strategy representation can be authored by a human,
drafted by the LLM assistant, and evolved by the genetic algorithm — no
translation layer required.

### Conceptual guide — The Knowledge Graph (full copy)
Your research is stored twice: as rows in PostgreSQL (the source of truth) and as
a connected graph in Neo4j (the memory). Six node types and eight edge types let
you ask questions no relational query expresses cleanly — *"trace the full
lineage of this evolved strategy back to the research note that inspired its
ancestor,"* or *"which regimes cause recurring failures across all my momentum
strategies."* Five named queries ship ready to use, and every one is tenant-scoped
at the query-builder level so it's structurally impossible to read another
organization's graph.

### API reference (build note)
Rendered from the live OpenAPI schema at `/openapi.json`, grouped by tag, with
try-it request/response examples. Never hand-written — always in sync with the
deployed API.

---

## PAGE 08 — Contact / Request a Demo (`/contact`)

**SEO title:** Request a Demo — Stellix Labs
**Meta description:** See Stellix Labs on your own research questions. A 30-minute walkthrough, not a generic slide deck.

### Hero
**Eyebrow:** REQUEST A DEMO
**H1:** Bring your hardest research question. We'll answer it live.
**Sub-headline:** Tell us a strategy that failed and you never fully understood.
We'll show you what the platform would have recorded — the regime, the trigger,
the responsible features — and how your team would never hit it blind again.

### Form (12 fields, exact spec)
1. **First name** — text, required. *Placeholder: Jane*
2. **Last name** — text, required. *Placeholder: Okafor*
3. **Work email** — email, required, must be a work domain. *Placeholder: jane@yourfirm.com*
4. **Company** — text, required. *Placeholder: Your firm*
5. **Job title** — text, required. *Placeholder: Head of Quant Research*
6. **Firm type** — select, required. *Options: Hedge Fund · Prop Trading Firm · Crypto Fund · Investment Bank · Asset Manager · Family Office · Academic / Other*
7. **Team size** — select, required. *Options: 1–5 · 6–20 · 21–50 · 51–200 · 200+*
8. **Use case description** — textarea, required, **20–500 characters with a live counter**. *Placeholder: What research problem are you trying to solve? What's failed before?*
9. **Primary interest** — multi-checkbox, at least one required. *Options: Regime Detection · Failure Intelligence · Knowledge Graph · Evolution Engine · Validation & Governance · The full platform*
10. **How did you hear about us?** — select, optional. *Options: Referral · Search · Social · Conference / Event · Other*
11. **Privacy consent** — checkbox, **required**. *Label: I agree to the Privacy Policy and to Stellix Labs contacting me about this request.*
12. *(Honeypot / anti-spam field — hidden, not counted as a user-facing field.)*

**Submit button:** Request my demo

### Validation copy
- Email must be a valid work address — free webmail domains prompt: *"Please use your work email so we can route your request to the right team."*
- Use-case counter states: *"{n}/500 — minimum 20 characters."*
- Consent unchecked on submit: *"Please accept the Privacy Policy to continue."*

### Success state
**Headline:** Request received. Check your inbox.
**Body:** We've logged your request and pinged our team in real time — a real
person will reach out within one business day to schedule your walkthrough. In
the meantime, the architecture page is the fastest way to see what makes Stellix
Labs different.
**Secondary CTA:** Read the architecture →

### On submit (build note)
Persist a `DemoRequest` lead record in PostgreSQL **and** fire a real-time
notification to the team (reusing the Batch 13 alerting webhook), so new leads
are seen the moment they arrive — not discovered later in a table nobody checks.

### Alternative contact
**Not ready for a demo?** Email us at **hello@stellixlabs.com**, or read the
[documentation](/docs) first.

---

## Appendix A — Copy compliance checklist (15a Definition of Done)

- [x] `/docs/landing-page-copy.md` exists with full real copy for all 8 pages.
- [x] Headline passes the "only Stellix Labs could say this" test (failure-memory framing a backtester cannot claim).
- [x] Villain section names a specific, real pain point concretely (the departing quant + institutional amnesia scenario, four scenario cards).
- [x] All 3 pillars have a real, falsifiable mechanism sentence (six regimes / four-model ensemble; append-only permission-locked SHAP autopsy; Neo4j graph with eight named edge types).
- [x] **User has reviewed and approved this copy before Batch 15b starts.** (Approved 2026-07-10.)

## Appendix B — Words we did not use

revolutionary · cutting-edge · seamless · powerful · game-changing ·
next-generation · unlock · supercharge · "AI-driven" (as a standalone claim) ·
best-in-class · robust (as marketing, distinct from the literal robustness score) ·
synergy · leverage (as a verb).
