"""Governance service: the kill switch (Batch 10) — the one deliberate lifecycle bypass —
and its CIO review workflow (Batch 25).

Role enforcement lives at the route level (``require_role``); these functions assume
the caller is already authorized for the action and focus on state + audit trail.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.graph.sync_service import GraphSyncService
from app.models.audit_log import AuditEventType
from app.models.kill_switch_review import REVIEW_WINDOW, KillSwitchReview
from app.models.strategy import Strategy, StrategyStatus
from app.models.user import User
from app.rbac.catalog import P
from app.services.audit import write_audit_log
from app.services.rbac import get_effective_role, has_permission
from app.strategy import lifecycle


class ReviewError(lifecycle.LifecycleError):
    http_status = 409


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _as_aware(value: datetime) -> datetime:
    # SQLite (tests) hands back naive datetimes for timestamptz columns.
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


async def kill_switch(
    session: AsyncSession, *, strategy: Strategy, user: User, reason: str
) -> Strategy:
    """Immediately force ANY strategy to RETIRED, short-circuiting the state
    machine entirely — per the SRC report, this is deliberate, not an oversight.
    Unlike the normal /retire endpoint, this does NOT call assert_transition_legal
    (works even from a state a normal retire would reject, e.g. an already-terminal
    strategy) and does NOT apply the parentless-failed-needs-admin escalation —
    role (risk_manager/cio/admin, enforced by the route dependency) plus a reason
    are the only gates. No undo: reactivation requires a brand-new run through the
    full draft->candidate->active pipeline and fresh approval, exactly like any
    other retired strategy — there is deliberately no "un-kill" path.

    Batch 25 dual approval: the kill still takes effect instantly, in this same
    transaction. A ``KillSwitchReview`` records the CIO review owed for it — pending
    (14-day deadline) for anyone who is not a CIO, self-reviewed when a CIO acted.
    """
    if not reason or not reason.strip():
        raise lifecycle.ReasonRequired("A reason is required to activate the kill switch")

    now = _utcnow()
    before_status = strategy.status.value
    strategy.status = StrategyStatus.RETIRED
    # A kill by the reviewing authority (killswitch.review; day one: the CIO) needs no second review.
    is_cio = await has_permission(session, user, P.KILLSWITCH_REVIEW)
    effective_role = await get_effective_role(session, user)
    triggered_by_role = ((effective_role.system_key or effective_role.name) if effective_role else user.role.value)[:32]
    review = KillSwitchReview(
        strategy_id=strategy.id,
        triggered_by_user_id=user.id,
        triggered_by_role=triggered_by_role,
        reason=reason.strip(),
        status_before_kill=before_status,
        triggered_at=now,
        review_deadline=now + REVIEW_WINDOW,
        is_self_reviewed=is_cio,
        reviewed_by_user_id=user.id if is_cio else None,
        reviewed_at=now if is_cio else None,
        review_note="Kill switch activated by the CIO (self-reviewed)" if is_cio else None,
    )
    session.add(review)
    await session.flush()
    await write_audit_log(
        session,
        organization_id=strategy.organization_id,
        actor=user,
        event_type=AuditEventType.KILL_SWITCH_ACTIVATED,
        entity_type="strategy",
        entity_id=strategy.id,
        entity_name=strategy.name,
        before_state={"status": before_status},
        after_state={"status": strategy.status.value},
        justification=reason,
        description=(
            f"{user.full_name or user.email} ({user.role.value}) activated the kill switch on "
            f"strategy '{strategy.name}' ({before_status} → retired). "
            + (
                "Self-reviewed: the CIO is the reviewing authority."
                if is_cio
                else f"CIO review due by {review.review_deadline:%Y-%m-%d}."
            )
        ),
    )
    await session.commit()
    await session.refresh(strategy)
    await GraphSyncService().sync_strategy_node(session, strategy)
    return strategy


async def acknowledge_review(
    session: AsyncSession, *, review: KillSwitchReview, reviewer: User, note: str
) -> KillSwitchReview:
    """A CIO confirms they have reviewed a kill. Read/acknowledge only: the strategy
    stays RETIRED — reversing a kill is not something a review can do."""
    if not await has_permission(session, reviewer, P.KILLSWITCH_REVIEW):
        raise lifecycle.PermissionDenied("You do not have permission to review a kill switch activation")
    if review.reviewed_at is not None:
        raise ReviewError("This kill switch activation has already been reviewed")
    if not note or not note.strip():
        raise lifecycle.ReasonRequired("A review note is required")

    now = _utcnow()
    was_overdue = now > _as_aware(review.review_deadline)
    review.reviewed_by_user_id = reviewer.id
    review.reviewed_at = now
    review.review_note = note.strip()

    strategy = await session.get(Strategy, review.strategy_id)
    await write_audit_log(
        session,
        organization_id=review.organization_id,
        actor=reviewer,
        event_type=AuditEventType.KILL_SWITCH_REVIEWED,
        entity_type="strategy",
        entity_id=review.strategy_id,
        entity_name=strategy.name if strategy else None,
        after_state={
            "kill_switch_review_id": str(review.id),
            "reviewed_after_deadline": was_overdue,
        },
        justification=note.strip(),
    )
    await session.commit()
    await session.refresh(review)
    return review


@dataclass(frozen=True)
class ReviewRow:
    review: KillSwitchReview
    strategy_name: str
    strategy_status: str
    triggered_by: User | None
    reviewed_by: User | None


def review_state(review: KillSwitchReview, *, now: datetime | None = None) -> str:
    """``self_reviewed`` | ``reviewed`` | ``overdue`` | ``pending``."""
    if review.is_self_reviewed:
        return "self_reviewed"
    if review.reviewed_at is not None:
        return "reviewed"
    if (now or _utcnow()) > _as_aware(review.review_deadline):
        return "overdue"
    return "pending"


async def list_reviews(
    session: AsyncSession,
    *,
    state: str | None = None,
    triggered_by_user_id: uuid.UUID | None = None,
    since: datetime | None = None,
) -> list[ReviewRow]:
    """Every kill in the tenant, newest first. Overdue reviews are never hidden or
    expired — they surface as ``overdue`` until a CIO acts on them."""
    stmt = (
        select(KillSwitchReview, Strategy.name, Strategy.status)
        .join(Strategy, Strategy.id == KillSwitchReview.strategy_id)
        .order_by(KillSwitchReview.triggered_at.desc())
    )
    if triggered_by_user_id is not None:
        stmt = stmt.where(KillSwitchReview.triggered_by_user_id == triggered_by_user_id)
    if since is not None:
        stmt = stmt.where(KillSwitchReview.triggered_at >= since)
    rows = (await session.execute(stmt)).all()

    user_ids = {
        uid
        for review, _, _ in rows
        for uid in (review.triggered_by_user_id, review.reviewed_by_user_id)
        if uid is not None
    }
    users: dict[uuid.UUID, User] = {}
    if user_ids:
        users = {
            u.id: u for u in (await session.execute(select(User).where(User.id.in_(user_ids)))).scalars()
        }

    now = _utcnow()
    result: list[ReviewRow] = []
    for review, name, status in rows:
        if state is not None and state != "all":
            current = review_state(review, now=now)
            wanted = {"awaiting": {"pending", "overdue"}}.get(state, {state})
            if current not in wanted:
                continue
        result.append(
            ReviewRow(
                review=review,
                strategy_name=name,
                strategy_status=status.value,
                triggered_by=users.get(review.triggered_by_user_id),
                reviewed_by=users.get(review.reviewed_by_user_id),
            )
        )
    return result
