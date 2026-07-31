"""Governance & Compliance endpoints (Batch 10): kill switch, active-strategies and
approval-queue views, and the org-wide audit log viewer. Compliance export lives here
too (added alongside the Celery job in the same batch)."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_tenant_db, require_role
from app.core.logging import get_current_request_id
from app.models.approval_record import ApprovalRecord
from app.models.audit_log import AuditEventType, AuditLog
from app.models.compliance_export import ComplianceExportJob, ComplianceExportStatus
from app.models.strategy import Strategy, StrategyStatus
from app.models.user import User, UserRole
from app.schemas.governance import (
    ActiveStrategiesResponse,
    ActiveStrategySummary,
    ApprovalQueueItem,
    ApprovalQueueResponse,
    AuditLogEntryRead,
    ComplianceExportEnqueued,
    ComplianceExportJobRead,
    ComplianceExportRequest,
    GovernanceAuditLogListResponse,
    KillSwitchRequest,
)
from app.schemas.strategy import StrategyRead
from app.services import compliance_export as compliance_export_svc
from app.services import governance as governance_svc
from app.strategy import lifecycle
from app.strategy.lifecycle import LifecycleError

router = APIRouter(prefix="/governance", tags=["Governance & Compliance"])

# Kill switch is an operational risk action — same role set as retire, deliberately
# NOT including compliance_officer (schemas.md RBAC audit finding #1).
_KILL_SWITCH_ROLES = (UserRole.RISK_MANAGER, UserRole.CIO, UserRole.ADMIN)
# Active-strategies / approval-queue are governance views for anyone who can act on
# them (same role set as approve/reject).
_GOVERNANCE_VIEW_ROLES = (UserRole.RISK_MANAGER, UserRole.CIO, UserRole.COMPLIANCE_OFFICER, UserRole.ADMIN)
# The org-wide audit trail and compliance export are oversight features, restricted
# the same way Batch 9's own LLM audit log is.
_COMPLIANCE_ROLES = (UserRole.ADMIN, UserRole.COMPLIANCE_OFFICER)


async def _get_or_404(db: AsyncSession, strategy_id: uuid.UUID) -> Strategy:
    strategy = (
        await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    ).scalar_one_or_none()
    if strategy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
    return strategy


@router.post(
    "/kill-switch/{strategy_id}",
    response_model=StrategyRead,
    summary="Emergency-retire any strategy, bypassing the state machine (risk_manager/cio/admin, reason required)",
)
async def kill_switch(
    strategy_id: uuid.UUID,
    payload: KillSwitchRequest,
    current_user: User = Depends(require_role(*_KILL_SWITCH_ROLES)),
    db: AsyncSession = Depends(get_tenant_db),
) -> Strategy:
    strategy = await _get_or_404(db, strategy_id)
    try:
        return await governance_svc.kill_switch(
            db, strategy=strategy, user=current_user, reason=payload.reason
        )
    except LifecycleError as exc:
        raise HTTPException(status_code=exc.http_status, detail=str(exc)) from exc


@router.get(
    "/active-strategies",
    response_model=ActiveStrategiesResponse,
    summary="List all currently-active strategies (governance view)",
)
async def list_active_strategies(
    _user: User = Depends(require_role(*_GOVERNANCE_VIEW_ROLES)),
    db: AsyncSession = Depends(get_tenant_db),
) -> ActiveStrategiesResponse:
    rows = (
        await db.execute(
            select(Strategy)
            .where(Strategy.status == StrategyStatus.ACTIVE)
            .order_by(Strategy.updated_at.desc())
        )
    ).scalars().all()
    items = [ActiveStrategySummary.model_validate(r) for r in rows]
    return ActiveStrategiesResponse(total=len(items), items=items)


@router.get(
    "/approval-queue",
    response_model=ApprovalQueueResponse,
    summary="List candidates awaiting an approve/reject decision (composite score >= threshold)",
)
async def list_approval_queue(
    _user: User = Depends(require_role(*_GOVERNANCE_VIEW_ROLES)),
    db: AsyncSession = Depends(get_tenant_db),
) -> ApprovalQueueResponse:
    decided_ids = select(ApprovalRecord.strategy_id)
    rows = (
        await db.execute(
            select(Strategy)
            .where(Strategy.status == StrategyStatus.CANDIDATE)
            .where(Strategy.robustness_score >= lifecycle.ROBUSTNESS_THRESHOLD)
            .where(Strategy.id.not_in(decided_ids))
            .order_by(Strategy.created_at.desc())
        )
    ).scalars().all()
    items = [ApprovalQueueItem.model_validate(r) for r in rows]
    return ApprovalQueueResponse(total=len(items), items=items)


@router.get(
    "/audit-log",
    response_model=GovernanceAuditLogListResponse,
    summary="Paginated, filterable org-wide audit trail (admin/compliance_officer only)",
)
async def list_audit_log(
    _user: User = Depends(require_role(*_COMPLIANCE_ROLES)),
    db: AsyncSession = Depends(get_tenant_db),
    event_type: AuditEventType | None = Query(default=None),
    entity_type: str | None = Query(default=None, max_length=64),
    actor_user_id: uuid.UUID | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> GovernanceAuditLogListResponse:
    conditions = []
    if event_type is not None:
        conditions.append(AuditLog.event_type == event_type)
    if entity_type:
        conditions.append(AuditLog.entity_type == entity_type)
    if actor_user_id is not None:
        conditions.append(AuditLog.actor_user_id == actor_user_id)
    if start_date is not None:
        conditions.append(AuditLog.created_at >= datetime.combine(start_date, time.min, tzinfo=UTC))
    if end_date is not None:
        conditions.append(AuditLog.created_at <= datetime.combine(end_date, time.max, tzinfo=UTC))

    total = await db.scalar(select(func.count()).select_from(AuditLog).where(*conditions))
    rows = (
        await db.execute(
            select(AuditLog)
            .where(*conditions)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    return GovernanceAuditLogListResponse(
        total=total or 0,
        count=len(rows),
        items=[AuditLogEntryRead.model_validate(r) for r in rows],
    )


async def _get_export_job_or_404(db: AsyncSession, job_id: uuid.UUID) -> ComplianceExportJob:
    job = (
        await db.execute(select(ComplianceExportJob).where(ComplianceExportJob.id == job_id))
    ).scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export job not found")
    return job


@router.post(
    "/export",
    response_model=ComplianceExportEnqueued,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Enqueue a compliance export of the audit trail for a date range (admin/compliance_officer only)",
)
async def create_compliance_export(
    payload: ComplianceExportRequest,
    current_user: User = Depends(require_role(*_COMPLIANCE_ROLES)),
    db: AsyncSession = Depends(get_tenant_db),
) -> ComplianceExportEnqueued:
    job = await compliance_export_svc.create_export_job(
        db,
        organization_id=current_user.organization_id,
        user=current_user,
        start_date=payload.start_date,
        end_date=payload.end_date,
        export_format=payload.export_format,
    )

    from app.worker.tasks import run_compliance_export

    result = run_compliance_export.delay(
        job_id=str(job.id),
        organization_id=str(current_user.organization_id),
        request_id=get_current_request_id(),
    )
    return ComplianceExportEnqueued(
        job_id=job.id,
        message="Compliance export enqueued. Poll GET /governance/export/{job_id} for status.",
        task_id=result.id,
    )


@router.get(
    "/export/{job_id}",
    response_model=ComplianceExportJobRead,
    summary="Poll a compliance export job's status (admin/compliance_officer only)",
)
async def get_compliance_export(
    job_id: uuid.UUID,
    _user: User = Depends(require_role(*_COMPLIANCE_ROLES)),
    db: AsyncSession = Depends(get_tenant_db),
) -> ComplianceExportJob:
    return await _get_export_job_or_404(db, job_id)


@router.get(
    "/export/{job_id}/download",
    summary="Download a completed compliance export file (admin/compliance_officer only)",
)
async def download_compliance_export(
    job_id: uuid.UUID,
    _user: User = Depends(require_role(*_COMPLIANCE_ROLES)),
    db: AsyncSession = Depends(get_tenant_db),
) -> FileResponse:
    job = await _get_export_job_or_404(db, job_id)
    if job.status != ComplianceExportStatus.COMPLETED or not job.file_path:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Export is not ready (status={job.status.value})",
        )
    media_type = "application/pdf" if job.export_format == "pdf" else "application/json"
    filename = f"stellix-compliance-export-{job.start_date}-{job.end_date}.{job.export_format}"
    return FileResponse(job.file_path, media_type=media_type, filename=filename)
