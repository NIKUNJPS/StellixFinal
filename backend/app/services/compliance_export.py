"""Compliance export service (Batch 10): renders the org's audit_log for a date
range as JSON or a real reportlab-rendered PDF, tracked via ComplianceExportJob.

Always runs via Celery (see app.worker.tasks.run_compliance_export) — there is no
separate sync/async code path keyed on range size. A date-range query plus a PDF
table render is cheap enough that the extra branch would add complexity without a
measurable benefit, and polling the job is a strictly simpler client contract.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, date, datetime, time
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_tenant_session
from app.models.audit_log import AuditEventType, AuditLog
from app.models.compliance_export import ComplianceExportJob, ComplianceExportStatus
from app.models.user import User
from app.services.audit import write_audit_log

_Entry = tuple[AuditLog, str | None]


def _export_dir() -> Path:
    path = Path(settings.COMPLIANCE_EXPORT_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


async def create_export_job(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user: User,
    start_date: date,
    end_date: date,
    export_format: str,
) -> ComplianceExportJob:
    job = ComplianceExportJob(
        requested_by_user_id=user.id,
        start_date=start_date,
        end_date=end_date,
        export_format=export_format,
    )
    session.add(job)
    await session.flush()
    await write_audit_log(
        session,
        organization_id=organization_id,
        actor_user_id=user.id,
        event_type=AuditEventType.DATA_EXPORT,
        entity_type="compliance_export_job",
        entity_id=job.id,
        after_state={
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "export_format": export_format,
        },
    )
    await session.commit()
    await session.refresh(job)
    return job


async def _load_entries(
    session: AsyncSession, *, start_date: date, end_date: date
) -> list[_Entry]:
    start_dt = datetime.combine(start_date, time.min, tzinfo=UTC)
    end_dt = datetime.combine(end_date, time.max, tzinfo=UTC)
    rows = (
        await session.execute(
            select(AuditLog, User.email)
            .outerjoin(User, User.id == AuditLog.actor_user_id)
            .where(AuditLog.created_at >= start_dt)
            .where(AuditLog.created_at <= end_dt)
            .order_by(AuditLog.created_at.asc())
        )
    ).all()
    return [(row[0], row[1]) for row in rows]


def _entry_dict(entry: AuditLog, actor_email: str | None) -> dict:
    return {
        "id": str(entry.id),
        "created_at": entry.created_at.isoformat(),
        "event_type": entry.event_type.value,
        "entity_type": entry.entity_type,
        "entity_id": str(entry.entity_id),
        "actor_user_id": str(entry.actor_user_id) if entry.actor_user_id else None,
        "actor_email": actor_email,
        "before_state": entry.before_state,
        "after_state": entry.after_state,
        "justification": entry.justification,
        "ip_address": entry.ip_address,
    }


def _render_json(
    entries: list[_Entry], *, path: Path, organization_id: uuid.UUID, start_date: date, end_date: date
) -> None:
    payload = {
        "organization_id": str(organization_id),
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "generated_at": datetime.now(UTC).isoformat(),
        "entry_count": len(entries),
        "entries": [_entry_dict(entry, email) for entry, email in entries],
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _render_pdf(
    entries: list[_Entry], *, path: Path, organization_id: uuid.UUID, start_date: date, end_date: date
) -> None:
    # Imported lazily: reportlab is only needed on the PDF branch, and heavy imports
    # stay out of the hot path for JSON exports (matches the vectorbt/shap pattern
    # used elsewhere for optional heavy dependencies).
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import landscape, letter
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(
        str(path),
        pagesize=landscape(letter),
        title="Stellix Labs Compliance Export",
        leftMargin=0.5 * inch,
        rightMargin=0.5 * inch,
    )
    story = [
        Paragraph("Stellix Labs — Governance Audit Trail", styles["Title"]),
        Paragraph(
            f"Organization {organization_id} &nbsp;&middot;&nbsp; "
            f"{start_date.isoformat()} to {end_date.isoformat()} "
            f"&nbsp;&middot;&nbsp; {len(entries)} events "
            f"&nbsp;&middot;&nbsp; generated {datetime.now(UTC).strftime('%Y-%m-%d %H:%M UTC')}",
            styles["Normal"],
        ),
        Spacer(1, 0.25 * inch),
    ]

    header = ["Timestamp (UTC)", "Event", "Entity", "Actor", "Justification"]
    data = [header]
    for entry, actor_email in entries:
        actor = actor_email or (f"user:{str(entry.actor_user_id)[:8]}" if entry.actor_user_id else "system")
        data.append(
            [
                entry.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                entry.event_type.value,
                f"{entry.entity_type}:{str(entry.entity_id)[:8]}",
                actor,
                Paragraph((entry.justification or "").replace("\n", " ")[:300], styles["BodyText"]),
            ]
        )
    if len(data) == 1:
        data.append(["—", "No events in range", "—", "—", "—"])

    table = Table(
        data,
        colWidths=[1.3 * inch, 1.5 * inch, 1.5 * inch, 1.5 * inch, 3.7 * inch],
        repeatRows=1,
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
            ]
        )
    )
    story.append(table)
    doc.build(story)


async def run_export(job_id: uuid.UUID, organization_id: uuid.UUID) -> None:
    """Celery-facing entry point: opens its own tenant session. Tests call
    ``run_export_in_session`` directly with a session bound to the test DB — mirrors
    ``run_evolution``/``run_evolution_in_session`` in app/services/evolution.py."""
    async with get_tenant_session(organization_id) as session:
        await run_export_in_session(session, job_id=job_id, organization_id=organization_id)


async def run_export_in_session(
    session: AsyncSession, *, job_id: uuid.UUID, organization_id: uuid.UUID
) -> None:
    job = (
        await session.execute(select(ComplianceExportJob).where(ComplianceExportJob.id == job_id))
    ).scalar_one_or_none()
    if job is None:
        return
    job.status = ComplianceExportStatus.RUNNING
    await session.commit()

    try:
        entries = await _load_entries(session, start_date=job.start_date, end_date=job.end_date)
        file_path = _export_dir() / f"{job.id}.{job.export_format}"
        if job.export_format == "pdf":
            _render_pdf(
                entries,
                path=file_path,
                organization_id=organization_id,
                start_date=job.start_date,
                end_date=job.end_date,
            )
        else:
            _render_json(
                entries,
                path=file_path,
                organization_id=organization_id,
                start_date=job.start_date,
                end_date=job.end_date,
            )
        job.status = ComplianceExportStatus.COMPLETED
        job.file_path = str(file_path)
    except Exception as exc:  # noqa: BLE001 — persist the failure, don't crash the worker
        job.status = ComplianceExportStatus.FAILED
        job.error = str(exc)
    await session.commit()
