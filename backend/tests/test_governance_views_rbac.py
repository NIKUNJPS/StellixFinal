"""RBAC matrix for the governance read/export endpoints (Batch 10): a wrong-role
user gets 403, a correct-role user gets through. Three tiers, per schemas.md:
kill-switch (covered in test_governance_kill_switch.py) is its own tier;
active-strategies/approval-queue are APPROVAL_ROLES; audit-log/export are
admin+compliance_officer only."""

from __future__ import annotations

import pytest
from app.models.user import UserRole

from tests.helpers import bearer, create_org_user, login

_VIEW_ROLES = (UserRole.RISK_MANAGER, UserRole.CIO, UserRole.COMPLIANCE_OFFICER, UserRole.ADMIN)
_COMPLIANCE_ROLES = (UserRole.ADMIN, UserRole.COMPLIANCE_OFFICER)
_ALL_ROLES = (UserRole.RESEARCHER, UserRole.RISK_MANAGER, UserRole.CIO, UserRole.COMPLIANCE_OFFICER, UserRole.ADMIN)


async def _token_for(client, db_session_factory, *, role: UserRole, tag: str) -> str:
    # tag may embed role.value (e.g. "risk_manager") for uniqueness — fine in an
    # email LOCAL part, but underscores are invalid in a DNS-style domain, so the
    # domain uses a hyphenated slug-safe form instead.
    domain = tag.replace("_", "-")
    email = f"{role.value}@{domain}.io"
    await create_org_user(
        db_session_factory, org_name=f"Gov RBAC {tag}", slug=f"gov-rbac-{domain}",
        email=email, role=role,
    )
    resp = await login(client, email=email)
    return resp.json()["access_token"]


@pytest.mark.parametrize("role", _ALL_ROLES)
async def test_active_strategies_view_rbac(client, db_session_factory, role):
    token = await _token_for(client, db_session_factory, role=role, tag=f"active-{role.value}")
    resp = await client.get("/governance/active-strategies", headers=bearer(token))
    expected = 200 if role in _VIEW_ROLES else 403
    assert resp.status_code == expected


@pytest.mark.parametrize("role", _ALL_ROLES)
async def test_approval_queue_view_rbac(client, db_session_factory, role):
    token = await _token_for(client, db_session_factory, role=role, tag=f"queue-{role.value}")
    resp = await client.get("/governance/approval-queue", headers=bearer(token))
    expected = 200 if role in _VIEW_ROLES else 403
    assert resp.status_code == expected


@pytest.mark.parametrize("role", _ALL_ROLES)
async def test_audit_log_view_rbac(client, db_session_factory, role):
    token = await _token_for(client, db_session_factory, role=role, tag=f"audit-{role.value}")
    resp = await client.get("/governance/audit-log", headers=bearer(token))
    expected = 200 if role in _COMPLIANCE_ROLES else 403
    assert resp.status_code == expected


@pytest.mark.parametrize("role", _ALL_ROLES)
async def test_compliance_export_create_rbac(client, db_session_factory, role):
    token = await _token_for(client, db_session_factory, role=role, tag=f"export-{role.value}")
    resp = await client.post(
        "/governance/export",
        json={"start_date": "2026-01-01", "end_date": "2026-12-31", "export_format": "json"},
        headers=bearer(token),
    )
    expected = 202 if role in _COMPLIANCE_ROLES else 403
    assert resp.status_code == expected
