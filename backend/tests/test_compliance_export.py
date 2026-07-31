"""Compliance export (Batch 10): calls the export service directly (bypassing
Celery's .delay(), same convention as test_evolution_e2e.py) and asserts a valid,
non-trivial JSON payload and a genuine, readable PDF for a constructed date range."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, date, datetime

import pypdf
from app.db.tenant import bind_organization
from app.models.audit_log import AuditEventType, AuditLog
from app.models.compliance_export import ComplianceExportJob, ComplianceExportStatus
from app.models.user import UserRole
from app.services.compliance_export import create_export_job, run_export_in_session
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from tests.helpers import bearer, create_org_user, login


async def _write_audit_row(
    maker: async_sessionmaker, *, organization_id, actor_user_id, created_at, event_type, justification=None
) -> None:
    async with maker() as session:
        bind_organization(session.sync_session, organization_id)
        session.add(
            AuditLog(
                actor_user_id=actor_user_id,
                event_type=event_type,
                entity_type="strategy",
                entity_id=uuid.uuid4(),
                before_state={"status": "active"},
                after_state={"status": "retired"},
                justification=justification,
                created_at=created_at,
            )
        )
        await session.commit()


async def test_json_export_contains_expected_entries_for_date_range(client, db_session_factory):
    org, admin = await create_org_user(
        db_session_factory, org_name="Export Co", slug="export-co",
        email="admin@export.co", role=UserRole.ADMIN,
    )
    in_range = datetime(2026, 3, 15, tzinfo=UTC)
    out_of_range = datetime(2025, 1, 1, tzinfo=UTC)
    await _write_audit_row(
        db_session_factory, organization_id=org.id, actor_user_id=admin.id,
        created_at=in_range, event_type=AuditEventType.KILL_SWITCH_ACTIVATED,
        justification="in-range event",
    )
    await _write_audit_row(
        db_session_factory, organization_id=org.id, actor_user_id=admin.id,
        created_at=out_of_range, event_type=AuditEventType.STRATEGY_APPROVED,
        justification="out-of-range event",
    )

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        job = await create_export_job(
            session, organization_id=org.id, user=admin,
            start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), export_format="json",
        )
        job_id = job.id
        await run_export_in_session(session, job_id=job_id, organization_id=org.id)

        refreshed = (
            await session.execute(select(ComplianceExportJob).where(ComplianceExportJob.id == job_id))
        ).scalar_one()
        assert refreshed.status == ComplianceExportStatus.COMPLETED
        assert refreshed.file_path is not None
        assert refreshed.error is None
        file_path = refreshed.file_path

    with open(file_path, encoding="utf-8") as f:
        payload = json.load(f)

    justifications = [e["justification"] for e in payload["entries"]]
    assert "in-range event" in justifications
    assert "out-of-range event" not in justifications
    assert payload["entry_count"] == len(payload["entries"])
    assert all("event_type" in e and "created_at" in e for e in payload["entries"])


async def test_pdf_export_produces_a_real_readable_pdf(client, db_session_factory):
    org, admin = await create_org_user(
        db_session_factory, org_name="Export PDF Co", slug="export-pdf-co",
        email="admin@exportpdf.co", role=UserRole.ADMIN,
    )
    await _write_audit_row(
        db_session_factory, organization_id=org.id, actor_user_id=admin.id,
        created_at=datetime(2026, 6, 1, tzinfo=UTC),
        event_type=AuditEventType.KILL_SWITCH_ACTIVATED, justification="PDF content check",
    )

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        job = await create_export_job(
            session, organization_id=org.id, user=admin,
            start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), export_format="pdf",
        )
        job_id = job.id
        await run_export_in_session(session, job_id=job_id, organization_id=org.id)

        refreshed = (
            await session.execute(select(ComplianceExportJob).where(ComplianceExportJob.id == job_id))
        ).scalar_one()
        assert refreshed.status == ComplianceExportStatus.COMPLETED
        file_path = refreshed.file_path

    with open(file_path, "rb") as f:
        raw = f.read()
    assert raw[:5] == b"%PDF-"  # a genuine PDF, not a JSON blob with a .pdf name

    reader = pypdf.PdfReader(file_path)
    assert len(reader.pages) >= 1
    text = reader.pages[0].extract_text()
    assert "PDF content check" in text
    assert "kill_switch_activated" in text


async def test_export_job_endpoint_reports_completed_status(client, db_session_factory):
    """Route-level smoke test: create via the real endpoint, run the service inline
    (no live Celery worker in the hermetic suite), then poll the real endpoint."""
    org, _admin = await create_org_user(
        db_session_factory, org_name="Export Route Co", slug="export-route-co",
        email="admin@exportroute.co", role=UserRole.ADMIN,
    )
    token = (await login(client, email="admin@exportroute.co")).json()["access_token"]

    create_resp = await client.post(
        "/governance/export",
        json={"start_date": "2026-01-01", "end_date": "2026-12-31", "export_format": "json"},
        headers=bearer(token),
    )
    assert create_resp.status_code == 202
    job_id = uuid.UUID(create_resp.json()["job_id"])

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        await run_export_in_session(session, job_id=job_id, organization_id=org.id)

    poll_resp = await client.get(f"/governance/export/{job_id}", headers=bearer(token))
    assert poll_resp.status_code == 200
    assert poll_resp.json()["status"] == "completed"

    download_resp = await client.get(f"/governance/export/{job_id}/download", headers=bearer(token))
    assert download_resp.status_code == 200
    body = json.loads(download_resp.content)
    assert body["organization_id"] == str(org.id)
