"""Failure service: create failure records (via the active→failed hook), tenant-scoped
clustering, and monitoring of active strategies."""

from __future__ import annotations

import uuid

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.metrics import failures_detected_total
from app.db.session import get_system_session, get_tenant_session
from app.failure import clustering, detection
from app.graph.sync_service import GraphSyncService
from app.models.audit_log import AuditEventType
from app.models.failure import Failure, FailureTrigger
from app.models.market_data import MarketData
from app.models.notification import NotificationType
from app.models.strategy import Strategy, StrategyStatus
from app.rbac.catalog import P
from app.services.audit import write_audit_log
from app.services.notification import notify_creator_and_permission
from app.services.strategy import _load_backtest_frames
from app.strategy.lifecycle import assert_transition_legal
from app.ws import events as ws_events


def _strategy_dict(strategy: Strategy) -> dict:
    return {
        "entry_rules": strategy.entry_rules,
        "exit_rules": strategy.exit_rules,
        "risk_constraints": strategy.risk_constraints,
    }


# --------------------------------------------------------------------------- #
# Persistence + clustering (session-injected so they are hermetically testable)
# --------------------------------------------------------------------------- #
async def persist_failure(
    session: AsyncSession,
    *,
    strategy: Strategy,
    assessment: detection.FailureAssessment,
    manual_reason: str | None = None,
    actor_user_id: uuid.UUID | None = None,
    symbol: str | None = None,
) -> Failure:
    """Create a Failure and flip the strategy to failed via the active→failed hook."""
    # Only an ACTIVE strategy may fail — and only via the automatic (manual=False) hook.
    assert_transition_legal(strategy.status, StrategyStatus.FAILED, manual=False)

    before_status = strategy.status.value
    market_context = dict(assessment.market_context)
    if manual_reason is not None:
        market_context["manual_reason"] = manual_reason
    # Batch 25: record the instrument the failure was detected on, so the failure
    # timeline can overlay a failure on the right symbol instead of on every symbol.
    if symbol is not None:
        market_context["symbol"] = symbol

    failure = Failure(
        strategy_id=strategy.id,
        strategy_version=strategy.version,
        failure_timestamp=pd.Timestamp(assessment.failure_timestamp).to_pydatetime(),
        regime_at_failure=assessment.regime_at_failure,
        trigger_condition=assessment.trigger,
        performance_metrics_at_failure=assessment.performance_metrics,
        feature_attribution=assessment.feature_attribution,
        market_context_snapshot=market_context,
        related_failure_ids=[],
    )
    session.add(failure)
    strategy.status = StrategyStatus.FAILED
    await session.flush()
    await session.refresh(failure)
    await session.refresh(strategy)

    graph = GraphSyncService()
    await graph.sync_strategy_node(session, strategy)
    await graph.sync_failure_node(session, failure)

    # Batch 12: notify the strategy's creator (if any) + governance-role users —
    # a failure is relevant to whoever owns the strategy and to risk oversight,
    # regardless of which of the four trigger paths detected it.
    await notify_creator_and_permission(
        session,
        organization_id=strategy.organization_id,
        creator_user_id=strategy.created_by_user_id,
        permission=P.NOTIFY_FAILURE_ALERTS,
        type=NotificationType.FAILURE_DETECTED,
        message=(
            f"Strategy '{strategy.name}' failed ({assessment.trigger.value}) "
            f"in the {assessment.regime_at_failure} regime."
        ),
        link=f"/admin/failures?strategy_id={strategy.id}",
    )

    # Only the manual trigger (Batch 6's /strategies/{id}/fail) is a human-initiated,
    # audit-worthy action — the automatic monitor sweep is system behavior, not an
    # actor decision, so it intentionally does not write an audit_log entry.
    if manual_reason is not None:
        await write_audit_log(
            session,
            organization_id=strategy.organization_id,
            actor_user_id=actor_user_id,
            event_type=AuditEventType.STRATEGY_STATUS_CHANGE,
            entity_type="strategy",
            entity_id=strategy.id,
            entity_name=strategy.name,
            before_state={"status": before_status},
            after_state={"status": strategy.status.value},
            justification=manual_reason,
        )
    failures_detected_total.labels(trigger_condition=assessment.trigger.value).inc()

    # Batch 19: realtime failure alert. This is the single choke point through which
    # every failure is created (automatic monitor sweep and the manual /fail trigger
    # both land here), so one publish covers all paths. Awaited, not fire-and-forget:
    # the publish only touches Redis (never a socket), returns immediately, and
    # already swallows its own errors — so it cannot fail the failure creation, and
    # awaiting it keeps the automatic path (a sync Celery task via asyncio.run)
    # correct without a dangling task.
    await ws_events.publish_failure_alert(
        org_id=str(strategy.organization_id),
        failure_id=str(failure.id),
        strategy_name=strategy.name,
        strategy_id=str(strategy.id),
        trigger=assessment.trigger.value,
    )
    return failure


async def cluster_failures(
    session: AsyncSession, *, organization_id: uuid.UUID, target_failure_id: uuid.UUID
) -> list[str]:
    """Link ``target_failure`` to similar failures IN THE SAME ORG (bidirectionally).

    The session is bound to ``organization_id``, so the SELECT auto-scopes — it is
    structurally impossible to load or link another tenant's failures.
    """
    rows = (await session.execute(select(Failure))).scalars().all()
    by_id = {str(f.id): f for f in rows}
    target = by_id.get(str(target_failure_id))
    if target is None:
        return []

    def _summary(f: Failure) -> dict:
        return {
            "id": str(f.id),
            "regime_at_failure": f.regime_at_failure,
            "trigger_condition": f.trigger_condition.value,
            "feature_attribution": f.feature_attribution,
        }

    others = [_summary(f) for f in rows if str(f.id) != str(target_failure_id)]
    related = clustering.find_related(_summary(target), others)

    target.related_failure_ids = related
    # Bidirectional: add the target to each linked failure's list.
    for other_id in related:
        other = by_id[other_id]
        current = list(other.related_failure_ids or [])
        if str(target_failure_id) not in current:
            other.related_failure_ids = current + [str(target_failure_id)]
    await session.commit()
    return related


# --------------------------------------------------------------------------- #
# Monitoring (opens its own tenant session; invoked by Celery tasks)
# --------------------------------------------------------------------------- #
async def monitor_and_fail(
    organization_id: uuid.UUID,
    strategy_id: uuid.UUID,
    symbol: str,
    *,
    force_trigger: FailureTrigger | None = None,
    manual_reason: str | None = None,
    actor_user_id: uuid.UUID | None = None,
) -> str | None:
    """Assess one active strategy against ``symbol``; on a trigger, record the failure."""
    symbol = symbol.strip().upper()
    async with get_tenant_session(organization_id) as session:
        strategy = (
            await session.execute(select(Strategy).where(Strategy.id == strategy_id))
        ).scalar_one_or_none()
        if strategy is None or strategy.status != StrategyStatus.ACTIVE:
            return None
        feature_df, regime_df = await _load_backtest_frames(session, symbol)
        if feature_df.empty:
            return None

        assessment = detection.assess(
            _strategy_dict(strategy),
            strategy.regime_compatibility,
            feature_df,
            regime_df,
            force_trigger=force_trigger,
        )
        if assessment is None:
            return None
        failure = await persist_failure(
            session,
            strategy=strategy,
            assessment=assessment,
            manual_reason=manual_reason,
            actor_user_id=actor_user_id,
            symbol=symbol,
        )
        await session.commit()
        return str(failure.id)


async def run_clustering(organization_id: uuid.UUID, failure_id: uuid.UUID) -> list[str]:
    async with get_tenant_session(organization_id) as session:
        return await cluster_failures(
            session, organization_id=organization_id, target_failure_id=failure_id
        )


async def monitor_symbol(organization_id: uuid.UUID, symbol: str) -> list[str]:
    """Monitor the org's ACTIVE strategies that trade ``symbol`` (chained off ingestion).

    A strategy is only ever judged against its OWN symbol (``Strategy.symbol``, Batch 26
    Part B). Judging it against whichever symbol happened to be ingested failed
    strategies on an unrelated instrument's regime — see docs/PLATFORM_STATE.md.
    """
    async with get_tenant_session(organization_id) as session:
        active = (
            await session.execute(
                select(Strategy.id).where(
                    Strategy.status == StrategyStatus.ACTIVE,
                    func.upper(Strategy.symbol) == symbol.strip().upper(),
                )
            )
        ).scalars().all()
    created: list[str] = []
    for sid in active:
        failure_id = await monitor_and_fail(organization_id, sid, symbol)
        if failure_id:
            created.append(failure_id)
    return created


async def monitor_sweep() -> list[tuple[str, str]]:
    """Daily sweep: every active strategy against ITS OWN symbol (where its org has data).

    Previously this crossed every active strategy with every symbol the org held data
    for (523 for the demo org), failing strategies on unrelated instruments' regimes.
    A strategy with no symbol cannot be monitored and is skipped.
    """
    async with get_system_session() as session:
        pairs = (
            await session.execute(
                select(Strategy.organization_id, Strategy.id, MarketData.symbol)
                .join(
                    MarketData,
                    (MarketData.organization_id == Strategy.organization_id)
                    & (func.upper(MarketData.symbol) == func.upper(Strategy.symbol)),
                )
                .where(Strategy.status == StrategyStatus.ACTIVE)
                .distinct()
            )
        ).all()
    results: list[tuple[str, str]] = []
    for org_id, sid, symbol in pairs:
        failure_id = await monitor_and_fail(org_id, sid, symbol)
        if failure_id:
            results.append((str(org_id), failure_id))  # (organization_id, failure_id)
    return results
