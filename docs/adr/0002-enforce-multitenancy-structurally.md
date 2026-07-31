# ADR 0002: Enforce Multi-Tenancy Structurally in the ORM

- **Status:** Accepted
- **Date:** 2026-06-28
- **Batch:** 0

## Context

The constitution mandates that every client-data table carry `tenant_id` and that
every query filter by it. Relying on developers to remember a `.where(tenant_id=...)`
clause on every query is a guaranteed eventual data-leak: the failure mode (returning
another tenant's data) is silent and catastrophic in a B2B fintech product.

We need enforcement that is *structural* — the default path is safe, and writing a
tenant-leaking query requires deliberately bypassing the mechanism.

## Decision

Two cooperating mechanisms in `backend/app/db/tenant.py`:

1. **`TenantScoped` declarative mixin** — provides a non-nullable `tenant_id` UUID
   column with an FK to `organizations.id` and an index. Every tenant-scoped model
   inherits it. The `organizations` table is the sole exception (it *is* the tenant).

2. **Automatic query filtering via `with_loader_criteria`** — we bind a `tenant_id`
   onto the SQLAlchemy `AsyncSession` (in `session.info`). A `do_orm_execute` event
   listener injects
   `with_loader_criteria(TenantScoped, lambda c: c.tenant_id == bound_tenant)`
   into every ORM SELECT. Result: all reads are auto-scoped without the caller
   writing a filter.

3. **Fail-closed**: if a query touches a `TenantScoped` entity while no tenant is
   bound to the session, the listener raises `TenantContextError` rather than
   returning unscoped rows. Writes are guarded by an ORM `before_flush` hook that
   stamps/validates `tenant_id` against the bound tenant.

Application code obtains a session via `get_tenant_session(tenant_id)` (or the
FastAPI dependency that derives the tenant from the authenticated principal in a
later batch). For Batch 0, an unscoped `get_session()` exists for system-level
operations (migrations, the `/health` check) and explicitly does not touch
tenant data.

## Consequences

- The safe path is the default path; leaking requires deliberately using an unscoped
  session against tenant data.
- `with_loader_criteria` covers ORM-level queries. Raw SQL / Core statements bypass
  it by design — those are reserved for migrations and system operations and are
  reviewed accordingly.
- A small runtime cost per query (criteria injection), accepted as the price of
  safety.
