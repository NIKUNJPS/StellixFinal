# Superadmin Control Plane — Privacy & Isolation Hardening (Batch 24)

This report documents how the founder's cross-tenant control plane (`/superadmin/*`)
coexists with the platform's per-tenant isolation guarantees, what is enforced today,
and the gaps a production deployment must close. It reflects the **real code**, not the
batch spec — where the spec assumed something the codebase does differently, the
codebase wins and the difference is called out.

## 1. Tenant isolation model (what the superadmin plane must not break)

Multi-tenancy is **structural, at the ORM layer** (ADR-0002), not Postgres RLS:

- Every tenant table is a `TenantScopedModel`. A fail-closed SQLAlchemy
  `with_loader_criteria` listener injects `organization_id = :bound_org` into every
  SELECT on a scoped session. A session with no bound org raises rather than returning
  all rows — **fail-closed**.
- `get_tenant_db` binds the org from the JWT (`org` claim). `get_system_db` marks the
  session explicitly **unscoped** and is used only for pre-auth flows and the superadmin
  plane.
- **Postgres RLS is disabled on all tenant tables.** The batch context claimed RLS was
  on; it is not. Isolation is entirely app-level. This is intentional (one enforcement
  point, testable in the hermetic suite) but it means *any* raw/unscoped query is a
  potential cross-tenant leak — which is exactly why the superadmin plane is audited.

**Verified:** `test_cross_org_isolation_still_holds` — a client in org A sees zero of
org B's strategies and gets 403 on `/superadmin/*`. The full data-isolation/RBAC suites
still pass unchanged (411 backend tests green).

## 2. How the superadmin plane crosses the boundary — and logs it

Every `/superadmin/*` route runs on `get_system_db` (**unscoped**), because the whole
point is to see across tenants. That is the one place the fail-closed scoping is
deliberately bypassed. To keep it accountable:

- **Every cross-org read and every mutation writes a `superadmin_audit_log` row**
  (`super_admin_id`, `action`, `target_type/id`, `before/after`, `reason`, `ip`,
  `created_at`). This is the SOC 2 control: privileged cross-tenant *access* is
  independently recorded, not just changes.
- **Verified against the live DB:** a single E2E console session produced 22 audit
  rows — `list_all_orgs`, `list_all_users`, `view_org_detail`, `get_platform_stats`,
  `get_revenue_breakdown`, `get_usage_by_org`, `list_demo_requests`, plus
  `approve_demo_request`, `suspend_org`, `reactivate_org`.
- **Deviation from spec (logging granularity):** the spec implied logging in the
  `require_super_admin` guard. We log at the **service layer** instead. Logging every
  authenticated GET in the guard (including list refreshes and health polls) would be a
  DB write per request and would bury the signal. The service logs the meaningful reads
  and all mutations — which is what "cross-org data access is recorded" actually
  requires. `require_super_admin` only gates.

## 3. The org-status gate (blast radius containment)

`get_current_user` runs `_enforce_org_status` for **every authenticated client
request**. A suspended org is locked out of the *entire* client API, not route-by-route:

- `suspended` → 403 `ORG_SUSPENDED`, `terminated` → 410 `ORG_TERMINATED`,
  `pending_approval` → 403 `ORG_PENDING`. Superadmins are **exempt** (the founder's
  console must survive any org's lifecycle state).
- Status is **Redis-cached, 60s TTL** (`org:status:{org_id}`), invalidated on every
  transition (`approve`/`suspend`/`reactivate`/`terminate`) so there is no stale window.
- Suspend/terminate also **revoke all refresh tokens** for the org, so no new access
  token can be minted; existing stateless 15-min access tokens are stopped by the gate
  on their next request.

**Verified E2E against the running stack:** an org's admin held a valid access token,
`/strategies` = 200. Founder suspended the org via the console UI (`POST .../suspend` →
200). The **same token** immediately returned 403 `ORG_SUSPENDED` on `/strategies`,
`/portfolio/overview`, `/auth/me`, and `/failures` — no 60s lag. Reactivate → the same
token returned 200 again immediately. Cache invalidation proven in both directions.

## 4. Impersonation (read-only, time-boxed, logged)

- Token carries the **target user's** identity (so tenant scoping is correct downstream)
  plus `impersonation: true` and the impersonator's id. **15-minute** lifetime regardless
  of `ACCESS_TOKEN_EXPIRE_MINUTES`.
- **Read-only is enforced globally**: `get_current_user` rejects any write HTTP method
  (POST/PUT/PATCH/DELETE) when the token is an impersonation token — one check, not
  per-endpoint annotations that could be forgotten.
- **A reason is required** and the action is logged. A superadmin **cannot** be
  impersonated.
- **Verified:** `test_impersonation_token_expires_in_15min`,
  `test_impersonation_is_read_only` (GET 200, POST 403 "read-only"),
  `test_impersonation_logged_to_superadmin_audit`.
- **UX note:** the console's "Impersonate" swaps the browser's in-memory token for the
  read-only one and drops into the client app; the founder re-authenticates to return.
  The token can't mutate anything, and it self-expires in 15 min.

## 5. Redis namespacing

Keys are per-concern and per-tenant where relevant: org status `org:status:{org_id}`,
rate-limit buckets keyed by user/org id, WS channels namespaced by org. The superadmin
plane's only Redis interaction is **invalidating** `org:status:{org_id}` on transitions.
No superadmin data is cached cross-tenant.

## 6. Neo4j knowledge graph

Every node and edge carries an `organization_id` property, and **every** Cypher
`MATCH`/`MERGE` scopes on `$organization_id` (`app/graph/neo4j_repository.py`,
`app/graph/tenant_query.py`). The superadmin plane does **not** read the graph
cross-tenant today — platform analytics are computed from Postgres only. If a future
superadmin graph view is added, it must apply the same per-org filter and log the access.

## 7. Revenue is not fabricated

There is no live billing integration (Stripe is unkeyed — deferred credential).
`monthly_revenue_usd` is set to the plan's **list price** on approval and is
founder-overridable. Every surface that shows revenue is flagged `mrr_is_list_price:
true` / "list-price MRR, not billed revenue." No fake numbers are invented to fill the
dashboard.

## 8. Known gaps / production TODOs

1. **Append-only audit is not enforced against a superuser connection.** Migration 0016
   runs `REVOKE UPDATE, DELETE ON superadmin_audit_log FROM PUBLIC` (matching the
   existing failure/audit-log pattern). But Postgres grants **do not apply to
   superusers**, and the dev/app connection is currently the `postgres` superuser — a
   direct `UPDATE` succeeds locally. **Action:** run the application as a dedicated
   non-superuser role with only `INSERT, SELECT` on the audit tables. The REVOKE only
   bites for that role. (This is a pre-existing platform limitation, not new to this
   batch.)
2. **No transactional email.** All lifecycle notifications (registration pending, org
   approved/provisioned/suspended/terminated, demo request) are pure content templates
   (`app/services/notifications.py`) delivered **best-effort over the webhook channel**
   and logged; a missing `DEMO_WEBHOOK_URL` makes them silent no-ops. Temp passwords are
   **never** placed in a notification body — they are returned once in the approve
   response for the founder to relay. **Action:** wire the templates to an email
   provider when keyed; the copy doesn't change, only the transport.
3. **RLS is off.** App-level scoping is the only isolation layer. Consider enabling
   Postgres RLS as defence-in-depth so an accidental unscoped query can't leak — but
   note the superadmin plane would then need `BYPASSRLS` or a policy exception, which
   re-introduces the same "audit everything" requirement.
4. **Impersonation swaps the founder's own session.** Acceptable for a 15-min read-only
   debug window, but a future improvement is to scope the impersonation token to a
   separate browser context so the console session isn't lost.

## 9. Test coverage (Batch 24)

`backend/tests/test_superadmin.py` (13 tests) covers: the `require_super_admin` 403,
cross-tenant listing, approve→active→login, suspend blocking multiple endpoints,
suspend/reactivate cache invalidation, terminate→410, 15-min read-only impersonation +
audit logging, demo-request→org+user provisioning, public demo endpoint needs no auth,
platform stats, and that cross-org isolation still holds. Notification templates are
unit-tested (`test_notification_templates.py`), including that the temp password never
leaks into a notification body. Full suite: **411 passed, 0 failures, 9 skipped**
(integration-only), no live network calls.
