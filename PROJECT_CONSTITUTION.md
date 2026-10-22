# Stellix Labs — Project Constitution

> **The Institutional Memory Layer for Quantitative Research**

This document is the supreme governing reference for the Stellix Labs codebase.
It outranks convenience, deadlines, and any individual batch's instructions.

> **READ THIS FILE FIRST at the start of every new work session, before writing or
> changing any code.** If a later instruction contradicts this constitution,
> STOP and raise the conflict — do not silently deviate.

---

## 1. The Three Pillars (Inviolable)

These three ideas are the reason Stellix Labs exists. They must **never be removed,
stubbed out, mocked away permanently, or "simplified for convenience"** in any later
batch. If a batch appears to require dropping one of these, that is a signal to stop
and reconsider the design — not to drop the pillar.

1. **Regime-Conditioning.** Nothing about a strategy, a performance number, or a
   research conclusion is context-free. Every signal, metric, and decision is
   conditioned on the prevailing *market regime*. Performance reported without a
   regime context is considered incomplete and must be treated as such throughout
   the system (data model, API, and UI).

2. **Failure-as-Asset.** Failed strategies, dead ends, and broken hypotheses are
   first-class, permanently retained research assets — never deleted, never hidden.
   The knowledge of *why* something failed, and *in which regime*, is as valuable as
   knowledge of what worked. The schema, API, and UI must make failures durable,
   queryable, and discoverable.

3. **Compounding Memory.** The platform's value increases monotonically with time
   and usage. Every research note, regime label, validation result, and failure is
   captured into Research Memory so that future research stands on the accumulated
   institutional memory of all prior research. Memory is append-first; we extend and
   annotate, we do not overwrite history.

---

## 2. Locked Tech Stack

> **Do not deviate from this under any circumstance. If you believe a substitution is
> justified, STOP and ask a human before writing code.**

### Backend
- Python 3.11+, FastAPI 0.110+
- PostgreSQL 15+ (relational: tenants, users, strategies metadata, audit logs)
- TimescaleDB extension on the same Postgres instance (time-series market data,
  regime labels, performance history)
- Research Memory: a tenant-scoped lineage / failure-memory index derived from
  PostgreSQL inside the API process — no separate graph database (ADR 0012 replaced
  the original Neo4j choice)
- Redis 7.x (cache, session state, job queue backing for Celery/RQ)
- SQLAlchemy 2.x (async) + Alembic for migrations
- Pydantic v2 for all schema validation
- Celery + Redis for background jobs (regime detection runs, GA evolution runs,
  validation suites — anything >2 seconds must be async background work, never
  blocking an API request)
- pytest + pytest-asyncio + httpx for testing

### Frontend
- Next.js 14+ (App Router), TypeScript (strict mode), React 18+
- TailwindCSS 3.x + shadcn/ui component library (NOT a custom design system from
  scratch — shadcn gives production-grade accessible components fast)
- TanStack Query for server state
- Zustand for local/global UI state
- Recharts for standard charts, D3.js only for the regime timeline and failure
  heatmap (the two visualizations Recharts genuinely can't do well)
- Cytoscape.js for the Research Memory lineage viewer
- React Hook Form + Zod for all forms (schema shared conceptually with backend
  Pydantic models — keep field names identical across the stack)

### Auth
- JWT access tokens (15 min expiry) + refresh tokens (7 day expiry, rotated,
  stored hashed in DB) + OAuth2 password flow for login.
- RBAC roles: `Researcher`, `RiskManager`, `CIO`, `ComplianceOfficer`, `Admin`.

### Infra
- Docker Compose for local dev (every service — postgres, timescale, redis —
  runs in containers from day 1, no "install postgres locally" instructions).
- Kubernetes manifests come later (Batch 17) — do not build them now.

---

## 3. Multi-Tenancy Rule (Non-Negotiable)

> Every table that holds client data must include an `organization_id` (UUID, FK to
> the `organizations` table) from the very first migration. Every single query must
> filter by `organization_id`. This is non-negotiable — retrofitting multi-tenancy
> later is extremely expensive and is the #1 reason B2B SaaS rewrites happen. Build a
> SQLAlchemy mixin/base class that enforces this so it's structurally impossible to
> write a tenant-leaking query by accident.

> Note: Batch 0 originally named this column `tenant_id`; Batch 1 reconciled it to
> `organization_id` before any database was deployed (see ADR 0003). The column name
> is `organization_id`; "tenant" remains the conceptual term. **This is the canonical,
> project-owner-approved naming (2026-06-28) — do not revert it.**

Implementation contract:
- All tenant-scoped models inherit `TenantScopedModel` (see
  `backend/app/db/tenant.py`), which provides the non-nullable `organization_id`
  column and FK to `organizations.id`.
- All tenant-scoped reads/writes go through a session that carries a bound tenant
  context; a SQLAlchemy `with_loader_criteria` listener auto-injects the
  `organization_id` filter on every ORM query against a `TenantScopedModel`. A query
  with no organization bound against a tenant-scoped model is a programming error and
  must raise (fail closed).

---

## 4. Testing Rule

> **Every feature must ship with tests. No batch is complete with failing or skipped
> tests.** `xfail`/`skip` markers are only acceptable with a written reason and a
> tracking note in `/docs/schemas.md` or an ADR. A green-but-empty test suite does
> not satisfy this rule — tests must exercise real behavior.

---

## 5. Schema-First Rule

> **Never invent a database field, API field, or graph schema property that
> contradicts an already-defined schema in `/docs/schemas.md`. If a new field is
> genuinely needed, add it to `/docs/schemas.md` FIRST, then implement.**

`/docs/schemas.md` is the single source of truth for entity shape. It is a living
document: **extend, never redefine.** Field names are kept identical across Postgres
columns, Pydantic models, API payloads, Zod schemas, and graph properties.

---

## 6. Session Protocol

At the start of every new work session:
1. Read this `PROJECT_CONSTITUTION.md`.
2. Read `/docs/schemas.md` for the current canonical entity definitions.
3. Read the most recent ADRs in `/docs/adr/`.
4. Only then begin work.
