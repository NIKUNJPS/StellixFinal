# SOC 2 Type I Readiness

**Scope:** the Stellix Labs platform (FastAPI backend, Next.js frontend, Celery
workers, Postgres/TimescaleDB, Neo4j, Redis).
**Status:** internal readiness assessment — **not** an audit, and **not** a claim of
certification. Stellix Labs has **not** completed a SOC 2 Type I or Type II
examination. This document maps existing, in-code controls to the relevant Trust
Services Criteria so an auditor or enterprise security reviewer can trace each claim
to a real mechanism.

**Ground rule for this document:** every technical assertion cites a real file or
mechanism. Where something is not implemented, or cannot be confirmed from the
codebase, it is marked **"Not implemented"** or **"TO VERIFY"** rather than asserted.
The document's only value is that it is true.

---

## CC6 — Logical and Physical Access Controls

### CC6.1 — Access is restricted to authorized users (RBAC, MFA, lockout)

**Role-based access control.** Authorization is a dependency-injection guard, not
scattered `if` checks. `require_role(*roles)` (`backend/app/api/deps.py:199`) is a
FastAPI dependency factory that 403s any caller whose role is not in the allowed set.
Roles are a fixed five-value enum, `UserRole` (`backend/app/models/user.py:24-28`):
`researcher`, `risk_manager`, `cio`, `compliance_officer`, `admin`. A separate,
orthogonal platform capability, `is_super_admin`, gates the internal control plane via
`require_super_admin` (`backend/app/api/deps.py`), and that surface is excluded from
the public API schema entirely (`include_in_schema=False`, `backend/app/api/router.py`;
verified by `backend/tests/test_public_openapi.py`).

**Multi-factor authentication.** TOTP MFA is real. `User.mfa_enabled`
(`backend/app/models/user.py`) with a stored Base32 secret; a successful password check
for an MFA-enabled user returns an MFA challenge token
(`create_mfa_challenge_token`, `backend/app/core/security.py`) rather than access
tokens, exchanged for real tokens only after a valid code. MFA is **opt-in per user**,
not org-enforced — see "Controls Not Yet Implemented."

**Account lockout.** `User.locked_until` (`backend/app/models/user.py:69`) backs a
lockout after repeated failed logins; `authenticate()`
(`backend/app/services/auth.py`) raises `AccountLockedError`, surfaced as HTTP 423 with
a `Retry-After` header (`backend/app/api/routes/auth.py`). Login and registration are
additionally rate-limited per IP and per account (`backend/app/core/rate_limit.py`).

### CC6.2 — Authentication (token lifetimes, password storage)

- **Access tokens:** JWT, **15-minute** expiry (`ACCESS_TOKEN_EXPIRE_MINUTES = 15`,
  `backend/app/core/config.py:61`). The JWT signing secret is loaded from the
  environment (`JWT_SECRET_KEY`), never hardcoded.
- **Refresh tokens:** **7-day** expiry (`REFRESH_TOKEN_EXPIRE_DAYS = 7`,
  `backend/app/core/config.py:62`), delivered as an httpOnly, path-scoped cookie so
  JavaScript cannot read them (XSS defense; ADR 0003). Stored only as SHA-256 hashes.
- **Passwords:** bcrypt with an explicit cost factor of **12**
  (`CryptContext(schemes=["bcrypt"], … bcrypt__rounds=12)`,
  `backend/app/core/security.py:23`). Plaintext passwords are never stored or logged.
- **API keys:** programmatic credentials (`slx_` prefix) are stored only as SHA-256
  hashes, shown once at creation, and carry explicit scopes.

### CC6.3 — Authorization (tenant + lifecycle enforcement)

Two independent gates run on essentially every authenticated request, both inside
`get_current_user` (`backend/app/api/deps.py`):

1. **Organization-status gate (Batch 24).** A suspended organization receives `403
   ORG_SUSPENDED`, a terminated one `410 ORG_TERMINATED`, and a still-pending one `403
   ORG_PENDING`. Because the gate lives in the shared dependency, a lifecycle change
   locks the tenant out of the *entire* client API, not route by route. Status is
   Redis-cached (60 s) and invalidated on every transition.
2. **Structural multi-tenancy (ADR-0002).** See C1.1.

### CC6.6 — Encryption

- **In transit:** the application emits HTTP Strict-Transport-Security in production
  (`Strict-Transport-Security`, set when `is_production`,
  `backend/app/core/security_headers.py`), instructing browsers to refuse plaintext
  `http://`. TLS termination itself is an ingress/deployment concern (see A1.2);
  **TO VERIFY** against the live ingress configuration.
- **Secrets at rest in configuration:** sensitive settings are typed as Pydantic
  `SecretStr` and read via `.get_secret_value()` (Batch 18 conversion,
  `backend/app/core/config.py`), so they are not accidentally logged or serialized.
- **Passwords / tokens at rest:** bcrypt for passwords, SHA-256 for refresh tokens and
  API keys (CC6.2).
- **Database encryption at rest:** **TO VERIFY.** There is no application-level
  database encryption in the codebase; the platform relies on managed data services
  (ADR-0004, `docs/adr/0004-managed-data-services.md`), so encryption-at-rest depends
  on the managed Postgres/Neo4j provider's configuration and is not asserted here.

### CC6.7 — Transmission and boundary protection

- **CORS** is configured from an allow-list, not a wildcard, via
  `BACKEND_CORS_ORIGINS` (`backend/app/core/config.py:36`, applied in
  `backend/app/main.py`).
- **Security headers** are added to every response by `SecurityHeadersMiddleware`
  (`backend/app/core/security_headers.py`): `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, a `Content-Security-Policy`, and (in production) HSTS.

### CC6.8 — Vulnerability management

Continuous integration (`.github/workflows/ci.yml`) runs on every push and PR:
**ruff** lint, the **pytest** suite with coverage (against a real Redis service
container), and the frontend **`tsc --noEmit` + `next build`**. Deployment
(`.github/workflows/deploy.yml`) builds and pushes both container images to GHCR and
applies them with `kubectl`.

**Honest gap:** CI runs correctness checks (lint, tests, type-check, build) but **no
dedicated security scanning** — there is no dependency-vulnerability scan (e.g. `pip
audit`/Dependabot enforcement), no SAST, and no container image scan (e.g. Trivy) in
the pipeline today. This is a real gap, listed again below.

---

## A1 — Availability

### A1.1 — Monitoring

- **Metrics:** Prometheus instrumentation is wired in
  (`prometheus_fastapi_instrumentator`, `backend/app/main.py`), exposing `GET /metrics`
  in the standard text format; custom business counters live in
  `backend/app/core/metrics.py` on the same registry. A Prometheus + Grafana stack is
  present under `infra/prometheus/` and `infra/grafana/`.
- **Error tracking:** Sentry is integrated (`sentry_sdk` in `backend/app/main.py`),
  inert until `SENTRY_DSN` is configured (deferred-credential pattern).
- **Health/heartbeat:** `GET /health` (unauthenticated liveness), a detailed
  admin-only `GET /system/health-detailed`, and a Celery `system_heartbeat` beat task
  (`backend/app/worker/celery_app.py`) whose freshness the System Monitoring page
  checks. **TO VERIFY:** whether Prometheus/Grafana/Sentry are actively provisioned and
  alerting in a production environment (the wiring is real; the running deployment is
  outside the repo).

### A1.2 — Scaling and deployment

Kubernetes manifests exist under `infra/k8s/`, and `docker-compose.yml` +
`infra/initdb/` support local/standby bring-up. The WebSocket layer is designed for
horizontal scale — each API replica runs its own Redis-pub/sub bridge (Batch 19,
`backend/app/ws/bridge.py`) so events fan out across replicas. **TO VERIFY:** current
replica counts, autoscaling policy, and ingress/TLS specifics against the live cluster.

### A1.3 — Recovery (RTO / RPO)

A disaster-recovery plan exists at `docs/disaster_recovery.md` with explicit v1
targets: **whole-region RTO ≤ 4 hours**, and per-store RPO targets (Postgres ≤ ~5 min
via the managed provider's point-in-time recovery; the Neo4j graph is treated as a
*rebuildable projection* of Postgres, so its effective RPO is rebuild time, not backup
age). Backups are taken nightly and before every migration. These are documented
targets, not yet evidenced by a live restore drill — **TO VERIFY** with a rehearsed
recovery.

---

## C1 — Confidentiality

### C1.1 — Tenant isolation (the primary confidentiality control)

Isolation is **structural, at the ORM layer** — and, importantly, **PostgreSQL
Row-Level Security is NOT used** (it is disabled on every table). Stating this plainly
matters: an auditor should not be told "RLS enabled" when it is not.

The real mechanism (ADR-0002, `docs/adr/0002-enforce-multitenancy-structurally.md`):
every tenant table subclasses `TenantScopedModel`, and a fail-closed SQLAlchemy
`with_loader_criteria` listener injects `organization_id = :bound_org` into every
SELECT on a tenant-bound session. A session with no bound organization **raises**
rather than returning cross-tenant rows — fail-closed, not fail-open. `get_tenant_db`
binds the org from the verified JWT; the unscoped `get_system_db` is reserved for
pre-auth flows and the audited superadmin plane. This is exercised by the isolation
test suite (e.g. `backend/tests/test_data_isolation.py`,
`backend/tests/test_graph_isolation.py`, `backend/tests/test_rbac_isolation.py`), and
the knowledge graph applies the same per-org filter in every Cypher query
(`backend/app/graph/`).

Cross-tenant access by the internal superadmin plane is deliberate and **independently
logged**: every cross-org read and mutation writes a `superadmin_audit_log` row
(`backend/app/services/superadmin.py`; see `docs/superadmin_isolation.md`).

### C1.2 — Data disposal

Organization termination is a controlled state transition, not an ad-hoc delete.
`terminate_org` (`backend/app/services/superadmin.py`) sets `status = TERMINATED`,
zeroes `monthly_revenue_usd`, records `terminated_at`, and revokes all of the org's
refresh tokens; thereafter the org-status gate returns `410 GONE` on every request.
This is a **soft** disposal (the rows remain for audit/eventual purge), described here
exactly as implemented — no claim of immediate cryptographic erasure. Hard deletion of
an organization cascades to its tenant data via `ON DELETE CASCADE` foreign keys on
`organization_id`. A formal, scheduled hard-purge workflow is **Not implemented**.

---

## PI1 — Processing Integrity

### PI1.1 — Look-ahead-bias prevention

Point-in-time correctness of features and backtests is guarded by a dedicated test,
`backend/tests/test_lookahead.py`, and the feature engine documents that every feature
at time *T* uses only data at *T* or earlier, with warm-up rows left `NaN` rather than
back-filled (`backend/app/features/engineering.py`). This is a genuine, tested
processing-integrity control.

### PI1.2 — Accurate processing (validation gate + Safeguard 5)

- **Five-method validation gate.** A strategy earns one composite robustness score
  from Walk-Forward, Regime Cross-Validation, Monte-Carlo, Persistence, and Stress
  tests; promotion to `active` is code-enforced above a 0.70 threshold — it cannot be
  clicked past.
- **Safeguard 5 (ADR-0005, `docs/adr/0005-safeguard5-*.md`).** LLM-generated numeric
  claims are cross-checked against ground truth covering *every* source shown to the
  model, so an assistant explanation cannot silently contradict the real numbers. This
  is a strong, real integrity control and is cited here deliberately.
- **Append-only records.** Failures, the governance audit log, the LLM audit log, and
  the superadmin audit log are append-only at the database role level (`REVOKE UPDATE,
  DELETE … FROM PUBLIC`; e.g.
  `backend/alembic/versions/20260708_0010_0010_governance_audit_log.py:67`) — with the
  important caveat in the next section.

---

## CC7 / CC8 — Change Management and Operations

### CC7.1 — System operations and logging

All application logs are **structured** (structlog, `backend/app/core/logging.py`) and
carry a per-request `request_id` and, once authenticated, the `organization_id` — bound
by middleware at the edge of the request (`backend/app/core/request_id.py`) and
propagated into any Celery task the request enqueues. This means a single incident can
be traced across the API process and its background work by correlation id. Unhandled
exceptions are caught by `UnhandledExceptionMiddleware` (`backend/app/main.py`) so a
crash returns a clean, CORS-correct 500 (and, when configured, a Sentry event) rather
than leaking internals.

### CC8.1 — Change management

- **Schema changes are versioned migrations.** Every database change is an Alembic
  migration under `backend/alembic/versions/` with an explicit `down_revision` forming a
  single linear history (current head `0017_weekly_digest_toggle`). Migrations are
  reviewed like code and applied in deploy; the suite asserts a single migration head.
- **Code changes gate on CI.** Branch pushes and PRs must pass lint, the full test
  suite, type-check, and build (`.github/workflows/ci.yml`) before merge.
- **Deploys are immutable images.** `deploy.yml` builds versioned container images,
  pushes them to GHCR, and rolls them out with `kubectl` — no in-place edits to running
  hosts.
- **Append-only audit for privileged change.** Founder/superadmin actions and
  governance events are recorded in append-only tables (below), so a change to a
  tenant's lifecycle or a privileged cross-tenant read leaves an immutable trail.

The four append-only tables and what each records: `audit_log` (governance actions —
kill switch, compliance exports), `superadmin_audit_log` (every cross-tenant read and
mutation by the founder plane), `llm_audit_log` (each LLM call, its cost, and its
numeric-validation result), and `failures` (immutable strategy-failure records with
SHAP attribution). Each is created with `REVOKE UPDATE, DELETE … FROM PUBLIC` in its
migration.

---

## Controls Not Yet Implemented (mandatory honest section)

These are real, current gaps. None should be represented to a customer as complete.

1. **No formal penetration test.** No third-party pentest has been performed.
2. **No SOC 2 Type II examination.** Type II requires ~6 months of operating-effectiveness
   evidence; none exists yet. Even Type I has not been formally audited.
3. **Append-only audit REVOKE does not bind a Postgres superuser.** As documented in
   `docs/superadmin_isolation.md` (§8.1): *"Postgres grants do not apply to superusers,
   and the dev/app connection is currently the `postgres` superuser — a direct `UPDATE`
   succeeds locally."* The `REVOKE UPDATE, DELETE` only provides real immutability when
   the application connects as a **dedicated non-superuser role with only INSERT/SELECT**
   on the audit tables. **Action:** provision that role in production. Until then,
   append-only is a design intent, not an enforced guarantee, for a superuser connection.
4. **No transactional email.** There is no SMTP/email provider. All notifications —
   account lifecycle and the weekly digest — are delivered best-effort over a
   webhook/log channel (`backend/app/services/notifications.py`,
   `backend/app/services/weekly_digest.py`). This is a functional gap, not a security
   claim, but it is called out for accuracy.
5. **No LLM spend cap.** Per-call LLM cost is recorded (`LLMAuditLog.estimated_cost_usd`)
   and rate-limited (50 calls/hour/org), but there is **no enforced monthly dollar
   budget** — cost is tracked, never capped (Batch 21 finding).
6. **No dedicated vulnerability scanning in CI** (CC6.8): lint + tests + type-check +
   build only; no dependency/container/SAST scanning.
7. **MFA is opt-in, not enforced.** There is no policy forcing MFA enrollment for
   privileged roles.
8. **Encryption at rest (database): TO VERIFY / provider-dependent** (CC6.6).
9. **Monitoring/alerting is wired but its production operation is TO VERIFY** (A1.1).
10. **No scheduled hard-purge / data-retention automation** (C1.2).

---

## Evidence Artifacts Available

- **Automated test suite:** **429 tests passing, 0 failures, 9 skipped**
  (integration-only), run in CI on every push. The suite includes the tenant-isolation,
  RBAC, look-ahead, append-only, and public-schema-exclusion tests cited above.
- **Architecture Decision Records** (`docs/adr/`): 0001 (record ADRs), **0002**
  (structural multi-tenancy), 0003 (auth/tenancy reconciliation), **0004** (managed data
  services), **0005** (Safeguard 5 ground truth), and ADR-FINAL.
- **Disaster-recovery plan:** `docs/disaster_recovery.md` (RTO/RPO targets, backup
  cadence).
- **Isolation hardening report:** `docs/superadmin_isolation.md` (cross-tenant control
  plane, the superuser-REVOKE caveat quoted above).
- **Audit tables (append-only):** `audit_log` (governance), `superadmin_audit_log`,
  `llm_audit_log`, and `failures`, each created with the `REVOKE UPDATE, DELETE FROM
  PUBLIC` pattern in their Alembic migrations.
- **CI/CD definitions:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`.
- **Infrastructure:** `infra/k8s/`, `infra/prometheus/`, `infra/grafana/`,
  `infra/docker-compose.yml`.

---

*Prepared as an internal readiness assessment. It describes the system as built at the
time of writing; items marked "TO VERIFY" require confirmation against the live
production environment, and items under "Controls Not Yet Implemented" are open work,
not completed controls.*
