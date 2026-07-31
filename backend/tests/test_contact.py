"""Public demo-request endpoint tests (Batch 15).

Validates the lead-capture contract: a good request stores a row and 200s; the
work-email / consent / length / interest rules reject with 422; the honeypot
drops silently with a success-looking response and NO stored row. No JWT is ever
used — this is a public endpoint.
"""

from __future__ import annotations

import pytest
from app.db.tenant import mark_session_unscoped
from app.models.demo_request import DemoRequest
from sqlalchemy import func, select

_GOOD = {
    "first_name": "Jane",
    "last_name": "Okafor",
    "work_email": "jane@quantfirm.com",
    "company": "QuantFirm Capital",
    "job_title": "Head of Quant Research",
    "firm_type": "hedge_fund",
    "team_size": "size_6_20",
    "use_case_description": "We keep rediscovering the same failed mean-reversion strategies across desks.",
    "primary_interest": ["failure_intelligence", "knowledge_graph"],
    "source": "referral",
    "consent": True,
}


async def _count_rows(db_session_factory) -> int:
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        return (await session.execute(select(func.count()).select_from(DemoRequest))).scalar_one()


@pytest.mark.anyio
async def test_valid_demo_request_is_stored(client, db_session_factory):
    resp = await client.post("/contact/demo-request", json=_GOOD)
    assert resp.status_code == 200
    assert resp.json()["received"] is True
    assert await _count_rows(db_session_factory) == 1

    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        row = (await session.execute(select(DemoRequest))).scalar_one()
    assert row.work_email == "jane@quantfirm.com"
    assert row.primary_interest == ["failure_intelligence", "knowledge_graph"]
    assert row.consent is True


@pytest.mark.anyio
async def test_free_webmail_rejected(client, db_session_factory):
    resp = await client.post("/contact/demo-request", json={**_GOOD, "work_email": "jane@gmail.com"})
    assert resp.status_code == 422
    assert await _count_rows(db_session_factory) == 0


@pytest.mark.anyio
async def test_consent_required(client, db_session_factory):
    resp = await client.post("/contact/demo-request", json={**_GOOD, "consent": False})
    assert resp.status_code == 422
    assert await _count_rows(db_session_factory) == 0


@pytest.mark.anyio
async def test_use_case_too_short_rejected(client, db_session_factory):
    resp = await client.post("/contact/demo-request", json={**_GOOD, "use_case_description": "too short"})
    assert resp.status_code == 422
    assert await _count_rows(db_session_factory) == 0


@pytest.mark.anyio
async def test_at_least_one_interest_required(client, db_session_factory):
    resp = await client.post("/contact/demo-request", json={**_GOOD, "primary_interest": []})
    assert resp.status_code == 422
    assert await _count_rows(db_session_factory) == 0


@pytest.mark.anyio
async def test_honeypot_drops_silently_without_storing(client, db_session_factory):
    resp = await client.post("/contact/demo-request", json={**_GOOD, "website": "http://spam.example"})
    # Looks like success to the bot...
    assert resp.status_code == 200
    assert resp.json()["received"] is True
    # ...but nothing was stored.
    assert await _count_rows(db_session_factory) == 0
