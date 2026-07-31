# ADR 0003: Auth/Tenancy Core — Naming Reconciliation & Auth Design

- **Status:** Accepted — **explicitly approved by the project owner (2026-06-28).**
  This naming is **canonical and final**; do NOT revert `organization_id` →
  `tenant_id` or `TenantScopedModel` → `TenantScoped` in a future session.
- **Date:** 2026-06-28
- **Batch:** 1

## Context

Batch 0 seeded the tenant column as `tenant_id` and the mixin as `TenantScoped`,
with TitleCase `user_role` values. Batch 1 specifies `organization_id`, a
`TenantScopedModel` mixin, lowercase role values, and additional fields (tiers,
lockout, etc.). Batch 0's initial migration was **never applied to any database**
(Docker was unavailable when Batch 0 landed), so no deployed schema exists to
protect.

## Decision

1. **Reconcile naming to Batch 1.** Canonical tenant column is `organization_id`;
   the mixin is `TenantScopedModel`; `user_role` values are lowercase
   (`researcher`, `risk_manager`, `cio`, `compliance_officer`, `admin`).
   `PROJECT_CONSTITUTION.md` §3 and `docs/schemas.md` are updated to match.

2. **Revise the single initial migration rather than stacking a rename.** Because
   nothing was ever migrated, `0001_initial` is edited to emit the final canonical
   schema. This keeps one clean, truthful initial migration. (Had any environment
   applied `0001`, we would instead have shipped an additive `0002` rename
   migration — the append-only rule applies to *deployed* history.)

3. **Auth design choices:**
   - **Login disambiguation.** Because email is unique per-org (not globally),
     `/auth/login` accepts an optional `organization_slug`. With one global match
     it is optional; when an email exists in multiple orgs it is required.
   - **Refresh tokens are opaque random strings**, not JWTs — stored only as
     SHA-256 hashes, rotated on every use (old one revoked).
   - **Refresh token delivered via httpOnly cookie**, never in a JS-readable body
     (XSS defense). Access token (15 min JWT) is returned in the response body for
     in-memory client storage. A body fallback for the refresh value exists for
     non-browser clients (curl/Postman) and tests.
   - **Account lockout**: 5 consecutive failures → 15-minute lock (`locked_until`).
   - **Rate limiting**: auth endpoints get a 5 req/min/IP limiter *now* (credential
     stuffing is the top early-SaaS attack). It is an in-process fixed-window
     limiter for Batch 1; Batch 11 replaces it with a Redis-distributed limiter for
     multi-instance correctness.

4. **Tenant enforcement is strengthened, not weakened.** The fail-closed
   `with_loader_criteria` auto-scoping from ADR 0002 is retained; querying a
   `TenantScopedModel` with no organization bound raises `TenantContextError`. This
   is what makes the tenant-isolation attack test pass structurally.

## Consequences

- A future reader sees one coherent initial schema matching the models.
- The constitution's multi-tenancy clause now reads `organization_id`.
- Redis-distributed rate limiting is explicitly deferred to Batch 11; the in-process
  limiter is correct for single-instance dev/staging.
