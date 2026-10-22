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

**An incident during verification — and a misdiagnosis, corrected 2026-09-26**
- During Batch 29 verification, `run_failure_monitor_sweep()` recorded a
  `regime_mismatch` failure on the strategy that had been reported Active (SPY
  Contrarian RSI, id `7ccfebeb-...`), leaving zero Active strategies. With explicit
  sign-off, an eligible candidate (`14462496-...`, same strategy family, validated at
  composite 0.796 for its current version) was activated through the real `/approve`
  endpoint, its null `symbol` was backfilled to `'SPY'`, and it produced a real `HOLD`
  signal.
- **Correction.** Batch 29 described that failure as a genuine detection. It was not.
  `monitor_sweep` (`app/services/failure.py`) evaluates every Active strategy against
  **every symbol its org has market data for** (523 for Meridian), not against the
  strategy's own `symbol`. The SPY strategy was failed using **ACGL**'s regime
  (Sideways); on 2026-09-26 at 00:22 IST the replacement was failed the same way using
  **CRM**'s regime (Crisis). Both strategies have `symbol = 'SPY'`. The trigger logic
  itself was checked in Batch 29; which symbol it fired on was not. The sweep predates
  `strategies.symbol` (Batch 26 Part B) and was never updated to use it.
- **Fixed 2026-10-09.** `monitor_sweep` and `monitor_symbol` (`app/services/failure.py`)
  now judge a strategy only against its OWN `Strategy.symbol` (case-insensitive; a
  strategy with no symbol is skipped). Regression test:
  `tests/test_failure_monitor_scope.py`. The two strategies that were wrongly failed
  were left untouched (they remain `failed`, as permanent records).
- **Current state:** one Active strategy in the demo org — "SPY Dip-in-Uptrend RSI
  45/60" (human-authored, v1.0, validation composite 0.731 ≥ 0.70), activated through
  the real `/strategies/{id}/approve` endpoint by the CIO account with a written
  justification stating it was demo preparation. Its null `symbol` was backfilled to
  `SPY` (the update API cannot set `symbol`); its version, validation evidence and the
  0.70 gate were not touched.

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

- **Index quotes are delayed, not live.** Global index quotes are free yfinance data
  with an inherent 15–20 minute vendor delay, refreshed every 30s (every 2 min before
  2026-09-26) on a dedicated `realtime` Celery queue so long sweeps can't freeze them;
  the screener refreshes every 2 min; the chart is "Delayed OHLCV, refreshed on
  request". Labelled as such everywhere shown. Real-time index values are licensed data
  this platform doesn't have.
- **Real-time prices cover four ETFs, from one exchange.** SPY / QQQ / DIA / IWM
  stream from Alpaca's free IEX feed (real trades from IEX only — a few percent of US
  volume, not the consolidated tape), shown as ETFs with the index each tracks as
  context. Needs `ALPACA_API_KEY_ID` / `ALPACA_API_SECRET_KEY` and a running
  `python -m app.streaming.etf_stream`; not configured in this environment. Verified
  end-to-end (connect, auth, subscribe, live ticking in the browser, stream-offline and
  recovery states) against a simulated Alpaca feed in an isolated stack; **not yet
  verified against the real Alpaca service**.
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
  - **Neo4j** — retired (ADR 0012). Research Memory is derived from PostgreSQL inside
    the API, so there is no graph database to run or to be unreachable.

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
- **ADR-0008's full story is real evidence the activation gate works, not just
  documentation of it** — the same class of bug ADR-0008 fixed (an Active strategy
  without current, matching validation evidence) cannot occur again by construction.
  (Batch 29 also cited its failure-monitor run as a second demonstration; that claim
  was withdrawn — see the correction above.)

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

## Demo-readiness pass (2026-10-21)

Scripts added under `scripts/` (all idempotent, API/engine-driven, no fabricated numbers):

| Script | Purpose |
|---|---|
| `fill_demo_backtests.py` | Adds 10 well-known strategy families (Bollinger breakout, RSI pullback, MACD trend, low-vol trend, RSI mean-reversion), backtests + validates them, and re-runs the real backtest for every Meridian strategy so equity-curve series are cached (the dashboard overlay and Backtest Results read that Redis cache). |
| `fill_failure_intelligence.py` | Sets `strategies.symbol` from the instrument each strategy was backtested on and generates the missing AI explanations through the audited, numerically-validated path. |
| `seed_terminal_demo.py` | Per-user sample portfolio (real historical closes as entry prices) and price alerts around live quotes. |
| `seed_governance_demo.py` | Risk Manager kill-switch on two weak candidates; CIO acknowledges one, one stays awaiting review. |
| `api_sweep.py` | Logs in as each role and GETs every parameterless endpoint; reports errors and empty responses. |
| `llm_setup.py` | Tests Gemini/Anthropic keys, discovers the Gemini models a key can use, and switches the provider lines in `.env`. |

Code changes: dashboard top-performers now requires real trades and shows one strategy per family
(evolution variants were five near-identical lines); failure routes resolve an instrument from the
strategy when an append-only failure row never recorded one; Research Memory runs on PostgreSQL
alone (ADR 0012; Neo4j retired).

Known, intentional gaps: billing invoices
and pending invitations are empty because no billing provider / mail relay is configured; two of the
oldest failure rows (`ACGL`, `CRM` under an SPY strategy) predate the monitor-scope fix and are
append-only, so they stay as recorded.

## Evaluation evidence pack (2026-10-21)

`docs/evaluation/` contains the measured-results evidence pack (implementation and test evidence, data provenance,
protocol, results, held-out baselines and ablations, verified references). Its headline: the pipeline is implemented and
tested (690 tests, 0 failing), but there is **no measured out-of-sample return advantage over buy-and-hold**, regime gating
helped drawdown but not return or Sharpe, and the evolution engine does not generalize reliably. Start at
`docs/evaluation/README.md`.

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
