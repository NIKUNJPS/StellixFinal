# ADR-FINAL: v1.0.0 — deviations, gaps closed, bugs caught, and an honest readiness assessment

- **Status:** Accepted — final architecture record for the v1.0.0 release
- **Date:** 2026-07-12
- **Batch:** 17 (final)

This record closes the build. It documents (1) where the implementation deliberately
deviated from or extended the original SRC-report spec, (2) the gaps closed along the
way, (3) the **real bugs caught by live verification** that hermetic tests missed, and
(4) an honest assessment of what is production-ready versus what needs work before real
institutional clients. It is intentionally candid.

---

## 1. Deliberate deviations from / extensions to the SRC spec

| # | Area | Deviation / extension | Why |
| --- | --- | --- | --- |
| 1 | **Deferred third-party credentials** | Anthropic (LLM), Stripe (billing), Sentry (errors), and the demo/alert webhooks are all **inert-until-configured**: the feature returns a clean `503`/no-op and stores an exact placeholder, never crashes. | Those accounts belong to the project owner and can't be created by the build. The graceful-degradation contract is a genuine product improvement, not a stub. |
| 2 | **Neo4j Community, graph as a derived projection** | The locked stack mandates Neo4j **Community** (no Enterprise HA/online-backup). We treat the graph as a **real-time dual-write projection of Postgres** — rebuildable, never a sole system of record. | Makes the Community-edition backup story (offline dump / rebuild-from-Postgres, see DR doc) acceptable, and keeps Postgres the single source of truth (constitution Pillar 2/3). |
| 3 | **Validation is genuinely hard to pass** | On a real public 2019–2024 sample, honest simple-DSL strategies validate to composite **~0.28–0.61**; almost none clear the `0.70` production activation gate. We did **not** loosen the gate. | That strictness *is* the product thesis (most strategies fail honest validation). See #4 for how the demo copes. |
| 4 | **Demo-seed-only activation bar** | `scripts/seed_demo_data.py` monkeypatches its **own** copy of `ROBUSTNESS_THRESHOLD` to `0.39` so the demo tenant has a realistic active book. **Product code still enforces `0.70`**, and every robustness score shown is the real composite. | Gives investors/evaluators a populated demo without faking a single number. Documented transparently in `docs/demo_script.md`. |
| 5 | **Local-disk artifact stores** | Compliance-export PDFs and user avatars write to local disk behind a path-returning interface, not S3/GCS. | Sufficient for v1/self-hosted; swappable for object storage without an API change. Backed by a writable volume in K8s. |
| 6 | **Managed data services in production** | No in-cluster StatefulSets for Postgres/Neo4j/Redis; the K8s manifests are stateless-tier only. | See `docs/adr/0004-managed-data-services.md`. |
| 7 | **Real libraries, never hand-rolled math** | Regime detection (hmmlearn/ruptures/arch/scikit-learn), backtest (vectorbt), SHAP (shap/lightgbm), GA (deap), indicators (ta). | Constitution §2; correctness + auditability over bespoke code. |

## 2. Gaps closed across the build

- **Multi-tenancy enforced structurally**, not by convention: `TenantScopedModel` +
  a `with_loader_criteria` listener auto-injects `organization_id` on every ORM query,
  and Cypher has a fail-closed `run_scoped` guard (raises if a query lacks
  `$organization_id`). A tenant-leaking query is hard to write by accident.
- **Everything > ~2s is async** (Celery): ingest, regime detection, backtests, the
  5-method validation suite, GA evolution, compliance export — never blocking a request.
- **Failure-as-asset is real and append-only**: `failures` cannot be UPDATE/DELETE'd
  (DB-level), each failure carries its regime + trigger + SHAP attribution, and the
  knowledge graph makes them queryable (the five named queries).
- **Observability, rate limiting, RBAC, audit logging, MFA/API-keys/sessions, billing,
  and a public marketing site** were all added as first-class, tested features
  (Batches 11–15), not afterthoughts.
- **Production hardening (this batch):** multi-stage non-root Dockerfiles, schema-valid
  K8s manifests (kubeconform-checked), CI/CD, coverage audit, real load test, DR runbook.

## 3. Real bugs caught by LIVE verification (not hermetic tests)

These are the defects that only a real, end-to-end run surfaced — the strongest
argument for the project's "verify live, with actual output" discipline.

| Batch | Bug | How live verification caught it | Fix |
| --- | --- | --- | --- |
| 13 | The `@app.exception_handler(Exception)` never ran **inside** `CORSMiddleware` (Starlette special-cases it onto `ServerErrorMiddleware`, outside user middleware), so 500s reached the browser **without CORS headers** and unlogged. | Hitting a deliberately-failing endpoint against the running server showed a CORS-less 500. | Plain-ASGI `UnhandledExceptionMiddleware` registered innermost; verified the 500 then carried CORS + `X-Request-ID` + org/user in the log. |
| 14 | `stripe.Webhook.construct_event` returns a `StripeObject`, **not a dict** — `.get(...)` on it would have broken all four webhook handlers. | Exercising the webhook with Stripe's own real HMAC signing (not a mock) surfaced the type. | Use `construct_event` only for signature verification, then `json.loads(payload)` for a plain dict. |
| 16 | A single bulk `INSERT` in `persist_market_data`/`persist_features` exceeded **asyncpg's hard 32767 bound-parameter cap** for any series > ~1,900 bars (BTC-USD's 2,171 daily bars × 17 cols = 36,907 params). | The real seed run **crashed** on BTC-USD; SPY/QQQ/GLD (≤1,489 bars) had silently stayed under the limit. | Chunk inserts under a 30k-param margin (`_chunk_rows`); regression test added. A genuine production bug (any long/intraday series), not just a seed issue. |
| 16 | The Knowledge-Graph UI hardcodes **stricter** query params (`min_regimes=4`, `min_occurrences=3`, `months=24`) than intuition; a data-layer check at 2/2 **passed**, but two of the five queries returned **empty in the real UI**. | Driving the actual query buttons in the browser and reading the response bodies. | Reshaped the seed (count-3 drawdown cluster; a 4-regime strategy left un-failed) so all five queries return data at the UI's own thresholds. |
| 17 | The Neo4j async driver caches one connection pool bound to the first event loop; with a **real Neo4j running**, later pytest-asyncio tests reused a dead socket and crashed (`NoneType has no attribute send`) — 13 scattered failures. Green in CI (no Neo4j), red locally. | Running the **full suite with Neo4j up** (from Batch 16) exposed it; each test passed in isolation. | Autouse fixture defaults every test to the in-memory graph fake — hermetic regardless of whether Neo4j is running, and never pollutes a real graph. |
| 17 | A latent **timestamp flaky test** (`updated_at != created_at`) that only passed because real-Neo4j slowness used to straddle a one-second boundary; the SQLite test DB's `CURRENT_TIMESTAMP` is second-precision. | Surfaced once the graph fake removed the accidental delay. | Assert monotonic (`>=`); Postgres `now()` is microsecond-precise in production. |
| 17 | **`pip-audit`** flagged five 2026 Starlette advisories: a loose `fastapi<1.0` floor back-resolves a fresh install to a **vulnerable** Starlette even though the *installed* env was patched. | The final dependency re-audit (fresh-resolve mode) vs. the installed venv. | Pin `fastapi==0.139.0` + `starlette>=1.3.1`; re-audit clean but for the non-exploitable `ecdsa` note below. |

## 4. Security re-audit (Batches 12–16 + dependencies)

- **RBAC / auth on new endpoints — verified:** billing (`/billing/*`) is
  `require_role(ADMIN)` on all four user-facing endpoints; the Stripe webhook is
  unauthenticated **by design** and signature-verified. User account endpoints
  (MFA, API keys, sessions, password, avatar, preferences) are all `get_current_user`
  self-service. Notifications are auth-guarded and self-scoped. The public
  `POST /contact/demo-request` is intentionally unauthenticated but IP-rate-limited +
  honeypot-guarded + Pydantic-validated.
- **Rate limiting / input validation:** every expensive/write path carries a limiter
  (per-org for ingest/backtest/validate/evolution/LLM; per-user global; per-IP auth +
  demo-request) and a Pydantic request model. Tenant scoping holds (all go through
  `get_tenant_db`).
- **`pip-audit`:** Starlette advisories closed (see §3). One residual — `ecdsa 0.19.2`
  (PYSEC-2026-1325, a transitive of `python-jose[cryptography]`) — has **no upstream
  fix** and is **not exploitable here**: the app uses **HS256 (HMAC)** exclusively
  (`JWT_ALGORITHM=HS256`), so the ECDSA code path is never invoked. Accepted with
  rationale; revisit if EC JWT algorithms are ever adopted (or migrate to PyJWT).
- **`npm audit`:** 3 moderate, all a **postcss** advisory bundled inside Next.js
  ("XSS via unescaped `</style>` in CSS stringify output"), transitively via
  `@sentry/nextjs`. **Not runtime-exploitable here** — postcss only processes the
  project's own Tailwind CSS at **build time**; no untrusted input reaches it. npm's
  suggested "fix" is a nonsensical downgrade to Next 9. Tracked for a future Next bump;
  not force-upgraded in the release batch.

## 5. Honest production-readiness assessment

### Ready
- Core research engine: real regime ensemble, backtests, 5-method validation, failure
  intelligence with SHAP, GA evolution, and the knowledge graph — all real, all tested
  (**335 tests pass; 80% overall coverage; every named business-logic module > 75%**).
- Multi-tenant isolation (structural), RBAC, audit logging, rate limiting, MFA/API keys.
- Deploy substrate: non-root images, schema-valid K8s manifests + HPA + probes, CI/CD,
  DR runbook. Read latency is excellent (**p95 ~18–19 ms at 50 concurrent users**).

### Needs work before real institutional clients
- **Third-party credentials must be provisioned** and re-verified end-to-end against
  live Anthropic/Stripe/Sentry (today they're graceful-degradation-tested, not
  live-tested). Stripe in particular needs a real webhook round-trip in staging.
- **Docker images are unbuilt here** (no Docker engine on the build machine) — the
  Dockerfiles are written and their assumptions verified (frontend `next build`
  produces the standalone `server.js`; backend paths/deps resolve), but a real
  `docker build` + image scan (e.g. Trivy) must run in CI before first deploy.
- **Load testing was single-worker + rate-limited**; a production-scale test with many
  distinct accounts (or relaxed limits in a load env) and the multi-replica topology is
  needed to size the cluster. The write path's true throughput ceiling is untested.
- **Neo4j Community HA**: no online backup/failover; the rebuild-from-Postgres path is
  documented but not drilled. For clients with strict graph-availability SLAs, budget
  Neo4j Enterprise/AuraDB Enterprise.
- **Financial-domain hardening**: the validation/backtch math is real but has not been
  independently quant-reviewed; no survivorship-bias-free universe, no transaction-cost
  model beyond the backtester's, no live-trading path (by design — this is a research
  memory layer, not an execution system).
- **Frontend residual lint warning** (one Batch-12 `useMemo` deps warning) and the
  postcss/next advisory above should be cleared in a maintenance pass.
- **Secrets management**: the K8s Secret is a template; production should source these
  from a real manager (External Secrets / Sealed Secrets / Vault), not a raw Secret.

### Bottom line
The platform is a **genuinely functional v1** — every pillar (regime-conditioning,
failure-as-asset, compounding memory) is real and exercised end-to-end, not mocked. It
is ready for a **controlled pilot** on managed infrastructure with the deferred
credentials wired up. It is **not yet** ready for unattended, SLA-bound institutional
production without the credential live-tests, a real image-build/scan pipeline,
production-scale load testing, and a quant review of the financial math.
