"""SuperAdmin control plane + org-status enforcement (Batch 24).

All against seeded SQLite data, no live calls. Covers the security core: the
org-status gate (a suspended org is locked out of the whole client API), the
require_super_admin guard, cross-org listing, approve/suspend transitions, the
15-minute read-only impersonation token, demo-request conversion, and that
cross-org isolation still holds for a normal client.
"""

from __future__ import annotations

from app.core.security import decode_access_token

from tests.helpers import bearer, create_superadmin, register_org


# --------------------------------------------------------------------------- #
# require_super_admin guard
# --------------------------------------------------------------------------- #
async def test_non_superadmin_gets_403_on_superadmin_routes(client, db_session_factory):
    token, _org = await register_org(client, org_name="Normal Co", email="user@normal.co")
    resp = await client.get("/superadmin/orgs", headers=bearer(token))
    assert resp.status_code == 403
    assert "SuperAdmin access required" in resp.text


async def test_superadmin_can_list_all_orgs(client, db_session_factory):
    # Two client orgs + the internal superadmin org — the founder sees all of them.
    await register_org(client, org_name="Client Alpha", email="a@alpha.co")
    await register_org(client, org_name="Client Bravo", email="b@bravo.co")
    sa_token, _ = await create_superadmin(client, db_session_factory)

    resp = await client.get("/superadmin/orgs", headers=bearer(sa_token))
    assert resp.status_code == 200
    names = {o["name"] for o in resp.json()["items"]}
    assert {"Client Alpha", "Client Bravo"} <= names  # cross-tenant visibility


# --------------------------------------------------------------------------- #
# Approve / suspend transitions
# --------------------------------------------------------------------------- #
async def test_approve_org_sets_active_and_allows_login(client, db_session_factory):
    from tests.helpers import login, register

    # A raw pending registration cannot log in.
    reg = await register(client, org_name="PendingCo", email="pending@co.com")
    assert reg.status_code == 202
    denied = await login(client, email="pending@co.com")
    assert denied.status_code == 403

    # The founder approves it → active → login works.
    sa_token, _ = await create_superadmin(client, db_session_factory)
    orgs = (await client.get("/superadmin/orgs", headers=bearer(sa_token))).json()["items"]
    org_id = next(o["id"] for o in orgs if o["name"] == "PendingCo")

    approved = await client.post(
        f"/superadmin/orgs/{org_id}/approve", json={"plan": "pro"}, headers=bearer(sa_token)
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "active"

    # Batch 25: approval activates the ORG; the admin still has to confirm their own
    # mailbox. Both gates must be satisfied for a self-registration to log in.
    from tests.helpers import verify_email_from_register

    await verify_email_from_register(client, reg)

    ok = await login(client, email="pending@co.com")
    assert ok.status_code == 200


async def test_suspend_org_blocks_all_endpoints(client, db_session_factory):
    """Suspending an org must lock EVERY client endpoint, not one route — spot-check
    several. The gate lives in get_current_user, so it is global."""
    token, _org = await register_org(client, org_name="ToSuspend", email="s@suspend.co")
    sa_token, _ = await create_superadmin(client, db_session_factory)

    # Works before suspension.
    assert (await client.get("/strategies", headers=bearer(token))).status_code == 200

    orgs = (await client.get("/superadmin/orgs", headers=bearer(sa_token))).json()["items"]
    org_id = next(o["id"] for o in orgs if o["name"] == "ToSuspend")
    suspended = await client.post(
        f"/superadmin/orgs/{org_id}/suspend",
        json={"reason": "non-payment"},
        headers=bearer(sa_token),
    )
    assert suspended.status_code == 200

    # Every one of these client endpoints is now locked with ORG_SUSPENDED 403.
    for path in ("/strategies", "/portfolio/overview", "/failures", "/regimes/current?symbol=SPY", "/auth/me"):
        resp = await client.get(path, headers=bearer(token))
        assert resp.status_code == 403, f"{path} not blocked: {resp.status_code}"
        assert resp.json()["detail"]["code"] == "ORG_SUSPENDED"


async def test_suspend_invalidates_redis_cache_on_reactivate(client, db_session_factory):
    """Suspend then reactivate — the org-status Redis cache is invalidated on each
    transition, so the client is blocked after suspend and works again after
    reactivate (no stale 60s window)."""
    token, _org = await register_org(client, org_name="Toggle", email="t@toggle.co")
    sa_token, _ = await create_superadmin(client, db_session_factory)
    orgs = (await client.get("/superadmin/orgs", headers=bearer(sa_token))).json()["items"]
    org_id = next(o["id"] for o in orgs if o["name"] == "Toggle")

    # Prime the cache with a request while active.
    assert (await client.get("/auth/me", headers=bearer(token))).status_code == 200

    await client.post(
        f"/superadmin/orgs/{org_id}/suspend", json={"reason": "x"}, headers=bearer(sa_token)
    )
    # Cache invalidated on suspend → blocked immediately, not after TTL.
    assert (await client.get("/auth/me", headers=bearer(token))).status_code == 403

    await client.post(f"/superadmin/orgs/{org_id}/reactivate", headers=bearer(sa_token))
    # Cache invalidated on reactivate → allowed immediately.
    assert (await client.get("/auth/me", headers=bearer(token))).status_code == 200


async def test_terminate_org_returns_410(client, db_session_factory):
    token, _org = await register_org(client, org_name="Doomed", email="d@doomed.co")
    sa_token, _ = await create_superadmin(client, db_session_factory)
    orgs = (await client.get("/superadmin/orgs", headers=bearer(sa_token))).json()["items"]
    org_id = next(o["id"] for o in orgs if o["name"] == "Doomed")

    await client.post(
        f"/superadmin/orgs/{org_id}/terminate", json={"reason": "closed"}, headers=bearer(sa_token)
    )
    resp = await client.get("/auth/me", headers=bearer(token))
    assert resp.status_code == 410
    assert resp.json()["detail"]["code"] == "ORG_TERMINATED"


# --------------------------------------------------------------------------- #
# Impersonation
# --------------------------------------------------------------------------- #
async def test_impersonation_token_expires_in_15min(client, db_session_factory):
    _token, _org = await register_org(client, org_name="Target Co", email="target@co.com")
    sa_token, _ = await create_superadmin(client, db_session_factory)
    users = (await client.get("/superadmin/users", headers=bearer(sa_token))).json()["items"]
    target = next(u for u in users if u["email"] == "target@co.com")

    resp = await client.post(
        "/superadmin/impersonate",
        json={"target_user_id": target["id"], "reason": "debugging a support ticket"},
        headers=bearer(sa_token),
    )
    assert resp.status_code == 200
    imp_token = resp.json()["access_token"]
    assert resp.json()["read_only"] is True

    payload = decode_access_token(imp_token)
    assert payload["impersonation"] is True
    # 15 minutes ± a small skew, regardless of ACCESS_TOKEN_EXPIRE_MINUTES.
    lifetime = payload["exp"].timestamp() - payload["iat"] if hasattr(payload["exp"], "timestamp") else payload["exp"] - payload["iat"]
    assert 14 * 60 <= lifetime <= 16 * 60


async def test_impersonation_is_read_only(client, db_session_factory):
    """The impersonation token can READ the target's data but not mutate anything."""
    _token, _org = await register_org(client, org_name="RO Co", email="ro@co.com")
    sa_token, _ = await create_superadmin(client, db_session_factory)
    users = (await client.get("/superadmin/users", headers=bearer(sa_token))).json()["items"]
    target = next(u for u in users if u["email"] == "ro@co.com")
    imp = (
        await client.post(
            "/superadmin/impersonate",
            json={"target_user_id": target["id"], "reason": "read-only debug"},
            headers=bearer(sa_token),
        )
    ).json()["access_token"]

    # GET works (read).
    assert (await client.get("/strategies", headers=bearer(imp))).status_code == 200
    # POST is rejected (write) — impersonation is read-only.
    resp = await client.post(
        "/strategies",
        json={"name": "x", "parameters": {}, "entry_rules": {}, "exit_rules": {}, "risk_constraints": {}},
        headers=bearer(imp),
    )
    assert resp.status_code == 403
    assert "read-only" in resp.text.lower()


async def test_impersonation_logged_to_superadmin_audit(client, db_session_factory):
    from app.db.tenant import mark_session_unscoped
    from app.models.superadmin_audit_log import SuperAdminAuditLog
    from sqlalchemy import select

    _token, _org = await register_org(client, org_name="Logged Co", email="logged@co.com")
    sa_token, sa_id = await create_superadmin(client, db_session_factory)
    users = (await client.get("/superadmin/users", headers=bearer(sa_token))).json()["items"]
    target = next(u for u in users if u["email"] == "logged@co.com")
    await client.post(
        "/superadmin/impersonate",
        json={"target_user_id": target["id"], "reason": "audit-test reason"},
        headers=bearer(sa_token),
    )

    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        rows = (
            await session.execute(
                select(SuperAdminAuditLog).where(SuperAdminAuditLog.action == "impersonate_user")
            )
        ).scalars().all()
    assert len(rows) == 1
    assert rows[0].reason == "audit-test reason"
    assert rows[0].super_admin_id == sa_id


# --------------------------------------------------------------------------- #
# Demo requests
# --------------------------------------------------------------------------- #
async def test_demo_request_approve_creates_org_and_user(client, db_session_factory):
    from tests.helpers import login

    # Public demo request (no auth) — reuses the existing Batch 15 endpoint.
    demo_body = {
        "first_name": "Dana",
        "last_name": "Prospect",
        "work_email": "dana@prospect.com",
        "company": "Prospect Capital",
        "job_title": "PM",
        "firm_type": "hedge_fund",
        "team_size": "size_6_20",
        "use_case_description": "Regime-aware backtesting for a multi-strat book.",
        "primary_interest": ["regime_detection"],
        "consent": True,
    }
    created = await client.post("/contact/demo-request", json=demo_body)
    assert created.status_code in (200, 201)

    sa_token, _ = await create_superadmin(client, db_session_factory)
    inbox = (await client.get("/superadmin/demo-requests", headers=bearer(sa_token))).json()
    assert len(inbox["pending"]) == 1
    req_id = inbox["pending"][0]["id"]

    approved = await client.post(
        f"/superadmin/demo-requests/{req_id}/approve",
        json={"plan": "pro", "temp_password": "TempPass123!"},
        headers=bearer(sa_token),
    )
    assert approved.status_code == 200
    assert approved.json()["admin_email"] == "dana@prospect.com"

    # The created org+admin can log in immediately (created ACTIVE).
    ok = await login(client, email="dana@prospect.com", password="TempPass123!")
    assert ok.status_code == 200


async def test_public_demo_request_needs_no_auth(client):
    resp = await client.post(
        "/contact/demo-request",
        json={
            "first_name": "No",
            "last_name": "Auth",
            "work_email": "noauth@x.com",
            "company": "NoAuth Co",
            "job_title": "Analyst",
            "firm_type": "prop_trading",
            "team_size": "size_1_5",
            "use_case_description": "Testing the public endpoint.",
            "primary_interest": ["full_platform"],
            "consent": True,
        },
    )
    assert resp.status_code in (200, 201)  # no Authorization header sent


# --------------------------------------------------------------------------- #
# Cross-org isolation still holds for normal clients
# --------------------------------------------------------------------------- #
async def test_cross_org_isolation_still_holds(client, db_session_factory):
    """A normal client logged into org A cannot see org B's data, and cannot reach
    the superadmin surface. Batch 24 must not weaken tenant isolation."""
    from app.models.strategy import StrategyStatus

    from tests.data_helpers import seed_strategy

    token_a, org_a = await register_org(client, org_name="Iso A", email="a@iso.co")
    _token_b, org_b = await register_org(client, org_name="Iso B", email="b@iso.co")
    await seed_strategy(db_session_factory, organization_id=org_b, name="B-Secret", status=StrategyStatus.ACTIVE)

    # A sees zero of B's strategies.
    listed = (await client.get("/strategies", headers=bearer(token_a))).json()
    names = {s["name"] for s in listed["items"]}
    assert "B-Secret" not in names
    # A cannot reach the founder console.
    assert (await client.get("/superadmin/orgs", headers=bearer(token_a))).status_code == 403


async def test_platform_stats_counts_across_orgs(client, db_session_factory):
    await register_org(client, org_name="Stat One", email="one@stat.co")
    await register_org(client, org_name="Stat Two", email="two@stat.co")
    sa_token, _ = await create_superadmin(client, db_session_factory)

    stats = (await client.get("/superadmin/stats", headers=bearer(sa_token))).json()
    assert stats["total_orgs"] >= 3  # two clients + internal
    assert stats["orgs_by_status"]["active"] >= 3
    assert stats["mrr_is_list_price"] is True
