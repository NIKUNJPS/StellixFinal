"""Onboarding status endpoints (Batch 21)."""

from __future__ import annotations

from app.db.tenant import mark_session_unscoped
from app.models.organization import Organization

from tests.data_helpers import seed_strategy
from tests.helpers import bearer, register_org


async def test_onboarding_status_and_complete(client, db_session_factory):
    token, org_id = await register_org(client, org_name="OnboardCo", email="o@onboard.co")

    # A freshly-activated org has NOT completed onboarding and has no strategies.
    status = await client.get("/onboarding/status", headers=bearer(token))
    assert status.status_code == 200, status.text
    body = status.json()
    assert body["completed"] is False
    assert body["strategy_count"] == 0

    done = await client.post("/onboarding/complete", headers=bearer(token))
    assert done.status_code == 200
    assert done.json()["completed"] is True

    # Reflected on next read and persisted in the DB.
    status2 = await client.get("/onboarding/status", headers=bearer(token))
    assert status2.json()["completed"] is True

    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        org = await session.get(Organization, org_id)
        assert org.onboarding_completed is True


async def test_onboarding_status_counts_real_strategies(client, db_session_factory):
    token, org_id = await register_org(client, org_name="OnboardStrat", email="os@onboard.co")
    await seed_strategy(db_session_factory, organization_id=org_id, name="First Strat")

    body = (await client.get("/onboarding/status", headers=bearer(token))).json()
    assert body["strategy_count"] == 1  # real count, not hardcoded
