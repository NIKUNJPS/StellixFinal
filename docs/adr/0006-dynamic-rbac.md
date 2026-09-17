# ADR 0006: Dynamic, database-backed RBAC

- **Status:** Accepted
- **Date:** 2026-09-17
- **Batch:** 26 (Part A)

## Context

Through Batch 25, authorization was a fixed `user_role` Postgres enum on `users.role`
(`researcher`, `risk_manager`, `cio`, `compliance_officer`, `admin`). Access decisions
were spread across `require_role(...)` dependencies, hardcoded role sets in services
(`GOVERNANCE_ROLES`, `APPROVAL_ROLES`, notification recipient lists), and matching role
checks in the frontend. Adding a role — or giving one person a slightly different set of
powers — meant a migration, a code change in several places, and a deploy.

Two requirements drove the change:

1. SuperAdmins must be able to define the permission catalog and the system roles every
   organization inherits, without a deploy.
2. Organization admins must be able to create custom roles that exist only inside their
   own organization, and assign any visible role to their members.

The hard constraint: **nobody's access may change as a result of the migration.**

## Decision

### Model

- `permissions` — the catalog (`key`, `category`, `description`). Keys are dotted
  (`strategy.approve`, `audit.view.org_risk`). The code-side catalog lives in
  `app/rbac/catalog.py` (`class P`).
- `roles` — `organization_id` NULL for system roles, set for an organization's custom
  roles. `is_system_default` marks the five original roles; `system_key` holds their
  legacy enum value. Names are unique per organization, and system role names are unique
  among system roles (partial unique index).
- `role_permissions` — the grant table.
- `users.role_id` and `invitations.role_id` — the role that grants permissions.

System roles and catalog permissions use deterministic `uuid5` ids, so the migration, the
test fixtures and the service seed produce identical rows. A test asserts the migration's
frozen seed equals the live catalog, so they cannot drift silently.

### The seeded mapping is reverse-engineered, not designed

Before touching any route, `tests/test_rbac_access_matrix.py` was written against the
enum-based code and recorded every role-gated endpoint and service rule for all five
roles. The permission grants in `SYSTEM_ROLES` were then derived from that ground truth.
The matrix test passed before the refactor and passes after it with the **file
unchanged** (same SHA-256), which is the evidence that access did not change.

### Enforcement

- Routes use `require_permission(key)` / `require_any_permission(*keys)`
  (`app/api/deps.py`). Services use `rbac.has_permission(session, user, key)`.
  Recipient lists use `users_with_permission(...)` with an **explicit organization
  filter**.
- Permissions are resolved from the database on every request (memoized for the life of
  the request only). The JWT's role claim is never consulted, so a role change or a
  permission edit takes effect on the user's **next request — no re-login**.
- The effective role is `users.role_id`, or — for any row not yet backfilled — the system
  role matching the legacy `users.role` enum.
- **Fail closed:** a `role_id` pointing at another organization's custom role grants
  nothing.
- **Lock-out guard:** assigning, editing or deleting a role is rejected if it would leave
  the organization with no active member holding `roles.manage`. The Admin system role
  can never lose `roles.manage`.
- System roles cannot be renamed or deleted; a non-default system role can be deleted
  only while no user holds it. A custom role cannot be deleted while assigned.
- Every change is audited: org changes as `role_created`, `role_updated`,
  `role_deleted`, `role_permissions_changed`, `user_role_changed` in `audit_log`;
  SuperAdmin changes in the SuperAdmin action log.

The frontend gates UI on the `permissions` list returned by `GET /auth/me`. That is a
convenience only; every permission is enforced by the backend independently.

### Why `Role` is not a `TenantScopedModel`

ADR 0002 enforces tenancy structurally through `TenantScopedModel`, whose loader criteria
add `organization_id = :current_org` to every query. A role row is either global (system,
`organization_id IS NULL`) or tenant-owned (custom). The automatic filter would hide every
system role from every organization. So `Role` is a plain model, and isolation is enforced
in one place — `app/services/rbac.py` `_visible_to(org)`
(`organization_id IS NULL OR organization_id = :org`) — which every role lookup goes
through. `tests/test_dynamic_rbac.py` covers cross-organization visibility, assignment and
the fail-closed case.

## Deprecation plan for `users.role` and `invitations.role`

The enum columns are kept for one release as a compatibility shim:

1. **Batch 26 (now):** `role_id` is authoritative. Assigning a *system* role also writes
   the matching enum value so any unconverted reader stays correct; assigning a custom
   role leaves the enum untouched. `audit_log.actor_role` is widened to 100 characters and
   records the effective role's key or name.
2. **Next release:** add a CI grep check that fails on new reads of `User.role` /
   `Invitation.role` outside `app/services/rbac.py`; make `users.role_id` NOT NULL.
3. **Following release:** drop `users.role`, `invitations.role` and — if nothing else uses
   it — the `user_role` enum type, in a dedicated migration.

`require_role(...)` remains as a thin legacy wrapper and is not used by any route.

## Consequences

- Roles and permissions change at runtime without a deploy, and apply immediately.
- Each authorization check costs one indexed query per request (cached per request).
- Adding a permission to the catalog does nothing until code checks it: new catalog keys
  created from the SuperAdmin console are labels until a route or service enforces them.
- Endpoints that were unrestricted before Batch 26 remain unrestricted; tightening them is
  a separate, explicit decision.
