"""Governance service: the kill switch (Batch 10) — the one deliberate lifecycle bypass.

Role enforcement lives at the route level (``require_role``); this function assumes
the caller is already authorized and focuses on the state bypass + audit trail.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.graph.sync_service import GraphSyncService
from app.models.audit_log import AuditEventType
from app.models.strategy import Strategy, StrategyStatus
from app.models.user import User
from app.services.audit import write_audit_log
from app.strategy import lifecycle


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
    """
    if not reason or not reason.strip():
        raise lifecycle.ReasonRequired("A reason is required to activate the kill switch")

    before_status = strategy.status.value
    strategy.status = StrategyStatus.RETIRED
    await write_audit_log(
        session,
        organization_id=strategy.organization_id,
        actor_user_id=user.id,
        event_type=AuditEventType.KILL_SWITCH_ACTIVATED,
        entity_type="strategy",
        entity_id=strategy.id,
        before_state={"status": before_status},
        after_state={"status": strategy.status.value},
        justification=reason,
    )
    await session.commit()
    await session.refresh(strategy)
    await GraphSyncService().sync_strategy_node(session, strategy)
    return strategy
