"""Batch 25 Task 7: a queued compliance export reports honestly whether anything is
going to process it, a broker outage fails the job loudly instead of leaving it
"pending" forever, and recent jobs survive a page reload."""

from __future__ import annotations

from unittest.mock import patch

from app.db.tenant import bind_organization
from app.models.compliance_export import ComplianceExportJob, ComplianceExportStatus
from app.models.user import UserRole
from sqlalchemy import select

from tests.helpers import bearer, create_org_user, token_for

_PAYLOAD = {"start_date": "2026-01-01", "end_date": "2026-12-31", "export_format": "pdf"}


async def _compliance_token(client, maker, tag):
    org, user = await create_org_user(
        maker, org_name=f"Export {tag}", slug=f"export-{tag}", email=f"co@{tag}.io", role=UserRole.COMPLIANCE_OFFICER
    )
    return org, await token_for(client, user.email)


async def test_queued_export_says_no_worker_is_running(client, db_session_factory):
    _, token = await _compliance_token(client, db_session_factory, "noworker")
    with patch("app.worker.tasks.run_compliance_export.delay") as delay:
        delay.return_value.id = "t1"
        job_id = (await client.post("/governance/export", json=_PAYLOAD, headers=bearer(token))).json()["job_id"]

    with patch("app.api.routes.governance.is_worker_online", return_value=False):
        job = (await client.get(f"/governance/export/{job_id}", headers=bearer(token))).json()
    assert job["status"] == "pending"
    assert job["worker_online"] is False
    assert "no background worker is running" in job["status_message"]

    with patch("app.api.routes.governance.is_worker_online", return_value=True):
        job = (await client.get(f"/governance/export/{job_id}", headers=bearer(token))).json()
    assert job["worker_online"] is True
    assert "pick this up shortly" in job["status_message"]

    with patch("app.api.routes.governance.is_worker_online", return_value=None):
        recent = (await client.get("/governance/export", headers=bearer(token))).json()
    assert [j["id"] for j in recent["items"]] == [job_id]


async def test_broker_outage_marks_job_failed_instead_of_pending_forever(client, db_session_factory):
    org, token = await _compliance_token(client, db_session_factory, "brokerdown")
    with patch("app.worker.tasks.run_compliance_export.delay", side_effect=ConnectionError("broker down")):
        resp = await client.post("/governance/export", json=_PAYLOAD, headers=bearer(token))
    assert resp.status_code == 503
    assert "queue is unavailable" in resp.json()["detail"]

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        [job] = (await session.execute(select(ComplianceExportJob))).scalars().all()
    assert job.status == ComplianceExportStatus.FAILED
    assert "queue is unavailable" in job.error


async def test_worker_liveness_reads_the_real_heartbeat(monkeypatch):
    """is_worker_online is a thin, honest read of the beat heartbeat key."""
    from datetime import UTC, datetime, timedelta

    from app.services import system_health

    class _FakeRedis:
        def __init__(self, value):
            self.value = value

        async def get(self, _key):
            return self.value

    monkeypatch.setattr(system_health.redis_client, "get_client", lambda: _FakeRedis(None))
    assert await system_health.is_worker_online() is False
    fresh = datetime.now(UTC).isoformat()
    monkeypatch.setattr(system_health.redis_client, "get_client", lambda: _FakeRedis(fresh))
    assert await system_health.is_worker_online() is True
    stale = (datetime.now(UTC) - timedelta(minutes=10)).isoformat()
    monkeypatch.setattr(system_health.redis_client, "get_client", lambda: _FakeRedis(stale))
    assert await system_health.is_worker_online() is False

    class _Broken:
        async def get(self, _key):
            raise ConnectionError("redis down")

    monkeypatch.setattr(system_health.redis_client, "get_client", lambda: _Broken())
    assert await system_health.is_worker_online() is None
