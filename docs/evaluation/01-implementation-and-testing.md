# 01 - Implementation and testing evidence

> Covers checklist items **"Current source code or repository"** and **"Implementation and testing evidence"**.
> Status labels are deliberately strict: *implemented and tested* means code exists, runs end to end in this
> environment, and has passing automated tests; anything weaker is labelled as such.

## 1. Repository

| Item | Value |
|---|---|
| Location | `D:\Tauric\StellixLabsMain` (a git repository) |
| Branch / state | `feat/tradingagents-integration`; **the working tree has many uncommitted changes** (count recorded in `evidence/manifest.json`), so the exact evaluated code is the working tree, not a commit. Commit before sharing a link. |
| Backend | Python 3.11, FastAPI, async SQLAlchemy 2, Alembic (27 migrations), Pydantic v2, Celery + Redis, Postgres (TimescaleDB extension check in health) |
| Frontend | Next.js 15 / React 18 / Tailwind, 77 page routes |
| Docs | `docs/adr/0001-0011`, `docs/schemas.md`, `docs/PLATFORM_STATE.md`, this folder |
| Excluding secrets | `backend/.env` holds API keys and is **not** to be shared; `backend/.env.example` is the safe template. `scripts/seed_demo_data.py` contains demo-only passwords (documented as local-development credentials) that should be removed or rotated before any public release. |
| Sharing | A source ZIP that omits `.env`, `.venv`, `node_modules`, `.next`, caches and local data can be produced with the command in `docs/evaluation/README.md` section 5. |

## 2. Component status

| Component | Where | Status | Tests | Integration / notes |
|---|---|---|---|---|
| Regime detection (HMM, PELT, GMM, GARCH + ensemble) | `app/regime/` | **Implemented and tested** | 15 passed, 1 skipped (integration) | Wired: ingestion, then regime job (Celery), then `regime_labels`. Labels are full-history fits (not point-in-time). No accuracy benchmark against a labelled ground truth exists. |
| Feature engineering | `app/features/` | **Implemented and tested** | includes a look-ahead test (appending a future bar must not change earlier features) | 13 trailing features |
| Strategy DSL, backtest, lifecycle | `app/strategy/` | **Implemented and tested** | 71 passed (with DSL, signals, features) | vectorbt engine; fees 0.1%, no slippage; same-bar close fills |
| Validation (5 methods, composite) | `app/validation/` | **Implemented and tested** | 32 passed | Gate = 0.70 composite + human approval; seed uses a lowered bar for its own process only |
| Failure intelligence (triggers, SHAP, clustering, AI explanation) | `app/failure/`, `app/services/failure.py`, `llm_explain.py` | **Implemented and tested** | 28 passed, 1 skipped by default (the append-only DB test was run for this pack: passed) | Monitor sweep wired to Celery beat. A scoping bug (strategies judged on unrelated instruments) was found and fixed during this work, with a regression test. |
| Evolution (DEAP genetic algorithm) | `app/evolution/`, `app/services/evolution.py` | **Implemented and tested** | 21 passed | Known design gap (ADR 0007): fitness is evaluated in-sample and is gameable; a fix is proposed, not built |
| Research Memory | `app/graph/` | **Implemented and tested.** A tenant-scoped index derived from PostgreSQL inside the API, rebuilt on a schedule; the same implementation runs in tests and in production | Covered by the `test_graph_*` suites and `test_research_memory_index.py` | Neo4j retired (ADR 0012): no second database, no dual-write to drift |
| Multi-agent research desk | `app/agents/`, `app/services/agent_desk.py` | **Implemented; unit tests use mocked model calls**; real runs exist (9 stored analyses) | 21 passed (mocked LLM) | Built on an open-source multi-agent framework (see references and `THIRD_PARTY_NOTICES.md`). Provider: Anthropic Claude Haiku 4.5. A Gemini provider path exists but a full analysis on it did not complete in testing, so it is not enabled. |
| LLM layer and safeguards | `app/llm/` | **Implemented and tested** | 36 passed (routing, price-prediction guard, numeric validation, audit logging, redaction) | Five safeguards: no price prediction, no execution authority, human approval, audit log, numeric validation. Tests mock the model providers. |
| Market terminal | `app/terminal/`, `frontend/components/terminal/` | **Implemented and tested** (backend) | 21 passed | Uses free, delayed public data; not part of any research claim |
| RBAC, tenancy, auth, rate limits | `app/rbac/`, `app/db/tenant.py`, `app/api/` | **Implemented and tested** | 137 passed (heuristic grouping by file name) | Tenant isolation is structural (every model carries `organization_id`; dedicated isolation tests exist for the graph, search, superadmin) |
| Frontend | `frontend/` | **Implemented**; verified by TypeScript type-check (clean) and manual browser checks | **No automated frontend tests exist** | `npm run typecheck`, `npm run lint` available |
| Live-data ingestion providers | `app/providers/` | Implemented; network integration tests skipped by default | 8 passed, 1 skipped | Yahoo Finance via `yfinance`, unadjusted |

## 3. Test evidence

Produced by `pytest tests -q -p no:warnings --junitxml docs/evaluation/evidence/pytest_junit.xml` and summarized by
`scripts/evaluation/summarize_tests.py` (`evidence/tests_summary.json`, `evidence/tests_by_file.csv`).

| Measure | Value |
|---|---|
| Tests collected | **690** |
| Passed | **681** |
| Failed / errored | **0 / 0** |
| Skipped | 9 (all: integration tests that need `RUN_INTEGRATION=1` and a live database) |
| Wall time | 267 s |
| Test files | 110 |

By subsystem (grouped heuristically by file name; the group "Platform / other" holds 42 files for everything
else, such as billing, notifications, search, onboarding and system health):

| Subsystem | Files | Passed | Skipped |
|---|---|---|---|
| Regime detection | 6 | 15 | 1 |
| Backtest and strategy DSL | 11 | 71 | 0 |
| Validation (5 methods) | 4 | 32 | 0 |
| Failure intelligence | 11 | 28 | 1 |
| Evolution (GA) | 6 | 21 | 0 |
| Knowledge graph | 8 | 30 | 0 |
| Multi-agent desk | 1 | 21 | 0 |
| Market terminal | 1 | 21 | 0 |
| LLM layer and safeguards | 6 | 36 | 0 |
| Security, RBAC and tenancy | 11 | 137 | 0 |
| Data ingestion | 3 | 8 | 1 |
| Platform / other | 42 | 261 | 6 |

**Integration tests actually run for this pack.** The two database-privilege tests behind the "failures are
permanent" claim (`tests/test_failure_append_only.py`, `tests/test_audit_log_append_only.py`) were run against the
live local Postgres with `RUN_INTEGRATION=1`: **2 passed** (`evidence/pytest_integration_append_only.xml`). The
remaining 7 skipped integration tests (live ingestion over the network, regime integration, research-note search)
were **not** run.

**Kinds of tests present** (examples): determinism of the GA with a fixed seed; byte-for-byte elitism; worked fitness
example (`weighted_avg_sharpe + 0.3 x robustness`); Monte Carlo and persistence behaviour on constant and degenerate
data; the look-ahead property of features; tenant isolation for the graph and search; failure-monitor scoping;
instrument fallback for failure records; 21 Agent Desk tests with a stubbed model; 21 Terminal tests.

## 4. Known failures, gaps and limits (stated plainly)

1. **Not point-in-time**: regime labels are full-history fits ([03](03-experimental-protocol.md) section 2).
2. **Validation is partly in-sample**: strategies (and every GA variant) were designed or tuned on the history the
   walk-forward folds slice.
3. **Optimistic backtest assumptions**: same-bar close fills, 0.1% fees only, no slippage or market impact, daily
   bars, unadjusted prices.
4. **No measured out-of-sample advantage** over passive holding in the test windows ([05](05-baselines-and-ablations.md)).
5. **Evolution does not show a generalization benefit**; its fitness is gameable (ADR 0007).
6. **Staged demo data**: the lifecycle states and the mix of failure triggers in the Meridian tenant are partly
   scripted ([04](04-results.md) section 1).
7. **Failure records are permanent, including two wrong ones** (instrument `CRM` / `ACGL` on an SPY strategy).
8. **Research Memory is held in the API process** (ADR 0012): each API replica derives its own copy from Postgres, and worker-side writes appear after the next rebuild.
9. **No frontend automated tests.**
10. **Multi-agent desk**: only nine analyses exist, one informative settled outcome; the underlying framework is
    third-party; the alternative-provider path did not complete a run.
11. **Operational**: during this work the locally launched services were stopped twice by something outside the
    application (not diagnosed); the data, code and results here are unaffected.
12. **Untracked work**: uncommitted changes (section 1).

## 5. Third-party components (provenance)

| Component | Role | Licence / note |
|---|---|---|
| TradingAgents (open-source multi-agent LLM trading framework; Xiao et al., arXiv 2412.20138) | Basis of the multi-agent desk; pinned dependency, wrapped by `app/agents` | See `docs/THIRD_PARTY_NOTICES.md` and ADR 0009. The paper and framework are cited in the references. |
| hmmlearn, ruptures, scikit-learn, arch | Regime detectors | Standard open-source libraries; no hand-rolled model math |
| vectorbt | Backtest engine | Open source |
| DEAP | Genetic algorithm operators | Open source (LGPL) |
| SHAP, LightGBM | Failure feature attribution | Open source |
| yfinance | Price data wrapper | Open source; data under Yahoo's terms |
| Anthropic Claude (Haiku 4.5) | LLM provider for the desk and explanations | Commercial API |
