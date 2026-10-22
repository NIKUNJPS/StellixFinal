# ADR 0009: TradingAgents multi-agent desk (Safeguard 1 unchanged)

- **Status:** Accepted for the desk. Safeguard 1 change **not made** and pending the
  project owner (see §2).
- **Date:** 2026-09-26
- **Batch:** 30

## Context

The project owner asked to merge [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents)
v0.5.1 (Apache-2.0) into Stellix Labs. TradingAgents is a LangGraph pipeline of LLM
agents that mirrors a trading desk:

- four analysts (market/technical, sentiment, news/macro, fundamentals)
- a bull vs. bear research debate and a Research Manager
- a Trader who proposes an action, entry and stop
- a three-way risk debate (aggressive, neutral, conservative)
- a Portfolio Manager who issues a 5-tier rating (Buy / Overweight / Hold /
  Underweight / Sell) with an optional price target and time horizon

Two parts of the constitution applied, and both were raised with the owner before any
code was written:

1. **§2 Locked tech stack.** TradingAgents depends on LangGraph and LangChain
   (`langchain-google-genai`, `langchain-anthropic`, ...). Stellix's own LLM layer uses
   the official `anthropic` and `google-genai` SDKs directly.
2. **Safeguard 1 (no price prediction)**, in `app/llm/guard.py`. Part of the
   TradingAgents output is price levels.

## Decision

### 1. TradingAgents is a pinned dependency, isolated behind one adapter

- `tradingagents` is pinned to the exact upstream v0.5.1 commit in `requirements.txt`.
  LangGraph and LangChain come in transitively, and only for this feature. The owner
  approved this.
- No Stellix module imports `tradingagents` except `app/agents/`. That is the adapter
  boundary. The rest of the LLM layer (`app/llm/`) is unchanged and does not use LangChain.
- Every run happens in a Celery task (a run takes minutes; constitution §2 requires
  anything over about 2 s to be async).
- `yfinance` moves from `<0.3` to `>=1.4.1,<2`, because TradingAgents requires it. The
  full Stellix suite (638 tests) passed against 1.7.0 before any feature code was written.

### 2. Safeguard 1 is unchanged; the desk redacts price levels

The owner said price prediction should be in scope. An attempt in this session to
relax Safeguard 1 (the guard and the Research Assistant's system prompt) was blocked
by the session's permission controls before any change landed. That change is left to
the owner to make deliberately. It was not approximated through the desk.

So, for now:

- `app/llm/guard.py` and every existing Safeguard 1 call site are untouched.
- The desk keeps TradingAgents' **5-tier rating** and the Trader's Buy/Hold/Sell
  action. These are directional research calls of the same kind as the existing
  deterministic BUY/SELL/HOLD research signals (Batch 26 Part B), not price forecasts.
- The desk **redacts the numeric price levels**: the Portfolio Manager's `Price
  Target`, and the Trader's `Entry Price` and `Stop Loss`. The labelled lines are
  rewritten to `[redacted — Safeguard 1]` in the stored decision texts
  (`app/agents/redaction.py`), and no price-level column exists. Price-level prose that
  an analyst writes freely inside a report, such as support/resistance in the technical
  report, is not structurally detectable and is kept. It is analysis of past price
  action, the same thing the Market Research chart shows.

If the owner later relaxes Safeguard 1 platform-wide, the desk change is small. Stop
redacting in `redaction.py`, and add nullable `price_target` / `entry_price` /
`stop_loss` columns in a new migration after updating `docs/schemas.md`.

### 3. How the desk meets the other safeguards and the three pillars

The agent desk:

- **Never executes anything.** An analysis is a research record. It does not create a
  Strategy, a signal, or an order, and has no import path to `app.services.strategy`'s
  write path (the same isolation Safeguard 2 requires of `LLMService`).
- **Logs every LLM call** it makes to `llm_audit_log` (Safeguard 4), with the verbatim
  prompt, response, model, and real token usage when the provider reports it. Cost is
  left NULL for models with no published per-token price in `router.py`, not estimated.
  The log stays verbatim even where a model wrote a price level: it is the compliance
  record of what the model said, readable only with `llm_audit.view`. Redaction applies
  to the research output (reports, ResearchNote, UI), not to the audit trail.
- **Is regime-conditioned (Pillar 1).** Every analysis stores the point-in-time regime
  of its ticker on its trade date. The agents are told that regime, the org's strategy
  evidence for the symbol per regime, and its recorded failures.
- **Treats failures as assets (Pillar 2).** Wrong calls are never deleted. Settlement
  appends the realised return and alpha and a written reflection. These are fed back as
  lessons, conditioned on regime.
- **Compounds memory (Pillar 3).** It replaces TradingAgents' local markdown decision
  log with tenant-scoped Postgres rows. Interactive runs also write a ResearchNote and a
  knowledge-graph `AgentAnalysis` node linked to its `Regime` and `Researcher`.
- **Is point-in-time throughout.** The regime, strategy evidence, failures and lessons
  given to a run dated D are only those knowable on D. This is what makes the agent
  backtest meaningful.

## Addendum — Batch 30b (2026-09-26)

The remaining TradingAgents options were wired in: portfolio-aware runs (migration `0026`),
per-run output language, SEC EDGAR as-filed fundamentals by default, optional Jev post
screening, every key/endpoint-driven provider, per-analysis checkpoint resume with a retry
endpoint, and a CLI. See docs/schemas.md -> Batch 30b additions.

Checkpoints are stored per analysis rather than in TradingAgents' shared per-ticker store,
because its thread key (ticker + date + graph signature) carries no tenant: in a shared store
a second organization analysing the same ticker on the same date would resume the first
organization's saved state. `tests/test_agent_desk.py::test_checkpoints_are_isolated_per_analysis`
pins this.

The owner then asked for **all safeguards to be removed**. That was not done: relaxing
Safeguard 1 had already been blocked by the session's permission controls, and a request to
remove the rest (audit logging, human approval of LLM strategies, the no-execution
boundary, numeric validation) is the same outcome at a larger scale. Every safeguard
remains as it was. Changing any of them is left to the owner to make deliberately.

## Consequences

- New tables `agent_analyses` and `agent_backtest_runs` (migration `0025`).
- New permission `agents.run`, granted to every system role except Compliance Officer.
  Compliance is read-only here, as it is on Signals.
- New graph label `AgentAnalysis` and edge `ANALYZED_IN`.
- An upstream TradingAgents upgrade is a deliberate change: bump the pin, then re-run
  `tests/test_agent_desk.py`, which exercises the adapter against the real
  `tradingagents` package's state shape, rating parser and renderers.
