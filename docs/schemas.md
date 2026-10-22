# Stellix Labs — Canonical Schemas (Living Document)

> **Single source of truth for the shape of every entity in the system.**
>
> Rules (see `PROJECT_CONSTITUTION.md` §5):
> - **Extend, never redefine.** New fields are appended; existing fields are not
>   silently changed. A breaking change requires an ADR in `/docs/adr/`.
> - **Field names are identical across the stack**: Postgres columns ⇄ Pydantic
>   models ⇄ API payloads ⇄ Zod schemas ⇄ Research Memory properties.
> - Before implementing any new field anywhere, add it here FIRST.

Legend:
- `PK` primary key · `FK` foreign key · `UQ` unique · `NN` not null
- Type notation is conceptual (maps to SQLAlchemy/Pydantic/Zod as appropriate).
- Every tenant-scoped entity carries `organization_id` and inherits
  `TenantScopedModel` (see `backend/app/db/tenant.py`).

---

## Conventions

- **IDs**: all primary keys are UUID v4 (`uuid` type), server-generated.
- **Timestamps**: `created_at`, `updated_at` are timezone-aware (`timestamptz`),
  server-defaulted. Stored in UTC.
- **Soft delete**: tenant data is generally not hard-deleted (see Pillar 2,
  Failure-as-Asset). Where retirement is needed, prefer a status field over
  deletion (e.g. `is_active`).
- **Multi-tenancy**: `organization_id` (UUID, FK → `organizations.id`, NN) on every
  client-data table. The column is supplied by the `TenantScopedModel` mixin and
  auto-filtered on every ORM query (ADR 0002).

---

## Core Entities

### Organization (tenant)
The top-level tenant boundary. Owns all other client data. This is the FK target
for every `organization_id`. NOT itself `TenantScopedModel` (it *is* the tenant).

| Field            | Type        | Constraints                         | Notes                                                        |
|------------------|-------------|-------------------------------------|--------------------------------------------------------------|
| `id`             | uuid        | PK                                  | Tenant identifier.                                           |
| `name`           | str         | NN                                  | Display name of the organization.                           |
| `slug`           | str         | NN, UQ                              | URL-safe unique key, lowercase. Used in URLs and login disambiguation. |
| `tier`           | enum        | NN, default `starter`               | Pricing tier — see `organization_tier` below.               |
| `max_strategies` | int         | nullable                            | Enforced strategy cap. `25` for starter; `NULL` = unlimited (pro/enterprise). |
| `risk_tolerance_max_drawdown_pct` | float | NN, default `30.0`         | Org-level Monte-Carlo drawdown tolerance (Batch 5); risk-tolerant orgs set it looser. |
| `is_active`      | bool        | NN, default `true`                  | Suspension without deletion; disabled tenants cannot authenticate. |
| `created_at`     | timestamptz | NN, server default                  |                                                              |
| `updated_at`     | timestamptz | NN, server default                  |                                                              |

**Tier enum** (`organization_tier`): `starter`, `pro`, `enterprise`.
Default `max_strategies` by tier: starter → `25`, pro → `NULL`, enterprise → `NULL`.

### User
A member of exactly one organization (v1; multi-org membership is a deferred v2
feature). Authentication subject and RBAC principal. `TenantScopedModel`.

| Field                   | Type        | Constraints                          | Notes                                                       |
|-------------------------|-------------|--------------------------------------|-------------------------------------------------------------|
| `id`                    | uuid        | PK                                   |                                                             |
| `organization_id`       | uuid        | NN, FK → organizations.id            | Owning organization.                                        |
| `email`                 | str         | NN, UQ within organization           | Login identifier; stored lowercased. NOT globally unique.   |
| `hashed_password`       | str         | NN                                   | bcrypt, cost factor 12. Never returned by the API or logged.|
| `full_name`             | str         | nullable                             | Display name.                                               |
| `role`                  | enum        | NN, default `researcher`             | RBAC role — see `user_role` below.                          |
| `is_active`             | bool        | NN, default `true`                   | Disabled users cannot authenticate.                         |
| `failed_login_attempts` | int         | NN, default `0`                      | Consecutive failures; reset on success.                     |
| `locked_until`          | timestamptz | nullable                             | Set when locked after 5 failures; lock lasts 15 minutes.    |
| `last_login_at`         | timestamptz | nullable                             | Updated on successful login.                                |
| `created_at`            | timestamptz | NN, server default                   |                                                             |
| `updated_at`            | timestamptz | NN, server default                   |                                                             |

**RBAC role enum** (`user_role`): `researcher`, `risk_manager`, `cio`,
`compliance_officer`, `admin`.

> Email uniqueness is enforced **per organization** (`UNIQUE (organization_id,
> email)`), not globally — two orgs may each have an `admin@theirfirm.com`.

### RefreshToken
Server-side record backing rotated refresh tokens. Raw tokens are never stored —
only a SHA-256 hash. `TenantScopedModel`.

| Field             | Type        | Constraints                 | Notes                                              |
|-------------------|-------------|-----------------------------|----------------------------------------------------|
| `id`              | uuid        | PK                          |                                                    |
| `organization_id` | uuid        | NN, FK → organizations.id   | Owning organization.                               |
| `user_id`         | uuid        | NN, FK → users.id           | Subject of the token.                              |
| `token_hash`      | str         | NN, UQ                      | SHA-256 hex digest of the opaque refresh token.    |
| `expires_at`      | timestamptz | NN                          | 7 days from issuance.                              |
| `revoked_at`      | timestamptz | nullable                    | Set on rotation/logout.                            |
| `device_info`     | str         | nullable                    | Optional user-agent / device descriptor.           |
| `created_at`      | timestamptz | NN, server default          |                                                    |
| `updated_at`      | timestamptz | NN, server default          |                                                    |

---

## Data Source Abstraction (Batch 2)

All external market data enters through one interface, `MarketDataProvider`
(`backend/app/providers/base.py`), whose single method
`fetch_ohlcv(symbol, start, end, interval)` returns a DataFrame with columns
`[timestamp, open, high, low, close, volume]` (timestamp tz-aware UTC, ascending).

Concrete providers: `yfinance` (free, default) and `alphavantage` (free tier,
`ALPHA_VANTAGE_API_KEY`). The chosen provider name is stored in `market_data.source`.

> **To add a paid provider (Bloomberg, Polygon, etc.) later, implement
> `MarketDataProvider` — zero downstream code changes required.** This is the
> deliberate, deferred answer to the original spec's "Exchange APIs, Bloomberg,
> Quandl": the seam is built; specific vendors plug in behind it.

**Tier ingest policy (application policy, not a DB column):** a tier-based maximum
ingest lookback is enforced at request time — starter ≤ 1825 days (~5y), pro /
enterprise unlimited (`TIER_MAX_INGEST_DAYS` in `services/ingestion.py`).

---

## Time-Series Tables (TimescaleDB, Batch 2)

> Both tables are TimescaleDB **hypertables** partitioned by `timestamp` when the
> extension is present; on a plain Postgres they are regular tables with identical
> schema/queries (the migration degrades gracefully). They use a **composite primary
> key** `(organization_id, symbol, timestamp)` rather than a UUID surrogate, because a
> hypertable's unique indexes must include the partitioning column. The PK doubles as
> the required composite index. Re-ingesting the same `(org, symbol, timestamp)`
> upserts (keep-latest).

### market_data (hypertable)

| Field             | Type        | Constraints                              | Notes                                  |
|-------------------|-------------|------------------------------------------|----------------------------------------|
| `organization_id` | uuid        | NN, FK → organizations.id, PK part       | Tenant.                                |
| `symbol`          | str         | NN, PK part                              | Upper-cased ticker.                    |
| `timestamp`       | timestamptz | NN, PK part, partition column            | Bar time (UTC).                        |
| `open`            | float       | NN                                       |                                        |
| `high`            | float       | NN                                       |                                        |
| `low`             | float       | NN                                       |                                        |
| `close`           | float       | NN                                       |                                        |
| `volume`          | float       | NN                                       |                                        |
| `source`          | str         | NN                                       | Provider name (`yfinance`, ...).       |
| `created_at`/`updated_at` | timestamptz | NN, server default               |                                        |

### feature_matrix (hypertable)

Commonly-queried indicators are real (nullable Float) columns for fast filtering; the
flexible `features` JSONB column carries the full/extensible indicator set so new
indicators need no migration. Same composite PK as `market_data`.

| Field             | Type        | Constraints                        | Notes                                            |
|-------------------|-------------|------------------------------------|--------------------------------------------------|
| `organization_id` | uuid        | NN, FK, PK part                    | Tenant.                                          |
| `symbol`          | str         | NN, PK part                        |                                                  |
| `timestamp`       | timestamptz | NN, PK part, partition column      |                                                  |
| `features`        | jsonb       | NN, default `{}`                   | Full indicator bag (extensible).                 |
| `log_return`      | float       | nullable                           | `ln(close_t / close_{t-1})`.                     |
| `sma_20`,`sma_50` | float       | nullable                           | Trailing simple moving averages.                 |
| `ema_12`,`ema_26` | float       | nullable                           | Trailing EWM (`adjust=False`).                   |
| `rsi_14`          | float       | nullable                           | Wilder RSI (ta).                                 |
| `macd`,`macd_signal` | float    | nullable                           | MACD(12,26) line + signal(9).                    |
| `atr_14`          | float       | nullable                           | Average True Range (ta).                         |
| `bollinger_upper`,`bollinger_lower` | float | nullable               | Bollinger(20, 2σ).                               |
| `realized_vol_20` | float       | nullable                           | Std of trailing 20 log returns.                  |
| `autocorr_5`      | float       | nullable                           | Lag-5 autocorr of log returns over a 30-bar trailing window. |
| `created_at`/`updated_at` | timestamptz | NN, server default          |                                                  |

> **TEMPORAL ISOLATION (inviolable):** every feature at `timestamp` T uses only data
> at T and earlier — trailing rolling/EWM/recursive constructs only, no centered
> windows, no forward-fill. Asserted by `tests/test_lookahead.py`.

### regime_labels (hypertable, Batch 3)

Ensemble regime output per bar (SRC report §5.1). Four independent detectors — HMM
(hmmlearn), PELT change-point (ruptures), GMM (scikit-learn), GARCH(1,1) (arch) — each
emit a taxonomy label; a **self-consistency-weighted majority vote** combines them,
with a fast-triggering **Crisis override** when GARCH conditional volatility exceeds an
extreme percentile. Same composite-PK hypertable design.

| Field              | Type        | Constraints                     | Notes                                                       |
|--------------------|-------------|---------------------------------|-------------------------------------------------------------|
| `organization_id`  | uuid        | NN, FK → organizations.id, PK   | Tenant.                                                     |
| `symbol`           | str         | NN, PK part                     |                                                             |
| `timestamp`        | timestamptz | NN, PK part, partition column   |                                                             |
| `regime_label`     | enum        | NN                              | `regime_label` taxonomy (below).                           |
| `confidence_score` | float       | NN                              | 0.0–1.0 = fraction of the 4 models agreeing with the final. |
| `model_votes`      | jsonb       | NN, default `{}`                | `{"hmm": "...", "pelt": "...", "gmm": "...", "garch": "..."}`. |
| `transition_probs` | jsonb       | nullable                        | HMM 4×4 transition matrix + raw-state→label map.            |
| `created_at`/`updated_at` | timestamptz | NN, server default       |                                                             |

**Regime taxonomy enum** (`regime_label`): `Bull`, `Bear`, `High-Volatility`,
`Low-Volatility`, `Sideways`, `Crisis`.

> **State→label mapping** (a real design decision, not a placeholder): for discrete
> models (HMM/GMM) the highest-vol state → High-Volatility, lowest-vol → Low-Volatility,
> and the rest are Bull/Bear/Sideways by mean-return sign — permutation-invariant so
> results are stable across fits. See `app/regime/taxonomy.py`.

---

## Operational Tables

### ingestion_jobs
Tracks an async ingestion run (tenant-scoped). Data-quality warnings are retained here
to be surfaced later on the System Monitoring page.

| Field               | Type        | Constraints                  | Notes                                          |
|---------------------|-------------|------------------------------|------------------------------------------------|
| `id`                | uuid        | PK                           |                                                |
| `organization_id`   | uuid        | NN, FK → organizations.id    | Tenant.                                         |
| `symbol`            | str         | NN                           |                                                |
| `start_date`,`end_date` | date    | NN                           | Requested window.                              |
| `interval`          | str         | NN                           | `1m`/`5m`/`15m`/`30m`/`1h`/`1d`/`1wk`/`1mo`.    |
| `provider`          | str         | NN                           |                                                |
| `status`            | enum        | NN, default `pending`        | `ingestion_status` below.                      |
| `rows_ingested`     | int         | NN, default 0                |                                                |
| `features_computed` | int         | NN, default 0                |                                                |
| `warnings`          | jsonb       | NN, default `[]`             | List of data-quality warning objects.          |
| `error`             | text        | nullable                     | Set on failure.                                |
| `celery_task_id`    | str         | nullable                     |                                                |
| `created_at`/`updated_at` | timestamptz | NN, server default     |                                                |

**Ingestion status enum** (`ingestion_status`): `pending`, `running`, `done`, `failed`.

---

## Strategy & Governance (Batch 4)

All four tables are tenant-scoped (`TenantScopedModel`, UUID PK). The rule DSL is a
strict JSON structure so it is machine-evaluable AND machine-generatable (by the LLM
service in a later batch).

### Strategy
| Field                 | Type        | Constraints                          | Notes                                                     |
|-----------------------|-------------|--------------------------------------|-----------------------------------------------------------|
| `id`                  | uuid        | PK                                   |                                                           |
| `organization_id`     | uuid        | NN, FK → organizations.id            | Tenant.                                                   |
| `name`                | str         | NN                                   |                                                           |
| `description`         | text        | nullable                             |                                                           |
| `version`             | str         | NN, default `v1.0`                   | Bumps `vX.Y`→`vX.(Y+1)` on parameter/rule change.         |
| `creator`             | enum        | NN                                   | `strategy_creator`: human / llm_generated / ga_engine.    |
| `created_by_user_id`  | uuid        | nullable, FK → users.id              | NULL when creator ≠ human.                                |
| `status`              | enum        | NN, default `draft`                  | `strategy_status`: draft/candidate/active/failed/retired. |
| `parameters`          | jsonb       | NN, default `{}`                     | Tunable params + ranges.                                  |
| `entry_rules`         | jsonb       | NN, default `{}`                     | Structured rule DSL (below).                              |
| `exit_rules`          | jsonb       | NN, default `{}`                     | Structured rule DSL.                                      |
| `risk_constraints`    | jsonb       | NN, default `{}`                     | `{max_drawdown_pct, max_position_size_pct, stop_loss_pct}`.|
| `robustness_score`    | float       | nullable                             | Set by the backtest; gate for candidate→active (≥ 0.70).  |
| `regime_compatibility`| jsonb       | nullable                             | `{regime_label: sharpe}` from the regime-aware backtest.  |
| `parent_strategy_id`  | uuid        | nullable, FK → strategies.id         | Evolutionary lineage.                                     |
| `created_at`/`updated_at` | timestamptz | NN, server default              |                                                           |

**`strategy_creator`**: `human`, `llm_generated`, `ga_engine`.
**`strategy_status`**: `draft`, `candidate`, `active`, `failed`, `retired`.

### StrategyVersion
Immutable snapshot per version (for diff/history). `parameters_snapshot` holds the full
tunable state (parameters + entry/exit rules + risk_constraints) so versions can be
diffed.

| Field                 | Type        | Constraints                 | Notes                              |
|-----------------------|-------------|-----------------------------|------------------------------------|
| `id`                  | uuid        | PK                          |                                    |
| `organization_id`     | uuid        | NN, FK → organizations.id   | Tenant.                            |
| `strategy_id`         | uuid        | NN, FK → strategies.id      |                                    |
| `version_number`      | str         | NN                          | e.g. `v1.0`.                       |
| `parameters_snapshot` | jsonb       | NN                          | Full tunable state at this version.|
| `change_reason`       | str         | nullable                    |                                    |
| `created_at`          | timestamptz | NN, server default          |                                    |

### ApprovalRecord
| Field                 | Type        | Constraints                 | Notes                              |
|-----------------------|-------------|-----------------------------|------------------------------------|
| `id`                  | uuid        | PK                          |                                    |
| `organization_id`     | uuid        | NN, FK → organizations.id   | Tenant.                            |
| `strategy_id`         | uuid        | NN, FK → strategies.id      |                                    |
| `approved_by_user_id` | uuid        | NN, FK → users.id           |                                    |
| `action`              | enum        | NN                          | `approval_action`: approve/reject. |
| `justification`       | text        | NN                          | Required.                          |
| `created_at`          | timestamptz | NN, server default          |                                    |

**`approval_action`**: `approve`, `reject`.

### performance_snapshots
Regime-conditioned backtest metrics (Pillar 1: performance is never stored without a
regime context). One row per regime present + one aggregate row (`regime_label = "ALL"`).
Each backtest run replaces the strategy's snapshots.

| Field           | Type        | Constraints                 | Notes                                             |
|-----------------|-------------|-----------------------------|---------------------------------------------------|
| `id`            | uuid        | PK                          |                                                   |
| `organization_id`| uuid       | NN, FK → organizations.id   | Tenant.                                           |
| `strategy_id`   | uuid        | NN, FK → strategies.id      |                                                   |
| `regime_label`  | str         | NN                          | Taxonomy label, or `"ALL"` for the global aggregate. |
| `sharpe_ratio`  | float       | nullable                    | mean/std of that regime's trade returns.          |
| `max_drawdown`  | float       | nullable                    | Peak-to-trough on the regime's cumulative returns.|
| `win_rate`      | float       | nullable                    | Fraction of trades with positive return.          |
| `profit_factor` | float       | nullable                    | Σ gains / |Σ losses|.                             |
| `calmar_ratio`  | float       | nullable                    | total_return / |max_drawdown|.                    |
| `trade_count`   | int         | NN, default 0               |                                                   |
| `period_start`/`period_end` | timestamptz | nullable        | Backtest window.                                  |
| `created_at`    | timestamptz | NN, server default          |                                                   |

> **Rule DSL** (`entry_rules` / `exit_rules`):
> ```json
> {"operator": "AND",
>  "conditions": [
>    {"indicator": "rsi_14", "comparator": "<", "value": 30},
>    {"indicator": "close", "comparator": "crosses_above", "value_ref": "sma_50"}]}
> ```
> `operator` ∈ {AND, OR}; conditions may nest. A leaf is
> `{indicator, comparator, value|value_ref}`. Comparators: `<,<=,>,>=,==,!=` (single
> row) and **`crosses_above`/`crosses_below` (genuine 2-row window)**:
> `crosses_above` = `prev[ind] <= prev[ref] AND curr[ind] > curr[ref]` (mirror for
> below). A single-row implementation is a bug.

### ValidationResult (Batch 5)
The 5-method validation breakdown + weighted composite (SRC report §11). Each run
replaces the strategy's prior result; the composite becomes `Strategy.robustness_score`
(the candidate→active gate). `TenantScopedModel`.

| Field                | Type        | Constraints                 | Notes                                                    |
|----------------------|-------------|-----------------------------|----------------------------------------------------------|
| `id`                 | uuid        | PK                          |                                                          |
| `organization_id`    | uuid        | NN, FK → organizations.id   | Tenant.                                                  |
| `strategy_id`        | uuid        | NN, FK → strategies.id      |                                                          |
| `walk_forward_score` | float       | nullable                    | Sub-score (weight 30%): fraction of OOS folds passing.   |
| `regime_cv_score`    | float       | nullable                    | Sub-score (30%): primary regimes with positive Sharpe /4.|
| `monte_carlo_score`  | float       | nullable                    | Sub-score (20%): `clip(1 - p95_dd/(2·tol), 0, 1)`.       |
| `persistence_score`  | float       | nullable                    | Sub-score (10%): `clip(1 - min_p/(2·α), 0, 1)`.          |
| `stress_test_score`  | float       | nullable                    | Sub-score (10%); **NULL = N/A** → weight redistributed.  |
| `composite_score`    | float       | NN                          | Weighted average over present methods.                   |
| `classification`     | enum        | NN                          | `validation_classification` below.                       |
| `method_details`     | jsonb       | NN, default `{}`            | Fold-by-fold, per-regime, and MC histogram data for the UI.|
| `created_at`/`updated_at` | timestamptz | NN, server default     |                                                          |

**`validation_classification`**: `auto_fail` (<0.50), `candidate` (0.50–0.70 inclusive),
`eligible_active` (>0.70). Method weights: Walk-Forward 30 · Regime-CV 30 · Monte-Carlo
20 · Persistence 10 · Stress 10; if Stress is N/A the other four renormalize to sum 1.

---

## Failure Intelligence (Batch 6)

### Failure
First-class failed-strategy records (Pillar 2, Failure-as-Asset). **Append-only and
immutable**: `created_at` only (no `updated_at`), and UPDATE/DELETE are revoked at the
Postgres permission level (migration 0006). `TenantScopedModel`.

| Field                            | Type        | Constraints                 | Notes                                                      |
|----------------------------------|-------------|-----------------------------|------------------------------------------------------------|
| `id`                             | uuid        | PK                          |                                                            |
| `organization_id`                | uuid        | NN, FK → organizations.id   | Tenant.                                                    |
| `strategy_id`                    | uuid        | NN, FK → strategies.id      |                                                            |
| `strategy_version`               | str         | NN                          | Version snapshot at failure.                               |
| `failure_timestamp`              | timestamptz | NN                          | Bar time the failure was detected at.                      |
| `regime_at_failure`              | str         | NN                          | Regime label when it failed.                               |
| `trigger_condition`              | enum        | NN                          | `failure_trigger` (below).                                 |
| `performance_metrics_at_failure` | jsonb       | NN                          | `{sharpe, max_drawdown, win_rate}` at failure.             |
| `feature_attribution`            | jsonb       | nullable                    | Top-5 by |SHAP|: `{feature_name, shap_value, direction}`; NULL if < 10 trades. |
| `market_context_snapshot`        | jsonb       | NN                          | Volatility level, key indicator values at failure time.    |
| `llm_generated_explanation`      | text        | nullable                    | Populated by Batch 9.                                      |
| `related_failure_ids`            | jsonb       | NN, default `[]`            | Array of related-failure UUID strings (clustering).        |
| `created_at`                     | timestamptz | NN, server default          | Immutable — failures are never edited.                     |

**`failure_trigger`**: `drawdown_breach`, `sharpe_decline`, `regime_mismatch`, `manual`.

> **SHAP attribution** uses a real LightGBM surrogate trained on the strategy's actual
> trade history (entry-time features → trade return, regression), with `shap.TreeExplainer`
> for genuine SHAP values — never `feature_importances_`. **Clustering** links same-org
> failures by weighted Jaccard similarity over (regime 0.4, trigger 0.3, top-3 feature
> overlap 0.3); links at ≥ 0.6, bidirectionally, and **never across `organization_id`**.

---

## Research Notes (Batch 7, extended Batch 10)

### ResearchNote
Postgres source-of-truth for researcher hypotheses/annotations (Pillar 3,
Compounding Memory), synced into the graph as a `ResearchNote` node. `TenantScopedModel`.
Batch 7 shipped the minimal version (`content`, `hypothesis`, `author_user_id`);
Batch 10 extends it into the full Research Notebook backing store.

| Field                  | Type        | Constraints                 | Notes                                          |
|------------------------|-------------|------------------------------|------------------------------------------------|
| `id`                   | uuid        | PK                           |                                                |
| `organization_id`      | uuid        | NN, FK → organizations.id    | Tenant.                                        |
| `title`                | str         | NN, default `""`             | Batch 10.                                      |
| `content`              | text        | NN                           | Markdown body.                                 |
| `hypothesis`           | text        | nullable                     | The specific hypothesis being tested/recorded. |
| `method`               | text        | nullable                     | Batch 10: how the hypothesis was/will be tested.|
| `status`               | enum        | NN, default `in_progress`    | Batch 10: `research_note_status` (below).      |
| `tags`                 | jsonb       | NN, default `[]`             | Batch 10: array of free-text strings.          |
| `related_strategy_ids` | jsonb       | NN, default `[]`             | Batch 10: array of Strategy UUID strings — backs one `INSPIRED_BY` edge per id (see below). |
| `related_failure_ids`  | jsonb       | NN, default `[]`             | Batch 10: array of Failure UUID strings (display/linking only — no dedicated graph edge for this direction). |
| `author_user_id`       | uuid        | NN, FK → users.id            | Synced as the graph `Researcher` (AUTHORED_BY).|
| `created_at`           | timestamptz | NN, server default           |                                                |
| `updated_at`           | timestamptz | NN, server default           | Batch 10 (autosave needs this).                |

**`research_note_status`**: `in_progress`, `completed`, `abandoned`.

> `Strategy.inspired_by_note_id` (nullable, FK → research_notes.id) was added to
> `strategies` in Batch 7 to back the `INSPIRED_BY` graph edge from the STRATEGY
> side (a strategy traces to at most one originating hypothesis note). Batch 10's
> `ResearchNote.related_strategy_ids` is the independent, many-valued NOTE side
> (a note can relate to several strategies) — `sync_research_note_node` now also
> MERGEs one `INSPIRED_BY` edge per id in that array, extending Batch 7's existing
> sync method rather than adding a parallel path. `related_failure_ids` has no
> graph-edge equivalent (no edge type in the SRC §5.4 8-edge set connects
> ResearchNote to Failure) — it's Postgres-only, for the notebook's own
> click-through UI.
>
> Full-text search: a generated `tsvector` column
> (`to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'') || ' ' || coalesce(hypothesis,''))`)
> with a GIN index, queried via `websearch_to_tsquery` (quoted phrases/`OR`/`-exclude`
> — the syntax users expect from a search bar, unlike `plainto_tsquery`'s "AND every
> word") + `ts_rank` for ordering — see `list_notes()` in `app/services/research_note.py`
> (kept in the same CRUD service rather than a separate `_search.py` module; the
> query is a handful of lines, not enough logic to justify a second file).
> Deliberately not Elasticsearch at this scale, per the constitution's "don't add
> infra beyond what's needed" spirit. On SQLite (hermetic tests, no tsvector) the
> same function falls back to a plain `ILIKE` substring match so the endpoint's
> pagination/filter plumbing stays testable without Postgres — real relevance
> ranking is only meaningful, and only tested, against the genuine dialect (see
> the integration test gated on `RUN_INTEGRATION=1`).
>
> **Bug found + fixed live, Batch 10**: the ORM's `search_vector` column had no
> way to know it's a Postgres `GENERATED ALWAYS` column (the generated expression
> is raw SQL in the migration, not declared via SQLAlchemy's `Computed()` in the
> model — deliberately, so the Postgres-only expression doesn't leak into
> hermetic SQLite's DDL for this column). Without that signal, the ORM sent an
> explicit `NULL` for `search_vector` on every INSERT, and Postgres rejects any
> value — even `NULL` — into a generated column
> (`asyncpg.exceptions.GeneratedAlwaysError`), so every note creation 500'd
> against the real database despite passing hermetic SQLite tests. Fixed with
> `server_default=FetchedValue()` on the column — the dialect-agnostic "this is
> server-managed, never send a value, just re-fetch it" marker — which has no
> DDL effect (SQLite's `create_all()` still emits the same plain nullable
> column) but stops the ORM including it in INSERT/UPDATE. Live-verified:
> note creation, autosave, and full-text search across three notes on the real
> Postgres dev DB, plus the full 165-test hermetic suite, both green after the fix.

---

## Research Memory (Batch 7; on PostgreSQL since ADR 0012)

> **PostgreSQL is the single source of truth.** Research Memory is a derived,
> tenant-scoped index of the records and relationships below, built from Postgres
> inside the API process (`app/graph/memory_index.py`) at startup and every
> `RESEARCH_MEMORY_REFRESH_SECONDS` (default 300), and kept current on every write by
> `GraphSyncService`. The only implementation is `InMemoryGraphRepository`
> (`app/graph/memory_repository.py`) behind the interface in `app/graph/repository.py`.
> Every record is keyed by `(organization_id, label, key)`, so every lookup is
> tenant-scoped by construction — the same fail-closed philosophy as
> `TenantScopedModel` (§3 of the constitution). Neo4j was retired in ADR 0012; the
> labels, relationship types and five queries below are unchanged.

### Node labels
Every node carries `organization_id`. Property names match the Postgres fields they
mirror where a Postgres source exists.

| Label          | Key property     | Properties                                                          | Postgres source                          |
|----------------|-------------------|----------------------------------------------------------------------|--------------------------------------------|
| `Strategy`     | `strategy_id`     | `organization_id, name, version, status, robustness_score`           | `strategies` (1:1, synced on create/update)|
| `Regime`       | `regime_id`       | `organization_id, regime_label, confidence_score, start_date, end_date, symbol` | Derived from `regime_labels` — see below |
| `Performance`  | `performance_id`  | `organization_id, sharpe_ratio, max_drawdown, win_rate, profit_factor, period_start, period_end` | `performance_snapshots` (1:1) or a failure-time snapshot (see CAUSED_BY) |
| `Failure`      | `failure_id`      | `organization_id, trigger_condition, llm_explanation, failure_timestamp` | `failures` (1:1)                        |
| `ResearchNote` | `note_id`         | `organization_id, content, hypothesis, created_at`                    | `research_notes` (1:1)                   |
| `Researcher`   | `user_id`         | `organization_id, name, role`                                         | `users` (1:1, ensured lazily on note sync)|

> **Regime node resolution:** `Strategy.regime_compatibility` and
> `Failure.regime_at_failure` only carry a regime **label** (no dated segment
> reference), so a graph `Regime` node is keyed by `(organization_id, regime_label)`
> — one node per distinct label per org, not per per-bar `regime_labels` row.
> `start_date`/`end_date` are the min/max `regime_labels.timestamp` observed for that
> org+label (across symbols); `symbol`/`confidence_score` are taken from the most
> recent matching `regime_labels` row. Nodes are MERGEd lazily, on demand, whenever a
> `Strategy`/`Failure` sync needs to connect a `VALID_IN`/`FAILED_IN` edge.

### Edge types (SRC report §5.4 — all 8)

| Edge           | From → To                    | Created when                                                                 |
|----------------|-------------------------------|-------------------------------------------------------------------------------|
| `VALID_IN`     | `Strategy` → `Regime`         | On strategy sync, for each label in `regime_compatibility` with Sharpe > 0.   |
| `FAILED_IN`    | `Strategy` → `Regime`         | On failure sync, for `Failure.regime_at_failure`.                             |
| `MUTATED_FROM` | `Strategy` → `Strategy`       | On strategy sync, if `parent_strategy_id` is set **and** `creator == ga_engine` (genetic mutation/crossover). |
| `ADAPTED_FROM` | `Strategy` → `Strategy`       | On strategy sync, if `parent_strategy_id` is set **and** `creator in {human, llm_generated}` (manual/LLM-driven derivation). |
| `INSPIRED_BY`  | `Strategy` → `ResearchNote`   | On strategy sync, if `inspired_by_note_id` is set.                            |
| `EVALUATED_BY` | `Strategy` → `Performance`    | On performance-snapshot sync (one edge per regime-partitioned snapshot row).  |
| `CAUSED_BY`    | `Failure` → `Performance`     | On failure sync: a dedicated `Performance` node (id `"{failure_id}-at-failure"`) is MERGEd from `Failure.performance_metrics_at_failure`, distinct from regular `performance_snapshots` rows (which get replaced on every backtest re-run, so a durable failure-time snapshot is kept instead of a fragile FK into mutable data). |
| `AUTHORED_BY`  | `ResearchNote` → `Researcher` | On research-note sync, from `author_user_id`.                                |

---

## Evolution Engine (Batch 8)

### EvolutionRun
One row per GA run (population → N generations → final candidates). `TenantScopedModel`.

| Field                    | Type        | Constraints                 | Notes                                                       |
|--------------------------|-------------|------------------------------|---------------------------------------------------------------|
| `id`                     | uuid        | PK                           |                                                                |
| `organization_id`        | uuid        | NN, FK → organizations.id    | Tenant.                                                       |
| `symbol`                 | str         | NN                            | Symbol backtested against (required — see note below).       |
| `status`                 | enum        | NN, default `running`        | `evolution_run_status`: running / completed / failed.         |
| `ga_config`               | jsonb       | NN                            | `{population_size, max_generations, crossover_prob, mutation_prob, mutation_indpb, sigma_base, elitism_fraction, tournament_size, plateau_generations, convergence_window, convergence_threshold_pct}`. |
| `seed_strategy_ids`      | jsonb       | NN, default `[]`              | Strategy UUIDs used to seed generation 0.                     |
| `generation_history`     | jsonb       | NN, default `[]`              | `[{generation, best_fitness, avg_fitness, sigma}, ...]` — drives the fitness-over-generations chart. |
| `best_fitness`           | float       | nullable                     | Best fitness seen across the whole run.                       |
| `generations_run`        | int         | NN, default 0                 |                                                                |
| `candidate_strategy_ids` | jsonb       | NN, default `[]`              | New `Strategy` rows registered from final-generation survivors.|
| `error`                  | text        | nullable                     | Set on failure.                                                |
| `created_at`/`updated_at`| timestamptz | NN, server default            |                                                                |

**`evolution_run_status`**: `running`, `completed`, `failed`.

> **Why `symbol` is required:** fitness evaluation backtests every individual every
> generation (Batch 4's `run_regime_aware_backtest`), which needs a symbol's
> feature/regime data — there is no stored per-strategy symbol anywhere in the schema
> (backtests always take `symbol` as a call-time argument, not a persisted field), so
> the evolution run request must supply one explicitly.

### Parameter space (encode/decode design)

> **Judgment call, documented per the schema-first rule:** Part 1 specified "a
> strategy's parameters dict flattened into a DEAP Individual," but most real
> strategies in this codebase (e.g. the SMA `crosses_above`/`value_ref` pattern) have
> **no literal tunable value at all** in their rule tree — the threshold is another
> indicator series, not a constant — so a literal reading would produce an empty,
> unevolvable Individual for exactly the strategies the batch needs to evolve.
>
> Resolution: `app/evolution/encoding.derive_parameter_space(strategy)` auto-derives
> the tunable gene set (in this fixed order) from:
> 1. every numeric literal `value` leaf in `entry_rules` (not `value_ref`, which
>    points at a series, not a constant),
> 2. every numeric literal `value` leaf in `exit_rules`,
> 3. every numeric field in `risk_constraints` (`stop_loss_pct`,
>    `max_position_size_pct`, `max_drawdown_pct`) — always present per
>    `assert_submittable`'s required-keys check, so every submittable strategy has
>    at least these genes even with a pure `value_ref` rule tree.
>
> Each gene gets a `[min, max]` range: RSI-family indicators clamp to `[0, 100]`
> (mathematically bounded); known `risk_constraints` keys use fixed sensible bounds;
> anything else defaults to `±50%` of the current literal (or `±1.0` if the literal
> is `0`). `decode(individual, template_strategy)` clamps every gene into its range,
> rounds int-typed genes, writes the clamped values back into a deep copy of the
> template's `entry_rules`/`exit_rules`/`risk_constraints`, and ALSO writes a
> self-documenting `Strategy.parameters` dict (`{name: {value, min, max, type}}`) so
> the tunable state is inspectable without re-deriving it. This makes `parameters` a
> genuinely accurate, literal "parameters dict" on every GA-produced child, while
> letting `encode()` bootstrap it from the rule tree when a parent doesn't have one.

### Fitness function

> `fitness = weighted_avg_sharpe + 0.3 * robustness_score`, where
> `weighted_avg_sharpe = Σ(sharpe_r * trade_count_r) / Σ(trade_count_r)` over every
> regime `r` in `BacktestResult.per_regime` with `trade_count_r > 0` — a
> **trade-count-weighted** average (regimes with more trades — more statistical
> evidence — count for more), not a flat mean across regime labels. `robustness_score`
> is Batch 4's own single-backtest composite (NOT the expensive Batch-5 5-method
> suite — that only runs once, on final survivors, per the DoD). See
> `app/evolution/fitness.py` for the exact implementation and a worked numeric example.

---

## LLM Research Assistant (Batch 9)

`app/llm/service.py`'s `LLMService` wraps the official `anthropic` SDK
(`claude-sonnet-4-6`, `ANTHROPIC_API_KEY`). All 4 functions use forced tool-use
(`tool_choice={"type": "tool", "name": ...}`) so every response is a guaranteed-
parseable structured object — never free text parsed with regex.

### LLMAuditLog
Append-only (same `REVOKE UPDATE, DELETE ... FROM PUBLIC` pattern as Batch 6's
`failures`) — every LLM call is logged **before** the result is returned to the
caller ("log-then-return"), regardless of success/failure downstream.
`TenantScopedModel`.

| Field                       | Type        | Constraints                 | Notes                                                    |
|------------------------------|-------------|------------------------------|------------------------------------------------------------|
| `id`                        | uuid        | PK                            |                                                             |
| `organization_id`           | uuid        | NN, FK → organizations.id     | Tenant.                                                    |
| `user_id`                   | uuid        | nullable, FK → users.id       | NULL for system-triggered calls (e.g. auto explain_failure).|
| `function_name`             | str         | NN                            | `generate_hypothesis` / `explain_failure` / `critique_strategy` / `summarize_graph_query_result`. |
| `full_prompt`               | text        | NN                            | The complete prompt sent (system + user content), verbatim.|
| `full_response`             | text        | NN                            | The complete raw response, verbatim (before Pydantic parsing).|
| `model_used`                | str         | NN                            | e.g. `claude-sonnet-4-6`.                                  |
| `input_tokens`              | int         | nullable                      | From the API's usage block.                                |
| `output_tokens`             | int         | nullable                      | From the API's usage block.                                |
| `numeric_validation_passed` | bool        | nullable                      | NULL when not applicable (generate_hypothesis / summarize_graph_query_result carry no checkable numeric claims); Safeguard 5 result otherwise. |
| `created_at`                | timestamptz | NN, server default            | Immutable — no `updated_at`.                                |

### Strategy.requires_review (extends Strategy, Batch 4)
`bool, NN, default false`. **Derived server-side, never client-settable**: forced to
`true` whenever `creator == llm_generated`, `false` otherwise — the human-approval
safeguard (below) needs this to be non-negotiable, not a value the request body can
override. Submitting/approving a `requires_review` strategy still goes through the
exact same `assert_submittable`/`assert_activatable` gates as any other strategy —
there is no bypass path.

### Judgment calls (documented per the schema-first rule)

> **`numeric_claims` was added to `explain_failure` and `critique_strategy`'s output
> schemas**, beyond Part 1's literal field list. Safeguard 5 (hallucination
> mitigation) requires mechanically cross-checking numeric claims against real
> stored data — but the literal schemas (`explanation_text`, `regime_context_summary`,
> `suggested_mitigation`, `strengths`, `weaknesses`, ...) are all free text, and
> regex-scraping numbers out of free text is exactly what structured tool-use output
> is meant to avoid. Both schemas now also require
> `numeric_claims: list[{metric_name, claimed_value}]` — the model is instructed to
> restate every specific number it references there, and that structured list (not
> the prose) is what gets validated against the real `Failure`/`Strategy` record.
>
> **`POST /llm/hypothesis` persists a `ResearchNote`** (Pillar 3: every research
> artifact is captured, not just returned and forgotten) but does **not** create a
> `Strategy` — `suggested_parameters` is returned for the researcher to optionally
> use in a *separate*, human-initiated `POST /strategies` call with
> `creator=llm_generated`. This keeps `LLMService` fully clear of Safeguard 2
> (zero dependency on `app.services.strategy`'s write path).
>
> **`GET /llm/graph-summary` re-runs the named query itself** server-side (via the
> real Batch 7 repository) rather than trusting a client-supplied result blob —
> `result_id` supplies the query-specific parameter it needs (e.g. a strategy_id for
> `lineage`); the other 4 queries use their own default parameters. This keeps the
> LLM grounded in freshly-fetched real data, consistent with the hallucination-
> mitigation principle, rather than summarizing a payload that could be stale or
> spoofed.

---

## Governance Layer (Batch 10)

### audit_log
Org-wide immutable audit trail — distinct from Batch 9's `llm_audit_log` (which is
specifically every LLM call; this is every *governance-significant state change*).
Append-only: `REVOKE UPDATE, DELETE ... FROM PUBLIC`, same pattern as `failures`
and `llm_audit_log`. `TenantScopedModel`.

| Field             | Type        | Constraints                 | Notes                                                    |
|-------------------|-------------|-------------------------------|--------------------------------------------------------|
| `id`              | uuid        | PK                            |                                                          |
| `organization_id` | uuid        | NN, FK → organizations.id     | Tenant.                                                  |
| `actor_user_id`   | uuid        | nullable, FK → users.id       | NULL for system/automatic events (e.g. the active→failed hook). |
| `event_type`      | enum        | NN                            | `audit_event_type` (below).                              |
| `entity_type`     | str         | NN                            | e.g. `"strategy"`, `"evolution_run"` — the kind of thing acted on. |
| `entity_id`       | uuid        | NN                            |                                                          |
| `before_state`    | jsonb       | nullable                      | Relevant fields before the change (e.g. `{"status": "candidate"}`). |
| `after_state`     | jsonb       | nullable                      | Relevant fields after the change.                        |
| `justification`   | text        | nullable                      | **Required at the API layer** for `kill_switch_activated` and `strategy_rejected` — enforced in the route, not just documented. |
| `ip_address`      | str         | nullable                      | Caller's IP, where available (login/failed_login always have it; internal Celery-triggered events don't). |
| `created_at`      | timestamptz | NN, server default            | Immutable — no `updated_at`.                             |

**`audit_event_type`**: `strategy_status_change`, `strategy_approved`,
`strategy_rejected`, `kill_switch_activated`, `evolution_candidate_approved`,
`data_export`, `user_role_changed`, `login`, `failed_login`.

> `user_role_changed` is reserved: no endpoint currently changes a user's role
> (none existed in any prior batch, and Batch 10 wasn't asked to add one) — the
> enum value exists for when that endpoint is built, so the audit trail doesn't
> need a breaking migration later.
>
> Event-type mapping for the hooks Batch 10 actually wires up: `submit` (draft→
> candidate) is deliberately NOT logged — it's a researcher proposing something
> for review, not a governance decision. `approve`→`strategy_approved`,
> `reject`→`strategy_rejected` (both the plain `/strategies/{id}/approve` path
> and evolution's `/evolution/candidates/{id}/reject`, which reuses the same
> service function — there's no separate `evolution_candidate_rejected` type by
> design, only `evolution_candidate_approved` was asked for). `retire` and the
> generic `/transition` endpoint (any target) →`strategy_status_change`. Manual
> failure trigger (Batch 6) → `strategy_status_change` (it *is* a status change,
> active→failed, and there's no dedicated failure-trigger type). Evolution
> candidate approve → `evolution_candidate_approved` specifically (distinct from
> the plain `strategy_approved` used by the regular strategy approval path, even
> though both call the same underlying `approve()`).

### Governance endpoints (Batch 10)

All under `/governance`, all tenant-scoped. Role sets are deliberately split into
three tiers rather than one blanket "governance panel" gate, since the batch prompt's
kill-switch spec (`risk_manager`/`cio`/`admin`) and its frontend note ("restricted to
ComplianceOfficer/Admin") name different role sets — reconciled by tier, not by
picking one over the other:

| Endpoint                              | Method | Roles                                            | Notes |
|----------------------------------------|--------|---------------------------------------------------|-------|
| `/governance/kill-switch/{strategy_id}` | POST  | `risk_manager`, `cio`, `admin`                    | Operational risk action — same base role set as `retire`, deliberately excludes `compliance_officer` (finding #1 below). Forces status → `retired` from **any** current status, calling neither `assert_transition_legal` nor `assert_retire_permitted` — a genuine bypass, not a relabeled `retire()`: it skips the "already-terminal" check `/retire` would apply, and skips the parentless-`failed`-needs-admin escalation, so a plain `risk_manager`/`cio` can kill-switch a scenario `/retire` would 403 them for. Requires non-blank `reason`. No undo: nothing transitions out of `retired`; reactivation means a brand-new `draft`→`candidate`→`active` run and fresh approval. |
| `/governance/active-strategies`         | GET   | `risk_manager`, `cio`, `compliance_officer`, `admin` (`APPROVAL_ROLES`) | Read view for anyone who can act on or review active strategies. |
| `/governance/approval-queue`            | GET   | `risk_manager`, `cio`, `compliance_officer`, `admin` (`APPROVAL_ROLES`) | `status=candidate AND robustness_score >= 0.70 AND` no `ApprovalRecord` yet (same "undecided" definition as evolution's pending-candidates list, but org-wide — not restricted to `creator=ga_engine`). Decisions are made via the existing `/strategies/{id}/approve` — no parallel approve/reject mechanism here. |
| `/governance/audit-log`                 | GET   | `admin`, `compliance_officer`                     | Paginated (`limit`/`offset`) + filterable (`event_type`, `entity_type`, `actor_user_id`, `start_date`/`end_date`). Same role pair as Batch 9's `GET /llm/audit-log` — org-wide audit trail visibility is a compliance/oversight concern, not an operational one. |
| `/governance/export`, `/governance/export/{job_id}` | POST, GET | `admin`, `compliance_officer` | See Compliance Export below. |

Live-verified the full role × endpoint matrix against the real dev Postgres (not
just hermetic tests): a `researcher` gets 403 on all four; `risk_manager` and `cio`
pass the kill-switch and view gates but get 403 on `/audit-log`; `compliance_officer`
passes every view gate and `/audit-log` but gets 403 on kill-switch; `admin` passes
everything. Confirmed `reason="   "` (whitespace-only) is rejected by the service's
`.strip()` check (422) even though it passes Pydantic's `min_length=1`, and an empty
string is rejected by Pydantic itself before the service ever runs.

Also live-verified the bypass itself is real, not just documented: created a
`failed`, parentless strategy; `POST /strategies/{id}/retire` as `risk_manager`
correctly 403'd ("Retiring a failed strategy with no parent requires an admin
override"); `POST /governance/kill-switch/{id}` as the *same* `risk_manager`
against the *same* strategy succeeded (200, status → `retired`), and the
resulting `audit_log` row shows `before_state={"status":"failed"}` →
`after_state={"status":"retired"}`.

### RBAC audit findings (fixed this batch)

Went through every endpoint in Batches 1-9. Full survey below; **two real gaps**
found and fixed:

1. **`approve()` excluded `compliance_officer`.** Batch 4's `GOVERNANCE_ROLES` is
   `{risk_manager, cio, admin}` — Batch 10 explicitly requires
   `ComplianceOfficer` to approve/reject via the Governance Panel's approval
   queue, reusing this exact function. Fixed by introducing
   `APPROVAL_ROLES = GOVERNANCE_ROLES | {compliance_officer}` in
   `app/strategy/lifecycle.py` and switching `approve()` to check against it.
   `retire`/kill-switch stay on `GOVERNANCE_ROLES` unchanged (compliance_officer
   was never asked to retire strategies or use the kill switch).
2. **`POST /strategies/{id}/transition` didn't check the CALLER's role for
   `target=active`.** It only checked `assert_activatable(has_approval=...)` —
   whether *an* approval record exists at all, not whether *this caller* is
   privileged. A regular researcher could call the generic transition endpoint
   directly. Fixed by requiring `APPROVAL_ROLES` at the route level before
   calling `svc.transition()` when the target is `active`.

Everything else audited was already correctly enforced — either via the
`require_role` FastAPI dependency (`GET /users/{id}` → admin;
`GET /llm/audit-log` → admin/compliance_officer), or via an equivalent
service-layer role check with the same effect (`retire`, the manual `/fail`
trigger, `approve`/`reject`). Every read-only or propose/research action
(create strategy, submit, backtest, validate, evolution run, ingest, regime
detect, graph queries, hypothesis/critique) is intentionally open to any
authenticated user — no batch ever specified a role restriction for these, and
restricting them would block the basic researcher workflow the platform exists
for.

### Tenant-isolation audit finding (fixed this batch, not just RBAC)

While live-verifying `/governance/audit-log` with a second test organization, found
a **cross-tenant leak in the tenant-scoping infrastructure itself** — `app/db/tenant.py`,
untouched since Batch 1, pre-dating every batch since. Not a Batch 10 regression, but
found *during* Batch 10 and fixed at the root because it's a real, live-reproduced
data leak, not a hypothetical one:

- `_apply_tenant_filter` (the `do_orm_execute` listener that injects the
  `with_loader_criteria` org filter) used to first check
  `_statement_touches_tenant_model(state)`, which keyed off `state.all_mappers`.
  For a bare aggregate — `select(func.count()).select_from(AuditLog)`, the exact
  shape every paginated list endpoint in this codebase uses for its `total` field
  — `all_mappers` is **empty** (no mapped column is selected, only the FROM
  clause), so the filter was silently skipped and the count query ran completely
  unscoped.
- **Live-reproduced**: registered a second organization, logged in as its admin
  (1 real `audit_log` row for that org), and `GET /governance/audit-log` returned
  `total=13` — organization 1's true global-table count, not organization 2's
  actual 1. The `items` list itself was correctly scoped (empty/correct) — only
  the `total` metadata leaked, but that's still tenant B learning tenant A's row
  count, a real disclosure.
- **Root-cause fix, not a per-endpoint patch**: removed the
  `_statement_touches_tenant_model` gate entirely and made `_apply_tenant_filter`
  apply `with_loader_criteria` unconditionally whenever an organization is bound.
  `with_loader_criteria` is itself a no-op for statements that don't touch
  `TenantScopedModel`, so this is both cheap and correct — no detection heuristic
  left to have blind spots. Verified safe: every session-producing helper
  (`get_tenant_db`/`get_system_db` in `app/api/deps.py`, `get_tenant_session`/
  `get_system_session` in `app/db/session.py`) already calls either
  `bind_organization` or `mark_session_unscoped` before yielding, so no query path
  exists that would newly hit the "no organization bound" `TenantContextError`.
- **Re-verified live after the fix**: same two-org setup, `GET /governance/audit-log`
  now returns each organization's own correct, distinct count (confirmed against
  `SELECT organization_id, count(*) FROM audit_log GROUP BY organization_id` in
  psql directly).
- **Blast radius**: this was not specific to `/governance/audit-log` — every
  endpoint using `select(func.count()).select_from(SomeTenantModel))` for a
  paginated `total` (e.g. `GET /llm/audit-log` from Batch 9, `GET /strategies`,
  `GET /evolution/runs`) was equally affected and is now equally fixed by the
  same root-cause change, with no per-endpoint edits required.

### Unhandled-exception CORS gap (found + partially addressed this batch)

Found live while wiring the Research Notebook's docked LLM panel: an unhandled
(non-`HTTPException`) exception in a route handler is caught by Starlette's
`ServerErrorMiddleware`, which sits **outside** every `app.add_middleware(...)`
call including `CORSMiddleware` — so its 500 response never gets an
`Access-Control-Allow-Origin` header, and a browser `fetch()` reports a bare
`net::ERR_FAILED` ("Failed to fetch") with zero diagnostic signal, even though
the server actually responded. Reproduced concretely: `/llm/critique/{id}`
without `ANTHROPIC_API_KEY` configured (expected — see Batch 9 notes, API key
setup is deliberately deferred to one pass at the end of the whole project)
raises a synchronous `TypeError` from the Anthropic SDK's header validation,
before any network call; curl sees a real `500` in <200ms, the browser sees a
network-level failure.

**Fix applied**: a global `@app.exception_handler(Exception)` in `app/main.py`
that logs the real exception server-side (`logger.exception`, never sent to the
client) and returns a generic `{"detail": "Internal server error"}` JSON 500 —
this response runs through `ExceptionMiddleware`, which IS wrapped by
`CORSMiddleware`, so most unhandled errors now reach the browser as a normal,
parseable JSON error instead of an opaque network failure. Verified via curl:
before the fix, `/llm/critique/{id}` returned a bodyless text "Internal Server
Error"; after, a clean `{"detail": "Internal server error"}`.

**Not fully resolved**: for this *specific* code path (the Anthropic SDK's
`TypeError` during `_validate_headers`, before any HTTP call is attempted),
the browser still occasionally sees `net::ERR_FAILED` rather than a clean 500 —
server logs show the exception handler's response being sent successfully
(`INFO: ... 500 Internal Server Error`) immediately followed by a second,
separate `ERROR: Exception in ASGI application` crash from deeper in the
CORSMiddleware/ASGI stack, which looks like a Starlette/CORS interaction edge
case specific to this exception shape, not something introduced by this
batch's code. Not chased further because: (a) it's contingent on the
no-API-key state the user has already deferred verifying, and the trigger
(a synchronous client-side `TypeError` before any network attempt) won't recur
once a real key is configured — the whole code path changes at that point; (b)
it doesn't block anything Batch 10 actually delivers (the Research Notebook's
CRUD/autosave/search/graph-sync all verified working independently of this);
(c) it would mean debugging a framework/middleware-version-specific interaction
tangential to this batch's scope. Worth a closer look whenever real LLM API
verification happens.

---

## API Hardening (Batch 11)

### Rate limiting

Batch 1 shipped `InMemoryRateLimiter` (`app/core/rate_limit.py`) for `/auth/login`
and `/auth/register` as an explicitly-documented single-process stopgap ("Batch 11
replaces it with a Redis-distributed limiter"). This batch does that, and adds
every limiter category the SRC report's gap-fix calls for.

**Algorithm: token bucket, not fixed-window.** A fixed window (`INCR` + `EXPIRE`)
is simpler but has a hard cliff at the window boundary and a well-known burst bug
at the edge (two windows' worth of requests can land back-to-back right at the
boundary). A token bucket allows a burst up to the bucket's capacity, then refills
steadily — smoother, and the standard choice for API rate limiting. Implemented as
one atomic Redis Lua script (`app/core/token_bucket.py`, `EVAL`) so the
read-tokens → compute-refill → decrement → write-back sequence can't race between
concurrent requests hitting the same key (the classic bug in a naive
GET-then-SET Redis limiter). Chose a hand-written Lua script over `slowapi`
(the spec's other suggested option) to keep the EXISTING Batch-1 integration
style — every limiter is a FastAPI dependency, disabled in tests via
`app.dependency_overrides[x] = lambda: None` — rather than switching to
`slowapi`'s decorator + exception-handler style, which would have meant
rewriting how every existing test disables rate limiting.

**Categories and limits** (`app/core/rate_limit.py` builds each as a module-level
instance from the `app/core/token_bucket.py` factories):

| Limiter | Capacity | Window | Keyed by | Tier-aware? |
|---|---|---|---|---|
| `login_rate_limiter` | 5 | 60s | client IP | no |
| `register_rate_limiter` | 3 | 60s | client IP | no |
| `login_account_rate_limiter` | 5 | 60s | login request's `email` field | no |
| `global_rate_limiter` | 100 | 60s | `user_id` (JWT `sub`) | **yes** |
| `ingest_rate_limiter` | 10 | 3600s | `organization_id` (JWT `org`) | **yes** |
| `backtest_rate_limiter` | 30 | 3600s | `organization_id` | **yes** |
| `validate_rate_limiter` | 20 | 3600s | `organization_id` | **yes** |
| `evolution_run_rate_limiter` | 5 | 3600s | `organization_id` | **yes** |
| `llm_rate_limiter` | 50 | 3600s | `organization_id` | **yes** |

> `register` tightened from Batch 1's shared 5/min/IP default to 3/min/IP per
> this batch's spec; `login`'s per-IP limit is unchanged at 5/min — the NEW
> thing for login is the additional, independent per-*account* limiter
> (`login_account_rate_limiter`), so distributed credential stuffing against
> ONE account from many different IPs still gets caught even though each
> individual IP stays under the per-IP threshold.
>
> `global_rate_limiter` is applied **router-wide**, not per-route: `app/api/router.py`
> passes `dependencies=[Depends(global_rate_limiter)]` to `include_router(...)`
> for every authenticated feature router (`users`, `data`, `regimes`,
> `strategies`, `failures`, `research_notes`, `graph`, `evolution`, `llm`,
> `governance` — `health` and `auth` are excluded: `health` needs no auth
> context, `auth` is pre-auth and has its own dedicated limiters). This means
> new routes added in later batches are covered automatically, with no risk of
> forgetting to wire the default in. `llm.router` additionally gets
> `llm_rate_limiter` at the router level too, since EVERY `/llm/*` route costs
> real Anthropic API budget per call, not just one specific endpoint.
>
> `ingest`/`backtest`/`validate`/`evolution_run` are attached per-route (only
> the one expensive endpoint each name implies), since — unlike the LLM
> budget concern — there's no reason a *different* endpoint in the same router
> should share that specific budget.

**Org-tier multiplier**: Enterprise gets 5x every tier-aware limiter's capacity
and refill rate (Starter/Pro both get the 1x baseline — the spec only calls out
Enterprise). Looked up via `get_org_rate_multiplier(organization_id)`
(`app/core/token_bucket.py`), which reads `Organization.tier` and caches the
result in Redis for 60s — avoids a Postgres round-trip on every single
rate-limited request (this runs on a genuine hot path), at the cost of up to 60s
of staleness if an org's tier changes (an accepted, minor tradeoff — the same
kind of snapshot-staleness a JWT's embedded `role` already has for its 15-minute
lifetime). Chose a short-TTL cache over embedding tier in the JWT itself
specifically to avoid touching the auth/token-issuance flow at all — this keeps
the tier lookup entirely contained to the rate-limiting module.

**429 response shape**: `Retry-After` header (seconds until at least one token
is available) plus a JSON body — `{"error": "rate_limit_exceeded", "limit":
"<scope>", "message": "..."}` — naming which specific limiter was hit, not just
a bare "too many requests."

**Test-only reset**: `app/core/token_bucket.reset_scope(scope)` deletes every
Redis key under a scope's prefix — needed because, unlike the hermetic per-test
SQLite database, Redis is a real, persistent, shared resource across test runs;
`tests/conftest.py`'s `client` fixture disables every limiter by default
(`app.dependency_overrides[x] = lambda: None` for all nine), and
`rate_limited_client` re-enables only the three auth ones, resetting their
Redis state before and after each test.

### Input validation audit (fixed this batch)

Went through every POST/PUT/PATCH endpoint across Batches 1-10 (12 schema
files) checking for: a raw `dict` body where a strict model belongs, a string
field with no `max_length`, a numeric field with no real-world-meaningful
bound, and a JSONB/dict field with no size cap. **Found and fixed roughly
twenty gaps**, by file:

- `app/schemas/auth.py` — passwords had no upper bound
  (`_PASSWORD_MAX_LENGTH = 128` on both password fields, guarding against a
  multi-MB "password" being hashed); `organization_slug` and `refresh_token`
  were unbounded strings.
- `app/schemas/strategy.py` — `description` was unbounded;
  `StrategyUpdateRequest.name` had **no constraint at all** (the create model
  had `min_length`/`max_length`, the update model didn't); every free-text
  reason/justification field (`change_reason`, `TransitionRequest.reason`,
  `ApproveRequest.justification`, `RetireRequest.reason`) was unbounded —
  introduced a shared `_REASON_MAX_LENGTH = 2000`; all four JSONB dict fields
  (`parameters`, `entry_rules`, `exit_rules`, `risk_constraints`) had no size
  cap on either Create or Update.
- `app/schemas/evolution.py` — `EvolutionRunRequest.ga_config` was a raw,
  unvalidated `dict` unpacked straight into the `GAConfig` dataclass
  constructor: a bad key wouldn't 422, it would 500. Replaced with
  `GAConfigOverrides`, a strict model mirroring every `GAConfig` field with a
  real bound (e.g. `population_size` 1-500, probabilities 0.0-1.0). Also,
  `strategy_ids` (the GA seed population) had no cap — a request listing
  100k UUIDs is a genuine resource-exhaustion vector, not just a validation
  nicety — capped at `_MAX_SEED_STRATEGIES = 500`.
  `CandidateDecisionRequest.justification` was unbounded.
- `app/schemas/research_note.py` — `content` unbounded (capped 100KB), short
  free-text fields (title, method, status label) uncapped (capped 5000),
  `tags` had no cap on list length or per-tag length (capped 20 tags / 50
  chars each), `related_strategy_ids`/`related_failure_ids` had no cap
  (capped 100).
- `app/schemas/failure.py` — `ManualFailRequest.reason` unbounded.
- `app/schemas/regime.py` — `RegimeDetectRequest.symbol` had **no constraint
  at all**, not even `max_length` — now `min_length=1, max_length=32`,
  matching every other `symbol` field in the codebase.
- `app/schemas/governance.py` — `KillSwitchRequest.reason` unbounded.
- GET query params across `research_notes.py`, `governance.py`, `graph.py`,
  `llm.py` — free-text filters (`tag`, `q`, `entity_type`, `regime`,
  `node_type`, `query_name`, `result_id`, `function_name`) had no
  `max_length`. Not an injection risk (still parameterized either way — see
  the injection audit below), but an unbounded-input vector worth closing
  regardless.

**New shared helper**: `app/schemas/validators.py` —
`check_json_size(value, *, max_bytes=100_000)` — reused as a `field_validator`
across every JSONB/dict field project-wide via the
`_check_x_size = field_validator("x")(check_json_size)` pattern, rather than
duplicating a length check per field.

**Scope note**: numeric fields elsewhere already had sane bounds by
construction (Batch 5-8's validation/evolution scores are `ge`/`le`-bounded in
the existing code) — this audit's numeric-bounds findings concentrated almost
entirely in `evolution.py`'s previously-raw `ga_config` dict, not scattered
across other files.

### SQL / Cypher injection audit (this batch)

> *Historical (Batch 13). The Cypher layer audited below was removed in ADR 0012;
> Research Memory no longer builds query strings at all.*

Audited every database query the backend builds — the SQLAlchemy (Postgres)
layer and every hand-written Cypher query (Batch 7's
`app/graph/neo4j_repository.py`) — for string-built queries. **Zero findings;
both layers already parameterize correctly.**

**SQLAlchemy / Postgres**: every query in the codebase is built through the
ORM's expression language (`select(...)`, `.where(...)`, `func.count()`, etc.),
which parameterizes automatically. Grepped the whole codebase for
string-formatted query construction (`f"..."` / `.format(...)` / `%` near
`session.execute`/`text(`) and found exactly one raw `text()` call anywhere: a
static `text("SELECT 1")` health check with no user input anywhere near it. No
f-string- or `.format()`-built query exists anywhere in the codebase.

**Cypher / Neo4j** (`app/graph/neo4j_repository.py`, 278 lines, read and
audited line-by-line): every query mixes two kinds of substitution, and
they're never confused with each other:

- **Values** — anything that could carry attacker-influenced data (strategy
  IDs, regime names, search terms, property values) — always go through
  `$param` placeholders bound via `run_scoped()`'s parameter dict, never
  string-interpolated into the query text.
- **Identifiers** — node labels, edge types, property *keys* — things
  Cypher's parameter syntax cannot substitute at all (`MATCH (n:$label)` isn't
  valid Cypher) — are f-string-interpolated, but only ever from a closed,
  hardcoded allowlist checked before interpolation: `NODE_LABELS`,
  `EDGE_TYPES`, `NODE_KEY_PROP`, `SEARCHABLE_PROPS`
  (`app/graph/constants.py`). Every route that accepts a label/edge-type/query
  name from the request (`GET /graph/node/{node_type}/{node_id}`,
  `GET /graph/search`, `GET /llm/graph-summary`) validates it against the
  matching allowlist and returns `400` before the value ever reaches the
  repository layer — confirmed in `graph.py` and `llm.py`.
- **One subtlety chased down specifically**: `merge_edge()`'s optional
  `edge_key` dict has its *keys* (not values) f-string-interpolated as
  property names (`f", {k}: $edge_key_{k}"` — again because Cypher can't
  parameterize a property name). Grepped every `merge_edge(` call site
  (`app/graph/sync_service.py`) and found exactly one passes a non-`None`
  `edge_key`, with a hardcoded literal key —
  `edge_key={"failure_id": failure_id}` in `_sync_failure_node` — never a key
  derived from request data. Safe in practice: no code path today lets a
  caller influence what keys land in that dict.

**Conclusion**: no SQL or Cypher injection vector found in either layer. No
code changes were required for this audit — it closes clean.

### CORS & security headers (this batch)

**CORS**: `BACKEND_CORS_ORIGINS` (`app/core/config.py`, Batch 1) already
defaulted to a specific origin (`http://localhost:3000`), never a wildcard —
so the missing piece wasn't the default, it was that nothing stopped an
operator from *setting* `BACKEND_CORS_ORIGINS=*` in a production environment.
Closed with a `model_validator(mode="after")` on `Settings`:
`ENVIRONMENT=production` plus `"*"` anywhere in `BACKEND_CORS_ORIGINS` now
fails `Settings()` construction outright (the process refuses to start)
rather than silently serving CORS headers that reflect any origin back to a
credentialed request. Non-production environments are unaffected — a
wildcard stays a valid local-dev convenience.

**Security headers**: new `SecurityHeadersMiddleware`
(`app/core/security_headers.py`), registered in `app/main.py` *after*
`CORSMiddleware` — Starlette's `add_middleware` makes each successive call
the new outermost layer, so this ordering puts security headers outside CORS,
meaning they land on every response this process emits, including CORS
preflight replies and the Batch-10 global exception handler's 500 (which
itself was added specifically so unhandled errors stay CORS-correct — this
extends the same "every response, even error paths" guarantee to the new
headers). Applied unconditionally:

| Header | Value | Notes |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | always |
| `X-Frame-Options` | `DENY` | always |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` | always — this is a pure JSON API with no HTML/JS/CSS of its own, so "deny everything" is the *correct* baseline, not just the strictest one |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | **production only** — HSTS tells the browser to refuse plain `http://` for this host for the given duration, which is correct behind real TLS and actively breaks `http://localhost` in local dev |

### Secrets audit (this batch)

Grepped the whole repository (backend, frontend, docs, `infra/`) for
secret-shaped strings (API key prefixes, `password`/`secret`/`api_key`
literals, PEM private-key headers) and checked every actual credential-usage
site by hand. **Zero findings; nothing to fix.**

- Every real usage site (`app/core/security.py`'s JWT signing,
  `app/llm/service.py`'s Anthropic client, `app/clients/{redis,neo4j}_client.py`,
  `app/db/session.py`, `app/worker/celery_app.py`) reads from `settings.X` —
  never a literal value.
- The only literal credential-shaped strings anywhere are `app/core/config.py`'s
  own `Settings` field *defaults* (`change-me-postgres`, `change-me-neo4j`,
  `change-me-redis`, `change-me-generate-a-long-random-secret`) — these are
  explicitly documented in that file's own module docstring as "non-secret
  development conveniences," mirrored 1:1 in `infra/.env.example`'s
  placeholders, and `docker-compose.yml` only ever references `${VAR}`
  substitution, never a literal. `ANTHROPIC_API_KEY` has no placeholder at
  all — it defaults to `None` and the LLM features simply don't work until a
  real key is set.
- Test files use obviously-fake credentials only (e.g.
  `DEFAULT_PASSWORD = "supersecret1"` in `tests/helpers.py`), never anything
  resembling a real secret.
- `.env` is gitignored at the repo root (`.env`, `.env.*`, with an explicit
  `!.env.example`/`!*.env.example` allowlist carve-out) — confirmed via
  `git ls-files` that no `.env`-shaped file is tracked in the current tree
  (only the intentional `infra/.env.example` template is).
- **Checked git history, not just the working tree**: `git log --all
  --full-history --name-only -- '.env' '**/.env'` and
  `git rev-list --objects --all | grep -iE '(^|/)\.env$'` (excluding
  `*.env.example`) both came back empty across every branch/ref — no `.env`
  file was ever committed at any point in this repository's history, so
  there's nothing to purge or rotate.

### Dependency audit (this batch)

**Backend (`pip-audit`)** — found 14 advisories across 3 packages; resolved
all but one:

| Package | Was | Now | Outcome |
|---|---|---|---|
| `starlette` | 0.46.2 | 1.3.1 | **Fixed** — 7 advisories, including one concretely exploitable against this codebase (see below) |
| `fastapi` | 0.115.14 | 0.139.0 | Bumped to pull in the fixed `starlette` (requirements.txt's own `<0.116` ceiling was the only thing blocking this) |
| `setuptools` | 65.5.0 | 83.0.0 | **Fixed** — 3 advisories, all in the legacy `package_index`/`easy_install` download path; build-tool only, never imported by app runtime code |
| `pytest` | 8.4.2 | *unchanged* | **Deferred** — see below |

`starlette`'s advisories mattered because one is concretely applicable, not
theoretical: **CVE-2025-62727**, a quadratic-complexity (ReDoS) parser in
`FileResponse`'s `Range`-header handling — and
`GET /governance/export/{job_id}/download` (Batch 10) returns exactly a
`FileResponse`. An unauthenticated crafted `Range` header against that route
could burn CPU per request. Fixed at `starlette>=0.49.1`; landed on `1.3.1`
(latest) since that's what `fastapi==0.139.0` resolves to, which also
incidentally closes several other Starlette advisories that don't apply to
this codebase today (Host-header path-confusion — we don't authorize on
`request.url`; `HTTPEndpoint` method-dispatch confusion — every route here is
a function-based `@router.get/post`, never a class-based `HTTPEndpoint`;
`StaticFiles` Windows UNC-path SSRF — this API serves no static directory).
Upgrade verified safe: full test suite green, plus a live boot + smoke test
(`/health`, `/openapi.json`, `/docs` all 200, security headers still present)
on the upgraded stack before committing.

`pytest`'s **CVE-2025-71176** (predictable `/tmp/pytest-of-{user}` naming,
enabling a local multi-user privilege-escalation/DoS) is deferred, not
ignored: it's a dev/test-only tool (never ships, never runs against
production traffic), the attack requires local access to a shared multi-user
Unix host (this is a solo Windows dev machine), and the fix requires pytest
9.x, which forces a coupled major-version bump in `pytest-asyncio` (currently
pinned `>=0.23,<0.25`, four majors behind its own `1.4.0` latest) whose
compatibility with this project's `asyncio_mode = "auto"` config and fixture
patterns is unverified. Low real-world severity × a breaking, unverified,
two-package coupled upgrade for test tooling only = not a "safe upgrade path"
by the batch's own DoD wording. Tracked as a follow-up rather than forced
through here.

**Frontend (`npm audit`)** — found 5 vulnerable paths (4 high, 1 moderate),
all rooted in an outdated `next`; resolved all but one *upstream-unfixable*
finding:

| Package | Was | Now | Outcome |
|---|---|---|---|
| `next` | 14.2.35 | 15.5.20 | **Fixed** — see below |
| `eslint-config-next` | 14.2.35 | 15.5.20 | Bumped alongside `next` (version-locked to it) |
| `postcss` (nested in `next`'s own bundle) | 8.4.31 | *unchanged* | **Deferred** — no upstream fix exists yet, see below |

`npm audit`'s own suggested remediation (`next@16.2.10`) was **not** taken as-is:
it's a major-version jump that also forces `eslint-config-next@16.x`, which
requires `eslint>=9` — a flat-config migration this project hasn't done, and
a separate, much larger effort than a security patch warrants. Instead,
checked whether a same-major-line patch release closes the actual CVE ranges
(every finding's vulnerable range ended at some `15.5.x` version, e.g.
`>=13.4.13 <15.5.16` for the SSRF-via-WebSocket-upgrade finding, CVSS 8.6) —
it did. Installed `next@15.5.16` (then `npm audit fix` moved it to the
already-published `15.5.20` patch), keeping `eslint@^8.57.0` and
`react@18.3.1`/`react-dom@18.3.1` completely untouched (both satisfy
`next@15.5.20`'s own peer-dependency ranges). This closed 4 of 5 findings,
including the two most severe: the WebSocket-upgrade SSRF (CVSS 8.6) and a
Pages Router `i18n` middleware/auth bypass (CVSS 7.5).

The one remaining finding — a moderate PostCSS XSS advisory
(GHSA-qx2v-qp2m-jg93) in a copy of `postcss@8.4.31` bundled **inside**
`next`'s own package (`node_modules/next/node_modules/postcss`, not this
project's direct `postcss@8.5.15` dependency used by Tailwind/autoprefixer,
which is already unaffected) — is not fixable from this side of the
dependency graph: checked `next@16.2.10` (the newest release that exists,
today) and it still vendors the exact same `postcss@8.4.31` internally, so no
published Next.js version yet updates it. `npm audit fix --force`'s only
"fix" is downgrading `next` to `9.3.3`, which isn't a remediation, it's a
regression. Accepted as a documented, upstream-blocked residual: moderate
severity, and exploitation requires attacker-controlled content flowing into
PostCSS's own CSS stringification, which nothing in this app's static,
developer-authored Tailwind pipeline does.

Verified the `next` upgrade didn't break the app: `npm run build` compiled
all 18 routes cleanly (one pre-existing, unrelated lint warning in
`failure-cluster-chart.tsx` from Batch 6 — not touched by this change), and a
live dev-server pass confirmed the landing page and `/login` render and
navigate correctly with zero console errors.

### Tests (this batch)

`tests/test_rate_limit.py` — one test per limiter category (auth per-IP ×2,
per-account, global, ingest, backtest, validate, evolution-run, llm), each
firing capacity+1 requests and asserting the last one 429s while every prior
one passes through; a dedicated test for the 429 response contract
(`Retry-After` header + `{error, limit, message}` body); and the org-tier
multiplier test (Starter throttled at request 11 on a capacity-10 limiter,
Enterprise's 5x gets all 11 through). `tests/test_input_validation.py`
spot-checks the audit with 9 payloads across 4 different endpoints/schema
files (oversized password, oversized/missing strategy fields, an oversized
JSONB `parameters` dict, out-of-bounds GA config, an over-cap seed list, too
many research-note tags, an unconstrained-until-now regime symbol) — every one
422s, none 500s. `tests/test_config.py` gained the CORS-wildcard-in-production
guard tests; `tests/test_security_headers.py` covers the headers middleware
(see above).

**Two real, pre-existing bugs surfaced by writing these tests, both fixed as
part of this batch, not just worked around:**

1. **`get_org_rate_multiplier` was untestable in the hermetic suite.** It
   opened its own `get_system_session()` — a plain function call, not a
   FastAPI `Depends(...)` — so it always hit the real configured Postgres
   (`DATABASE_URL`), completely bypassing the SQLite override every other
   piece of this codebase's test suite relies on. Fixed by threading the
   session through as a real dependency:
   `per_user_limiter`/`per_org_limiter`'s `_dependency` now declares
   `db: AsyncSession = Depends(get_system_db)` and passes it into
   `get_org_rate_multiplier(db, organization_id)`, so
   `app.dependency_overrides[get_system_db]` (already set by the `client`
   fixture for everything else) now covers this too. Beyond testability, this
   is also the more correct design — every other DB access in this codebase
   goes through FastAPI's DI, and this was the one place quietly reaching
   around it.
2. **`RedisTokenBucketLimiter` cached a `Script` object tied to whatever Redis
   client existed the first time it ran, forever.** `redis.register_script()`
   returns a `Script` whose `__call__` defaults to `self.registered_client` —
   the specific client instance passed in when the script was registered —
   not whatever `redis_client.get_client()` returns on a later call. Since
   `_get_script` only rebuilt the cached `Script` when `self._script is None`,
   a limiter that had already run once would silently keep issuing commands
   against that original client object even after a reconnect replaced the
   process-wide singleton — in production this could only bite after a
   genuine Redis reconnect (rare, easy to miss), but the tests hit it on
   nearly every request because pytest-asyncio hands each test function its
   own event loop, and this suite is the first thing to exercise Redis across
   many test functions (Batch 1's original limiter was in-process, no Redis
   at all). Symptoms were inconsistent by design — sometimes an "Event loop is
   closed" crash, sometimes a silently-not-rate-limited request — because
   whichever stale connection the pool happened to hand back varied by
   timing. Fixed at the root: `_get_script` now also rebuilds when
   `self._script.registered_client is not redis`, and `check()` passes
   `client=redis` explicitly into the script call rather than relying on the
   cached default. A `tests/conftest.py` autouse fixture
   (`_fresh_redis_client_per_test`) additionally closes and recreates the
   client between tests, both to keep tests isolated and to make this exact
   class of staleness bug fail loudly again if it ever regresses.

Also worth noting since it shaped how the burst tests are written: the token
bucket refills continuously against real wall-clock time, so a large-capacity
limiter (`global`, 100/60s) tested with 101 real sequential ASGI round-trips
can refill enough mid-burst for the 101st to wrongly succeed — not flakiness
in the usual sense, just the algorithm doing exactly what it's designed to do
under real elapsed time. Every burst test freezes `time.time()` for its
duration rather than relying on the test suite running fast enough.

---

## Dashboard Pages & Supporting Models (Batch 12)

Builds the SRC report's remaining dashboard pages (09, 10, 13, 15, 21, 22) —
Pages 11/12/14/16-20 were already built alongside their backing features in
Batches 4-10. Four new models, two new columns on existing tables, and a
handful of new read-only aggregation queries back them.

### Notification

The first real use of a notifications system in this build — genuinely
triggered from events (failure detection, evolution completion, a strategy
becoming approval-eligible), not a static mock.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | `TenantScopedModel` |
| user_id | UUID FK → users, `ondelete=CASCADE` | who the notification is for — notifications are per-user, not per-org broadcast |
| type | enum `notification_type` | `failure_detected`, `evolution_completed`, `approval_requested` |
| message | Text | human-readable, rendered as-is |
| link | String(512), nullable | frontend route to click through to (e.g. `/admin/failures?strategy_id=...`) |
| read_at | timestamptz, nullable | NULL = unread |
| created_at | timestamptz | |

Creation goes through one shared `create_notification()` helper
(`app/services/notification.py`) that checks the recipient's
`User.preferences["notifications"][type]` toggle before inserting a row — an
opted-out user genuinely gets no row, not a row the frontend happens to hide,
so the Batch 22 "notification toggles" are real, not cosmetic.

**Trigger points** (all inside the existing service functions that already
run at these moments, not new hooks bolted on from outside):
- **`failure_detected`** — `app/services/failure.py`'s `persist_failure()`,
  the single choke point every `Failure` row already passes through regardless
  of which trigger path (drawdown breach, Sharpe decline, regime mismatch,
  manual) created it. Notifies the strategy's `created_by_user_id` (if set)
  plus every org user with a role in `lifecycle.GOVERNANCE_ROLES`
  (risk_manager/cio/admin), deduplicated.
- **`evolution_completed`** — `app/services/evolution.py`'s `run_evolution()`,
  at the point `EvolutionRun.status` is set to `completed` or `failed`.
  Notifies the user who started the run — already threaded through as a
  parameter from `run_evolution_task.delay(..., user_id=...)` (Batch 8), no
  new column needed on `EvolutionRun` to carry it.
- **`approval_requested`** — `app/services/strategy.py`'s `run_backtest()` and
  `run_strategy_validation()`, right after each sets `strategy.robustness_score`
  (the only two places that field is ever written). Fires when, after the
  write, `strategy.status == CANDIDATE and robustness_score >=
  lifecycle.ROBUSTNESS_THRESHOLD` — i.e. the exact moment a strategy becomes
  eligible for the Batch 10 approval queue. Notifies every org user with a
  role in `lifecycle.APPROVAL_ROLES` (risk_manager/cio/compliance_officer/
  admin). Guarded by an idempotency check (skip if an unread
  `approval_requested` notification already exists for this strategy) since
  both a backtest and a validation run can touch the same strategy.

### ApiKey

Programmatic (non-JWT) access, scoped to `/strategies` and `/data`, per the
Batch 12 spec.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | `TenantScopedModel` |
| user_id | UUID FK → users, `ondelete=CASCADE` | the key's owner — actions taken with the key attribute to this user, same as if they'd used a JWT |
| key_hash | String(64), unique, indexed | SHA-256 hex digest — same pattern as `RefreshToken.token_hash`, the raw key is never stored |
| key_prefix | String(12) | first few characters of the raw key, stored in the clear so the Settings UI can show "which key is which" without ever re-displaying the secret |
| name | String(255) | user-assigned label |
| scopes | JSONB list[str] | e.g. `["strategies:read", "strategies:write", "data:read", "data:write"]` |
| last_used_at | timestamptz, nullable | updated on every successful auth |
| expires_at | timestamptz, nullable | NULL = never expires |
| revoked_at | timestamptz, nullable | NULL = active |
| created_at | timestamptz | |

Raw key format: `slx_{32 random urlsafe chars}`, generated with
`secrets.token_urlsafe`, shown to the user **exactly once** at creation
(matching how the refresh-token/reset-token raw values are handled — hash
stored, plaintext never persisted or logged).

**Auth integration**: `app/api/deps.py`'s `get_token_payload` now accepts
either a JWT (existing behavior, checked first) or, if the bearer value
starts with `slx_`, an API key — hashed and looked up against `ApiKey.key_hash`,
rejected if revoked or past `expires_at`, and translated into the exact same
`{"sub": user_id, "org": organization_id}` payload shape a JWT produces. Every
downstream dependency (`get_tenant_db`, `get_current_user`, `require_role`)
is completely unaware of which auth method was used — this is the same
design principle Batch 11's rate limiters used (a shared payload shape,
not a parallel code path per auth method). A new `require_scope(scope: str)`
dependency is layered on top for the two endpoint groups the spec calls out
by name (`POST /strategies`, `POST /data/ingest`) — it passes through
unconditionally for JWT-authenticated requests (a human user's RBAC role
already governs what they can do) and checks `scopes` only when the request
was authenticated via API key.

### TradeRecord

The Backtest Results page's "full trade log table" needs a persisted,
queryable per-trade record — `run_backtest()` computed this in memory all
along (`BacktestResult.trades`, a DataFrame) but only ever persisted the
*aggregate* `PerformanceSnapshot` rows, discarding the per-trade detail after
the request returned. Extends Batch 4's backtest output; doesn't redefine it.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | `TenantScopedModel` |
| strategy_id | UUID FK → strategies, `ondelete=CASCADE` | |
| entry_timestamp | timestamptz | |
| exit_timestamp | timestamptz | |
| direction | String(8) | `"Long"` / `"Short"` — vectorbt's own label, not re-enumerated |
| entry_price | Float | vectorbt's `Avg Entry Price` |
| exit_price | Float | vectorbt's `Avg Exit Price` |
| pnl | Float | vectorbt's `PnL` (absolute, in the backtest's cash units) |
| return_pct | Float | same per-trade return already used for Sharpe/Sortino/etc. |
| regime_at_entry | String(32), nullable | joined on `entry_timestamp` against `regime_labels`, same join Batch 4 already does for `regime_compatibility` |

Populated inside `run_backtest()` alongside the existing `PerformanceSnapshot`
rows: prior rows for the strategy are deleted and replaced on every re-run
(identical replace-on-rerun semantics to `PerformanceSnapshot`, so the two
stay consistent with each other).

### performance_snapshots additions (extends Batch 4)

Two new nullable columns, per the Batch 12 spec's explicit instruction not to
leave these as frontend-only calculated values:

- **`sortino_ratio: float | None`** — `mean(trade_returns) / downside_deviation`,
  where downside deviation is the std-dev of only the *negative* returns
  (`ddof=1`, same convention as the existing Sharpe calc). `None` when there
  are fewer than 2 losing trades (matches Sharpe's existing `n >= 2` guard,
  applied to the downside subset instead of all trades).
- **`beta_vs_benchmark: float | None`** — `cov(strategy_returns,
  benchmark_returns) / var(benchmark_returns)`, using **per-bar** portfolio
  returns (`vectorbt`'s `pf.returns()`, a full time series) against the
  benchmark's own daily returns over the same window — not the per-*trade*
  returns used for Sharpe/Sortino/Calmar, which have irregular spacing (a
  trade held 3 days and one held 30 days aren't comparable return
  observations for a covariance calc the way two consecutive daily bars are).
  `None` whenever the configured benchmark symbol has no ingested
  `market_data` covering the backtest's period — Beta is never computed
  against a resampled/interpolated proxy.
- **`annualized_return: float | None`** / **`volatility: float | None`** —
  Page 13's other two headline metrics beyond Sortino/Beta, added in a
  follow-up migration (`0012_backtest_bar_metrics`) after the initial Batch 12
  migration missed them. Same per-bar basis as Beta (`compute_bar_level_metrics`
  in `app/strategy/backtest.py`): `annualized_return` compounds total per-bar
  return to a 252-trading-day year (`(1+total_return)^(252/n)-1`);
  `volatility` is `std(per-bar returns, ddof=1) * sqrt(252)`. Both `None` when
  there are fewer than 2 bars.

All four of these are **aggregate-only** — `NULL` on every per-regime row,
never computed against the regime-partitioned trade subsets, for the reason
stated above.

### Organization additions (Batch 12)

- **`benchmark_symbol: str`**, default `"SPY"` — the configurable parameter
  the spec asks for. Org-level (like `risk_tolerance_max_drawdown_pct`), not
  per-backtest-request, since a benchmark choice is an institutional setting,
  not something that should silently vary backtest-to-backtest.

### User additions (Batch 12)

- **`totp_secret: str | None`** — base32 TOTP secret (`pyotp.random_base32()`).
  Stored in the clear at the DB-column level (same trust boundary as
  `hashed_password`'s column — protected by Postgres access control, not an
  application-level KMS envelope). A real production hardening pass would
  encrypt this at rest with a dedicated key-management service; out of scope
  for this v1, called out here rather than silently glossed over.
- **`mfa_enabled: bool`**, default `False` — flips to `True` only once a TOTP
  code has been verified against `totp_secret` (see MFA flow below);
  generating a secret alone does not enable MFA.
- **`avatar_url: str | None`** — served path to a locally-stored upload
  (`var/avatars/`, mirroring `COMPLIANCE_EXPORT_DIR`'s dev-local-disk pattern
  from Batch 10). **Not production-ready as-is** — swap for S3/MinIO (or
  equivalent object storage) before a real multi-instance deployment, exactly
  the same documented, deliberate deferral as Batch 10's compliance-export
  directory and this batch's forgot-password email.
- **`preferences: dict`** (JSONB), default
  `{"default_regime_filter": null, "default_date_range_days": 90,
  "notifications": {"failure_detected": true, "evolution_completed": true,
  "approval_requested": true}}` — one flexible JSONB blob rather than five-plus
  separate columns, consistent with how this codebase already treats
  free-form, growable preference-shaped data (`model_votes`,
  `regime_compatibility`). The notification sub-keys are read by
  `create_notification()` (see Notification above) — toggling one off in
  Settings genuinely stops that notification type from being created for that
  user, not just hidden client-side.

### PasswordResetToken

Mirrors `RefreshToken`'s hashing pattern exactly (raw token never stored,
SHA-256 hash + expiry + a one-time-use marker instead of `revoked_at`).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | `TenantScopedModel` — needed to resolve which org's user this is for a slug-less reset link |
| user_id | UUID FK → users, `ondelete=CASCADE` | |
| token_hash | String(64), unique, indexed | SHA-256 of the opaque reset token |
| expires_at | timestamptz | short-lived — 30 minutes |
| used_at | timestamptz, nullable | NULL = still redeemable; set on successful reset, never deleted (keeps a permanent record a reset happened, consistent with Pillar 3's append-first bias) |
| created_at | timestamptz | |

`POST /auth/forgot-password` **does not send a real email** — no
transactional email provider is wired up (same deferral as every other
"needs a real external service" gap in this build, e.g. Batch 9's
`ANTHROPIC_API_KEY`). It logs the reset link
(`logger.info`, plus returns it directly in the JSON response body **only
when `settings.ENVIRONMENT != "production"`**, so a developer can click
through it in the same terminal/browser without needing to read server logs)
and the code carries an explicit comment: replace with a real provider
(SendGrid/Resend/etc.) before production. Always returns 200 regardless of
whether the email exists, to avoid leaking account existence.

### MFA login flow (extends Batch 1's login)

Enrollment (`POST /auth/mfa/enroll`, `POST /auth/mfa/verify`) is separate from
the login-time challenge:
1. **Enroll**: generates a fresh `totp_secret`, returns it plus a
   `pyotp.totp.TOTP(secret).provisioning_uri(...)` for the frontend to render
   as a QR code. `mfa_enabled` stays `False` until step 2.
2. **Verify**: caller submits a TOTP code; on success, `mfa_enabled` flips to
   `True`. A secret that's never successfully verified never enables MFA —
   there's no "half-enrolled" state that silently starts requiring codes.
3. **Login, once `mfa_enabled=True`**: `POST /auth/login`'s password check
   succeeding no longer immediately returns access/refresh tokens. Instead it
   returns a short-lived **MFA challenge token** (a distinct JWT claim shape,
   `{"purpose": "mfa_challenge", "sub": user_id}`, 5-minute expiry, signed with
   the same `JWT_SECRET_KEY` — no new table, since this is purely transient
   and stateless like an access token, not something that needs to survive a
   restart or be revocable independently). `POST /auth/mfa/login` exchanges
   `{challenge_token, code}` for the real access/refresh token pair once the
   TOTP code checks out.

### New read-only aggregations (Batch 12)

None of these introduce new tables — they're queries against data that
already exists, added because the dashboard pages need them and nothing
upstream computed them yet:

- **Regime statistics** (Page 15) — per `RegimeLabel`, across all
  `regime_labels` rows for the org: duration (count of consecutive-labeled
  bars, summed), avg return (from `market_data.close`), avg volatility (from
  `feature_matrix.realized_vol_20`), avg Sharpe (from trade-level returns in
  `TradeRecord` where `regime_at_entry` matches, falling back gracefully to
  `None` if no strategy has traded in that regime yet).
- **Strategy compatibility alerts** (Page 15) — active strategies
  (`Strategy.status == ACTIVE`) whose `regime_compatibility` dict does not
  list the org's current regime (most recent `regime_labels` row per symbol)
  as compatible, or lists it with a negative/null Sharpe. Surfaces "this
  active strategy isn't validated for the regime we're in right now."
- **Failure heatmap** (Page 10) — count of `failures` rows grouped by
  `(strategy_id, regime_at_failure)`, the matrix the D3 heatmap renders
  (strategy × regime, color intensity = count). The Constitution reserves
  D3 specifically for the regime timeline and this heatmap (Recharts can't do
  a proper 2-D color matrix well) — first time this heatmap is actually built;
  Batch 6 documented it as a known gap.
- **Top performers** (Page 10's equity-curve overlay) — `GET
  /strategies/top-performers?limit=5`: the top-N strategies by aggregate
  Sharpe (`performance_snapshots` where `regime_label='ALL'`), each paired
  with its cached equity curve (see below). A strategy that ranks in the top
  N but has no cached curve (never backtested, or the cache expired) is
  skipped rather than shown with a broken/flat line — the ranking over-fetches
  2x candidates specifically to absorb this.

### Backtest Results chart series (Page 13, Batch 12)

The equity curve, drawdown series, and rolling-Sharpe series `run_backtest()`
now computes (`app/strategy/backtest.py`'s `BacktestResult.equity_curve` /
`drawdown_series` / `rolling_sharpe`, from `vectorbt`'s `pf.value()` /
`pf.drawdown()` / a 20-bar rolling Sharpe over `pf.returns()`) are **not**
persisted to Postgres — at ~1 row/trading day per backtest, they don't fit
`performance_snapshots` (one row per regime) or `trade_records` (one row per
trade). Instead they're cached in Redis (`app/services/backtest_cache.py`),
keyed by strategy id, JSON-encoded, with a 90-day TTL — the same "operational
telemetry, not durable business data" precedent as System Monitoring's
uptime%/consistency-sweep caching (see below): the durable, audit-relevant
numbers (aggregate metrics, trade log) are already in Postgres, so losing this
cache to a TTL or a `FLUSHALL` only costs a chart until the next re-run, not
data. `GET /strategies/{id}/backtest-results` returns `has_run: false` and
`charts: null` for a strategy that has never been backtested — a real,
expected state on this page, not an error.

Rolling Sharpe is deliberately `null` for its warm-up window (first 19 bars,
`ROLLING_SHARPE_WINDOW=20`) rather than computed over a partial window — a
20-bar statistic computed from 3 bars isn't the same statistic, and charting
it as if it were would be misleading.

### System health-detailed (extends Batch 0's `/health`)

`GET /system/health-detailed` (admin-only) is a **separate, richer** endpoint
— it does not replace or change `/health`, which stays the fast, unauthenticated
liveness probe Batches 0-11 already depend on. Per service: `status`, a
rolling `uptime_pct` (tracked in Redis — a small ring buffer of the last N
check results per service, not a new Postgres table, since this is
operational telemetry, not durable business data), `last_check`,
`response_time_ms`. Celery worker liveness is checked via a dedicated
`heartbeat` task scheduled every minute (Celery beat) that just writes a
timestamp to Redis — "worker liveness" means "a heartbeat task actually ran
recently," not merely "the broker connection is reachable" (a broker can be
up with every worker process dead). Job queue counts (active/pending/failed
by task name) come from inspecting Celery's Redis result backend directly
(`celery_app.control.inspect()`), not a new table. System resource gauges
(CPU/memory/disk I/O) use `psutil` against the actual host process — real
numbers, not simulated. The alerting log surfaces Batch 7's existing
consistency-sweep warnings (orphaned nodes / unsynced strategies / missing
lineage edges) by reading the sweep's last-run result rather than
re-implementing that check.

### Judgment calls (documented per the schema-first rule)

1. **Notification fan-out, not broadcast.** A `failure_detected` or
   `approval_requested` event can produce several `Notification` rows (one
   per relevant user) rather than one org-wide row with a separate read-state
   join table. Simpler schema, and "read" is genuinely per-user for a
   per-user notification — no need for a many-to-many read-receipts table.
2. **API key scopes are coarse, not per-endpoint.** `scopes` supports
   `{strategies,data}:{read,write}` — four buckets, not one flag per route.
   The spec calls out `/strategies` and `/data` by name as the programmatic
   surface; a fine-grained per-endpoint ACL system is real scope creep for a
   v1 API-key feature no other part of this spec asks for.
3. **TradeRecord vs. re-deriving trades on read.** Persisting per-trade rows
   (rather than re-running the backtest whenever the Backtest Results page
   loads) was chosen because re-running a vectorbt backtest is exactly the
   ">2 second, must be async background work" case the Constitution's locked
   stack section already calls out — a detail page has to be fast to load.
4. **MFA challenge token, not a DB table.** A challenge token is short-lived,
   single-purpose, and doesn't need independent revocation the way a refresh
   token does (Batch 1's whole reason for hashing refresh tokens in a table
   is that they're long-lived and must be revocable) — a signed, stateless
   JWT with a 5-minute expiry is the right weight for this, not a new table.
5. **`benchmark_symbol` is admin-only, via a new `organizations` route.**
   No `organizations` route module existed before this batch (org data was
   only ever readable as a nested part of `GET /auth/me`) — pre-note 3
   requires the benchmark symbol to be "a configurable parameter," and the
   natural owner of an org-wide setting is an admin, mirroring the existing
   "role read-only unless admin" convention already used for the rest of
   Page 22's Profile tab. Scoped to just this one field (`PATCH
   /organizations/me`) — org name/slug editing isn't part of this spec.
6. **Backtest chart series cached in Redis, not a new table.** See "Backtest
   Results chart series" above — same rationale as System Monitoring's
   Redis-backed operational telemetry, applied to a second, unrelated
   feature, because the same shape-mismatch-with-Postgres reasoning applies
   independently: per-bar time series aren't snapshot- or trade-shaped.

---

## Observability (Batch 13)

No new database tables — this batch is entirely cross-cutting infrastructure
(logging, metrics, tracing IDs, error tracking, health-probe contracts). New
`Settings` fields only:

| Field | Default | Notes |
|---|---|---|
| `SENTRY_DSN` | `None` | Empty = Sentry SDK never initializes (a no-op), same deferral pattern as `ANTHROPIC_API_KEY` (Batch 9) — a real DSN requires the project owner's own Sentry account, which nothing in this codebase can create on their behalf. |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.0` | Performance-tracing sample rate; 0 disables it, keeping error-only capture even once a DSN is supplied, until the owner explicitly opts into tracing overhead/cost. |
| `GRAFANA_ALERT_WEBHOOK_URL` | `None` | Discord/Slack incoming-webhook URL for Grafana's built-in alerting contact point; unset means the contact point provisions with an empty URL (alerts evaluate, they just have nowhere to deliver to yet). |

No separate `LOG_JSON`-style field: log rendering (JSON lines vs. a
human-readable console renderer) is driven directly by the existing
`settings.is_production`, not a second knob that could drift from
`ENVIRONMENT`.

### Structured logging

Every existing `logging.getLogger(__name__)` call site in the codebase (there
are dozens, across every batch) is left **completely unchanged**. Rather than
rewriting every call site to `structlog.get_logger()` (a large, high-risk,
low-value diff), `app/core/logging.py` configures `structlog` to sit
**downstream of the standard library's own logging**, per structlog's own
documented integration pattern: the root logger's handler is given a
`structlog.stdlib.ProcessorFormatter`, so every stdlib `logger.info(...)`/
`logger.warning(...)`/`logger.exception(...)` call anywhere in the codebase
is rendered through the exact same processor chain as a native
`structlog.get_logger()` call — same JSON shape, same context-var merging,
zero call-site changes. `structlog.contextvars.merge_contextvars` is one of
those processors, so anything bound via `bind_contextvars()` (see below)
appears on every subsequent log line automatically, stdlib or structlog,
until `clear_contextvars()` runs.

Every log line therefore carries: `timestamp` (ISO 8601, UTC), `level`,
`logger` (the module name), `event` (the message), and — whenever bound —
`request_id`, `organization_id`, `user_id`. Fields that were never bound
(e.g. `organization_id` on a pre-auth request) are simply absent, not `null`
— a log-processing pipeline downstream shouldn't have to special-case a
placeholder value.

### `request_id` propagation (API → Celery)

- `RequestIDMiddleware` (`app/core/request_id.py`) runs first in the
  middleware stack (outermost, so it wraps everything including
  `UnhandledExceptionMiddleware` — see "Unhandled-exception handling,
  corrected" below) and, for every request: reads an inbound `X-Request-ID`
  header if the caller already has one (lets a request be traced across a
  future API gateway/reverse proxy hop), else generates a fresh `uuid4`; binds it via
  `structlog.contextvars.bind_contextvars(request_id=...)`; stamps it back
  onto the response as `X-Request-ID` (so a browser network tab or an API
  client can correlate a specific response with server-side logs); clears
  contextvars in a `finally` so nothing leaks into the next request served
  by the same worker/event loop.
- `organization_id` and `user_id` are bound one layer in, inside
  `get_tenant_db`/`get_current_user` (`app/api/deps.py`) — the earliest
  point either is actually known — not in the middleware itself (which runs
  before auth resolves).
- **Celery propagation**: every task in `app/worker/tasks.py` gained an
  optional `request_id: str | None = None` parameter. A new
  `@with_log_context` decorator (`app/worker/logging_context.py`) wraps
  every task body: clears contextvars, binds `request_id` (generating a
  fresh one if the caller didn't supply one — a beat-scheduled task like
  `run_failure_monitor_sweep` has no upstream HTTP request to inherit from,
  but every task execution still gets *some* traceable ID) plus
  `organization_id` (when the task takes one) and `task_name`, runs the task,
  clears contextvars again in `finally` (Celery worker processes are
  long-lived and reused across many tasks — an uncleared contextvar would
  leak one task's IDs into the next task that happens to run on the same
  worker thread). Every `.delay(...)` call site — both the 7 that originate
  directly from a route handler and the internal task→task chains
  (ingest → regime detection → failure monitor → clustering/explanation;
  evolution → validation) — passes `request_id=get_current_request_id()`, a
  small helper that just reads whatever's currently bound in structlog's
  contextvars. Since that's true both inside a request handler AND inside an
  already-running task (which bound its own `request_id` via the decorator
  above), the SAME helper correctly propagates one traceable ID across an
  entire causal chain, however many tasks deep, with no special-casing
  needed at each call site.

### Prometheus metrics

`prometheus-fastapi-instrumentator` (not hand-rolled, per the batch's own
instruction) is wired in `app/main.py` and exposes `GET /metrics` in the
standard Prometheus text exposition format — automatic HTTP request count,
latency histograms (`http_request_duration_seconds`), and status-code
breakdown, labeled by method/path/status.

Custom business metrics (`app/core/metrics.py`), instrumented at the exact
service-layer call site where the real event happens (not synthesized from
the HTTP layer, so a Celery-task-driven creation still counts):

| Metric | Type | Labels | Incremented in |
|---|---|---|---|
| `strategies_created_total` | Counter | — | `create_strategy()` |
| `validations_run_total` | Counter | — | `run_strategy_validation()` |
| `evolution_runs_total` | Counter | — | `run_evolution_in_session()` |
| `llm_calls_total` | Counter | `function_name` | `LLMService._call_tool()` — the one method all 4 LLM functions funnel through |
| `failures_detected_total` | Counter | `trigger_condition` | `persist_failure()` |
| `active_strategies_gauge` | Gauge | — | Recomputed every 60s by the existing `system_heartbeat` beat task (a fresh `COUNT(*) WHERE status='active'` across all orgs), not incremented/decremented at each of the many code paths that can move a strategy into or out of `active` (kill switch, `/approve`, the generic `/transition`, evolution auto-registration) — self-correcting every tick rather than accumulating drift from a missed decrement. |
| `celery_queue_pending_gauge` | Gauge | `task_name` | Same 60s heartbeat tick, reusing Batch 12's existing `get_job_queue_counts()` |
| `service_health_gauge` | Gauge | `service` | Set to 1/0 on every `_timed_check()` probe in `system_health.py` (Postgres/TimescaleDB/Redis/Celery) — this is what the "any service down > 1 minute" alert rule (below) actually queries; the rich `/system/health-detailed` JSON is for a human looking at a dashboard, this gauge is for Prometheus to alert on the same underlying checks. |

### Sentry (error tracking)

`sentry_sdk.init(...)` runs in `app/main.py` guarded by `if
settings.SENTRY_DSN:` — completely inert (SDK never initializes, zero
overhead, zero network calls) until a real DSN is supplied. Uses the
`FastApiIntegration`/`StarletteIntegration`, which patch `ExceptionMiddleware`
to capture every exception before any registered handler runs — confirmed
this coexists correctly with `UnhandledExceptionMiddleware` (see
"Unhandled-exception handling, corrected" below): Sentry still captures the
exception for reporting even though that middleware independently returns
the clean, CORS-correct JSON 500 the client sees — the two are independent,
not competing. An admin-only `GET
/system/observability/sentry-test` route exists purely to deliberately raise
`RuntimeError` on demand, for verifying capture end-to-end once a real DSN is
configured — it does nothing else and touches no data.

Frontend mirrors this with `@sentry/nextjs`'s current App Router convention
— `instrumentation.ts` (+ `sentry.server.config.ts`/`sentry.edge.config.ts`
it conditionally imports by runtime) and `instrumentation-client.ts`, all
reading `NEXT_PUBLIC_SENTRY_DSN`, all no-ops when unset — plus a matching
"Error Tracking (Sentry)" card on `/admin/system` with two buttons: one calls
the backend sentry-test route, one throws a real client-side exception
directly. `app/global-error.tsx` also added (the SDK's own dev warning
flagged its absence): without it, React *render* errors in the App Router
aren't captured, only event-handler/unhandled exceptions (which the global
window handlers already cover).

**Neither integration has been verified against a real Sentry project** —
same deferral as `ANTHROPIC_API_KEY`: creating a Sentry account is a
"create an account" action outside what this codebase can do for the
project owner. What's been verified instead, live:
- The SDK does not error or change any request/response behavior when
  `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are unset (the default, current
  state) — confirmed by curling the backend test route and clicking both
  frontend buttons with no DSN configured.
- **The transport is genuinely wired, not just imported**: pointed
  `sentry_sdk.init()` at a syntactically-valid DSN whose host is a local
  `http.server` listener instead of sentry.io (no account, no real network
  dependency), called `capture_exception()` + `flush()`, and confirmed the
  listener received a real `POST /api/1/envelope/` with
  `Content-Type: application/x-sentry-envelope` and a gzip-compressed body
  — i.e. `sentry_sdk.init(dsn=...)` → `capture_exception()` → an actual
  outbound envelope, exactly the pipeline a real DSN would use.
- The admin-only backend route and the frontend's "Trigger Backend/Frontend
  Exception" buttons were each clicked/curled and produce a real, intentional
  exception on their respective side (see the error-handling fix below for
  what curling the backend route surfaced).

### Unhandled-exception handling, corrected (bug found via live verification)

Batch 11 registered `@app.exception_handler(Exception)` believing it ran
inside `CORSMiddleware` (so a client would still get CORS/security headers
on an unhandled-exception 500). Live-testing the new sentry-test route in
this batch — curling it with both an `Origin` header and an inbound
`X-Request-ID` — showed neither ever reached the client on the resulting
500. Tracing this against the installed `starlette.applications
.build_middleware_stack` confirmed why: Starlette special-cases a handler
registered for the literal `Exception` (or `500`) key onto
`ServerErrorMiddleware`, which its own docstring says is deliberately used
"to wrap *everything* else up" — i.e. it sits **outside** every
`app.add_middleware()` layer, CORS included. The Batch 11 belief was simply
wrong for this Starlette version.

Fix: `app/core/error_handling.py`'s `UnhandledExceptionMiddleware` replaces
the `@app.exception_handler(Exception)` registration. It's a plain ASGI
middleware (not `BaseHTTPMiddleware`) registered **first** (so, per
Starlette's `add_middleware`-makes-each-new-call-outermost rule, it's the
*innermost* user middleware — right next to `ExceptionMiddleware`/the
router). Every middleware added after it (CORS, SecurityHeaders,
RequestID) now sees `call_next()` return a normal Response instead of a
raised exception, so each gets to add its own headers on the way back out.

Plain ASGI, not `BaseHTTPMiddleware`, is a second, independent fix bundled
into the same change: `BaseHTTPMiddleware.call_next()` runs the wrapped app
in a separate `anyio` task (confirmed against the installed
`starlette.middleware.base` source — `task_group.start_soon(coro)`), and a
child task's `contextvars.bind_contextvars()` calls are invisible to the
parent task once control returns. `organization_id`/`user_id` are bound
during dependency resolution (`app/api/deps.py`), below this middleware in
the stack — had it stayed `BaseHTTPMiddleware`-based, that binding would
never have been visible in its own exception log line. Confirmed live,
before vs. after: the log line for a deliberately-thrown exception showed
`request_id=...` in both versions, but only gained
`organization_id=... user_id=...` after switching to plain ASGI.

`ServerErrorMiddleware` stays registered as-is (Starlette wires it in
regardless) as a last-resort net for anything that escapes even this — e.g.
an exception raised by another middleware itself — but in the normal case
it no longer fires; `UnhandledExceptionMiddleware` still re-raises after
sending its response (mirroring `ServerErrorMiddleware`'s own "always
continue to raise... allows servers to log the error" convention), so
uvicorn's own default error logging also fires once per exception — a
harmless, expected duplicate, by design, not a bug.

### Liveness vs. readiness

Batch 0's `/health` (rich, always-200, per-service detail — the payload the
System Monitoring page's precursor and now `/system/health-detailed` build
on) is unchanged. Two new, deliberately minimal endpoints exist alongside it
for the K8s-probe use case Batch 17 will actually wire up:

- **`GET /health/live`** — no dependency checks at all; returns 200 the
  instant the ASGI process can schedule a coroutine. This is "is the process
  still alive," full stop — a K8s liveness probe failing here means *kill
  and restart the pod*, so it must never fail because Postgres is briefly
  slow.
- **`GET /health/ready`** — checks Postgres and Redis connectivity (reusing
  `check_health()`'s existing probes; Celery is deliberately excluded — it is
  async by design, so an API request doesn't need a live worker to be servable).
  Returns 503 (not 200-with-a-status-field, unlike `/health`) when either
  check fails — a K8s readiness probe failing here means *stop routing
  traffic to this pod, but don't restart it*, the correct response to "the
  DB is briefly unreachable," not "this process is broken."
- `SystemHealthDetailedResponse` (Batch 12) gained `liveness: bool` and
  `readiness: bool` fields, computed from the same two checks, so the human
  dashboard view states the distinction explicitly too — not just the two
  machine-facing probe endpoints.

### Alerting

Grafana's own built-in alerting (not a separate Alertmanager container —
the batch's own instructions offer this as an explicit either/or, and one
fewer moving part is the right call for a bootstrapped v1) evaluates rules
directly against the Prometheus datasource, provisioned from
`infra/grafana/provisioning/alerting/`:

1. **Error rate > 5% over 5 minutes** — `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.05`.
2. **Celery queue depth > 100 pending for > 10 minutes** — `sum(celery_queue_pending_gauge) > 100`, `for: 10m`.
3. **Any service down for > 1 minute** — `min(service_health_gauge) < 1`, `for: 1m` (per-service breakdown is visible in the alert's own labels; the rule itself is "is anything unhealthy," not one rule per service, so adding a 6th monitored service later doesn't require a 6th alert rule).

All three route to a single webhook contact point
(`GRAFANA_ALERT_WEBHOOK_URL`, e.g. a Discord/Slack incoming-webhook URL) —
unset by default (provisioning renders an empty URL, Grafana simply won't
have a working contact point until the owner supplies one), same deferred-
credential shape as everything else in this section.

**Live-verified end-to-end**, not just written and trusted: ran the real
Prometheus and Grafana binaries natively (no Docker on this dev machine —
see "Judgment calls" below) against the actual running backend, pointed
`GRAFANA_ALERT_WEBHOOK_URL` at a throwaway local `http.server` listener
(standing in for a real Discord/Slack webhook — no external account
needed), and confirmed via each layer's own API:
- Prometheus `up{job="stellix-backend"} == 1`; `strategies_created_total`
  visibly incremented from 0 to 1 in Prometheus after creating a real
  strategy through the API.
- Grafana provisioned the `Prometheus` datasource, the `Stellix Labs —
  Overview` dashboard (all 11 panels present via `/api/dashboards/uid/...`),
  and all 3 alert rules (`/api/v1/provisioning/alert-rules`), plus the
  webhook contact point and notification policy pointing at it.
- Querying dashboard panel expressions through Grafana's own datasource
  proxy returned real values — e.g. `service_health_gauge` correctly showed
  `postgres=1, redis=1, neo4j=0, timescaledb=0, celery_worker=0`, matching
  this dev environment's actual (already-documented) degraded-service
  state exactly.
- **Two of the three rules genuinely fired** on real conditions (not just
  configured): "Any service down for > 1 minute" fired within its 1-minute
  `for` window off the real neo4j/timescaledb/celery_worker outages above,
  and "Error rate > 5% over 5 minutes" fired after a deliberate burst of
  requests to the sentry-test route pushed the real error rate to ~45%.
  Both delivered a real webhook POST, captured by the throwaway listener,
  with the exact alertname/summary/severity from the provisioning YAML and
  correct `A`/`B`/`C` values from the reduce→threshold expression chain.
  The third (Celery queue depth > 100) was left unforced — provisioned and
  under active evaluation, but manufacturing 100+ real pending tasks
  wasn't worth the disruption once the alerting *mechanism* was already
  proven twice over.

### Judgment calls (documented per the schema-first rule)

1. **stdlib logging left in place, structlog added downstream.** Rewriting
   every existing `logger = logging.getLogger(__name__)` call site
   (present in nearly every service module from Batch 1 onward) to
   `structlog.get_logger()` would be a large, mechanical, high-blast-radius
   diff for zero behavioral difference — structlog's own recommended
   integration path for an existing stdlib-logging codebase is exactly the
   downstream-formatter approach used here.
2. **`active_strategies_gauge`/`celery_queue_pending_gauge` are recomputed
   on a tick, not incremented at each mutation site.** A strategy can move
   into/out of `active` from at least four different code paths (kill
   switch, `/approve`, the generic `/transition`, evolution
   auto-registration); a periodic, self-correcting recompute (reusing the
   existing 60s heartbeat beat task) is more robust than threading a
   counter increment/decrement through all four and risking drift if any
   one of them is ever modified without remembering the metric.
3. **Grafana's built-in alerting, not a separate Alertmanager service.**
   The batch's own instructions present this as a real choice; standing up
   an entire additional container for a v1, single-webhook alerting need is
   scope the prompt doesn't actually require.
4. **Sentry DSN and Grafana webhook are both deferred, undemonstrated
   against a real external account.** Both require the project owner to
   create a third-party account/credential — an action this codebase (and
   this assistant) cannot perform on the owner's behalf, identical in kind
   to Batch 9's `ANTHROPIC_API_KEY`. What's verified instead is documented
   above per integration.
5. **Prometheus and Grafana run as native Windows binaries for local
   verification, not via `docker-compose up`.** This dev machine has no
   Docker (see "Local env constraints" — the same reason Neo4j runs
   degraded-gracefully rather than live throughout this whole project).
   `infra/docker-compose.yml` gained real `prometheus`/`grafana` service
   definitions for when Docker *is* available (a real deployment target);
   this dev pass additionally downloaded/ran the native equivalents so the
   dashboard, scrape, and alert-firing behavior could be proven against
   real data rather than trusted from the YAML alone.
6. **`@app.exception_handler(Exception)` replaced with a plain-ASGI
   middleware, not just re-registered.** See "Unhandled-exception handling,
   corrected" above — this was a genuine pre-existing bug (missing CORS/
   security/request-id headers on every unhandled-exception response),
   found via this batch's own live verification, not a hypothetical.
7. **`@sentry/nextjs` install surfaced 3 dev-time warnings, all fixed
   rather than ignored**: `disableLogger` → `webpack.treeshake
   .removeDebugLogging` (deprecated option name), added the required
   `onRouterTransitionStart` export to `instrumentation-client.ts`, and
   added `app/global-error.tsx` (without it, React render errors — as
   opposed to event-handler/unhandled exceptions — aren't captured). All
   three came directly from the SDK's own startup console output.
8. **One accepted, unfixed `npm audit` finding**: installing
   `@sentry/nextjs` pulls in its own nested `next` dependency (for internal
   type/build-plugin use) on an old range with a moderate PostCSS XSS
   advisory. `npm audit fix --force` would downgrade the *project's own*
   Next.js to 9.3.3 to "fix" it — worse than the transitive, build-time-only,
   nested-dependency issue it claims to resolve. Left as-is, matching the
   Batch 11 dependency-audit precedent of documenting an accepted low-risk
   finding rather than applying a destructive fix.

---

## Billing & Subscriptions (Batch 14)

Wires real Stripe billing onto Batch 1's existing `Organization.tier`/
`max_strategies` fields — no new tenant concept, just a real payment/sync
layer behind fields that already existed. `ANTHROPIC_API_KEY`-style deferred
credentials: `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are unset in this
deployment (no sponsor funding yet), and every billing code path is gated so
it 503s cleanly rather than crashing — see "Deferred-credential gating"
below.

### New `Settings` fields

| Field | Default | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | `None` | Empty = every billing endpoint 503s "Billing not configured" — same deferral pattern as `ANTHROPIC_API_KEY` (Batch 9) and `SENTRY_DSN` (Batch 13). Requires the project owner's own Stripe account. |
| `STRIPE_WEBHOOK_SECRET` | `None` | Per-endpoint signing secret Stripe issues when a webhook endpoint is registered (dashboard or `stripe listen`); required to verify `POST /billing/webhook` payloads. Independently deferrable from `STRIPE_SECRET_KEY` — a key can be configured before the webhook endpoint is registered with Stripe. |
| `STRIPE_PUBLISHABLE_KEY` | `None` | Frontend-visible key (mirrored to the frontend as `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`). Not actually used server-side — Stripe Checkout/Portal are fully hosted redirects, no `Stripe.js` Elements needed — but documented/reserved since almost every Stripe integration guide expects it to exist. |
| `STRIPE_PRICE_STARTER` | `None` | Price ID (`price_...`) for the Starter monthly plan. Printed by `/scripts/stripe_setup.py`, pasted into `.env` — never hardcoded in application code (a Stripe Price ID is environment-specific: test-mode and live-mode products/prices are entirely separate objects with different IDs). |
| `STRIPE_PRICE_PRO` | `None` | Price ID for the Pro monthly plan. Same deferral/no-hardcode rule. |
| `FRONTEND_URL` | `http://localhost:3000` | Used to build the absolute `success_url`/`cancel_url` (Checkout) and `return_url` (Customer Portal) Stripe redirects back to. New setting — nothing before this batch needed the backend to construct a frontend URL. |

No `STRIPE_PRICE_ENTERPRISE`: Enterprise is "Contact Sales," deliberately
never has a Stripe Price or a self-serve Checkout path (see "Judgment
calls").

### Pricing (`/scripts/stripe_setup.py`)

One-time setup script (not an API route, not run automatically) that creates
2 Stripe Products + Prices via the real Stripe API and prints the resulting
Price IDs for the owner to paste into `.env` as `STRIPE_PRICE_STARTER`/
`STRIPE_PRICE_PRO` — Price IDs are never hardcoded anywhere in application
code, exactly like `GRAFANA_ALERT_WEBHOOK_URL` is never hardcoded (Batch 13
precedent for "the owner pastes an ID/secret into `.env` after a one-time
external-service setup step").

| Tier | Price | Stripe Price |
|---|---|---|
| Starter | $49/mo | recurring, monthly, USD |
| Pro | $199/mo | recurring, monthly, USD |
| Enterprise | Contact Sales | no Stripe object at all |

Idempotent by product name lookup (re-running the script after Products
already exist prints the existing Price IDs instead of creating duplicates)
— a one-time setup script that silently double-creates billing products on a
second run would be a real footgun.

### Subscription

Tenant-scoped (`TenantScopedModel`) sync record of the organization's Stripe
subscription. Exactly one row per organization once they've ever completed
Checkout (`UNIQUE (organization_id)`) — an org that has never upgraded off
the free Starter default has **no** Subscription row at all; `GET
/billing/status` handles that as a normal, expected state, not an error.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `organization_id` | uuid | NN, FK → organizations.id, UQ | One subscription record per org. |
| `stripe_customer_id` | str | NN, UQ | Stripe `Customer` ID — created on first checkout, reused for every subsequent checkout/portal session for this org. |
| `stripe_subscription_id` | str | nullable, UQ | Stripe `Subscription` ID. Nullable: a `Customer` can exist (e.g. mid-Checkout) fractionally before `checkout.session.completed` actually creates the subscription. |
| `tier` | enum | NN | `organization_tier` (the SAME enum as `Organization.tier` — reused, not redefined, per the schema-first "extend, never redefine" rule). What Stripe's line item says this subscription is for. |
| `status` | enum | NN | `subscription_status`: `active`, `past_due`, `canceled`, `trialing` (below). |
| `current_period_end` | timestamptz | nullable | End of the current billing period — drives "Manage Billing" UI copy ("renews on..." / "access until..."). |
| `cancel_at_period_end` | bool | NN, default `false` | True when the customer canceled via the Portal but Stripe hasn't yet reached `current_period_end` — subscription is still `active` today, but won't renew. |
| `created_at`/`updated_at` | timestamptz | NN, server default | |

**`subscription_status` enum**: `active`, `past_due`, `canceled`, `trialing`
— exactly the 4 values the batch prompt specifies. Stripe's own API reports
a superset (`incomplete`, `incomplete_expired`, `unpaid`, `paused`); the
webhook handler maps those down onto this 4-value enum rather than widening
it to match Stripe 1:1 (see "Judgment calls" — incomplete/unpaid → treated
as `past_due`, paused → treated as `canceled`), since every consumer of this
field in this codebase (rate limiter, tier gate, billing page) only ever
needs to ask "is this org currently paying and current," not reproduce
Stripe's full state machine.

**`Organization.tier`/`Organization.max_strategies` remain the fields
everything else in the codebase reads** (Batch 11's rate-limit multiplier,
Batch 1's strategy cap) — unchanged from before this batch. What changes is
*who writes to them*: before Batch 14 nothing ever updated them after
registration; from this batch on, the webhook handler is the sole writer,
using `TIER_MAX_STRATEGIES` (already defined in `app/models/organization.py`
since Batch 1) to keep `max_strategies` consistent with `tier` on every
transition. This satisfies the prompt's "confirm tier enforcement reads from
the real subscription tier" requirement without changing the read side at
all — `Organization.tier` only counts as "the real subscription tier" once
something keeps it live-synced, which is exactly what this batch adds.

### Billing endpoints (`app/api/routes/billing.py`)

Two separate `APIRouter` instances in one file, registered differently in
`app/api/router.py`:

- **`billing.router`** (`GET /billing/status`, `GET /billing/invoices`,
  `POST /billing/checkout`, `POST /billing/portal`) — JWT-authenticated,
  admin-only (`require_role(UserRole.ADMIN)`, matching Batch 12's
  `PATCH /organizations/me` precedent for org-level settings), registered
  with the router-wide global rate limiter like every other authenticated
  router.
- **`billing.webhook_router`** (`POST /billing/webhook`) — Stripe calls this
  server-to-server with no JWT at all (there is no user in the loop); it can
  only be registered *without* the global rate limiter (which keys off a JWT
  `sub` claim that doesn't exist here) — mirrors exactly how `auth.router` is
  excluded from `_GLOBAL_LIMIT` in `app/api/router.py` for the same reason
  (pre-auth, no JWT yet). Authenticity here comes entirely from Stripe's
  signature, not from FastAPI's normal auth dependency.

**`POST /billing/checkout`** — body `{"tier": "starter" | "pro"}`. `tier ==
"enterprise"` is rejected with a `400` pointing at the contact-sales flow
(not a Stripe API call at all — there is no Enterprise Price to check out
into). Creates (or reuses, via `Subscription.stripe_customer_id`) a Stripe
`Customer`, then a `checkout.Session` in `mode="subscription"` with the
tier's Price ID, `success_url`/`cancel_url` built from `settings.FRONTEND_URL`,
and `client_reference_id`/`metadata.organization_id` set to the caller's org
— the webhook handler has no other way to know which of *our* organizations
a given Stripe event belongs to except by reading back whatever metadata we
put there ourselves. Returns `{"checkout_url": "..."}`; the frontend does a
full-page redirect, no custom card form (PCI-scope avoidance is the entire
reason Stripe Checkout exists over a custom form).

**`POST /billing/webhook`** — reads the raw request body (`await
request.body()`, never `request.json()` — Stripe's signature is computed
over the exact raw bytes, and re-serializing a parsed-then-dumped JSON body
is not guaranteed byte-identical) and the `Stripe-Signature` header, verifies
via `stripe.Webhook.construct_event(payload, sig_header, settings
.STRIPE_WEBHOOK_SECRET)`. An invalid or missing signature →
`stripe.error.SignatureVerificationError` → `400` (never processed, never
trusted). Opens an **unscoped** system session (`get_system_session()`) —
by design: the whole point of this handler is to look up *which* organization
a Stripe object belongs to from `metadata.organization_id`/
`stripe_customer_id`, so it cannot already have a tenant bound the way a
normal authenticated request does. Handles exactly 4 event types (anything
else is acknowledged with 200 and ignored — Stripe expects an ack for every
event type it sends to an endpoint subscribed to "all events," not just the
ones we act on):
  1. **`checkout.session.completed`** — reads `metadata.organization_id` +
     `customer` + `subscription` off the session; upserts the org's
     `Subscription` row (`stripe_customer_id`, `stripe_subscription_id`,
     `tier` from `metadata.tier`, `status="active"`); updates
     `Organization.tier`/`max_strategies` to match.
  2. **`customer.subscription.updated`** — the general sync path for
     upgrades/downgrades/renewals initiated either through the Portal or a
     new Checkout: reads the subscription's own `status`, `current_period_end`,
     `cancel_at_period_end`, and the tier off its price ID (reverse-mapped
     against `STRIPE_PRICE_STARTER`/`STRIPE_PRICE_PRO`); updates
     `Subscription` + `Organization.tier`/`max_strategies` together.
  3. **`customer.subscription.deleted`** — see "Judgment calls" for the
     read-only-vs-lockout decision: downgrades `Organization.tier` to
     `starter` and `max_strategies` to Starter's cap (`25`), sets
     `Subscription.status = "canceled"`. Does **not** touch
     `Organization.is_active` (that remains the actual, separate,
     admin-only "suspend this tenant" mechanism from Batch 1) and does
     **not** delete/retire any existing strategies over the new, lower cap
     — same "never delete, only gate new creation" behavior
     `create_strategy`'s existing cap check already has.
  4. **`invoice.payment_failed`** — sets `Subscription.status = "past_due"`
     and fires a new `NotificationType.PAYMENT_FAILED` to
     `{ADMIN, CIO}`-role users via the existing `notify_users_with_roles`
     helper (Batch 12) — billing is an org-leadership concern, not the
     narrower `GOVERNANCE_ROLES` set (which includes `risk_manager`, who
     doesn't need a payment-failure alert).

**`POST /billing/portal`** — creates a Stripe `billing_portal.Session` for
the org's existing `stripe_customer_id` (`404`/clean error if the org has
never checked out — nothing to manage yet) with `return_url` back to the
billing page. Returns `{"portal_url": "..."}` for a full-page redirect —
this is how cancellation/payment-method/plan-switch UI is delivered without
building any of it ourselves, per the batch prompt.

**`GET /billing/status`** — `{tier, max_strategies, active_strategy_count,
subscription_status, current_period_end, cancel_at_period_end}`; the
"no Subscription row yet" org gets `subscription_status: null` and its
current (Starter default) `tier`/`max_strategies`, not a 404.

**`GET /billing/invoices`** — proxies `stripe.Invoice.list_async(customer=...)`
live on every call; nothing is cached or stored locally, per the batch
prompt ("pull from Stripe API directly, don't store locally") — this is
billing/financial data Stripe already retains as the system of record, and
this codebase already has one precedent (Batch 12's compliance export) for
NOT needlessly duplicating a durable external record into Postgres.

### Deferred-credential gating

`app/services/billing.py`'s `BillingUnavailableError` mirrors Batch 9's
`LLMUnavailableError` exactly: every function checks
`if not settings.STRIPE_SECRET_KEY: raise BillingUnavailableError(...)`
*before* touching the `stripe` SDK at all (proactive guard, not a reactive
catch of whatever the SDK happens to raise on a missing key — Batch 12
found the reactive approach surprising once for Anthropic's SDK, so this
batch guards upfront instead). All 4 authenticated billing routes catch it
→ clean `503 {"detail": "Billing not configured"}`. The webhook route
guards the same way, but 503s instead of attempting (and failing) signature
verification with an empty secret — a `503` from a webhook endpoint is a
normal, retryable Stripe response (Stripe retries failed webhook deliveries
on a backoff schedule for several days), so this is safe even though no
human ever sees that response.

### Judgment calls (documented per the schema-first rule)

1. **Pricing: Starter $49/mo, Pro $199/mo** — taken directly from the batch
   prompt's own inline examples ("<<FILL IN PRICE e.g. $49/mo>>" /
   "e.g. $199/mo"), not independently invented. Enterprise has no price at
   all — contact-sales only, by design (large accounts negotiate).
2. **`customer.subscription.deleted` → downgrade to Starter limits, NOT
   account lockout.** A canceled subscription reverts `Organization.tier` to
   `starter`/`max_strategies` to `25` and blocks *new* strategy creation
   beyond that cap — it does not touch `Organization.is_active`, does not
   block login, and does not hide/retire any existing data. Rationale:
   Pillar 2 (Failure-as-Asset) already commits this codebase to never
   deleting/hiding research assets regardless of billing state, and
   "involuntary full lockout on a lapsed card" is a worse product experience
   than "you're back on the free tier's limits" for a tool whose value is
   the accumulated historical record. Full lockout remains available as a
   *separate*, deliberate admin action (`Organization.is_active = false`,
   already built in Batch 1) — billing status and tenant suspension are
   different concerns and this batch keeps them that way.
3. **Stripe's 8 subscription statuses collapsed onto the prompt's 4.**
   `incomplete`/`incomplete_expired`/`unpaid` → stored as `past_due`
   (payment not currently succeeding, but not necessarily final);
   `paused` → stored as `canceled` (not currently billing or providing
   service). Every actual consumer of this field only branches on
   "actively paying" vs. "not," so a wider enum would add states nothing
   reads.
4. **`max_strategies` is fully derived from `tier`, never independently
   set.** `TIER_MAX_STRATEGIES` (Batch 1) is the single mapping; the webhook
   never accepts an arbitrary strategy-cap number from Stripe metadata. A
   custom enterprise strategy cap outside the standard tiers would need a
   real product decision and its own schema field later, not a silent
   webhook-controllable override.
5. **`GET /billing/invoices` has no pagination parameters yet.** Passes a
   fixed `limit` to Stripe and returns whatever comes back — pagination can
   be added if a real customer ever accumulates enough invoices to need it;
   speculative cursor-pagination plumbing for an org's first few monthly
   invoices is exactly the kind of premature complexity the project avoids
   elsewhere.
6. **Deferred, undemonstrated against real Stripe** — same shape as
   `ANTHROPIC_API_KEY`/`SENTRY_DSN`: no `STRIPE_SECRET_KEY` is configured
   (no sponsor funding yet per this batch's own prompt), so the full
   checkout→webhook→portal round trip against Stripe's real API is not
   live-verified this batch. What *is* verified: every parameter shape used
   against the real `stripe` SDK (confirmed live against Stripe's actual API
   with a syntactically-valid-but-fake key — each call reached
   `AuthenticationError`, proving the request shape itself was accepted, not
   rejected for malformed parameters) and the full webhook signature
   verification logic (a real HMAC-SHA256 signature computed and verified
   end-to-end using `stripe.Webhook.construct_event` itself, no mocking of
   Stripe's own verification code).

---

## Public Site & Lead Capture (Batch 15)

The 8-page public marketing site (Landing, Product, Features, Architecture, Use
Cases, Pricing, Docs, Contact) is frontend-only except for one backend
addition: a lead-capture record for the Contact / Request-a-Demo form. Copy for
all 8 pages is finalized (and user-approved) in `docs/landing-page-copy.md` —
that document, not this one, is the source of truth for on-page text; the build
uses it verbatim.

### DemoRequest

The only new table this batch. Deliberately **not** `TenantScopedModel`: a demo
request comes from an anonymous public visitor who has no organization yet — it
is a pre-tenant lead, the mirror image of `Organization`/registration (which
also predate any tenant binding). Written by the unauthenticated
`POST /contact/demo-request` endpoint.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `first_name` | str | NN | |
| `last_name` | str | NN | |
| `work_email` | str | NN | Validated as a work address — free-webmail domains (gmail/yahoo/outlook/…) are rejected with a readable 422, per the approved copy. Not unique (a firm may request more than once). |
| `company` | str | NN | |
| `job_title` | str | NN | |
| `firm_type` | enum | NN | `demo_firm_type`: `hedge_fund`, `prop_trading`, `crypto_fund`, `investment_bank`, `asset_manager`, `family_office`, `academic_other`. |
| `team_size` | enum | NN | `demo_team_size`: `size_1_5`, `size_6_20`, `size_21_50`, `size_51_200`, `size_200_plus`. |
| `use_case_description` | text | NN | 20–500 chars, enforced in the Pydantic schema (mirrors the frontend live counter). |
| `primary_interest` | jsonb | NN, default `[]` | Multi-select; ≥1 required. Values from `demo_primary_interest`: `regime_detection`, `failure_intelligence`, `knowledge_graph`, `evolution_engine`, `validation_governance`, `full_platform`. Stored as a JSON string array (like `ApiKey.scopes`), not a second enum table — it's a small fixed vocabulary read only for lead triage. |
| `source` | str | nullable | Optional "how did you hear about us." |
| `consent` | bool | NN | Must be `true` — a `false`/absent consent is a 422, never a stored row. |
| `created_at` | timestamptz | NN, server default | |

**Endpoint** — `POST /contact/demo-request`, **public** (no JWT; a landing-page
visitor has no auth). Registered *without* the JWT-keyed global rate limiter
(same reason `auth`/`billing.webhook` are — there's no `sub` to key on),
carrying its own dedicated **per-IP** limiter (reuses Batch 11's
`per_ip_limiter`, 5/min/IP) to blunt form-spam. A hidden honeypot field on the
form is checked server-side: a filled honeypot returns a normal-looking 202
without storing anything, so bots get no signal. Persists the `DemoRequest` row,
then fires a **best-effort webhook notification** so a human sees the lead in
real time.

**`DEMO_WEBHOOK_URL` setting** — deferred/`None` by default (same pattern as
`SENTRY_DSN`/`GRAFANA_ALERT_WEBHOOK_URL`/`STRIPE_SECRET_KEY`): when set, the
endpoint POSTs a compact JSON summary of the lead to it (Discord/Slack-style
incoming webhook) via a small `app/services/webhook.py::post_webhook` helper;
when unset it logs the lead at INFO and moves on. The row is always written
regardless — the webhook is a notification, never a gate. Webhook delivery
failures are caught and logged, never surfaced to the visitor (who always gets
a clean success as long as the row saved).

### Judgment calls

1. **Public site fonts/animation are frontend-only, no schema impact.** The
   animated architecture-diagram hero, the interactive Neo4j-schema diagram, and
   the code blocks all render *real, already-documented* artifacts (the six
   regimes, the 8 graph edges, the Strategy rule DSL, the `recurring_failure_modes`
   query) — nothing new is invented for the marketing site, so there's nothing
   new to add here beyond `DemoRequest`.
2. **Pricing page module gating.** The public pricing page presents Evolution
   Engine + LLM assistant as Pro-tier features (Starter = the core research
   loop). This is a marketing/packaging presentation only — it does **not**
   change any enforcement code. Batch 14's sole enforced tier limit remains
   `max_strategies` (Starter 25 / Pro-Enterprise unlimited); no per-module
   feature flag is added to the backend this batch.
3. **Pricing checkout is auth-aware, not a second checkout path.** The
   Starter/Pro CTAs reuse Batch 14's existing admin-only `POST /billing/checkout`
   unchanged: a logged-in admin is sent straight to Stripe Checkout; an
   anonymous visitor is routed to `/register?plan=…` first (you can't create a
   Stripe subscription for an org that doesn't exist yet). No new billing
   endpoint.

---

## Governance Review, Audit Identity & Market Data (Batch 25)

Migration `0019_governance_audit_actor` (revises `0018_email_verify_invites`). All
changes are additive.

### audit_log additions (extends Batch 10)
Point-in-time snapshot of who acted and on what — so a compliance officer never has to
resolve a UUID, and a later role change or deleted user cannot rewrite history.

| Field          | Type | Constraints | Notes |
|----------------|------|-------------|-------|
| `actor_email`  | str(320) | nullable | Actor's email at the time of the action. NULL for system events and for rows written before 0019. |
| `actor_name`   | str(255) | nullable | Actor's display name at the time. |
| `actor_role`   | str(32)  | nullable | Actor's RBAC role at the time (`user_role` value). |
| `entity_name`  | str(255) | nullable | Human-readable target, e.g. the strategy name. |
| `description`  | text     | nullable | Plain-English sentence, generated by `services/audit.describe_event` when the caller supplies none. |

New indexes: `ix_audit_log_actor_user_id`, `ix_audit_log_created_at`.

Legacy rows are deliberately **not backfilled** (append-only table; a user's current role
is not evidence of the role they held then). `GET /governance/audit-log` resolves them
from the current profile and labels them `actor_identity_source="current_profile"`
(vs `"recorded"` / `"system"`).

**`audit_event_type` additions**: `logout`, `strategy_created`, `strategy_version_saved`,
`strategy_deleted`, `kill_switch_reviewed`, `llm_explanation_generated`.

Hook mapping (supersedes the Batch 10 note that `submit` is not logged): create →
`strategy_created`; save-as-new-version and rule-changing `PUT` → `strategy_version_saved`;
submit (draft→candidate), transition, retire, manual fail → `strategy_status_change`;
draft delete → `strategy_deleted` (with a `before_state` snapshot of the discarded rules);
CIO review → `kill_switch_reviewed`; stored LLM failure explanation →
`llm_explanation_generated` (actor = the user who caused it, NULL only for the automatic
monitor sweep); revoking a live refresh token → `logout`.

### KillSwitchReview (new, tenant-scoped)
One row per kill switch activation. The kill itself is still instant; this row records the
CIO review owed for it. Separate table because `audit_log` is append-only and a strategy
can be killed more than once.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | uuid | PK | |
| `organization_id` | uuid | NN, FK → organizations.id | Tenant. |
| `strategy_id` | uuid | NN, FK → strategies.id | |
| `triggered_by_user_id` | uuid | nullable, FK → users.id (SET NULL) | Brief's `kill_switch_triggered_by`. |
| `triggered_by_role` | str(32) | NN | Role at the time — decides whether review is owed. |
| `reason` | text | NN | Brief's `kill_switch_reason` (still mandatory). |
| `status_before_kill` | str(16) | NN | |
| `triggered_at` | timestamptz | NN | |
| `review_deadline` | timestamptz | NN | `triggered_at + 14 days`. Brief's `kill_switch_review_deadline`. |
| `reviewed_by_user_id` | uuid | nullable, FK → users.id (SET NULL) | Brief's `kill_switch_reviewed_by_cio`. |
| `reviewed_at` | timestamptz | nullable | |
| `review_note` | text | nullable | Required at the API when a CIO acknowledges. |
| `is_self_reviewed` | bool | NN, default false | True when a CIO pulled the switch. |
| `created_at`/`updated_at` | timestamptz | NN | |

Derived `review_state`: `self_reviewed` | `reviewed` | `overdue` (deadline passed, not
reviewed) | `pending`. Overdue reviews are never expired or hidden. Rules: a kill by
anyone other than a CIO (risk_manager **or admin**) owes a CIO review; only a `cio` can
acknowledge (segregation of duties — admin cannot sign off on the CIO's behalf); an
acknowledgement never reverses the kill.

### Strategy lifecycle additions (extends Batch 4)
- **Delete draft** — `DELETE /strategies/{id}` → 204. Only `status=draft`, only the
  creating user or an admin, and only if the strategy has no failures, approval records,
  validation results or child strategies. Everything else → 409 ("retire instead"). There
  is **no** delete path for retired strategies (Pillars 2/3).
- **Save as new version** — `POST /strategies/{id}/versions` (roles `researcher`,
  `admin`) with `change_reason` (required, 3–512 chars) and at least one changed rule /
  parameter / risk constraint. Bumps `vX.Y` → `vX.(Y+1)`, writes a `StrategyVersion`,
  never creates a new strategy row. Candidate/active/failed strategies return to `draft`.
  Retired strategies are immutable (409, also for `PUT`).
- **Approval currency** — an `ApprovalRecord` only counts for the version it was given to
  (`created_at >= latest StrategyVersion.created_at`), both for activation and for the
  approval-queue "already decided" filter.
- `StrategyListItem` gains `created_by_user_id`.

### Failure additions (extends Batch 6, no column change)
- New failures store `market_context_snapshot.symbol` (the instrument they were detected
  on). Existing rows are untouched (append-only) and report `symbol: null`.
- Derived read fields: `llm_explanation_status` (`generated` | `queued` | `unavailable`),
  `symbol`, `strategy_name`; `FailureRead` also `background_worker_online`.
- `POST /failures/{id}/explanation` queues generation (LLM rate limit applies); 503 when
  no provider capable of `explain_failure` (Claude) is configured.

### Other endpoints
| Endpoint | Method | Roles | Notes |
|----------|--------|-------|-------|
| `/governance/audit-log` | GET | admin, compliance_officer: all events; cio: risk/approval events org-wide; risk_manager: own risk/approval events | Adds `q` search, response `scope`, readable actor fields. |
| `/governance/kill-switch/reviews` | GET | risk_manager (own kills), cio, compliance_officer, admin | `review_state=all|awaiting|pending|overdue|reviewed|self_reviewed`, `since_days`. |
| `/governance/kill-switch/reviews/{id}/acknowledge` | POST | cio | Body `{note}`. |
| `/governance/strategy-controls` | GET | governance view roles | Non-retired strategies + anything retired in the last 14 days. |
| `/governance/export` | GET | admin, compliance_officer | Recent export jobs. Job reads add `worker_online` + `status_message`. A broker failure at enqueue marks the job `failed` (503) instead of leaving it `pending`. |
| `/users/members` | GET | admin, compliance_officer | Read-only org member directory (`q` filter). |
| `/llm/audit-log` | GET | admin, compliance_officer | Entries add `user_email`, `user_name`. |
| `/market/indices` | GET | any authenticated user | See below. |

### Global market indices (not tenant data)
Delayed public quotes, **not** a real-time feed. Stored in Redis
(`market:global_indices:latest`), never in a tenant table, and broadcast on the realtime
bridge's **global** scope. `MarketDataProvider.fetch_latest_quotes(symbols)` returns
`LatestQuote(symbol, last_price, previous_close, session_date, error)`; yfinance implements
it with one batched 5-day daily download.

| Quote field | Notes |
|-------------|-------|
| `symbol`, `name`, `region` | From the fixed index registry. |
| `last_price`, `previous_close`, `change`, `change_pct` | **null whenever `status="unavailable"`** — a stale number is never sent as current. |
| `session_date` | Exchange session the price belongs to (not a live trade time). |
| `fetched_at` | Last successful refresh. A failed refresh keeps the last good price but does not reset this clock. |
| `status`, `unavailable_reason` | `unavailable` once `fetched_at` is older than `MARKET_QUOTES_STALE_AFTER_SECONDS`. |

Tickers (all verified against yfinance on 2026-09-16): `^GSPC`, `^DJI`, `^IXIC`, `^FTSE`,
`^GDAXI`, `^N225`, `^HSI`, `^NSEI`, `^BSESN`.

Settings: `MARKET_QUOTES_ENABLED` (true), `MARKET_QUOTES_PROVIDER` (yfinance),
`MARKET_QUOTES_REFRESH_SECONDS` (120, also the beat interval), `MARKET_QUOTES_STALE_AFTER_SECONDS`
(900), `MARKET_QUOTES_REALTIME` (false; only true with a real-time provider),
`MARKET_QUOTES_SKIP_WEEKENDS` (true).

### Realtime envelope scope (extends Batch 19)
Envelopes now carry `scope`: `"organization"` (default; delivered to one org's sockets;
missing `organization_id` → dropped) or `"global"` (public, non-tenant data only; delivered
to every socket; `target_user_ids` ignored). Only `market_quotes` uses `global`.

---

## Dynamic RBAC (Batch 26)

Migration `0020_dynamic_rbac` (revises `0019_governance_audit_actor`). Design and
deprecation plan: ADR 0006.

### permissions
| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | uuid | PK | Deterministic `uuid5` for catalog permissions. |
| `key` | str(100) | unique, not null | Dotted key, e.g. `strategy.approve`. |
| `description` | text | not null, default "" | |
| `category` | str(64) | not null | Groups the permission matrix UI. |
| `created_at` / `updated_at` | timestamptz | | |

### roles (not tenant-scoped — see ADR 0006)
| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | uuid | PK | Deterministic `uuid5` for the five default system roles. |
| `organization_id` | uuid | FK organizations ON DELETE CASCADE, nullable | NULL = system role. |
| `name` | str(100) | unique with `organization_id`; system names unique via partial index `uq_roles_system_name` | |
| `description` | text | not null, default "" | |
| `is_system_default` | bool | not null | The five original roles; cannot be renamed or deleted. |
| `system_key` | str(32) | unique, nullable | Legacy `user_role` value for default roles. |
| `created_by_user_id` | uuid | FK users ON DELETE SET NULL, nullable | |

### role_permissions
| Field | Type | Constraints |
|-------|------|-------------|
| `role_id` | uuid | PK, FK roles ON DELETE CASCADE |
| `permission_id` | uuid | PK, FK permissions ON DELETE CASCADE |

### Column additions
- `users.role_id` — uuid, FK roles ON DELETE RESTRICT, nullable, indexed. Backfilled from
  `users.role`. `users.role` is deprecated (kept in sync for system roles).
- `invitations.role_id` — uuid, FK roles ON DELETE SET NULL, nullable. Backfilled from
  `invitations.role`.
- `audit_log.actor_role` widened `str(32)` → `str(100)` (custom role names).
- `audit_event_type` additions: `role_created`, `role_updated`, `role_deleted`,
  `role_permissions_changed`.

### Seeded system roles
| Role | Permissions |
|------|-------------|
| Researcher | `strategy.version` |
| Risk Manager | `governance.view`, `strategy.approve`, `strategy.retire`, `strategy.fail_manual`, `killswitch.trigger`, `notifications.approval_requests`, `notifications.failure_alerts`, `audit.view.own_risk` |
| CIO | Risk Manager's governance set (without `audit.view.own_risk`) + `killswitch.review`, `killswitch.history.view_all`, `audit.view.org_risk`, `notifications.billing_alerts` |
| Compliance Officer | `governance.view`, `strategy.approve`, `killswitch.history.view_all`, `audit.view.all`, `compliance.export`, `llm_audit.view`, `members.view`, `notifications.approval_requests` |
| Admin | Every catalog permission except `killswitch.review`, `audit.view.org_risk`, `audit.view.own_risk` |

---

## Validated Gate Score (ADR 0008)

Migration `0021_validated_gate_score` (revises `0020_dynamic_rbac`).

### Column additions
| Table | Field | Type | Notes |
|-------|-------|------|-------|
| `strategies` | `backtest_robustness` | float, nullable | A single backtest's own 60/40 robustness (Batch 4). Display only — written by `run_strategy_backtest` and by GA candidate registration. **Never gates activation.** |
| `validation_results` | `strategy_version` | str(20), nullable | The strategy version this result validated. NULL on historical rows other than each strategy's most recent. |

`strategies.robustness_score` is now written **only** by `run_strategy_validation`, and
holds the 5-method composite. `assert_activatable` requires a validation result whose
`strategy_version` equals the strategy's current version, so editing rules invalidates the
evidence rather than carrying it forward.

### Data repair performed by the migration
- Existing `robustness_score` values were copied to `backtest_robustness`.
- Each strategy's `robustness_score` was reset to its latest validated composite, or NULL
  where it had never been validated.
- `ACTIVE` strategies with no validation record were demoted to `candidate`.

---

## Quant Engineer, Symbol & Research Signals (Batch 26 Part B)

Migrations `0022_strategy_symbol`, `0023_quant_engineer_signals_view`,
`0024_strategy_signals` (revises `0021_validated_gate_score` in sequence).

### Column additions
| Table | Field | Type | Notes |
|-------|-------|------|-------|
| `strategies` | `symbol` | str(32), nullable | The instrument the strategy trades. Required at creation going forward (API schema, not a DB constraint) — nullable so strategies predating this column stay untouched. Backfilled to `'SPY'` only for the one currently-active SPY-named strategy (the sole unambiguous case); every other NULL row was left alone. |

### New permission + system role (0023, additive delta on top of 0020)
| Role | Permissions |
|------|-------------|
| Quant Engineer (new system role, `system_key=quant_engineer`) | `strategy.version`, `signals.view` — a research/build role, no governance permissions |

`signals.view` (new, category Research) was also granted to the five original system
roles: Researcher, Risk Manager, CIO (research/oversight use), Compliance Officer
(audit-read), and Admin (holds every permission but three governance ones). Migration
0020 stays frozen; 0023 holds this delta as its own frozen copy, and
`tests/test_dynamic_rbac.py::test_migration_seed_matches_catalog_exactly` checks the
union of 0020 + 0023 against the live `app/rbac/catalog.py`.

### strategy_signals (new, tenant-scoped)
| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | uuid | PK | |
| `organization_id` | uuid | FK organizations ON DELETE CASCADE, not null | |
| `strategy_id` | uuid | FK strategies ON DELETE CASCADE, not null, indexed | |
| `symbol` | str(32) | not null | |
| `signal_type` | enum(`BUY`,`SELL`,`HOLD`) | not null | |
| `evaluated_at` | timestamptz | not null | When this signal became current (the change point). |
| `last_evaluated_at` | timestamptz | not null | Bumped on every re-evaluation that leaves the signal unchanged; a new row is written only when `signal_type` changes. |
| `regime_at_signal` | str(64), nullable | | Real current regime for the symbol, joined at signal time. |
| `rule_snapshot` | jsonb | not null, default `{}` | The entry/exit rule that fired, or `{"event": "none", ...}` for HOLD. |
| `robustness_score_at_signal` | float, nullable | | The ADR-0008-corrected validated composite — **never** `backtest_robustness`. |

`audit_event_type` addition: `signal_generated` (written once per persisted row, not on
every unchanged re-evaluation).

### Signal generation (`app/services/signals.py`)
100% deterministic: reuses the real `strategy.version`-adjacent gate helpers
(`_has_approve_record`, `_validated_version`, `lifecycle.assert_activatable`) so a
signal is only ever produced for a strategy that is genuinely Active per ADR 0008 —
never a parallel "good enough" check — and the real DSL evaluator
(`app.strategy.dsl.generate_signals`). HOLD is derived by replaying position state
across the symbol's bars (entering only from flat, exiting only from a position,
mirroring `vectorbt.Portfolio.from_signals`), then reading the latest bar's event on
top of that replayed state — not simply "no event fired today". The module has zero
import path to `app.llm`, enforced by the same import-graph mechanism as Safeguard 2
(`app.llm.architecture_check.find_banned_imports`).

### Realtime delivery
New WS event `strategy_signal`, published via the **organization** scope (never
`global` — signals are private per-tenant research output, unlike public market
quotes). A Celery beat entry (`refresh_strategy_signals`, tied to
`MARKET_QUOTES_REFRESH_SECONDS`) re-evaluates every genuinely-Active strategy across
every active org each cycle, in its own tenant-scoped session, publishing only on a
signal change.

### GET /signals
Gated on `signals.view`. Returns the caller's org's genuinely-Active strategies with
their current signal, evaluating (and persisting on change) at read time as well as
on the periodic sweep.

---

## Market Research Widgets (Batch 28)

Global, non-tenant data (same reasoning as Batch 25's index quotes) — no new tables,
no new migration. Everything here is Redis-cached and served from that cache; a
request never calls a data provider directly.

### Macro Dashboard (`app/services/macro_data.py`, `app/providers/fred_client.py`)
FRED (Federal Reserve Bank of St. Louis) — the real, documented `api.stlouisfed.org`
REST API, not the keyless CSV-graph shortcut some other tools use. Requires a free,
self-service `FRED_API_KEY` (deferred-credential pattern, same as
`ALPHA_VANTAGE_API_KEY`); unset means every series reports `status: "not_configured"`,
never fabricated data. Series: the Treasury Constant Maturity yield curve
(`DGS1MO`…`DGS30`) and CBOE VIX (`VIXCLS`). Refreshed once a day at most
(`FRED_REFRESH_SECONDS`, default 86400) — FRED itself updates these once a day.
New WS event `macro_update`, **global** scope.

### Market Screener (`app/services/market_screener.py`)
A curated, BOUNDED universe of 56 well-known, liquid US equities across the 11 GICS
sectors (`SCREENER_UNIVERSE`) — explicitly stated as such in the API response
(`universe_note`), never implied as full-market coverage. One batched `yfinance` call
per refresh (`MarketDataProvider.fetch_screener_snapshot`, new provider method) —
never one HTTP request per symbol. Sector is a curated, stable classification, not
re-derived per-refresh. Refreshed on the same cadence as the global index quotes
(`MARKET_QUOTES_REFRESH_SECONDS`). New WS event `screener_update`, **global** scope.

### Sector Heatmap
Derived from the Screener's own cached rows — no second fetch. Tile size is today's
**dollar volume** (price × volume), not market capitalization: bulk live market-cap
data isn't reliably available from yfinance without one slow call per symbol, and a
stale or fabricated cap number would violate this platform's honesty discipline.
Color is the dollar-volume-weighted average % change. A sector with zero available
symbols reports `None`, never a fabricated `0.0`.

### Enhanced Charting (`app/services/market_chart.py`)
On-demand (not cached/broadcast like the other widgets above — symbol × interval ×
range is an unbounded combination, unlike a fixed universe). Reuses the real
`app.features.engineering.compute_features` — the SAME function strategy
backtesting/validation uses — for SMA/EMA/RSI/MACD/Bollinger; never a second,
divergent computation. VWAP is additive (not part of that shared function) and is a
rolling 20-bar volume-weighted average, explicitly labeled as such — not a true
intraday session VWAP, which the offered intervals cannot support. Only Daily/Weekly/
Monthly are offered; intraday intervals are deliberately excluded because yfinance
cannot honestly serve a meaningful lookback window at that granularity.

### Options Chain — deferred, not built
Evaluated and rejected for this batch: yfinance's own options chain, tested live
against AAPL's most liquid near-the-money strikes (17k–35k contracts traded that
session), returned `bid=0`, `ask=0`, `openInterest=0` across the board and an
implausible near-zero implied volatility. Shipping this as a real options chain would
present fabricated-looking data as real.

### Sourcing note
OpenTerminal (the project that inspired these widgets) sources its Screener, Heatmap,
Options Chain and Charting from `scanner.tradingview.com` and `api.nasdaq.com` —
internal endpoints that power those sites' own frontends, not published APIs (their
own code spoofs a browser `Referer`/`Origin` to avoid a 403). None of that was
adopted; see `docs/THIRD_PARTY_NOTICES.md` for the full classification.

---

## Multi-Agent Desk — TradingAgents Integration (Batch 30, ADR 0009)

TauricResearch/TradingAgents v0.5.1 runs as a pinned dependency behind the adapter in
`app/agents/`, only inside Celery. Nothing outside `app/agents/` imports `tradingagents`.

### AgentAnalysis (`agent_analyses`)
One multi-agent run for one ticker on one trade date. `TenantScopedModel`.
**Write-once content:** after a row reaches `completed`, its reports, rating and levels
are never rewritten. The only later write is settlement, which fills the `settled_*`
fields exactly once (append-first, Pillar 3). Failed runs are kept with their `error`
(Pillar 2).

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `organization_id` | uuid | NN, FK → organizations.id | Tenant. |
| `requested_by_user_id` | uuid | nullable, FK → users.id (SET NULL) | NULL for system-started work. |
| `backtest_run_id` | uuid | nullable, FK → agent_backtest_runs.id (CASCADE) | Set when the row is a backtest grid cell. |
| `ticker` | str(32) | NN | Normalised upper-case, exchange suffix kept (`0700.HK`). |
| `trade_date` | date | NN | Analysis date; never in the future. |
| `asset_type` | str(16) | NN, default `stock` | `stock` or `crypto` (`-USD` suffix → crypto). |
| `status` | enum `agent_analysis_status` | NN | `queued` / `running` / `completed` / `failed`. |
| `selected_analysts` | jsonb list | NN | Subset of `market`, `social`, `news`, `fundamentals`. |
| `llm_provider` | str(32) | NN | TradingAgents provider key (`google`, `anthropic`, ...). |
| `deep_model` / `quick_model` | str(64) | NN | Model ids actually used. |
| `config_snapshot` | jsonb | NN | What actually ran: debate rounds, risk rounds, holding period, `output_language`, `fundamental_data` vendor chain, `backend_url`, `jev_screening`. |
| `portfolio` | jsonb | nullable | Batch 30b (migration `0026`). The caller's book in TradingAgents' `PortfolioContext` shape `{cash, currency, positions[{ticker, quantity, average_price}]}`. **NULL = no portfolio given, which is not a flat book**; `{"positions": []}` is a flat book. Rendered into TradingAgents' `portfolio_context` for the Trader, risk team and Portfolio Manager. |
| `regime_at_analysis` | str(32) | nullable | Point-in-time regime for `ticker` on `trade_date` (latest `regime_labels` row ≤ trade_date). NULL when the org has no regime data for the ticker. |
| `regime_confidence` | float | nullable | That row's `confidence_score`. |
| `regime_context` | jsonb | NN | Exactly what Stellix injected into the agents: regime, recent regime path, strategy evidence per regime, failures, lessons (plus the rendered text). Stored verbatim for audit. |
| `progress` | jsonb list | NN | Completed pipeline stages in order: `[{stage, at}]`. |
| `reports` | jsonb | NN | Safeguard 1: numeric price levels are redacted before storage (ADR 0009 §2). `market_report`, `sentiment_report`, `news_report`, `fundamentals_report`, `investment_plan`, `trader_investment_plan`, `final_trade_decision`, `investment_debate{bull_history, bear_history, judge_decision}`, `risk_debate{aggressive_history, conservative_history, neutral_history, judge_decision}`. |
| `rating` | str(16) | nullable | `Buy`/`Overweight`/`Hold`/`Underweight`/`Sell`, or `REVIEW` when no rating could be parsed (TradingAgents #1170 semantics — never silently Hold). |
| `trader_action` | str(8) | nullable | Trader's `Buy`/`Hold`/`Sell`. |
| `time_horizon` / `position_sizing` | str(128) | nullable | From the Portfolio Manager / Trader structured outputs. |
| `research_note_id` | uuid | nullable, FK → research_notes.id (SET NULL) | Interactive runs only. |
| `llm_call_count` | int | NN, default 0 | Rows this run wrote to `llm_audit_log` (`function_name = agent:<stage>`). |
| `input_tokens` / `output_tokens` | int | nullable | Sum of provider-reported usage; NULL if the provider reported none. |
| `error` | text | nullable | |
| `started_at` / `completed_at` | timestamptz | nullable | |
| `benchmark` | str(32) | nullable | Alpha baseline (TradingAgents regional map: SPY, ^N225, ...). |
| `holding_days` | int | nullable | Trading days in the outcome window. |
| `settled_raw_return` / `settled_alpha` | float | nullable | Realised return and alpha over `holding_days`. |
| `settled_resolution_date` | date | nullable | Date of the last bar used, i.e. when the outcome became knowable — the point-in-time cutoff for reusing the lesson. |
| `settled_reflection` | text | nullable | 2–4 sentence LLM reflection (also audited). |
| `settled_at` | timestamptz | nullable | |
| `created_at` / `updated_at` | timestamptz | NN | |

Indexes: `(organization_id)`, `(organization_id, ticker, trade_date)`, `(backtest_run_id)`.

### AgentBacktestRun (`agent_backtest_runs`)
A ticker × date grid of AgentAnalysis cells, scored by realised alpha and grouped by
**regime × rating**. `TenantScopedModel`.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `organization_id` | uuid | NN, FK | |
| `requested_by_user_id` | uuid | nullable, FK → users.id (SET NULL) | |
| `tickers` | jsonb list | NN | |
| `trade_dates` | jsonb list | NN | ISO dates from TradingAgents' `iter_grid(start, end, every_n_days)`. |
| `selected_analysts` | jsonb list | NN | |
| `status` | enum `agent_analysis_status` | NN | Same four values. |
| `total_cells` / `completed_cells` / `failed_cells` | int | NN | |
| `summary` | jsonb | NN | `{by_regime_rating, by_rating, by_regime, scored_cells, unscored_cells}`; each group is `{regime?, rating?, n, mean_alpha, hit_rate}`. `hit_rate` = share of directional calls that were right: bullish (Buy/Overweight) with alpha > 0, bearish (Underweight/Sell) with alpha < 0. Hold and REVIEW count toward `n` and `mean_alpha` but not `hit_rate` (NULL when a group has no directional calls). |
| `error` | text | nullable | |
| `started_at` / `completed_at` | timestamptz | nullable | |
| `created_at` / `updated_at` | timestamptz | NN | |

Maximum cells per run: `AGENTS_BACKTEST_MAX_CELLS` (default 40). Each cell is a full
multi-agent run with its real LLM cost.

### Research Memory additions
| Label | Key property | Properties | Postgres source |
|---|---|---|---|
| `AgentAnalysis` | `analysis_id` | `organization_id, ticker, trade_date, rating, regime_at_analysis, settled_alpha` | `agent_analyses` (1:1, synced on completion and on settlement) |

| Edge | From → To | Created when |
|---|---|---|
| `ANALYZED_IN` | `AgentAnalysis` → `Regime` | On sync, when `regime_at_analysis` is set. |
| `AUTHORED_BY` | `AgentAnalysis` → `Researcher` | On sync, when `requested_by_user_id` is set (reuses the existing edge type). |

### Audit, permissions, realtime
- `audit_event_type` gains `agent_analysis_completed` and `agent_backtest_completed`.
- Permission `agents.run` (Research): start analyses and backtests. Granted to
  Researcher, Quant Engineer, Risk Manager, CIO, and Admin (Admin by catalog formula).
  Reading analyses is not permission-gated, like research notes.
- WS event `agent_progress` (org-scoped): `{analysis_id, backtest_run_id, ticker, stage, status, rating}`.

### Settings (`app/core/config.py`)
`AGENTS_LLM_PROVIDER` (default `google`), `AGENTS_DEEP_MODEL`, `AGENTS_QUICK_MODEL`, `AGENTS_MAX_DEBATE_ROUNDS`
(1), `AGENTS_MAX_RISK_ROUNDS` (1), `AGENTS_HOLDING_DAYS` (5), `AGENTS_BACKTEST_MAX_CELLS`
(40), `AGENTS_DATA_DIR`. The desk needs the chosen provider's key: `GEMINI_API_KEY` for
`google`, `ANTHROPIC_API_KEY` for `anthropic`. Without it, the start endpoints return a
clean 503 (deferred-credential pattern).

### Batch 30b additions (the rest of TradingAgents' options)
- **Every provider TradingAgents drives with a key/endpoint**: `google`, `anthropic`, and the
  OpenAI-compatible family (`openai`, `xai`, `deepseek`, `qwen`, `qwen-cn`, `glm`, `glm-cn`,
  `minimax`, `minimax-cn`, `openrouter`, `mistral`, `kimi`, `groq`, `nvidia`, `ollama`,
  `openai_compatible`). Non-native providers read `AGENTS_LLM_API_KEY` (falling back to the
  provider's own env var); `ollama` / `openai_compatible` may be keyless;
  `AGENTS_LLM_BACKEND_URL` overrides the endpoint and is required for `openai_compatible`.
  `azure` and `bedrock` are not exposed (they need their own credential files/chains).
- `AGENTS_OUTPUT_LANGUAGE` (default `English`), overridable per run (`output_language`).
- `AGENTS_FUNDAMENTALS_VENDORS` (default `sec_edgar,yfinance`): SEC EDGAR statements as filed
  on the analysis date, falling through to yfinance for non-SEC filers. `SEC_EDGAR_USER_AGENT`
  is exported for SEC's caller identification.
- `TYPESAFE_API_KEY` / `TYPESAFE_DEFAULT_MODEL`: optional Jev screening of StockTwits/Reddit posts.
- `AGENTS_CHECKPOINT_ENABLED` (default true): LangGraph checkpoints after every agent in a
  per-analysis directory `AGENTS_DATA_DIR/runs/<analysis_id>/` (never shared — TradingAgents keys
  threads by ticker+date only, so a shared store would let tenants resume each other's runs).
  Deleted when the analysis completes.
- `POST /agents/analyses/{id}/retry` (`agents.run`): re-queues a `failed` analysis, or one stuck
  in `queued`/`running` for over 2 hours. It resumes from the last finished agent; earlier
  progress is kept and `llm_call_count` / tokens accumulate across attempts. `completed` stays
  write-once (409).
- `scripts/agent_desk_cli.py`: the TradingAgents CLI's counterpart — `status`, `analyze`,
  `retry`, `backtest`, `settle`, `list` — running the same service in-process as a named org
  member whose role grants `agents.run`.

---

## Market Terminal — OpenTerminal parity (Batch 31, ADR 0010)

Global market data under `/terminal/*` (any authenticated user; nothing tenant-scoped),
plus per-user workspace, watchlists, holdings and alerts (tenant-scoped **and**
owner-scoped: `TenantScopedModel` + `owner_user_id` filter on every read/write).

### Cached global data contract
Every global payload is `{data, source, delay_note, fetched_at, stale, age_seconds}`.
`stale: true` means the latest refresh failed and the last good value is being served;
it is never presented as fresh. Cache keys are `terminal:*`, never org-scoped.

### `terminal_workspaces`
One row per (organization, user). `TenantScopedModel`.
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `organization_id` | uuid | NN, FK | |
| `owner_user_id` | uuid | NN, FK → users.id (CASCADE), unique with org | |
| `widgets` | jsonb list | NN | `[{id, type, config}]`; `type` ∈ `chart, quote, watchlist, news, screener, heatmap, options, crypto, macro, holdings, calendar, insider, recap, tv, ai, alerts`. |
| `layout` | jsonb list | NN | react-grid-layout items `[{i, x, y, w, h}]`. |
| `active_symbol` | str(32) | NN, default `SPY` | Symbol linked widgets follow. |
| `created_at` / `updated_at` | timestamptz | NN | |

### `terminal_watchlists`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `organization_id` | uuid | NN, FK | |
| `owner_user_id` | uuid | NN, FK → users.id (CASCADE) | |
| `name` | str(64) | NN | |
| `symbols` | jsonb list | NN | Max 100 upper-case symbols, de-duplicated, order kept. |
| `created_at` / `updated_at` | timestamptz | NN | |

### `holding_portfolios`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `organization_id` | uuid | NN, FK | |
| `owner_user_id` | uuid | NN, FK → users.id (CASCADE) | |
| `name` | str(64) | NN | |
| `base_currency` | str(8) | NN, default `USD` | A label; no FX conversion is performed. |
| `cash` | float | nullable | Optional free cash, used when the book is handed to the Agent Desk. |
| `created_at` / `updated_at` | timestamptz | NN | |

### `holding_transactions`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `organization_id` | uuid | NN, FK | |
| `portfolio_id` | uuid | NN, FK → holding_portfolios.id (CASCADE), indexed | |
| `symbol` | str(32) | NN | |
| `side` | enum `holding_side` | NN | `buy` / `sell`. |
| `quantity` | float | NN, > 0 | |
| `price` | float | NN, > 0 | Per unit. |
| `fee` | float | NN, default 0, ≥ 0 | |
| `executed_at` | timestamptz | NN | |
| `note` | str(255) | nullable | |
| `created_at` | timestamptz | NN | |

Positions are **derived, never stored**. The average-cost method, replayed in `executed_at`
order: a buy raises quantity and cost (fee included); a sell realises
`(price − avg_cost) × qty − fee` and never changes the average cost; a sell larger than the
position is rejected (422), so there are no accidental shorts. Unrealised P&L uses the
latest cached quote and is `null` when no quote is available.

### `price_alerts`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `organization_id` | uuid | NN, FK | |
| `owner_user_id` | uuid | NN, FK → users.id (CASCADE) | |
| `symbol` | str(32) | NN | |
| `condition` | enum `price_alert_condition` | NN | `above` / `below`. |
| `target_price` | float | NN, > 0 | |
| `status` | enum `price_alert_status` | NN | `active` / `triggered` / `cancelled`. |
| `triggered_at` | timestamptz | nullable | |
| `triggered_price` | float | nullable | The quote that fired it. |
| `note` | str(255) | nullable | |
| `created_at` / `updated_at` | timestamptz | NN | |

`notification_type` gains `price_alert`. A firing alert writes a notification for its owner
and publishes an org-scoped WS `price_alert` event with `target_user_ids = [owner]`.
Max 50 active alerts per user.

### Agent Desk link
`POST /agents/analyses` accepts `holdings_portfolio_id` (mutually exclusive with
`portfolio`). The desk then uses that portfolio's derived positions, average costs and
`cash` as its PortfolioContext, snapshotted into `agent_analyses.portfolio`.

### Endpoints
Global: `GET /terminal/search`, `/quotes`, `/quote/{symbol}`, `/history/{symbol}`, `/news`,
`/options/{symbol}`, `/crypto`, `/crypto/{symbol}/history`, `/crypto/{symbol}/orderbook`,
`/macro/global`, `/calendar/economic`, `/calendar/earnings`, `/earnings-history/{symbol}`,
`/insider/{symbol}`, `/short-volume/{symbol}`, `/screener`, `/heatmap`, `/recap`, `/status`.
`PATCH /terminal/portfolios/{id}` updates `cash`.
User: `GET|PUT /terminal/workspace`; `GET|POST /terminal/watchlists`,
`PATCH|DELETE /terminal/watchlists/{id}`; `GET|POST /terminal/portfolios`,
`DELETE /terminal/portfolios/{id}`, `GET|POST /terminal/portfolios/{id}/transactions`,
`DELETE /terminal/portfolios/{id}/transactions/{tx_id}`,
`GET /terminal/portfolios/{id}/positions`; `GET|POST /terminal/alerts`,
`DELETE /terminal/alerts/{id}`.
AI: `POST /llm/chat/stream` gains optional `context_symbol`. When it is set, the server prepends a
context block (quote, Stellix regime, recent headlines) to the prompt; Safeguard 1 still
checks the user's message first.

### Settings
`SEC_EDGAR_USER_AGENT` (insider data and market caps; deferred credential),
`TERMINAL_RISK_FREE_RATE` (default 0.04; used for Greeks only when FRED `DGS3MO` is
unavailable), `TERMINAL_TV_CHANNELS` (JSON `[{label, youtube_channel_id}]`),
`TERMINAL_SOURCE_TIMEOUT_SECONDS` (15), `COINGECKO_API_KEY` (optional free Demo key; without it
CoinGecko throttles and the crypto board falls back to Binance 24h tickers, labelled).
Market cap: SEC shares outstanding; multi-class issuers (absent from SEC frames) use Yahoo
market cap / price as implied shares, labelled per row in `shares_source`.

---

## Reserved for Later Batches

### Regime
> Implemented in Batch 3 (Postgres `regime_labels`) — see **regime_labels** under
> Time-Series Tables. Research Memory record implemented Batch 7 — see Research Memory above.

### Failure
> Implemented in Batch 6 — see **Failure Intelligence** above.

### ResearchNote
> Implemented in Batch 7 — see **Research Notes** above.

---

## Change Log
- **Batch 0** — Seeded `Organization`, `User`, `RefreshToken`; reserved
  `Strategy`, `Regime`, `Performance`, `Failure`, `ResearchNote`, and the
  knowledge-graph section.
- **Batch 1** — Finalized the auth/tenancy core (single initial migration, nothing
  was deployed prior): renamed the tenant column `tenant_id → organization_id` and
  the mixin `TenantScoped → TenantScopedModel`; switched `user_role` values to
  lowercase and added `risk_manager`/`cio`/`compliance_officer`; added
  `Organization.tier` + `Organization.max_strategies`; added
  `User.failed_login_attempts`, `User.locked_until`, `User.last_login_at`; added
  `RefreshToken.device_info`. (See ADR 0003.)
- **Batch 2** — Added the data layer: `MarketDataProvider` abstraction (yfinance +
  alphavantage), `market_data` and `feature_matrix` TimescaleDB hypertables (composite
  PK, graceful-degrade on plain Postgres), `ingestion_jobs` operational table with the
  `ingestion_status` enum, and the temporal-isolation invariant for features.
- **Batch 3** — Added the regime detection engine: `regime_labels` hypertable + the
  6-label `regime_label` taxonomy enum; a 4-detector ensemble (HMM/PELT/GMM/GARCH) with
  self-consistency weighting and a fast-triggering Crisis override; regime detection
  chains off the end of ingestion.
- **Batch 4** — Added the strategy lifecycle + governance: `strategies` (with
  `regime_compatibility`), `strategy_versions`, `approval_records`,
  `performance_snapshots`; enums `strategy_creator`, `strategy_status`,
  `approval_action`; the JSON rule DSL (with the 2-row `crosses_*` comparators); and a
  regime-aware vectorbt backtest that partitions trade returns by entry-regime.
- **Batch 5** — Added the validation engine: `validation_results` +
  `validation_classification` enum; `Organization.risk_tolerance_max_drawdown_pct`; a
  5-method suite (walk-forward, regime-CV, Monte-Carlo, persistence, stress) combined
  into a weighted composite that sets `Strategy.robustness_score`.
- **Batch 6** — Added failure intelligence: `failures` (append-only, UPDATE/DELETE
  revoked at the permission level) + `failure_trigger` enum; 4 detection triggers →
  `active→failed` hook; real LightGBM+SHAP feature attribution; tenant-scoped weighted-
  Jaccard clustering (`related_failure_ids`).
- **Batch 7** — Added the knowledge graph: `research_notes` table +
  `strategies.inspired_by_note_id`; 6 Neo4j node labels + all 8 SRC §5.4 edge types;
  `GraphSyncService` (real-time dual-write, MERGE-idempotent, tenant-scoped via the
  `run_scoped` query-builder helper); the 5 named research queries + generic
  node/search endpoints; a nightly consistency sweep (orphaned nodes, unsynced
  strategies, missing lineage edges — logged, never auto-fixed); Cytoscape.js
  Knowledge Graph Viewer + Research Queries panel. Neo4j itself is not yet
  runtime-available on this dev machine (no Docker) — sync degrades gracefully and
  read queries return a clear 503 rather than a misleadingly-empty result; hermetic
  tests run against `FakeGraphRepository`, a hand-verified in-memory implementation
  of the same repository interface (see "Knowledge Graph" above for the full caveat).
- **Batch 8** — Added the evolution engine: `evolution_runs` table +
  `evolution_run_status` enum; a real DEAP genetic algorithm (`tools.selTournament`
  tournsize=5, `tools.cxUniform` indpb=0.5, `tools.mutGaussian` with adaptive sigma
  that halves after 5 stagnant generations, manual top-10% elitism, termination on
  max_generations or <1% improvement over 10 generations); `encode`/`decode` derive
  the tunable gene set from entry_rules/exit_rules literal values + risk_constraints
  (not a pre-populated `parameters` dict — see "Evolution Engine" above for why),
  clamping every gene to its declared range before it can reach the backtester;
  fitness = trade-count-weighted average per-regime Sharpe + 0.3×robustness_score
  (Batch 4's cheap single-backtest composite, not the expensive Batch 5 suite, which
  only runs once per surviving candidate); 5 `/evolution/*` endpoints; evolved
  candidates register as `Strategy` rows (`creator=ga_engine`, real
  `parent_strategy_id`), auto-submit to `candidate`, chain Batch 5 validation, and
  sync `MUTATED_FROM` edges via Batch 7's `GraphSyncService` automatically (no new
  graph code needed — reused `create_strategy`'s existing sync hook). Live-verified
  end to end against real SPY data (2 chained runs, real adaptive-sigma halving
  0.1→0.05, real evolved RSI thresholds and risk parameters, Batch 4's
  candidate→active robustness gate correctly blocking an under-robust candidate).
- **Batch 9** — Added the LLM research assistant: `llm_audit_log` (append-only) +
  `strategies.requires_review`; `LLMService` wraps the official `anthropic` SDK
  (`claude-sonnet-4-6`) with forced tool-use for all 4 functions (generate_hypothesis,
  explain_failure, critique_strategy, summarize_graph_query_result) so responses are
  guaranteed-parseable structured objects, never free text parsed with regex. Five
  enforced safeguards, each a real code-level control with its own test: (1) a
  pattern-based price-forecast guard rejects flagged prompts with 400 before the LLM
  is ever called; (2) `LLMService` has zero import dependency on
  `app.services.strategy`/`failure`/`evolution` (statically verified via
  `app/llm/architecture_check.py`), so it can only ever return data, never mutate;
  (3) `Strategy.requires_review` is derived server-side from `creator==llm_generated`,
  never client-settable, and grants no bypass around Batch 4's lifecycle gates; (4)
  every LLM call logs the full prompt/response/token-usage to `llm_audit_log`
  BEFORE returning ("log-then-return"); (5) `explain_failure`/`critique_strategy`
  restate every numeric claim in a structured `numeric_claims` field (added beyond
  Part 1's literal schema — see "LLM Research Assistant" above), cross-checked
  against the real record within tolerance, surfaced as a warning badge when a claim
  doesn't match. `failures` gained a narrow, explicit two-column UPDATE carve-out
  (`llm_generated_explanation`, `llm_numeric_validation_passed`) on an otherwise
  still fully append-only table, needed because this dev box's superuser DB
  connection would have silently masked the fact that a correctly-configured
  least-privilege production role could never fill in the explanation at all.
  All 165 hermetic tests pass (all 5 safeguards have explicit passing tests); the
  price-prediction guard was additionally live-verified in a real browser (a
  flagged prompt correctly 400s before any LLM call). Real Anthropic API
  verification is **deferred, not yet runtime-verified** — no `ANTHROPIC_API_KEY`
  is configured yet; the owner plans to attach one once the full project is built
  out, for a single comprehensive live pass rather than per-batch. Confirmed the
  failure mode without a key is clean (the `anthropic` SDK itself raises a clear
  `TypeError` before any network call — not a bug in this batch's code).
- **Batch 10** — Added the Governance Layer and the full Research Notebook.
  `audit_log` (org-wide, append-only — distinct from Batch 9's LLM-specific one)
  hooked into every state-changing endpoint from Batches 1/4/6/8: approve/reject
  (evolution-aware — a GA-engine strategy's approval logs
  `evolution_candidate_approved`, not the plain `strategy_approved`), retire, the
  generic `/transition`, the manual failure trigger, login/failed_login, and the
  new kill switch and compliance export. Kill switch
  (`POST /governance/kill-switch/{id}`, risk_manager/cio/admin) forces **any**
  strategy straight to `retired`, genuinely short-circuiting the state machine —
  no `assert_transition_legal`, no parentless-`failed`-needs-admin escalation —
  live-verified against a case `/retire` itself would 403 a risk_manager for.
  Approval queue and active-strategies are read views only; approve/reject still
  goes through Batch 4's existing endpoint, no parallel mechanism. Compliance
  export (`POST /governance/export`) renders the audit trail for a date range as
  JSON or a genuinely readable `reportlab`-rendered PDF (real table, resolved
  actor emails, not a styled JSON dump), via Celery with `ComplianceExportJob`
  tracking. Research Notebook extends Batch 7's minimal `ResearchNote`
  (content/hypothesis only) into the full backing store: title/method/status/
  tags/related_strategy_ids/related_failure_ids/updated_at, a generated
  `tsvector` column queried via `websearch_to_tsquery`/`ts_rank` for real
  full-text search, a lightweight `/autosave` endpoint, and `sync_research_note_node`
  extended (not duplicated) with an `INSPIRED_BY` edge per `related_strategy_ids`
  entry. Mandatory RBAC audit across every Batch 1-9 endpoint found and fixed two
  real gaps (`approve()` excluding `compliance_officer`; the generic `/transition`
  endpoint not checking the caller's role for `target=active`) — see "RBAC audit
  findings" above. Also found and fixed, live, two gaps outside the RBAC audit's
  literal scope but the same "go back and verify" spirit: a cross-tenant leak in
  `app/db/tenant.py` predating this batch (a bare `select(func.count())` aggregate
  bypassed the tenant filter, leaking row counts across orgs — root-cause fixed,
  not patched per-endpoint) and a missing `server_default=FetchedValue()` on
  `ResearchNote.search_vector` (the ORM tried to write `NULL` into a Postgres
  `GENERATED ALWAYS` column, 500ing every note creation against the real database
  despite passing on hermetic SQLite). Frontend: a Governance & Compliance Panel
  (`/admin/governance`) with three role tiers reconciled from the batch's own
  conflicting role hints, live-verified end to end (kill switch, approve/reject,
  audit log, export create→poll→download); a Research Notebook
  (`/admin/research`) with a real markdown editor (`@uiw/react-md-editor`, not
  hand-rolled), a docked (always-visible, not slide-out) AI Assistant panel wired
  to Batch 9's hypothesis/critique endpoints, tag input, linked strategy/failure
  chips with click-through, and debounced (3s) autosave with a save-state
  indicator — live-verified including a real autosaved edit read back from
  Postgres. Along the way, found (and partially fixed) a general Starlette gap
  where an unhandled exception's 500 response bypasses `CORSMiddleware` entirely,
  surfacing as an opaque "Failed to fetch" in any browser client regardless of
  cause — added a global exception handler so most such errors now return a
  clean, parseable JSON 500 instead. 217 tests pass (208 hermetic + 9 integration,
  including a live non-superuser-role append-only test for `audit_log`,
  mirroring Batch 6's `failures` pattern).
- **Batch 11** — API hardening: rate limiting, an input-validation audit, an
  injection audit, CORS/security headers, a secrets audit, and a dependency
  audit, closing out the SRC gap-fix list's biggest remaining hole (no abuse
  protection on a multi-tenant SaaS). Replaced Batch 1's in-process, login/
  register-only limiter with Redis-backed token buckets
  (`app/core/token_bucket.py`, one atomic Lua `EVAL` per check): a global
  100/min/user default applied router-wide, a per-account login limiter
  (independent of the existing per-IP one, so distributed credential stuffing
  against one account from many IPs still gets caught), and five per-org
  limiters on the expensive endpoints (`ingest`, `backtest`, `validate`,
  `evolution/run`, every `/llm/*` route) — all tier-aware, Enterprise getting
  5x via `Organization.tier` (Redis-cached 60s). Input validation audit across
  every POST/PUT/PATCH endpoint from Batches 1-10 (12 schema files) found and
  fixed ~20 gaps: missing `max_length` on strings, missing bounds on numerics
  (`evolution.py`'s `ga_config` was a raw unvalidated `dict` unpacked straight
  into the GA dataclass — replaced with a strict `GAConfigOverrides` model),
  and missing 100KB size caps on JSONB fields (`app/schemas/validators.py`'s
  `check_json_size`, reused everywhere via the `field_validator` pattern). SQL
  injection audit (SQLAlchemy — one static `text("SELECT 1")`, zero user
  input) and Cypher injection audit (Batch 7's `neo4j_repository.py`, read
  line-by-line — every value goes through `$param` binding, every label/
  edge-type/property-key interpolation comes from a closed allowlist or a
  hardcoded constant) both closed clean, no code changes needed. CORS gained
  a fail-fast startup guard against a wildcard origin in production; a new
  `SecurityHeadersMiddleware` adds `X-Content-Type-Options`, `X-Frame-Options`,
  a baseline `Content-Security-Policy`, and production-only
  `Strict-Transport-Security` to every response. Secrets audit (codebase +
  full git history) came back clean. Dependency audit
  (`pip-audit`/`npm audit`) fixed what had a safe path — `starlette` 0.46.2→
  1.3.1 (closing a `FileResponse` `Range`-header ReDoS this codebase is
  concretely exposed to via the compliance-export download endpoint) via a
  `fastapi` bump to 0.139.0; `next` 14.2.35→15.5.20 (4 of 5 findings, including
  an 8.6-CVSS WebSocket-upgrade SSRF), staying on the 15.x line specifically
  to avoid the ESLint-9 flat-config migration a jump to 16.x would have forced
  — and documented what didn't: `pytest`'s one low-severity, dev-only CVE
  (needs a coupled, unverified `pytest-asyncio` major bump) and one PostCSS
  advisory vendored inside `next` itself with no upstream fix yet in any
  released version, 16.2.10 included. Writing the required rate-limit tests
  surfaced two real, pre-existing bugs, both fixed at the root rather than
  worked around: `get_org_rate_multiplier` opened its own DB session instead
  of taking one via `Depends(get_system_db)`, making it invisible to every
  test override in the codebase; and `RedisTokenBucketLimiter` cached a Lua
  `Script` object bound to whichever Redis client existed the first time it
  ran, which silently goes stale after any reconnect (in production, a rare
  edge case; in the test suite, hit on nearly every run once tests started
  exercising Redis across many test functions, since Batch 1's original
  limiter never touched Redis at all). 244 tests pass (235 hermetic + 9
  integration), up from Batch 10's 217 — the new rate-limit, input-validation,
  security-header, and CORS suites account for the difference — plus live
  end-to-end verification against the real local Postgres/Redis stack (ingest
  limiter 429s exactly at request 11; a freshly-created Enterprise-tier org
  gets all 11 through where Starter would not).
- **Batch 12** — Built out the dashboard: `notifications` (real event-triggered,
  fan-out per relevant user, not a mock) + `api_keys` (SHA-256-hashed, scoped
  auth, integrated into `get_token_payload` alongside JWT) + `trade_records`
  (per-trade detail for the Backtest Results page) + `password_reset_tokens`;
  `Organization.benchmark_symbol`; `User.totp_secret`/`mfa_enabled`/
  `avatar_url`/`preferences`; `performance_snapshots.sortino_ratio`/
  `beta_vs_benchmark`, plus a follow-up migration
  (`0012_backtest_bar_metrics`) adding `annualized_return`/`volatility` after
  the first pass missed two of Page 13's ten headline metrics. Extended
  `app/strategy/backtest.py` with per-bar (not per-trade) aggregate metrics —
  Beta, annualized return, volatility — and three chart series (equity curve,
  drawdown, 20-bar rolling Sharpe), Redis-cached (`backtest_cache.py`) rather
  than a new table, same "operational cache, not durable business data"
  precedent as System Monitoring's uptime%/consistency-sweep caching. Real
  TOTP MFA via `pyotp` (enroll → verify-to-enable → a short-lived stateless
  JWT challenge token bridges login to the second factor — no new table for
  it, unlike refresh tokens, since it's neither long-lived nor independently
  revocable). `GET /system/health-detailed` extends Batch 0's `/health` with
  per-service uptime%/response-time (Redis ring buffer), Celery worker
  liveness via a dedicated heartbeat beat task (not just broker
  reachability), job-queue counts from the Celery result backend, real
  `psutil` host gauges, and Batch 7's consistency-sweep alerts. Six pages
  built against exclusively real backend data, no hardcoded arrays anywhere:
  Login (remember-me wired to actual refresh-token expiry; forgot/reset-
  password with a dev-only logged link, clearly commented for replacement
  before production), Main Dashboard (6 KPIs + 4 charts including a new D3
  strategy×regime failure heatmap — Batch 6 left this as a documented gap),
  Backtest Results (10 metrics, 5 charts, full trade log), Regime Monitor
  (added a radial confidence gauge, an HMM transition-probability heatmap
  from data Batch 3 was already persisting but never exposing, a regime-
  statistics table, and compatibility alerts), System Monitoring, and User
  Settings (Profile/Security/API Keys/Preferences tabs). Shared chrome
  (`components/layout/`) built from scratch — no prior top-nav/sidebar
  existed; every one of the app's real routes gets a sidebar entry, none
  invented. Added 13 shadcn primitives (dialog, dropdown-menu, tabs, table,
  select, switch, checkbox, avatar, command/cmdk, sheet, tooltip, progress,
  separator) plus a `popover`/`popover-foreground` token pair the existing
  theme didn't have yet. Found and fixed three real bugs beyond the batch's
  literal scope: (1) `apiFetch` unconditionally forced a JSON content-type
  even for `FormData` bodies, which would have silently broken the new
  avatar-upload endpoint; (2) pre-note 1 assumed the LLM graceful-degradation
  state was "already handled" from Batch 9 — live testing found this was
  wrong: the Anthropic SDK's own `TypeError` for a missing API key propagated
  as an unhandled 500 that bypasses `CORSMiddleware`, which the browser then
  reports as an opaque "Failed to fetch" with no readable message at all;
  fixed by having `LLMService` catch it and raise a purpose-built
  `LLMUnavailableError`, which all three LLM-calling routes (plus the async
  `explain_failure` Celery pipeline, which now skips gracefully instead of
  recording a hard task failure) convert to a clean 503; (3) a genuinely
  unrelated route ordering/shape gap — no `organizations` route existed at
  all before this batch, so `benchmark_symbol` (pre-note 3's "configurable
  parameter") was neither readable nor writable anywhere; added
  `GET /auth/me`'s existing `OrganizationRead` field plus a narrow, admin-
  only `PATCH /organizations/me`. 298 tests pass (289 hermetic + 9
  integration), up from Batch 11's 244. Both the backend (real yfinance AAPL
  ingestion → regime detection → a real SMA-cross backtest with 18 real
  trades → all six pages) and the frontend (every page loaded live in a
  browser against that data, including a full register → forgot-password →
  dev reset link → reset → re-login round trip) were live-verified end to
  end, not just against hermetic tests.
- **Batch 13** — Added cross-cutting observability, no new tables: `structlog`
  configured downstream of stdlib logging (every existing `logger.info/
  warning/exception` call site everywhere in the codebase is unchanged, but
  now emits structured JSON/console output with automatic contextvar
  merging); `RequestIDMiddleware` + a `@with_log_context` Celery decorator
  propagate one `request_id` from an HTTP request through every
  `.delay(...)` call (7 route-originated + 5 internal task→task chains) it
  triggers; `organization_id`/`user_id` bound at the earliest point each is
  known. Added the two previously-silent WARNING-worthy events Batch 2/9
  already computed but never logged (ingestion data-quality flags, LLM
  numeric-hallucination-guard failures). `prometheus-fastapi-instrumentator`
  (automatic HTTP metrics) + 5 custom business counters/gauges
  (`app/core/metrics.py`) instrumented at their real service-layer call
  sites — `active_strategies_gauge`/`celery_queue_pending_gauge` recomputed
  on the existing 60s heartbeat tick rather than incremented at each of
  several mutation sites, to avoid drift. Sentry (backend `sentry_sdk` +
  frontend `@sentry/nextjs`) wired in, guarded by `SENTRY_DSN`/
  `NEXT_PUBLIC_SENTRY_DSN` — same deferred-credential precedent as
  `ANTHROPIC_API_KEY` (no real Sentry account exists yet), but the transport
  itself was proven genuine by pointing `sentry_sdk.init()` at a local
  `http.server` standing in for sentry.io and confirming a real envelope
  POST. `GET /health/live` (no checks) and `GET /health/ready` (Postgres +
  Redis, 503 on failure) added alongside the unchanged `/health`;
  `SystemHealthDetailedResponse` gained matching `liveness`/`readiness`
  fields. `infra/prometheus/` + `infra/grafana/provisioning/` (datasource,
  an 11-panel dashboard, 3 alert rules routed to a single
  `GRAFANA_ALERT_WEBHOOK_URL` webhook contact point) added to
  `docker-compose.yml` for when Docker is available; this dev machine has
  none, so verification instead ran the real Prometheus/Grafana Windows
  binaries natively against the actual running backend. Found and fixed one
  real, pre-existing bug in the process: Batch 11's
  `@app.exception_handler(Exception)` was believed to run inside
  `CORSMiddleware` but actually doesn't — Starlette special-cases it onto
  `ServerErrorMiddleware`, which sits outside every `app.add_middleware()`
  layer — so an unhandled exception's 500 reached the client with no CORS,
  security, or request-id headers at all. Replaced with a plain-ASGI
  `UnhandledExceptionMiddleware` registered as the innermost user middleware
  (also fixing a second, related issue: `BaseHTTPMiddleware`'s task-spawning
  meant `organization_id`/`user_id` were invisible in that one log line even
  after the CORS fix). 310 tests pass (301 hermetic + 9 integration), up
  from Batch 12's 298. Live-verified beyond hermetic tests: the request-id/
  CORS regression fix confirmed via direct curl against a running server
  (both before and after, headers present only after); a real strategy
  creation visibly incrementing `strategies_created_total` in Prometheus;
  Grafana's dashboard rendering real `service_health_gauge` values matching
  this environment's actual degraded-service state; and — the strongest
  proof — 2 of the 3 alert rules genuinely fired (one off the real Neo4j/
  TimescaleDB/Celery outages already present in this dev environment, one
  off a deliberate error-rate burst against the new sentry-test route) and
  both delivered a real webhook POST to a throwaway local listener.
- **Batch 14** — Real Stripe billing wired onto Batch 1's existing
  `Organization.tier`/`max_strategies` (new `subscriptions` table, one row
  per org once they've ever completed Checkout; `Organization.tier` stays
  what the rate limiter/strategy cap read, now kept live-synced by the
  webhook instead of set-once-at-registration). `POST /billing/checkout`
  (Stripe Checkout, hosted/PCI-scope-avoiding, not a custom card form),
  `POST /billing/portal` (Customer Portal), `GET /billing/status` +
  `GET /billing/invoices` (proxied live from Stripe, never stored locally),
  and `POST /billing/webhook` (signature-verified via
  `stripe.Webhook.construct_event`, handling `checkout.session.completed`/
  `customer.subscription.updated`/`customer.subscription.deleted`/
  `invoice.payment_failed`) — the webhook route is a second, separate
  `APIRouter` excluded from the JWT-keyed global rate limiter (same reason
  `auth.router` is, mirrored from Batch 11). `STRIPE_SECRET_KEY`/
  `STRIPE_WEBHOOK_SECRET` unset (no sponsor funding yet, per this batch's own
  prompt) — every billing function checks this proactively
  (`BillingUnavailableError` → clean 503), mirroring `LLMUnavailableError`
  (Batch 9) exactly. `scripts/stripe_setup.py` (idempotent, one-time)
  creates the Starter ($49/mo) and Pro ($199/mo) Stripe Products/Prices and
  prints the IDs to paste into `.env`; Enterprise is Contact-Sales-only, no
  Stripe object at all. `customer.subscription.deleted` downgrades to
  Starter limits rather than a full lockout — `Organization.is_active`
  (Batch 1) remains the actual, separate, admin-only suspension mechanism,
  untouched by billing state (see "Judgment calls" for the reasoning: Pillar
  2, Failure-as-Asset, already commits this codebase to never hiding
  research assets over a lapsed card). 325 tests pass (316 hermetic + 9
  integration), up from Batch 13's 310. Found and fixed one real bug via
  the new tests, not just via them passing: `stripe.Webhook.construct_event`
  returns event data wrapped in Stripe's `StripeObject` (rich attribute-style
  access) rather than a plain dict — it has no real `.get()` method (confirmed
  live: calling it raises `AttributeError: get`, not returning `None` the way
  every handler function's `data_object.get(...)` calls assumed). Fixed by
  using `construct_event` purely for its signature-verification side effect
  and separately `json.loads`-ing the same already-verified payload bytes for
  the plain dict every handler actually reads — would have broken all 4
  webhook handlers against a real Stripe call, not just in tests. Live-
  verified beyond the hermetic suite: registered a real org through the
  actual browser UI, confirmed `GET /billing/status` returns real
  tier/usage data and the Billing page renders it; confirmed all of
  `POST /billing/checkout`, `POST /billing/portal`, and `POST /billing/webhook`
  return a genuine `503` against the real running dev server (not just the
  test client) with `STRIPE_SECRET_KEY` unset; confirmed the webhook's
  signature-verification and all 4 event handlers end-to-end using
  `stripe`'s own real HMAC-SHA256 signing code (`WebhookSignature`), not a
  mocked/faked signature.
- **Batch 15** — The 8-page public marketing site (Landing, Product,
  Features, Architecture, Use Cases, Pricing, Docs, Contact), built in two
  parts. 15a: a user-approved copy document (`docs/landing-page-copy.md`) —
  every headline/villain/mechanism sentence tied to a real shipped artifact
  (the six regimes, the append-only SHAP failure autopsy, the 8-edge Neo4j
  graph), no fabricated testimonials/logos/metrics. 15b: the build, from that
  copy verbatim. One backend addition: `demo_requests` (public,
  non-tenant lead capture — mirror image of registration) written by the
  unauthenticated, IP-rate-limited, honeypot-guarded `POST /contact/demo-request`,
  which persists the row and fires a best-effort webhook (`DEMO_WEBHOOK_URL`,
  deferred/None like `SENTRY_DSN`). Frontend: a `(marketing)` route group with
  Fraunces (display) + Inter (body) via next/font; an animated four-layer
  architecture-diagram hero (pure SVG, pulsing cyan data-flow connectors — no
  gradient blob) reused interactively on Product/Architecture; the real
  6-node/8-edge Neo4j schema as a hover diagram; the real `recurring_failure_modes`
  Cypher and Strategy JSON DSL as highlighted code; a live Cytoscape mini-graph
  and five other real mini-vizzes on Features; a monthly/annual pricing toggle
  (live 20% recalculation) whose Starter/Pro CTAs call Batch 14's real
  `POST /billing/checkout` (auth-aware — anonymous visitors route to
  `/register?plan=` first); a Docs page whose API reference is fetched from the
  running service's live `/openapi.json`; and a 12-field demo form (react-hook-form
  + zod, live 20–500 char counter, work-email + consent enforcement, honeypot).
  Performance-first: no framer-motion/flexsearch/shiki (CSS + IntersectionObserver
  animations, a dependency-free code highlighter and doc search, lazy-loaded
  Cytoscape) plus `sitemap.ts`/`robots.ts` and per-page OpenGraph metadata.
  Live-verified against the running dev servers: the landing renders the full
  animated diagram; the pricing toggle recalculates $49/$199 → $39/$159; the
  Docs page loaded all 96 live endpoints across 18 tags (including the new
  `/contact` and Batch 14 `/billing`); the Architecture page rendered all 6
  real nodes, 8 real edges, the real Cypher and DSL, and working layer filters;
  the Features Knowledge-Graph tab mounted a real Cytoscape `<canvas>`; and a
  real demo submission against the live backend persisted a `demo_requests` row
  in the actual Postgres. `tsc --noEmit` clean, `next lint` clean (only a
  pre-existing Batch-12 warning). No console errors on any page.
- **Batch 16** — Demo seed data (no schema change; one product bug fix). A single
  idempotent script, `scripts/seed_demo_data.py`, builds a demo tenant (*Meridian
  Capital Partners*, `meridian-capital`, Pro) that looks like six months of real
  institutional usage by driving the **real** pipeline end-to-end: real yfinance
  bars for SPY/QQQ/GLD/BTC-USD 2019–2024 (6,718 bars), real regime detection, real
  backtests, real 5-method validation, real failure detection, and a real chained
  DEAP evolution. Nothing is faked — every `robustness_score` is the genuine
  composite. Because no simple public-data strategy clears the production `0.70`
  activation gate, the seed **process only** monkeypatches its own copy of
  `lifecycle.ROBUSTNESS_THRESHOLD` to `0.39` (product code untouched; still `0.70`
  on a live request) so the top-scoring strategies can form an active book; the
  demo script is explicit about this. The seed produces a **5 active / 6 failed /
  3 retired** book (plus ~18 candidates incl. GA-evolved + retirement successors),
  9 hand-written research notes, and 2 chained evolution runs giving a
  parent→child→grandchild lineage. Failures are shaped so all four trigger types
  are present AND all five named graph queries return non-empty results **at the
  frontend's own hardcoded thresholds** (`min_regimes=4`, `min_occurrences=3`,
  `months=24`): three same-symbol drawdown breaches form a genuine count-3
  recurring `(Low-Volatility, DRAWDOWN_BREACH)` mode + a ≥3 similarity cluster; a
  4-regime strategy (`SPY Contrarian RSI`) is left un-failed for
  `robust_across_regimes`; and one active strategy is wired `inspired_by_note_id`
  for `hypotheses_leading_to_active`. LLM content is deferred (no
  `ANTHROPIC_API_KEY`): failure explanations store the exact placeholder in
  Postgres **and** on the graph's `FAILED_IN` edges (the failure node is re-synced
  after the placeholder is set), regenerable via `scripts/backfill_llm_content.py`.
  A companion `scripts/verify_demo_seed.py` prints the dashboard KPIs and runs all
  five graph queries at the UI's thresholds. **Product bug fixed:**
  `app/services/ingestion.py` `persist_market_data`/`persist_features` did a single
  bulk `INSERT` that exceeded asyncpg's hard 32767 bound-parameter cap on any
  series past ~1,900 bars (BTC-USD's 2,171 daily bars × 17 feature columns =
  36,907 params) — now chunked via `_chunk_rows` under a 30,000-param safety
  margin; covered by `tests/test_ingestion_chunking.py`. **Live-verified** against
  real Postgres + a native Neo4j and the running dev servers, logged in as the
  seeded `research@meridian.com`: the Main Dashboard renders all 6 KPIs
  (Low-Volatility regime, avg active robustness 0.56, 6 failures, 9 notes, 2 runs)
  and all 4 charts; the Failure Intelligence page shows the 6 failures with the
  placeholder in the Explanation column and the `(Low-Volatility × drawdown = 3)`
  cluster matrix; and every one of the five Knowledge-Graph query buttons returned
  real data (`robust-across-regimes?min_regimes=4` → `SPY Contrarian RSI`;
  `recurring-failure-modes?min_occurrences=3` → count-3 mode). Idempotency verified
  by re-running: the active/failed/retired book is identical (only the stochastic
  GA count varies), and only the Meridian org is cleared/rebuilt (cascade delete +
  Neo4j node purge) — no other tenant is touched. Walkthroughs in
  `docs/demo_script.md` (5-min investor + 15-min technical).
- **Batch 17 (final)** — Production hardening, deployment config, and the final
  validation pass. No schema change. **Deploy artifacts:** production multi-stage
  Dockerfiles (backend: slim `python:3.11-slim`, non-root uid 1000, venv-copied so no
  build toolchain / dev deps / tests / pip cache in the final image; frontend: Next
  `output: "standalone"`, Node-20 builder → slim runner copying only
  `.next/standalone` + `.next/static` + `public`, non-root `node`). **Kubernetes**
  (`infra/k8s/`, all kubeconform-valid against k8s 1.29): backend Deployment (2
  replicas, 256Mi/250m→512Mi/500m, `/health/live` + `/health/ready` probes, hardened
  `readOnlyRootFilesystem` securityContext), celery-worker Deployment + HPA (1→3, CPU
  proxy with a documented KEDA queue-depth alternative), frontend Deployment (2
  replicas), ConfigMap (non-secret env) + Secret template (placeholders,
  never-commit), Services + Ingress (nginx + cert-manager TLS), a pre-deploy Alembic
  migration Job, and a Kustomization. **No StatefulSets** for Postgres/Neo4j/Redis —
  managed cloud services (ADR-0004). **CI/CD** (`.github/workflows/`): `ci.yml` (push
  any branch → backend pytest+ruff with a Redis service, frontend tsc + `next build`),
  `deploy.yml` (push to main → build+push both images to GHCR, auto-deploy staging,
  manual-approval production via a protected Environment). **Test/coverage audit:**
  full suite **335 passing** (9 integration opt-in skipped), **80% overall**, every
  named business-logic module > 75% (regime 94%, validation 80%, evolution 92/94%,
  lifecycle 92%, tenant isolation 97%, failure 93%, backtest 98%); wrote tests for the
  two zero-coverage critical paths surfaced (`validation/engine.run_validation` and the
  Cypher tenant-scoping guard `graph/tenant_query.run_scoped`, both now 100%). Fixed a
  real test-isolation bug (the Neo4j async driver's loop-bound pool crashed later
  pytest-asyncio tests when a real Neo4j was running — 13 failures; now every test
  defaults to the in-memory graph fake) and a SQLite-precision flaky timestamp assert.
  **Load test** (`tests/load/locustfile.py`, real headless locust, 50 users/60s): read
  **p95 = 18–19 ms** (target < 2 s), zero 5xx — every non-2xx was a deliberate Batch-11
  429 shedding excess (writes served exactly their per-org hourly caps). **DR runbook**
  (`docs/disaster_recovery.md`): pg_dump/restore + neo4j-admin dump + rebuild-from-
  Postgres, per-Celery-task idempotency table (acks-early → a dead worker drops, never
  duplicates, in-flight work; the append-only failure/evolution tasks flagged), RTO/RPO.
  **Security re-audit:** RBAC/rate-limit/validation confirmed on all Batch 12–16
  endpoints (billing is admin-only; the public demo-request is IP-limited + honeypot).
  `pip-audit` closed five 2026 Starlette advisories by pinning `fastapi==0.139.0` +
  `starlette>=1.3.1` + `prometheus-fastapi-instrumentator>=8` (the loose old floors
  back-resolved to a vulnerable Starlette); residual `ecdsa` advisory documented as
  not-exploitable (HS256-only). `npm audit`: 3 moderate, a build-time-only postcss
  advisory inside Next — no runtime path, tracked. **`docs/adr/ADR-FINAL.md`** records
  every SRC deviation, the real bugs caught by live (not hermetic) verification across
  all 17 batches, and an honest production-ready-vs-needs-work assessment. Tagged
  **v1.0.0**.
- **Batch 25** — Governance + audit identity + delayed market data (migration `0019`):
  `kill_switch_reviews` (dual-approval kill switch with 14-day CIO review, overdue
  flagged not expired); `audit_log` actor/target snapshot columns + six new
  `audit_event_type` values; draft-only strategy delete; save-as-new-version with a
  mandatory change reason; approvals scoped to the version they approved; failures record
  their `symbol`; honest `llm_explanation_status`; org member directory; global
  (non-tenant) delayed index quotes on a new realtime `global` scope. Fixed: realtime events
  published by a Celery worker after its first task were silently dropped (Redis client
  bound to a closed event loop).
- **Batch 26 (Part A)** — Dynamic RBAC (migration `0020`): `permissions`, `roles`,
  `role_permissions`; `users.role_id` / `invitations.role_id` (enum columns deprecated,
  ADR 0006); four role `audit_event_type` values. Permissions resolve from the database
  per request, so role changes apply without re-login. SuperAdmin roles console and org
  custom roles. Access unchanged, proven by an access-matrix test written before the
  refactor. Fixed: billing webhook failure notifications went to admins of every
  organization instead of only the affected one.
- **ADR 0008 fix** — Gate integrity (migration `0021`): `strategies.backtest_robustness`
  and `validation_results.strategy_version`. `robustness_score` is now exclusively the
  5-method composite, and activation requires a validation result for the current
  version. Repaired 64 strategies whose gate score disagreed with their validation, 10
  scored without any validation, and demoted the one ACTIVE strategy that had never been
  validated. Found while diagnosing why no strategy clears 0.70 (see also ADR 0007 on the
  GA fitness function).
- **Batch 26 (Part B)** — Quant Engineer system role (migration `0023`, additive delta
  on 0020) + `signals.view` permission; `strategies.symbol` (migration `0022`, required
  going forward, backfilled only for the one unambiguous case); `strategy_signals`
  (migration `0024`) — deterministic Buy/Sell/Hold research signals for genuinely-Active
  strategies only, reusing the real ADR-0008 gate and DSL evaluator, HOLD derived from
  position replay, architecturally isolated from the LLM layer. Realtime delivery on a
  new org-scoped `strategy_signal` WS event via a Celery beat sweep. New `/signals`
  frontend page, gated on `signals.view`.
- **Batch 28** — Market Research widgets: Macro Dashboard (FRED, official documented
  API, deferred `FRED_API_KEY`), Screener (bounded 56-symbol universe, one batched
  yfinance call), Sector Heatmap (derived from the Screener, sized by dollar volume
  not market cap), Enhanced Charting (real shared indicator computation +
  `lightweight-charts`). No new tables — Redis-cached, global-scope WS events
  (`macro_update`, `screener_update`), same pattern as Batch 25's index quotes.
  Options Chain evaluated and deferred (yfinance's own chain returned zero bid/ask/
  open-interest even for AAPL's most liquid strikes). Inspired by OpenTerminal
  (MIT) but built native — its Screener/Heatmap/Options/Charting sources are
  unofficial (internal endpoints of tradingview.com/nasdaq.com); none adopted. New
  `/market-research` frontend page.
- **Batch 30** — Multi-Agent Desk (ADR 0009): TauricResearch/TradingAgents v0.5.1 as a
  pinned dependency behind `app/agents/`, run in Celery. Regime-conditioned,
  point-in-time context and lessons; `agent_analyses` + `agent_backtest_runs` (migration
  `0025`); every agent LLM call in `llm_audit_log`; ResearchNote + `AgentAnalysis` graph
  node; per-regime agent backtest; `agents.run` permission; `agent_progress` WS event;
  new `/agents` frontend. Safeguard 1 unchanged: the desk keeps the 5-tier rating and
  redacts price target / entry / stop (relaxing it is pending the owner). `yfinance`
  bumped to 1.x.
- **Batch 31** — Market Terminal (ADR 0010): every OpenTerminal feature on official or
  published sources — server-saved widget workspace, ⌘K search, intraday-to-MAX charting,
  quote panel, RSS news, options chain with Black-Scholes Greeks, crypto board/candles/order
  book, ECB + commodity macro, holdings tracker (feeds the Agent Desk), FRED economic and
  yfinance earnings calendars, SEC Form 4 insiders, FINRA short volume, market recap,
  context-aware AI, official YouTube TV, price alerts. SEC market caps size the heatmap.
  Migration `0027`.
- **ADR 0012 — Research Memory on PostgreSQL (Neo4j retired).** The knowledge graph is
  renamed Research Memory and runs on PostgreSQL alone: the in-memory index (formerly the
  opt-in `GRAPH_BACKEND=memory` of ADR 0011) is the only implementation, rebuilt every
  `RESEARCH_MEMORY_REFRESH_SECONDS` (default 300). Removed the Neo4j driver, client,
  Cypher repository and tenant guard, the drift sweep and its beat entry, the backfill
  CLI, the Neo4j health probe and Neo4j from Compose/Kubernetes/env examples.
  `/system/health-detailed` replaces `consistency_alert` with `memory_index`
  (`rebuilt_at, refresh_seconds, strategies, failures, research_notes` for the caller's
  org). `/health` no longer reports `neo4j`. Dashboard routes `/<role>/graph` →
  `/<role>/memory` with permanent redirects. Settings `NEO4J_*` and `GRAPH_BACKEND`
  removed (left-over values in an existing `.env` are ignored).
