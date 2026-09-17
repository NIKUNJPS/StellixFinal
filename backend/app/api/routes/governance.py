"""Governance & Compliance endpoints (Batch 10): kill switch, active-strategies and
approval-queue views, and the org-wide audit log viewer. Compliance export lives here
too (added alongside the Celery job in the same batch).

Batch 25: CIO review of kill-switch activations, a strategy control list for the
risk roles, a role-scoped + searchable audit trail with readable actor identity, and
honest processing state for queued compliance exports.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_permissions,
    get_tenant_db,
    require_any_permission,
    require_permission,
)
from app.core.logging import get_current_request_id
from app.models.approval_record import ApprovalRecord
from app.models.audit_log import AuditEventType, AuditLog
from app.models.compliance_export import ComplianceExportJob, ComplianceExportStatus
from app.models.kill_switch_review import REVIEW_WINDOW, KillSwitchReview
from app.models.strategy import Strategy, StrategyStatus
from app.models.strategy_version import StrategyVersion
from app.models.user import User
from app.rbac.catalog import P
from app.schemas.governance import (
    ActiveStrategiesResponse,
    ActiveStrategySummary,
    ActorSummary,
    ApprovalQueueItem,
    ApprovalQueueResponse,
    AuditLogEntryRead,
    ComplianceExportEnqueued,
    ComplianceExportJobListResponse,
    ComplianceExportJobRead,
    ComplianceExportRequest,
    GovernanceAuditLogListResponse,
    KillSwitchRequest,
    KillSwitchReviewAcknowledgeRequest,
    KillSwitchReviewListResponse,
    KillSwitchReviewRead,
    StrategyControlItem,
    StrategyControlListResponse,
)
from app.schemas.strategy import StrategyRead
from app.services import compliance_export as compliance_export_svc
from app.services import governance as governance_svc
from app.services.system_health import is_worker_online
from app.strategy import lifecycle
from app.strategy.lifecycle import LifecycleError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/governance", tags=["Governance & Compliance"])

# Batch 26: authorization is permission-based (app/rbac/catalog.py). Day-one grants
# reproduce the Batch 10/25 role sets exactly: killswitch.trigger = risk_manager, cio,
# admin (deliberately not compliance_officer, schemas.md RBAC finding #1);
# governance.view = those three plus compliance_officer; compliance.export =
# admin + compliance_officer; the three audit scopes as documented on list_audit_log.
_RISK_EVENT_TYPES = (
    AuditEventType.STRATEGY_STATUS_CHANGE,
    AuditEventType.STRATEGY_APPROVED,
    AuditEventType.STRATEGY_REJECTED,
    AuditEventType.EVOLUTION_CANDIDATE_APPROVED,
    AuditEventType.KILL_SWITCH_ACTIVATED,
    AuditEventType.KILL_SWITCH_REVIEWED,
)


async def _get_or_404(db: AsyncSession, strategy_id: uuid.UUID) -> Strategy:
    strategy = (
        await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    ).scalar_one_or_none()
    if strategy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")
    return strategy


def _lifecycle_http(exc: LifecycleError) -> HTTPException:
    return HTTPException(status_code=exc.http_status, detail=str(exc))


def _actor(user: User | None, fallback_id: uuid.UUID | None = None) -> ActorSummary:
    if user is None:
        return ActorSummary(user_id=fallback_id, email=None, full_name=None, role=None)
    return ActorSummary(user_id=user.id, email=user.email, full_name=user.full_name, role=user.role.value)


@router.post(
    "/kill-switch/{strategy_id}",
    response_model=StrategyRead,
    summary="Emergency-retire any strategy, bypassing the state machine (risk_manager/cio/admin, reason required)",
)
async def kill_switch(
    strategy_id: uuid.UUID,
    payload: KillSwitchRequest,
    current_user: User = Depends(require_permission(P.KILLSWITCH_TRIGGER)),
    db: AsyncSession = Depends(get_tenant_db),
) -> Strategy:
    strategy = await _get_or_404(db, strategy_id)
    try:
        return await governance_svc.kill_switch(
            db, strategy=strategy, user=current_user, reason=payload.reason
        )
    except LifecycleError as exc:
        raise _lifecycle_http(exc) from exc


@router.get(
    "/kill-switch/reviews",
    response_model=KillSwitchReviewListResponse,
    summary="Kill switch activations and their CIO review state (risk_manager/cio/compliance_officer/admin)",
)
async def list_kill_switch_reviews(
    current_user: User = Depends(require_permission(P.GOVERNANCE_VIEW)),
    permissions: frozenset[str] = Depends(get_current_permissions),
    db: AsyncSession = Depends(get_tenant_db),
    review_state: str = Query(
        default="all", pattern="^(all|awaiting|pending|overdue|reviewed|self_reviewed)$"
    ),
    since_days: int | None = Query(default=None, ge=1, le=3650),
) -> KillSwitchReviewListResponse:
    """Callers holding ``killswitch.history.view_all`` see every kill in the
    organization; everyone else sees only the kills they triggered.
    ``awaiting`` = pending + overdue."""
    since = datetime.now(UTC) - timedelta(days=since_days) if since_days else None
    triggered_by = None if P.KILLSWITCH_HISTORY_ALL in permissions else current_user.id
    rows = await governance_svc.list_reviews(
        db, state=review_state, triggered_by_user_id=triggered_by, since=since
    )
    now = datetime.now(UTC)
    items = [
        KillSwitchReviewRead(
            id=row.review.id,
            strategy_id=row.review.strategy_id,
            strategy_name=row.strategy_name,
            strategy_status=row.strategy_status,
            reason=row.review.reason,
            status_before_kill=row.review.status_before_kill,
            triggered_by=_actor(row.triggered_by, row.review.triggered_by_user_id),
            triggered_at=row.review.triggered_at,
            review_deadline=row.review.review_deadline,
            review_state=governance_svc.review_state(row.review, now=now),
            is_self_reviewed=row.review.is_self_reviewed,
            reviewed_by=_actor(row.reviewed_by, row.review.reviewed_by_user_id)
            if row.review.reviewed_by_user_id
            else None,
            reviewed_at=row.review.reviewed_at,
            review_note=row.review.review_note,
        )
        for row in rows
    ]
    return KillSwitchReviewListResponse(
        total=len(items),
        awaiting_review_count=sum(1 for i in items if i.review_state in ("pending", "overdue")),
        overdue_count=sum(1 for i in items if i.review_state == "overdue"),
        items=items,
    )


@router.post(
    "/kill-switch/reviews/{review_id}/acknowledge",
    response_model=KillSwitchReviewRead,
    summary="CIO acknowledges a kill switch activation (does NOT reverse the kill)",
)
async def acknowledge_kill_switch_review(
    review_id: uuid.UUID,
    payload: KillSwitchReviewAcknowledgeRequest,
    current_user: User = Depends(require_permission(P.KILLSWITCH_REVIEW)),
    db: AsyncSession = Depends(get_tenant_db),
) -> KillSwitchReviewRead:
    review = (
        await db.execute(select(KillSwitchReview).where(KillSwitchReview.id == review_id))
    ).scalar_one_or_none()
    if review is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kill switch review not found")
    try:
        review = await governance_svc.acknowledge_review(
            db, review=review, reviewer=current_user, note=payload.note
        )
    except LifecycleError as exc:
        raise _lifecycle_http(exc) from exc

    strategy = await db.get(Strategy, review.strategy_id)
    triggered_by = await db.get(User, review.triggered_by_user_id) if review.triggered_by_user_id else None
    return KillSwitchReviewRead(
        id=review.id,
        strategy_id=review.strategy_id,
        strategy_name=strategy.name if strategy else "",
        strategy_status=strategy.status if strategy else StrategyStatus.RETIRED,
        reason=review.reason,
        status_before_kill=review.status_before_kill,
        triggered_by=_actor(triggered_by, review.triggered_by_user_id),
        triggered_at=review.triggered_at,
        review_deadline=review.review_deadline,
        review_state=governance_svc.review_state(review),
        is_self_reviewed=review.is_self_reviewed,
        reviewed_by=_actor(current_user),
        reviewed_at=review.reviewed_at,
        review_note=review.review_note,
    )


@router.get(
    "/strategy-controls",
    response_model=StrategyControlListResponse,
    summary="Every strategy the kill switch can act on, plus retired strategies from the review window",
)
async def list_strategy_controls(
    _user: User = Depends(require_permission(P.GOVERNANCE_VIEW)),
    db: AsyncSession = Depends(get_tenant_db),
) -> StrategyControlListResponse:
    """Non-retired strategies (the kill switch works on any of them), plus anything
    retired within the last 14 days — so a freshly killed strategy never disappears
    from the control room during its CIO review window."""
    recent_cutoff = datetime.now(UTC) - REVIEW_WINDOW
    rows = (
        await db.execute(
            select(Strategy)
            .where(
                or_(
                    Strategy.status != StrategyStatus.RETIRED,
                    Strategy.updated_at >= recent_cutoff,
                )
            )
            .order_by(Strategy.updated_at.desc())
        )
    ).scalars().all()
    order = {
        StrategyStatus.ACTIVE: 0,
        StrategyStatus.CANDIDATE: 1,
        StrategyStatus.FAILED: 2,
        StrategyStatus.DRAFT: 3,
        StrategyStatus.RETIRED: 4,
    }
    items = sorted((StrategyControlItem.model_validate(r) for r in rows), key=lambda i: order[i.status])
    return StrategyControlListResponse(total=len(items), items=items)


@router.get(
    "/active-strategies",
    response_model=ActiveStrategiesResponse,
    summary="List all currently-active strategies (governance view)",
)
async def list_active_strategies(
    _user: User = Depends(require_permission(P.GOVERNANCE_VIEW)),
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
    _user: User = Depends(require_permission(P.GOVERNANCE_VIEW)),
    db: AsyncSession = Depends(get_tenant_db),
) -> ApprovalQueueResponse:
    # Batch 25: "decided" means decided FOR THE CURRENT VERSION. A decision on an
    # earlier version no longer keeps a re-versioned, re-submitted strategy out of
    # the queue forever.
    latest_version = (
        select(StrategyVersion.strategy_id, func.max(StrategyVersion.created_at).label("saved_at"))
        .group_by(StrategyVersion.strategy_id)
        .subquery()
    )
    decided_ids = (
        select(ApprovalRecord.strategy_id)
        .join(latest_version, latest_version.c.strategy_id == ApprovalRecord.strategy_id, isouter=True)
        .where(
            or_(
                latest_version.c.saved_at.is_(None),
                ApprovalRecord.created_at >= latest_version.c.saved_at,
            )
        )
    )
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
    summary="Paginated, filterable, searchable audit trail (scope depends on role)",
)
async def list_audit_log(
    current_user: User = Depends(require_any_permission(P.AUDIT_VIEW_ALL, P.AUDIT_VIEW_ORG_RISK, P.AUDIT_VIEW_OWN_RISK)),
    permissions: frozenset[str] = Depends(get_current_permissions),
    db: AsyncSession = Depends(get_tenant_db),
    event_type: AuditEventType | None = Query(default=None),
    entity_type: str | None = Query(default=None, max_length=64),
    actor_user_id: uuid.UUID | None = Query(default=None),
    q: str | None = Query(default=None, max_length=200, description="Search actor, strategy name, or description"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> GovernanceAuditLogListResponse:
    """``audit.view.all``: every event. ``audit.view.org_risk``: risk + approval events
    across the organization. ``audit.view.own_risk``: only the caller's own risk +
    approval actions. The broadest permission held wins."""
    conditions = []
    scope = "organization"
    if P.AUDIT_VIEW_ALL in permissions:
        pass
    elif P.AUDIT_VIEW_ORG_RISK in permissions:
        scope = "risk_actions"
        conditions.append(AuditLog.event_type.in_(_RISK_EVENT_TYPES))
    else:
        scope = "own_risk_actions"
        conditions.append(AuditLog.event_type.in_(_RISK_EVENT_TYPES))
        conditions.append(AuditLog.actor_user_id == current_user.id)

    if event_type is not None:
        conditions.append(AuditLog.event_type == event_type)
    if entity_type:
        conditions.append(AuditLog.entity_type == entity_type)
    if actor_user_id is not None:
        conditions.append(AuditLog.actor_user_id == actor_user_id)
    if q and q.strip():
        pattern = f"%{q.strip().lower()}%"
        conditions.append(
            or_(
                func.lower(AuditLog.actor_email).like(pattern),
                func.lower(AuditLog.actor_name).like(pattern),
                func.lower(AuditLog.entity_name).like(pattern),
                func.lower(AuditLog.description).like(pattern),
                func.lower(AuditLog.justification).like(pattern),
                func.lower(User.email).like(pattern),
                func.lower(User.full_name).like(pattern),
            )
        )
    if start_date is not None:
        conditions.append(AuditLog.created_at >= datetime.combine(start_date, time.min, tzinfo=UTC))
    if end_date is not None:
        conditions.append(AuditLog.created_at <= datetime.combine(end_date, time.max, tzinfo=UTC))

    total = await db.scalar(
        select(func.count())
        .select_from(AuditLog)
        .outerjoin(User, User.id == AuditLog.actor_user_id)
        .where(*conditions)
    )
    rows = (
        await db.execute(
            select(AuditLog, User)
            .outerjoin(User, User.id == AuditLog.actor_user_id)
            .where(*conditions)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()

    items: list[AuditLogEntryRead] = []
    for entry, actor in rows:
        read = AuditLogEntryRead.model_validate(entry)
        if entry.actor_email:
            read.actor_identity_source = "recorded"
        elif actor is not None:
            # Pre-Batch-25 row: no snapshot was taken. Resolve from the profile as it
            # is today — and say so, since the role may have changed since.
            read.actor_email = actor.email
            read.actor_name = actor.full_name
            read.actor_role = actor.role.value
            read.actor_identity_source = "current_profile"
        if not read.description:
            from app.services.audit import describe_event

            read.description = describe_event(
                entry.event_type,
                actor_label=read.actor_name or read.actor_email,
                entity_name=entry.entity_name,
                before_state=entry.before_state,
                after_state=entry.after_state,
            )
        items.append(read)
    return GovernanceAuditLogListResponse(total=total or 0, count=len(items), scope=scope, items=items)


async def _get_export_job_or_404(db: AsyncSession, job_id: uuid.UUID) -> ComplianceExportJob:
    job = (
        await db.execute(select(ComplianceExportJob).where(ComplianceExportJob.id == job_id))
    ).scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export job not found")
    return job


def _export_status_message(job: ComplianceExportJob, worker_online: bool | None) -> str:
    if job.status == ComplianceExportStatus.COMPLETED:
        return "Export ready to download."
    if job.status == ComplianceExportStatus.FAILED:
        return f"Export failed: {job.error}" if job.error else "Export failed."
    if job.status == ComplianceExportStatus.RUNNING:
        return "Generating the export now."
    if worker_online is False:
        return (
            "Queued, but no background worker is running, so this export will not start "
            "until one is. Ask your administrator to start the Celery worker."
        )
    if worker_online is None:
        return "Queued. Background worker status could not be checked."
    return "Queued. A background worker will pick this up shortly."


def _export_read(job: ComplianceExportJob, worker_online: bool | None) -> ComplianceExportJobRead:
    read = ComplianceExportJobRead.model_validate(job)
    read.worker_online = worker_online
    read.status_message = _export_status_message(job, worker_online)
    return read


@router.get(
    "/export",
    response_model=ComplianceExportJobListResponse,
    summary="Recent compliance export jobs (admin/compliance_officer only)",
)
async def list_compliance_exports(
    _user: User = Depends(require_permission(P.COMPLIANCE_EXPORT)),
    db: AsyncSession = Depends(get_tenant_db),
    limit: int = Query(default=10, ge=1, le=50),
) -> ComplianceExportJobListResponse:
    jobs = (
        await db.execute(
            select(ComplianceExportJob).order_by(ComplianceExportJob.created_at.desc()).limit(limit)
        )
    ).scalars().all()
    worker_online = await is_worker_online()
    return ComplianceExportJobListResponse(items=[_export_read(j, worker_online) for j in jobs])


@router.post(
    "/export",
    response_model=ComplianceExportEnqueued,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Enqueue a compliance export of the audit trail for a date range (admin/compliance_officer only)",
)
async def create_compliance_export(
    payload: ComplianceExportRequest,
    current_user: User = Depends(require_permission(P.COMPLIANCE_EXPORT)),
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

    try:
        result = run_compliance_export.delay(
            job_id=str(job.id),
            organization_id=str(current_user.organization_id),
            request_id=get_current_request_id(),
        )
    except Exception as exc:  # noqa: BLE001 — broker unreachable
        # Without this the job row would sit at "pending" forever with nothing ever
        # going to process it. Record the real reason on the job instead.
        logger.warning("Could not enqueue compliance export %s", job.id, exc_info=True)
        job.status = ComplianceExportStatus.FAILED
        job.error = "The background job queue is unavailable; the export could not be queued."
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=job.error
        ) from exc
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
    _user: User = Depends(require_permission(P.COMPLIANCE_EXPORT)),
    db: AsyncSession = Depends(get_tenant_db),
) -> ComplianceExportJobRead:
    job = await _get_export_job_or_404(db, job_id)
    return _export_read(job, await is_worker_online())


@router.get(
    "/export/{job_id}/download",
    summary="Download a completed compliance export file (admin/compliance_officer only)",
)
async def download_compliance_export(
    job_id: uuid.UUID,
    _user: User = Depends(require_permission(P.COMPLIANCE_EXPORT)),
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
