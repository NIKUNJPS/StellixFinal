# Platform State — v1.0 Consolidation Checkpoint

This is the single source of truth for "what is genuinely true about this system right
now." It corresponds to git tag `v1.0-review`. Every claim and number below was
personally verified in the Batch 29 consolidation session (2026-09-24) — reproduced from
a real test run, a real live-database query, or a real browser check, not carried over
from an earlier report. Where an earlier claim turned out stale or wrong, that's called
out explicitly rather than silently corrected.

---

## What Is Genuinely Working (verified this session)

**Backend correctness**
- Full test suite: **625 collected, 0 errors, 0 failures.** With the default
  (`RUN_INTEGRATION` unset): 616 passed, 9 skipped (integration-only). Re-run with
  `RUN_INTEGRATION=1` (live Postgres + live network, opt-in): all 625 pass, 0 skipped —
  confirmed via `--junit-xml`, not the terminal summary line (which this session found
  can get lost in output-capture and should not be trusted alone).
- Migration head: `0024_strategy_signals`, matching the live Postgres schema exactly
  (`alembic current` == `alembic heads`).
- Public OpenAPI schema: **120 endpoints**, **0** under `/superadmin/*` — the internal
  control-plane exclusion holds under a live full-text scan of the running schema.

**Governance (ADR-0008)**
- Re-ran the divergence check the original ADR-0008 fix was built to close, against
  live data: **0** strategies where `robustness_score` disagrees with the validation
  record for their current version, **0** Active strategies lacking valid current-version
  validation evidence (the exact bug class — an unvalidated strategy reaching Active —
  that ADR-0008 fixed). Confirmed via a live query joining `strategies` and
  `validation_results` on `strategy_version`, not a re-run of the original migration-era
  query (its comparison columns didn't exist in their current form before the migration).

**Dynamic RBAC**
- 6 system roles, all `is_system_default=true`, real permission counts verified against
  a live query: Admin 24, CIO 12, Compliance Officer 9, Quant Engineer 2
  (`signals.view` + `strategy.version`, zero governance permissions), Researcher 2, Risk
  Manager 9.
- `tests/test_rbac_access_matrix.py` + `tests/test_dynamic_rbac.py`: **61/61 passed**.
  **Correction to a prior claim**: there is no SHA-256-hash-baseline file backing this
  regression net anywhere in the codebase — it's a hardcoded expected-access-set
  assertion test, not a hash comparison. (`hashlib`/`sha256` usage elsewhere in the repo
  is unrelated: token/API-key hashing in `app/core/security.py`.)
- Org-status enforcement (suspend/reactivate): tested with a single pre-issued token,
  no re-login — 200 → suspend → 403 `ORG_SUSPENDED` → reactivate → 200. Instant in both
  directions.
- All 6 roles + SuperAdmin browser-verified this session, including **Quant Engineer's
  first-ever full browser verification** (previously only checked via API calls): nav
  renders correctly (no governance items), Dashboard and Signals pages load real data.

**Celery / realtime**
- Backend, frontend, Celery worker, and Celery beat all started and ran live this
  session (worker and beat as **separate processes** — Windows does not support
  Celery's combined `--beat` flag).
- The per-task Redis-client fix (Batch 25, "Event loop is closed" bug) lives centrally
  in `redis_client.get_client()`, loop-tracked; every one of its 10+ call sites across
  `ws/events.py`, `token_bucket.py`, `backtest_cache.py`, `market_quotes.py`,
  `market_screener.py`, `macro_data.py`, `org_status.py`, `system_health.py`,
  `csv_upload.py`, and `ws/bridge.py` routes through it — none bypass it with a raw
  client. Confirmed live via successful runs of `refresh_global_index_quotes`,
  `refresh_screener_data`, `refresh_strategy_signals`, `run_failure_monitor_sweep`,
  `run_graph_consistency_sweep` (154 orgs checked, 0 flagged).
- A large backlog of stale queued tasks (620 `ingest_market_data`, 100 `run_evolution`,
  80 `run_compliance_export`, 20 `run_strategy_validation`) had accumulated in Redis
  across the project's history because no worker had been continuously running to
  consume them. Drained/purged this session — this was stale message backlog, not a
  code defect (every failure was a clean `NoResultFound` on an orphaned reference).

**A real incident, caught and handled live**
- During this session's own verification, running `run_failure_monitor_sweep()` for
  the first time against fully caught-up historical data triggered a **genuine**
  `regime_mismatch` failure detection on the strategy that had been reported Active
  (SPY Contrarian RSI, id `7ccfebeb-...`) — a real backtest-driven detection, not a bug
  (verified the trigger logic, the honest SHAP-attribution omission for a low trade
  count, and reproduced the finding directly). This left **zero** Active strategies
  platform-wide. With explicit sign-off, a real eligible candidate
  (`14462496-...`, same strategy family, already validated at composite 0.796 for its
  current version) was activated through the **real** `/approve` governance endpoint —
  not fabricated — and a real null `symbol` on that row was backfilled to `'SPY'` (same
  unambiguous-lineage precedent as migration 0022's original backfill), after which
  `refresh_strategy_signals` produced a real `HOLD` signal. This is presented as evidence
  the governance and monitoring systems are real and load-bearing, not decorative — the
  platform's own safety system found and acted on something a static status report
  would have missed.

**Market Research widgets**
- All 4 tabs browser-verified with real or honestly-degraded data: Macro ("FRED not
  configured" — accurate, no `FRED_API_KEY` set), Screener (real yfinance data across a
  bounded 56-symbol universe), Sector Heatmap (real dollar-volume-sized tiles), Chart
  (real SPY candlesticks + indicators via the same `compute_features()` the strategy
  engine uses).

**Onboarding**
- Full self-registration wizard walked end-to-end with a genuinely fresh org this
  session: register → real email-verification-required gate → verification link
  (retrieved from server logs, since no SMTP is configured in this environment — the
  same honest degradation pattern as `ForgotPasswordResponse.dev_reset_link`) →
  SuperAdmin org approval → login → dashboard with **honest empty states** everywhere
  (0 strategies, 0 failures, `—` for regime/performance) while genuinely global data
  (market indices) still renders. Zero regressions.

**Demo environment**
- `scripts/cleanup_e2e_artifacts.py` run for real this session (dry-run, then
  `--execute`): removed 1 throwaway test org ("E2E Batch25 Co", 5 test users);
  Meridian Capital and the SuperAdmin account were untouched by the script's hard-coded
  preserve list. 153 organizations remain.

---

## What Is Honestly Limited

- **Market data refresh cadence is not live.** Screener/index quotes: refreshed
  periodically (dashboard label: "every 2 min" for indices; screener/chart labeled
  "Delayed OHLCV, refreshed on request — not real-time"), sourced from free yfinance
  data with an inherent 15–20 minute vendor delay, honestly labeled as such everywhere
  it's shown.
- **Screener universe is bounded, not the full market**: exactly **56** well-known,
  liquid US equities across sectors, labeled explicitly on the page ("not the full
  market").
- **Options Chain was deliberately not shipped.** Real yfinance options data was
  inspected during Batch 28: bid/ask/open-interest were 0 for the vast majority of
  contracts on the free/delayed tier — a chain built on that data would look live but
  mislead. Documented in `docs/THIRD_PARTY_NOTICES.md` and `docs/schemas.md`.
- **Every unconfigured credential in this environment, and its honest fallback**:
  - `ANTHROPIC_API_KEY` — not set. Research Assistant / LLM explanation generation
    shows a plain "not configured" message rather than failing silently or fabricating
    output. Historical failure records generated with a key configured in an earlier
    session remain intact and are displayed normally; new ones honestly show
    "AI explanation unavailable — no API key configured."
  - `GEMINI_API_KEY` — not set. Reproduced live: asking the Research Assistant a
    question returns "Gemini is not configured: GEMINI_API_KEY unset", not a fabricated
    answer.
  - `FRED_API_KEY` — not present in `.env` at all. Macro dashboard shows "FRED not
    configured" with a link to get a free key, not blank/broken widgets.
  - **Neo4j** — confirmed genuinely unreachable this session via a direct driver
    connection attempt (`ServiceUnavailable`, connection refused on
    `bolt://localhost:7687`), not merely "usually not running." Every Neo4j-touching
    code path degrades honestly: the consistency sweep logs a per-org warning and
    returns `graph_unreachable: true` rather than crashing; the Knowledge Graph page
    returns a real `503` on query; `/system/health-detailed` reports it as `error`
    alongside `postgres: ok`, `redis: ok`.

## Known Architectural Decisions Worth Explaining If Asked

- **Modular monolith, not microservices** — one FastAPI service and one Next.js
  frontend, not a service mesh. Correct at this stage: a small team, a single Postgres
  source of truth, and no independent-scaling requirement yet don't justify the
  operational cost of network-boundary decomposition. See `ADR-FINAL.md`.
- **ORM-level tenancy (ADR-0002), not Postgres Row-Level Security** — every
  tenant-scoped table is isolated by a fail-closed SQLAlchemy listener rather than DB
  policies, proven by a dedicated tenant-isolation attack test. Chosen for portability
  across managed Postgres providers that don't uniformly support RLS, and because the
  ORM layer is the single place all query construction already passes through.
- **The append-only audit log's Postgres-superuser caveat in dev** — the dev app
  connects as the `postgres` superuser, which bypasses the grant-level revocation that
  makes `audit_log`/`failures` genuinely append-only; the integration tests
  (`test_audit_log_append_only.py`, `test_failure_append_only.py`) prove the guarantee
  by connecting as a non-superuser role instead. See `docs/superadmin_isolation.md`.
- **ADR-0008's full story is real evidence the governance model works, not just
  documentation of it** — see "A real incident, caught and handled live" above: the
  same class of bug ADR-0008 fixed (an Active strategy without current, matching
  validation evidence) cannot occur again by construction, and this session's own
  failure-detection run is a second, independent demonstration of the monitoring layer
  actually doing its job on real data.

## Real Numbers (as of this session, 2026-09-24, method noted)

| Metric | Value | How obtained |
|---|---|---|
| Backend tests | 625 collected / 616 passed / 9 skipped / 0 failed (default); 625/625/0/0 with `RUN_INTEGRATION=1` | `pytest --junit-xml`, this session |
| Migration head | `0024_strategy_signals` | `alembic heads` == `alembic current` against live Postgres |
| Public API endpoints | 120 (0 under `/superadmin/*`) | Live `GET /openapi.json`, counted |
| Frontend pages | 73 route files | `find frontend/app -name page.tsx \| wc -l` |
| System roles | 6, with real permission counts (24/12/9/2/2/9) | Live DB query against `roles`/`role_permissions` |
| Organizations | 153 (154 before this session's E2E cleanup removed 1) | Live DB query |
| Commits on `main` | 38 | `git rev-list --count main` |
| ADRs | 8 numbered (0001–0008) + `ADR-FINAL.md` | `docs/adr/` |

## What's Deliberately Deferred, Not Forgotten

- **News feed, portfolio tracker, economic calendar** — explicitly scoped out of
  Batch 28 (Market Research Widgets); not started.
- **The licensed Outlook Engine (Batch 27)** — short/long-term forecasting, gated on a
  SEBI-advisory license the founder holds personally. Not started this session (out of
  scope per this batch's own instructions). Will reuse Batch 26 Part B's real
  `strategies.symbol` / `strategy_signals` architecture when resumed, rather than a
  parallel one.
- **ADR-0007's fitness-function realignment** — the evolution fitness function's
  misalignment with the approval gate is a documented, accepted finding
  (`docs/adr/0007-evolution-fitness-misaligned-with-approval-gate.md`); the fix itself
  has not been implemented.

---

*Every number and claim above traces to a command, query, or browser action actually
run in this session. If a follow-up question can't be answered by re-running the cited
command against the current environment, that's a sign this document has drifted and
should be re-verified, not trusted as a snapshot forever.*
