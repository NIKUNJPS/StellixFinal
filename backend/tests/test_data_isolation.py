"""Tenant isolation for Batch 2 data: org A cannot see org B's market_data or jobs."""

from __future__ import annotations

import uuid
from datetime import date

from app.db.tenant import bind_organization
from app.models.ingestion_job import IngestionJob, IngestionStatus

from tests.data_helpers import seed_market_data
from tests.helpers import bearer
from tests.helpers import register_activate_login as register


async def _register_org(client, *, org_name, email):
    reg = await register(client, org_name=org_name, email=email)
    token = reg.json()["access_token"]
    me = (await client.get("/auth/me", headers=bearer(token))).json()
    return token, uuid.UUID(me["user"]["organization_id"])


async def test_market_data_is_tenant_scoped(client, db_session_factory):
    token_a, org_a = await _register_org(client, org_name="Alpha Data", email="a@alpha.io")
    token_b, org_b = await _register_org(client, org_name="Bravo Data", email="b@bravo.io")

    await seed_market_data(db_session_factory, organization_id=org_a, symbol="AAPL", closes=[100, 101, 102])
    await seed_market_data(db_session_factory, organization_id=org_b, symbol="AAPL", closes=[200, 201])

    a_series = (await client.get("/data/market/AAPL", headers=bearer(token_a))).json()
    b_series = (await client.get("/data/market/AAPL", headers=bearer(token_b))).json()

    assert a_series["count"] == 3
    assert [p["close"] for p in a_series["points"]] == [100, 101, 102]
    assert b_series["count"] == 2
    assert [p["close"] for p in b_series["points"]] == [200, 201]
    # No overlap — A never sees B's 200-series and vice versa.
    assert 200 not in [p["close"] for p in a_series["points"]]


async def test_job_status_is_tenant_scoped(client, db_session_factory):
    token_a, _org_a = await _register_org(client, org_name="Alpha Jobs", email="a@ajobs.io")
    _token_b, org_b = await _register_org(client, org_name="Bravo Jobs", email="b@bjobs.io")

    # Seed an ingestion job owned by org B.
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org_b)
        job = IngestionJob(
            symbol="AAPL",
            start_date=date(2024, 1, 1),
            end_date=date(2024, 2, 1),
            interval="1d",
            provider="yfinance",
            status=IngestionStatus.PENDING,
        )
        session.add(job)
        await session.commit()
        await session.refresh(job)
        job_b_id = job.id

    # Org A asks for org B's job by id → 404 (existence not observable across tenants).
    resp = await client.get(f"/data/ingest/{job_b_id}/status", headers=bearer(token_a))
    assert resp.status_code == 404
