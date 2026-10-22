"""Batch 26 Part A: dynamic RBAC beyond the unchanged-access matrix
(tests/test_rbac_access_matrix.py) — the seed, custom roles, the SuperAdmin console,
org isolation, no-re-login semantics, the lock-out guard, and the cross-tenant
notification leak fixed along the way."""

from __future__ import annotations

import importlib.util
import uuid
from pathlib import Path

from app.core.security import create_access_token
from app.db.tenant import bind_organization, mark_session_unscoped
from app.models.audit_log import AuditEventType, AuditLog
from app.models.notification import Notification
from app.models.organization import OrganizationTier
from app.models.rbac import Role
from app.models.strategy import StrategyStatus
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.superadmin_audit_log import SuperAdminAuditLog
from app.models.user import User, UserRole
from app.rbac.catalog import PERMISSION_CATALOG, SYSTEM_ROLES, P, system_role_id
from sqlalchemy import select

from tests.data_helpers import seed_strategy
from tests.helpers import add_user_to_org, bearer, create_org_user, create_superadmin


def _token(user: User) -> dict[str, str]:
    return bearer(create_access_token(user_id=user.id, organization_id=user.organization_id, role=user.role.value))


async def _org(maker, tag: str, role: UserRole = UserRole.ADMIN):
    return await create_org_user(maker, org_name=f"Rbac {tag}", slug=f"rbac-{tag}", email=f"admin@{tag}.rbac.io", role=role)


# ----------------------------------------------------------------------------- seed
def _load_migration(name: str, glob: str):
    path = next(Path(__file__).parents[1].joinpath("alembic", "versions").glob(glob))
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_seed_matches_catalog_exactly():
    """The migrations' seed data must reproduce the live catalog EXACTLY. Migration
    0020 stays frozen with the original five roles; migration 0023 (Batch 26 Part B)
    adds the signals.view permission, the Quant Engineer role, and signals.view grants
    to the existing roles. Their union must equal app/rbac/catalog.py — otherwise a
    fresh DB (seeded from the catalog) and production (seeded from the migrations)
    would diverge."""
    m20 = _load_migration("migration_0020", "*_0020_dynamic_rbac.py")
    m23 = _load_migration("migration_0023", "*_0023_quant_engineer_signals_view.py")
    # Batch 30 (ADR 0009): agents.run permission + grants.
    m25 = _load_migration("migration_0025", "*_0025_agent_desk.py")

    # Permissions: 0020 base + 0023 delta == catalog (seed order is irrelevant, so
    # compare as sets — the catalog groups signals.view with the other Research keys
    # while the migration adds it as a later delta).
    perms = (
        [(k, c, d) for k, c, d in m20.PERMISSIONS]
        + [(k, c, d) for k, c, d in m23.NEW_PERMISSIONS]
        + [(k, c, d) for k, c, d in m25.NEW_PERMISSIONS]
    )
    assert set(perms) == {(p.key, p.category, p.description) for p in PERMISSION_CATALOG}
    assert len(perms) == len(PERMISSION_CATALOG)  # no duplicate keys across the two migrations

    # Roles: 0020 base grants, plus signals.view granted to the listed existing roles,
    # plus the new roles from 0023.
    roles = {k: (n, d, set(pset)) for k, n, d, pset in m20.SYSTEM_ROLES}
    for role_key in m23.SIGNALS_VIEW_GRANTED_TO:
        n, d, pset = roles[role_key]
        roles[role_key] = (n, d, pset | {"signals.view"})
    for k, n, d, pset in m23.NEW_ROLES:
        roles[k] = (n, d, set(pset))
    for role_key in m25.AGENTS_RUN_GRANTED_TO:
        n, d, pset = roles[role_key]
        roles[role_key] = (n, d, pset | {"agents.run"})
    assert {k: (n, d, sorted(pset)) for k, (n, d, pset) in roles.items()} == {
        r.key: (r.name, r.description, sorted(r.permissions)) for r in SYSTEM_ROLES
    }

    # Deterministic ids agree across both migrations and the catalog.
    for r in SYSTEM_ROLES:
        mod = m23 if r.key == "quant_engineer" else m20
        assert mod._system_role_id(r.key) == system_role_id(r.key)


async def test_system_roles_seeded_as_defaults(client, db_session_factory):
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        roles = (await session.execute(select(Role))).scalars().all()
    assert {r.system_key for r in roles} == {
        "researcher", "risk_manager", "cio", "compliance_officer", "admin", "quant_engineer"
    }
    assert all(r.is_system_default and r.organization_id is None for r in roles)


async def test_quant_engineer_role_seeded_correctly(client, db_session_factory):
    """Batch 26 Part B — Quant Engineer exists as a system default with exactly
    {strategy.version, signals.view} (+ agents.run from Batch 30), no governance
    permissions, and the same
    deletion protection as the original five system roles."""
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        role = (await session.execute(select(Role).where(Role.system_key == "quant_engineer"))).scalar_one()
        assert role.name == "Quant Engineer"
        assert role.is_system_default is True and role.organization_id is None
        from app.services.rbac import permission_keys_by_role

        perms = (await permission_keys_by_role(session, [role.id]))[role.id]
    # Batch 30 (ADR 0009) adds agents.run — a research permission, still no governance.
    assert set(perms) == {P.STRATEGY_VERSION, P.SIGNALS_VIEW, P.AGENTS_RUN}
    # No governance permissions — a research/build role, not a risk-governance one.
    assert not ({P.STRATEGY_APPROVE, P.KILLSWITCH_TRIGGER, P.AUDIT_VIEW_ALL, P.GOVERNANCE_VIEW} & set(perms))

    # Deletion protection: a SuperAdmin cannot delete a system-default role (same 403
    # as researcher/admin/etc.).
    token, _ = await create_superadmin(client, db_session_factory)
    resp = await client.delete(f"/superadmin/roles/{system_role_id('quant_engineer')}", headers=bearer(token))
    assert resp.status_code == 403


async def test_me_returns_effective_role_and_permissions(client, db_session_factory):
    _, cio = await _org(db_session_factory, "me", role=UserRole.CIO)
    body = (await client.get("/auth/me", headers=_token(cio))).json()
    assert body["effective_role"]["system_key"] == "cio"
    assert P.KILLSWITCH_REVIEW in body["permissions"]
    assert P.BILLING_MANAGE not in body["permissions"]


# ------------------------------------------------------------------- custom roles
async def test_custom_role_grants_only_its_permissions(client, db_session_factory):
    org, admin = await _org(db_session_factory, "custom")
    analyst = await add_user_to_org(db_session_factory, organization_id=org.id, email="analyst@custom.rbac.io", role=UserRole.RESEARCHER)

    created = await client.post(
        "/roles",
        json={"name": "Audit Analyst", "description": "reads audit only", "permissions": [P.AUDIT_VIEW_ALL, P.MEMBERS_VIEW]},
        headers=_token(admin),
    )
    assert created.status_code == 201, created.text
    role = created.json()
    assert role["scope"] == "organization" and role["permissions"] == [P.AUDIT_VIEW_ALL, P.MEMBERS_VIEW]

    token = _token(analyst)  # issued BEFORE the role change — no re-login below
    assert (await client.get("/governance/audit-log", headers=token)).status_code == 403

    assigned = await client.put(f"/users/{analyst.id}/role", json={"role_id": role["id"]}, headers=_token(admin))
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["effective_role"]["name"] == "Audit Analyst"

    # Same token, very next request: the new permissions apply...
    audit = await client.get("/governance/audit-log", headers=token)
    assert audit.status_code == 200 and audit.json()["scope"] == "organization"
    assert (await client.get("/users/members", headers=token)).status_code == 200
    # ...and ONLY those: nothing a researcher or admin could do comes along.
    assert (await client.get("/governance/approval-queue", headers=token)).status_code == 403
    assert (await client.get("/billing/status", headers=token)).status_code == 403
    draft = await seed_strategy(db_session_factory, organization_id=org.id, valid_rules=True)
    version = await client.post(
        f"/strategies/{draft}/versions",
        json={"entry_rules": {"operator": "OR", "conditions": [{"indicator": "rsi_14", "comparator": "<", "value": 20}]},
              "change_reason": "not allowed"},
        headers=token,
    )
    assert version.status_code == 403  # strategy.version was a researcher permission
    me = (await client.get("/auth/me", headers=token)).json()
    assert me["permissions"] == [P.AUDIT_VIEW_ALL, P.MEMBERS_VIEW]

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        events = {r.event_type for r in (await session.execute(select(AuditLog))).scalars()}
    assert {AuditEventType.ROLE_CREATED, AuditEventType.USER_ROLE_CHANGED} <= events


async def test_org_admin_cannot_see_or_assign_another_orgs_custom_role(client, db_session_factory):
    org_a, admin_a = await _org(db_session_factory, "orga")
    org_b, admin_b = await _org(db_session_factory, "orgb")
    member_b = await add_user_to_org(db_session_factory, organization_id=org_b.id, email="m@orgb.rbac.io", role=UserRole.RESEARCHER)
    role_a = (await client.post("/roles", json={"name": "A Only", "permissions": [P.MEMBERS_VIEW]}, headers=_token(admin_a))).json()

    names_b = {r["name"] for r in (await client.get("/roles", headers=_token(admin_b))).json()["items"]}
    assert "A Only" not in names_b
    assert {"Researcher", "Risk Manager", "CIO", "Compliance Officer", "Admin"} <= names_b

    denied = await client.put(f"/users/{member_b.id}/role", json={"role_id": role_a["id"]}, headers=_token(admin_b))
    assert denied.status_code == 404
    assert (await client.patch(f"/roles/{role_a['id']}", json={"name": "hijack"}, headers=_token(admin_b))).status_code == 404
    assert (await client.delete(f"/roles/{role_a['id']}", headers=_token(admin_b))).status_code == 404


async def test_role_in_another_org_grants_nothing_even_if_assigned_directly(client, db_session_factory):
    """Defence in depth: a corrupted role_id pointing at another tenant's role fails closed."""
    org_a, admin_a = await _org(db_session_factory, "leak1")
    org_b, _ = await _org(db_session_factory, "leak2")
    role_a = (await client.post("/roles", json={"name": "Powerful", "permissions": [P.BILLING_MANAGE]}, headers=_token(admin_a))).json()
    victim = await add_user_to_org(db_session_factory, organization_id=org_b.id, email="v@leak2.rbac.io", role=UserRole.RESEARCHER)
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        u = await session.get(User, victim.id)
        u.role_id = uuid.UUID(role_a["id"])
        await session.commit()
    assert (await client.get("/billing/status", headers=_token(victim))).status_code == 403
    assert (await client.get("/auth/me", headers=_token(victim))).json()["permissions"] == []


async def test_non_admin_roles_cannot_manage_roles(client, db_session_factory):
    org, _ = await _org(db_session_factory, "nomanage")
    for role in (UserRole.RESEARCHER, UserRole.RISK_MANAGER, UserRole.CIO, UserRole.COMPLIANCE_OFFICER):
        user = await add_user_to_org(db_session_factory, organization_id=org.id, email=f"{role.value}@nomanage.rbac.io", role=role)
        assert (await client.post("/roles", json={"name": f"x{role.value}"}, headers=_token(user))).status_code == 403
        assert (await client.put(f"/users/{user.id}/role", json={"role_id": str(system_role_id("admin"))}, headers=_token(user))).status_code == 403


async def test_lockout_guard_keeps_one_role_manager(client, db_session_factory):
    org, admin = await _org(db_session_factory, "lockout")
    demote = await client.put(f"/users/{admin.id}/role", json={"role_id": str(system_role_id("researcher"))}, headers=_token(admin))
    assert demote.status_code == 409
    assert "manage roles" in demote.json()["detail"]
    me = (await client.get("/auth/me", headers=_token(admin))).json()
    assert me["effective_role"]["system_key"] == "admin"

    second = await add_user_to_org(db_session_factory, organization_id=org.id, email="admin2@lockout.rbac.io", role=UserRole.ADMIN)
    ok = await client.put(f"/users/{admin.id}/role", json={"role_id": str(system_role_id("researcher"))}, headers=_token(second))
    assert ok.status_code == 200


async def test_custom_role_in_use_cannot_be_deleted(client, db_session_factory):
    org, admin = await _org(db_session_factory, "inuse")
    member = await add_user_to_org(db_session_factory, organization_id=org.id, email="m@inuse.rbac.io", role=UserRole.RESEARCHER)
    role = (await client.post("/roles", json={"name": "Temp", "permissions": []}, headers=_token(admin))).json()
    await client.put(f"/users/{member.id}/role", json={"role_id": role["id"]}, headers=_token(admin))
    assert (await client.delete(f"/roles/{role['id']}", headers=_token(admin))).status_code == 409
    await client.put(f"/users/{member.id}/role", json={"role_id": str(system_role_id("researcher"))}, headers=_token(admin))
    assert (await client.delete(f"/roles/{role['id']}", headers=_token(admin))).status_code == 204


async def test_invitation_can_carry_a_custom_role(client, db_session_factory):
    org, admin = await _org(db_session_factory, "invite")
    role = (await client.post("/roles", json={"name": "Observer", "permissions": [P.GOVERNANCE_VIEW]}, headers=_token(admin))).json()
    resp = await client.post("/users/invitations", json={"email": "obs@invite.rbac.io", "role_id": role["id"]}, headers=_token(admin))
    assert resp.status_code == 201, resp.text
    assert resp.json()["role_id"] == role["id"]
    link = resp.json()["dev_invite_link"]
    token = link.split("token=")[1]
    accepted = await client.post("/auth/accept-invitation", json={"token": token, "password": "supersecret12", "full_name": "Obs"})
    assert accepted.status_code in (200, 201), accepted.text
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        user = (await session.execute(select(User).where(User.email == "obs@invite.rbac.io"))).scalar_one()
    assert user.role_id == uuid.UUID(role["id"])
    assert (await client.get("/governance/approval-queue", headers=_token(user))).status_code == 200


# ------------------------------------------------------------- superadmin console
async def test_superadmin_manages_system_roles(client, db_session_factory):
    token, _ = await create_superadmin(client, db_session_factory)
    headers = bearer(token)
    listing = (await client.get("/superadmin/roles", headers=headers)).json()
    assert {r["system_key"] for r in listing["items"] if r["is_system_default"]} == {
        "researcher", "risk_manager", "cio", "compliance_officer", "admin", "quant_engineer"
    }

    created = await client.post(
        "/superadmin/roles", json={"name": "Data Engineer", "description": "platform role", "permissions": [P.STRATEGY_VERSION]},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    qe = created.json()
    assert qe["scope"] == "system" and not qe["is_system_default"]

    perms = await client.put(f"/superadmin/roles/{qe['id']}/permissions",
                             json={"permissions": [P.STRATEGY_VERSION, P.GOVERNANCE_VIEW]}, headers=headers)
    assert perms.json()["permissions"] == [P.GOVERNANCE_VIEW, P.STRATEGY_VERSION]

    # A new system role is immediately assignable in every organization.
    org, admin = await _org(db_session_factory, "sysrole")
    assert "Data Engineer" in {r["name"] for r in (await client.get("/roles", headers=_token(admin))).json()["items"]}

    researcher_id = str(system_role_id("researcher"))
    assert (await client.delete(f"/superadmin/roles/{researcher_id}", headers=headers)).status_code == 403
    rename = await client.patch(f"/superadmin/roles/{researcher_id}", json={"name": "Scientist"}, headers=headers)
    assert rename.status_code == 403
    describe = await client.patch(f"/superadmin/roles/{researcher_id}", json={"description": "Updated copy"}, headers=headers)
    assert describe.status_code == 200 and describe.json()["description"] == "Updated copy"
    strip_admin = await client.put(f"/superadmin/roles/{system_role_id('admin')}/permissions",
                                   json={"permissions": [P.BILLING_MANAGE]}, headers=headers)
    assert strip_admin.status_code == 409

    assert (await client.delete(f"/superadmin/roles/{qe['id']}", headers=headers)).status_code == 204

    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        actions = {r.action for r in (await session.execute(select(SuperAdminAuditLog))).scalars()}
    assert {"system_role_created", "system_role_permissions_changed", "system_role_updated", "system_role_deleted"} <= actions


async def test_non_superadmin_cannot_use_role_console(client, db_session_factory):
    _, admin = await _org(db_session_factory, "notsuper")
    assert (await client.get("/superadmin/roles", headers=_token(admin))).status_code == 403
    assert (await client.post("/superadmin/permissions", json={"key": "x.y", "category": "C"}, headers=_token(admin))).status_code == 403


async def test_superadmin_system_role_permission_change_applies_everywhere(client, db_session_factory):
    token, _ = await create_superadmin(client, db_session_factory)
    _, cio = await _org(db_session_factory, "sysedit", role=UserRole.CIO)
    assert (await client.get("/users/members", headers=_token(cio))).status_code == 403
    current = next(r for r in (await client.get("/superadmin/roles", headers=bearer(token))).json()["items"] if r["system_key"] == "cio")
    await client.put(f"/superadmin/roles/{current['id']}/permissions",
                     json={"permissions": current["permissions"] + [P.MEMBERS_VIEW]}, headers=bearer(token))
    assert (await client.get("/users/members", headers=_token(cio))).status_code == 200


# ------------------------------------------------------------ bugs fixed en route
async def test_payment_failed_notification_stays_inside_its_organization(client, db_session_factory):
    """Pre-Batch-26 the unscoped Stripe webhook session notified admins/CIOs of EVERY org."""
    from app.services.billing import handle_invoice_payment_failed

    org_a, admin_a = await _org(db_session_factory, "payA")
    org_b, admin_b = await _org(db_session_factory, "payB")
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org_a.id)
        session.add(Subscription(stripe_customer_id="cus_A", stripe_subscription_id="sub_A",
                                 tier=OrganizationTier.PRO, status=SubscriptionStatus.ACTIVE))
        await session.commit()
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        await handle_invoice_payment_failed(session, {"customer": "cus_A", "subscription": "sub_A"})
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        recipients = set((await session.execute(select(Notification.user_id))).scalars())
    assert admin_a.id in recipients
    assert admin_b.id not in recipients


async def test_weekly_digest_recipients_are_the_orgs_digest_holders(client, db_session_factory):
    from app.services.weekly_digest import digest_recipient_emails

    org, admin = await _org(db_session_factory, "digest")
    await add_user_to_org(db_session_factory, organization_id=org.id, email="cio@digest.rbac.io", role=UserRole.CIO)
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        assert await digest_recipient_emails(session, org.id) == [admin.email]


async def test_kill_by_custom_reviewer_role_is_self_reviewed(client, db_session_factory):
    org, admin = await _org(db_session_factory, "customkill")
    member = await add_user_to_org(db_session_factory, organization_id=org.id, email="head@customkill.rbac.io", role=UserRole.RESEARCHER)
    role = (await client.post("/roles", json={"name": "Head of Risk",
                                               "permissions": [P.KILLSWITCH_TRIGGER, P.KILLSWITCH_REVIEW]},
                               headers=_token(admin))).json()
    await client.put(f"/users/{member.id}/role", json={"role_id": role["id"]}, headers=_token(admin))
    sid = await seed_strategy(db_session_factory, organization_id=org.id, status=StrategyStatus.ACTIVE, valid_rules=True)
    resp = await client.post(f"/governance/kill-switch/{sid}", json={"reason": "custom"}, headers=_token(member))
    assert resp.status_code == 200
    from app.models.kill_switch_review import KillSwitchReview

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        review = (await session.execute(select(KillSwitchReview))).scalar_one()
    assert review.is_self_reviewed is True
    assert review.triggered_by_role == "Head of Risk"
