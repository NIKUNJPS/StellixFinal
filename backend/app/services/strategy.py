"""Strategy service: create/version/update, lifecycle transitions, and backtest run."""

from __future__ import annotations

import uuid

import pandas as pd
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.metrics import strategies_created_total, validations_run_total
from app.db.session import get_tenant_session
from app.features.engineering import FEATURE_COLUMNS
from app.graph.sync_service import GraphSyncService
from app.models.approval_record import ApprovalAction, ApprovalRecord
from app.models.audit_log import AuditEventType
from app.models.feature_matrix import FeatureMatrix
from app.models.market_data import MarketData
from app.models.notification import NotificationType
from app.models.organization import Organization
from app.models.performance_snapshot import AGGREGATE_LABEL, PerformanceSnapshot
from app.models.regime_label import RegimeLabelRecord
from app.models.strategy import Strategy, StrategyCreator, StrategyStatus
from app.models.strategy_version import StrategyVersion
from app.models.user import User, UserRole
from app.services.audit import write_audit_log
from app.services.notification import notify_users_with_roles
from app.strategy import lifecycle
from app.ws import events as ws_events

_TUNABLE_KEYS = ("parameters", "entry_rules", "exit_rules", "risk_constraints")


def _fire(coro) -> None:
    """Schedule a best-effort realtime publish without awaiting it.

    Batch 19: strategy transitions run inside the async API process, so a
    fire-and-forget task is the right shape here (Celery-side publishers use
    asyncio.run instead — different execution context). The publish itself never
    raises (app/ws/events.py swallows Redis errors), so the only thing this guards
    against is the task being GC'd before it runs: the reference is dropped
    deliberately because the realtime notification is disposable — the state change
    is already committed to Postgres before we get here.
    """
    import asyncio

    asyncio.create_task(coro)


class StrategyLimitError(Exception):
    http_status = 403


def bump_version(version: str) -> str:
    try:
        major, minor = version.lstrip("v").split(".")
        return f"v{int(major)}.{int(minor) + 1}"
    except Exception:
        return "v1.1"


def _snapshot(strategy: Strategy) -> dict:
    return {
        "parameters": strategy.parameters,
        "entry_rules": strategy.entry_rules,
        "exit_rules": strategy.exit_rules,
        "risk_constraints": strategy.risk_constraints,
    }


async def _has_approve_record(session: AsyncSession, strategy_id: uuid.UUID) -> bool:
    row = (
        await session.execute(
            select(ApprovalRecord.id)
            .where(ApprovalRecord.strategy_id == strategy_id)
            .where(ApprovalRecord.action == ApprovalAction.APPROVE)
            .limit(1)
        )
    ).first()
    return row is not None


async def maybe_notify_approval_requested(session: AsyncSession, strategy: Strategy) -> None:
    """Batch 12: fire once a strategy becomes eligible for the Batch 10 approval
    queue — status==CANDIDATE and robustness_score crossing the gate threshold.
    Called from every place that writes robustness_score (run_backtest,
    run_strategy_validation, and evolution's candidate registration), since
    whichever one runs SECOND is what actually makes a strategy eligible; the
    dedupe guard means touching the same strategy from multiple call sites
    doesn't spam the same recipients twice."""
    if strategy.status != StrategyStatus.CANDIDATE:
        return
    if strategy.robustness_score is None or strategy.robustness_score < lifecycle.ROBUSTNESS_THRESHOLD:
        return
    await notify_users_with_roles(
        session,
        organization_id=strategy.organization_id,
        roles=lifecycle.APPROVAL_ROLES,
        type=NotificationType.APPROVAL_REQUESTED,
        message=(
            f"Strategy '{strategy.name}' is ready for approval "
            f"(robustness score {strategy.robustness_score:.2f})."
        ),
        link=f"/admin/strategies/{strategy.id}",
        dedupe=True,
    )


# --------------------------------------------------------------------------- #
# Create / update / versioning
# --------------------------------------------------------------------------- #
async def create_strategy(
    session: AsyncSession, *, organization: Organization, user: User, data: dict
) -> Strategy:
    # Enforce the org tier's strategy cap (non-retired strategies).
    if organization.max_strategies is not None:
        count = await session.scalar(
            select(func.count())
            .select_from(Strategy)
            .where(Strategy.status != StrategyStatus.RETIRED)
        )
        if count is not None and count >= organization.max_strategies:
            raise StrategyLimitError(
                f"Strategy cap reached ({organization.max_strategies}); retire one or upgrade the plan."
            )

    creator = StrategyCreator(data.get("creator", "human"))
    strategy = Strategy(
        name=data["name"],
        description=data.get("description"),
        version="v1.0",
        creator=creator,
        created_by_user_id=user.id if creator == StrategyCreator.HUMAN else None,
        status=StrategyStatus.DRAFT,
        # Batch 9 (LLM Safeguard 3): derived from creator, never client-settable —
        # any `requires_review` key in `data` is ignored on purpose.
        requires_review=(creator == StrategyCreator.LLM_GENERATED),
        parameters=data.get("parameters") or {},
        entry_rules=data.get("entry_rules") or {},
        exit_rules=data.get("exit_rules") or {},
        risk_constraints=data.get("risk_constraints") or {},
        parent_strategy_id=data.get("parent_strategy_id"),
        inspired_by_note_id=data.get("inspired_by_note_id"),
    )
    session.add(strategy)
    await session.flush()

    session.add(
        StrategyVersion(
            strategy_id=strategy.id,
            version_number="v1.0",
            parameters_snapshot=_snapshot(strategy),
            change_reason="Initial version",
        )
    )
    await session.commit()
    await session.refresh(strategy)
    await GraphSyncService().sync_strategy_node(session, strategy)
    strategies_created_total.inc()
    return strategy


async def update_strategy(
    session: AsyncSession, *, strategy: Strategy, data: dict, change_reason: str | None
) -> Strategy:
    if "name" in data and data["name"] is not None:
        strategy.name = data["name"]
    if "description" in data:
        strategy.description = data["description"]

    tunable_changed = any(
        key in data and data[key] is not None and data[key] != getattr(strategy, key)
        for key in _TUNABLE_KEYS
    )
    for key in _TUNABLE_KEYS:
        if key in data and data[key] is not None:
            setattr(strategy, key, data[key])

    if tunable_changed:
        strategy.version = bump_version(strategy.version)
        # Editing rules/params invalidates any prior validation.
        if strategy.status in (StrategyStatus.CANDIDATE, StrategyStatus.ACTIVE):
            strategy.status = StrategyStatus.DRAFT
            strategy.robustness_score = None
            strategy.regime_compatibility = None
        session.add(
            StrategyVersion(
                strategy_id=strategy.id,
                version_number=strategy.version,
                parameters_snapshot=_snapshot(strategy),
                change_reason=change_reason or "Parameters/rules updated",
            )
        )
    await session.commit()
    await session.refresh(strategy)
    await GraphSyncService().sync_strategy_node(session, strategy)
    return strategy


# --------------------------------------------------------------------------- #
# Lifecycle transitions
# --------------------------------------------------------------------------- #
async def submit(session: AsyncSession, *, strategy: Strategy) -> Strategy:
    lifecycle.assert_transition_legal(strategy.status, StrategyStatus.CANDIDATE)
    lifecycle.assert_submittable(strategy)
    strategy.status = StrategyStatus.CANDIDATE
    await session.commit()
    await session.refresh(strategy)
    await GraphSyncService().sync_strategy_node(session, strategy)

    # Batch 19: a strategy reaching candidate is ready for review. Target the users
    # who can actually approve it (same role set the approval queue uses), so the
    # toast lands with the approvers rather than the whole org.
    approver_ids = (
        await session.execute(
            select(User.id)
            .where(User.role.in_(lifecycle.APPROVAL_ROLES))
            .where(User.is_active.is_(True))
        )
    ).scalars().all()
    _fire(
        ws_events.publish_approval_request(
            org_id=str(strategy.organization_id),
            strategy_id=str(strategy.id),
            strategy_name=strategy.name,
            requested_by_name=strategy.name,  # submit has no acting user; name the strategy
            robustness_score=strategy.robustness_score or 0.0,
            approver_user_ids=[str(u) for u in approver_ids],
        )
    )
    return strategy


async def approve(
    session: AsyncSession,
    *,
    strategy: Strategy,
    user: User,
    action: ApprovalAction,
    justification: str,
) -> Strategy:
    # Batch 10 RBAC audit fix: compliance_officer must also be able to approve/reject
    # (the Governance Panel's approval queue is restricted to ComplianceOfficer/Admin
    # and reuses this exact function) — was GOVERNANCE_ROLES (excluded compliance_officer).
    if user.role not in lifecycle.APPROVAL_ROLES:
        raise lifecycle.PermissionDenied(
            "Only risk_manager, cio, compliance_officer, or admin may approve"
        )
    if not justification or not justification.strip():
        raise lifecycle.ReasonRequired("A justification is required")

    before_status = strategy.status.value
    session.add(
        ApprovalRecord(
            strategy_id=strategy.id,
            approved_by_user_id=user.id,
            action=action,
            justification=justification,
        )
    )
    await session.flush()

    if action == ApprovalAction.APPROVE:
        lifecycle.assert_transition_legal(strategy.status, StrategyStatus.ACTIVE)
        lifecycle.assert_activatable(
            strategy, has_approval=await _has_approve_record(session, strategy.id)
        )
        strategy.status = StrategyStatus.ACTIVE
    # A GA-engine-produced candidate is an evolution decision regardless of which
    # endpoint the caller used, so the event type reflects the strategy's origin.
    if action == ApprovalAction.APPROVE:
        event_type = (
            AuditEventType.EVOLUTION_CANDIDATE_APPROVED
            if strategy.creator == StrategyCreator.GA_ENGINE
            else AuditEventType.STRATEGY_APPROVED
        )
    else:
        event_type = AuditEventType.STRATEGY_REJECTED
    await write_audit_log(
        session,
        organization_id=strategy.organization_id,
        actor_user_id=user.id,
        event_type=event_type,
        entity_type="strategy",
        entity_id=strategy.id,
        before_state={"status": before_status},
        after_state={"status": strategy.status.value},
        justification=justification,
    )
    await session.commit()
    await session.refresh(strategy)
    await GraphSyncService().sync_strategy_node(session, strategy)

    if action == ApprovalAction.APPROVE:
        _fire(
            ws_events.publish_strategy_status_change(
                org_id=str(strategy.organization_id),
                strategy_id=str(strategy.id),
                strategy_name=strategy.name,
                old_status=before_status,
                new_status=strategy.status.value,
                changed_by_name=user.full_name or user.email,
            )
        )
    return strategy


async def retire(
    session: AsyncSession, *, strategy: Strategy, user: User, reason: str
) -> Strategy:
    lifecycle.assert_transition_legal(strategy.status, StrategyStatus.RETIRED)
    lifecycle.assert_retire_permitted(
        strategy, role=user.role, reason=reason, is_admin=(user.role == UserRole.ADMIN)
    )
    before_status = strategy.status.value
    strategy.status = StrategyStatus.RETIRED
    await write_audit_log(
        session,
        organization_id=strategy.organization_id,
        actor_user_id=user.id,
        event_type=AuditEventType.STRATEGY_STATUS_CHANGE,
        entity_type="strategy",
        entity_id=strategy.id,
        before_state={"status": before_status},
        after_state={"status": strategy.status.value},
        justification=reason,
    )
    await session.commit()
    await session.refresh(strategy)
    await GraphSyncService().sync_strategy_node(session, strategy)

    _fire(
        ws_events.publish_strategy_status_change(
            org_id=str(strategy.organization_id),
            strategy_id=str(strategy.id),
            strategy_name=strategy.name,
            old_status=before_status,
            new_status=strategy.status.value,
            changed_by_name=user.full_name or user.email,
        )
    )
    return strategy


async def transition(
    session: AsyncSession,
    *,
    strategy: Strategy,
    target: StrategyStatus,
    user: User,
    reason: str | None,
) -> Strategy:
    """Generic transition endpoint entry point — enforces the full lifecycle map."""
    lifecycle.assert_transition_legal(strategy.status, target)
    if target == StrategyStatus.CANDIDATE:
        lifecycle.assert_submittable(strategy)
    elif target == StrategyStatus.ACTIVE:
        # Batch 10 RBAC audit fix: assert_activatable only checked that AN approval
        # record exists, never whether THIS caller is privileged — any authenticated
        # researcher could flip candidate->active via this generic endpoint as long
        # as someone else had approved it at some point. Now requires the same role
        # set as the dedicated /approve endpoint.
        if user.role not in lifecycle.APPROVAL_ROLES:
            raise lifecycle.PermissionDenied(
                "Only risk_manager, cio, compliance_officer, or admin may activate a strategy"
            )
        lifecycle.assert_activatable(
            strategy, has_approval=await _has_approve_record(session, strategy.id)
        )
    elif target == StrategyStatus.RETIRED:
        lifecycle.assert_retire_permitted(
            strategy, role=user.role, reason=reason, is_admin=(user.role == UserRole.ADMIN)
        )
    elif target == StrategyStatus.DRAFT:
        strategy.robustness_score = None
        strategy.regime_compatibility = None
    before_status = strategy.status.value
    strategy.status = target
    await write_audit_log(
        session,
        organization_id=strategy.organization_id,
        actor_user_id=user.id,
        event_type=AuditEventType.STRATEGY_STATUS_CHANGE,
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


# --------------------------------------------------------------------------- #
# Backtest orchestration (invoked by the Celery task)
# --------------------------------------------------------------------------- #
async def _load_backtest_frames(
    session: AsyncSession, symbol: str
) -> tuple[pd.DataFrame, pd.DataFrame]:
    fm_rows = (
        await session.execute(
            select(FeatureMatrix).where(FeatureMatrix.symbol == symbol).order_by(FeatureMatrix.timestamp)
        )
    ).scalars().all()
    md_rows = (
        await session.execute(
            select(MarketData).where(MarketData.symbol == symbol).order_by(MarketData.timestamp)
        )
    ).scalars().all()
    close_by_ts = {r.timestamp: r.close for r in md_rows}

    records = []
    for r in fm_rows:
        rec = {"timestamp": pd.Timestamp(r.timestamp), "close": close_by_ts.get(r.timestamp)}
        for col in FEATURE_COLUMNS:
            rec[col] = getattr(r, col)
        records.append(rec)
    feature_df = pd.DataFrame.from_records(records)
    if not feature_df.empty:
        feature_df = feature_df.set_index("timestamp")

    rg_rows = (
        await session.execute(
            select(RegimeLabelRecord).where(RegimeLabelRecord.symbol == symbol).order_by(RegimeLabelRecord.timestamp)
        )
    ).scalars().all()
    regime_df = pd.DataFrame(
        {
            "timestamp": [pd.Timestamp(r.timestamp) for r in rg_rows],
            "regime_label": [r.regime_label.value for r in rg_rows],
        }
    )
    return feature_df, regime_df


async def _load_benchmark_close(session: AsyncSession, symbol: str) -> pd.Series:
    """Batch 12: the benchmark symbol's own close-price series, for Beta. Empty
    (not an error) when the benchmark hasn't been ingested — compute_beta()
    treats an empty/missing series as "no Beta available", not a failure."""
    rows = (
        await session.execute(
            select(MarketData).where(MarketData.symbol == symbol).order_by(MarketData.timestamp)
        )
    ).scalars().all()
    if not rows:
        return pd.Series(dtype=float)
    return pd.Series(
        [r.close for r in rows], index=[pd.Timestamp(r.timestamp) for r in rows], dtype=float
    )


async def run_backtest(organization_id: uuid.UUID, strategy_id: uuid.UUID, symbol: str) -> dict:
    """Load data, run the regime-aware backtest, persist snapshots, update the strategy."""
    from app.models.trade_record import TradeRecord
    from app.services.backtest_cache import record_backtest_charts
    from app.strategy.backtest import run_regime_aware_backtest  # heavy import (vectorbt)

    symbol = symbol.strip().upper()
    async with get_tenant_session(organization_id) as session:
        strategy = (
            await session.execute(select(Strategy).where(Strategy.id == strategy_id))
        ).scalar_one()
        organization = (
            await session.execute(select(Organization).where(Organization.id == organization_id))
        ).scalar_one()
        feature_df, regime_df = await _load_backtest_frames(session, symbol)
        if feature_df.empty:
            raise ValueError(f"No feature data for {symbol}; ingest it first")
        benchmark_close = await _load_benchmark_close(session, organization.benchmark_symbol)

        result = run_regime_aware_backtest(
            {
                "entry_rules": strategy.entry_rules,
                "exit_rules": strategy.exit_rules,
                "risk_constraints": strategy.risk_constraints,
            },
            feature_df,
            regime_df,
            benchmark_close=benchmark_close,
        )

        # Replace prior snapshots + trade records for this strategy.
        await session.execute(
            delete(PerformanceSnapshot)
            .where(PerformanceSnapshot.organization_id == organization_id)
            .where(PerformanceSnapshot.strategy_id == strategy_id)
        )
        await session.execute(
            delete(TradeRecord)
            .where(TradeRecord.organization_id == organization_id)
            .where(TradeRecord.strategy_id == strategy_id)
        )

        rows = list(result.per_regime.items()) + [(AGGREGATE_LABEL, result.aggregate)]
        snapshots: list[PerformanceSnapshot] = []
        for label, metrics in rows:
            snapshot = PerformanceSnapshot(
                strategy_id=strategy_id,
                regime_label=label,
                sharpe_ratio=metrics["sharpe_ratio"],
                sortino_ratio=metrics["sortino_ratio"],
                max_drawdown=metrics["max_drawdown"],
                win_rate=metrics["win_rate"],
                profit_factor=metrics["profit_factor"],
                calmar_ratio=metrics["calmar_ratio"],
                trade_count=metrics["trade_count"],
                # Beta/annualized_return/volatility are aggregate-only (per-bar
                # returns, not per-regime trade returns).
                beta_vs_benchmark=result.beta_vs_benchmark if label == AGGREGATE_LABEL else None,
                annualized_return=result.annualized_return if label == AGGREGATE_LABEL else None,
                volatility=result.volatility if label == AGGREGATE_LABEL else None,
                period_start=result.period_start,
                period_end=result.period_end,
            )
            session.add(snapshot)
            await session.flush()
            snapshots.append(snapshot)

        for trade in result.trades.to_dict("records"):
            # NOTE: dict access, not itertuples() — "return" is a Python keyword,
            # and itertuples() silently renames such columns to positional "_N"
            # names rather than raising, which would have made this a quiet
            # AttributeError instead of an obvious one.
            session.add(
                TradeRecord(
                    strategy_id=strategy_id,
                    entry_timestamp=pd.Timestamp(trade["entry_timestamp"]).to_pydatetime(),
                    exit_timestamp=pd.Timestamp(trade["exit_timestamp"]).to_pydatetime(),
                    direction=trade["direction"],
                    entry_price=float(trade["entry_price"]),
                    exit_price=float(trade["exit_price"]),
                    pnl=float(trade["pnl"]),
                    return_pct=float(trade["return"]),
                    regime_at_entry=trade["regime"] if pd.notna(trade["regime"]) else None,
                )
            )

        strategy.robustness_score = result.robustness_score
        strategy.regime_compatibility = result.regime_compatibility
        await maybe_notify_approval_requested(session, strategy)
        await session.commit()
        await session.refresh(strategy)

        graph = GraphSyncService()
        await graph.sync_strategy_node(session, strategy)
        for snapshot in snapshots:
            await graph.sync_performance_node(session, snapshot)

    # Chart series for the Backtest Results page — Redis-cached (see
    # backtest_cache.py), not Postgres; overwritten on every re-run just like
    # the snapshots/trade-records deleted+reinserted above.
    await record_backtest_charts(
        strategy_id,
        equity_curve=result.equity_curve,
        drawdown_series=result.drawdown_series,
        rolling_sharpe=result.rolling_sharpe,
    )

    return {
        "strategy_id": str(strategy_id),
        "symbol": symbol,
        "robustness_score": result.robustness_score,
        "trade_count": result.aggregate.get("trade_count", 0),
        "regimes": list(result.per_regime.keys()),
    }


async def get_backtest_results(session: AsyncSession, *, strategy_id: uuid.UUID) -> dict:
    """Page 13 (Backtest Results, Batch 12): aggregate + per-regime metrics and
    the trade log (Postgres, durable — same source run_backtest() persists
    to), plus the 3 chart series (Redis, see backtest_cache.py — "never run
    yet" is a real, expected state here, not an error)."""
    from app.models.trade_record import TradeRecord
    from app.services.backtest_cache import get_backtest_charts

    snapshots = (
        await session.execute(
            select(PerformanceSnapshot)
            .where(PerformanceSnapshot.strategy_id == strategy_id)
            .order_by(PerformanceSnapshot.regime_label.asc())
        )
    ).scalars().all()
    aggregate = next((s for s in snapshots if s.regime_label == AGGREGATE_LABEL), None)
    per_regime = [s for s in snapshots if s.regime_label != AGGREGATE_LABEL]

    trades = (
        await session.execute(
            select(TradeRecord)
            .where(TradeRecord.strategy_id == strategy_id)
            .order_by(TradeRecord.entry_timestamp.asc())
        )
    ).scalars().all()

    charts = await get_backtest_charts(strategy_id)
    return {
        "strategy_id": strategy_id,
        "has_run": aggregate is not None,
        "aggregate": aggregate,
        "per_regime": per_regime,
        "trades": trades,
        "charts": charts,
    }


async def get_top_performers(session: AsyncSession, *, limit: int = 5) -> list[dict]:
    """Page 10 (Main Dashboard, Batch 12): top-N strategies by aggregate Sharpe,
    each with its cached equity curve, for the "top-5 overlay" chart. Skips a
    strategy that has never been backtested (no chart cache) rather than
    showing a broken/flat overlay line for it."""
    from app.services.backtest_cache import get_backtest_charts

    rows = (
        await session.execute(
            select(Strategy.id, Strategy.name, Strategy.robustness_score, PerformanceSnapshot.sharpe_ratio)
            .join(PerformanceSnapshot, PerformanceSnapshot.strategy_id == Strategy.id)
            .where(PerformanceSnapshot.regime_label == AGGREGATE_LABEL)
            .where(PerformanceSnapshot.sharpe_ratio.is_not(None))
            .order_by(PerformanceSnapshot.sharpe_ratio.desc())
            .limit(limit * 2)  # over-fetch: some may lack a (separately-cached) equity curve
        )
    ).all()

    items: list[dict] = []
    for strategy_id, name, robustness_score, sharpe_ratio in rows:
        charts = await get_backtest_charts(strategy_id)
        if charts is None:
            continue
        items.append(
            {
                "strategy_id": strategy_id,
                "name": name,
                "sharpe_ratio": sharpe_ratio,
                "robustness_score": robustness_score,
                "equity_curve": charts["equity_curve"],
            }
        )
        if len(items) >= limit:
            break
    return items


async def run_strategy_validation(
    organization_id: uuid.UUID, strategy_id: uuid.UUID, symbol: str
) -> dict:
    """Run the full 5-method validation suite; persist a ValidationResult and set the
    strategy's robustness_score to the composite (which gates candidate→active)."""
    from sqlalchemy import delete as sa_delete

    from app.core.config import settings
    from app.models.validation_result import ValidationResult
    from app.strategy.backtest import run_regime_aware_backtest
    from app.validation.engine import run_validation

    symbol = symbol.strip().upper()
    async with get_tenant_session(organization_id) as session:
        strategy = (
            await session.execute(select(Strategy).where(Strategy.id == strategy_id))
        ).scalar_one()
        organization = (
            await session.execute(
                select(Organization).where(Organization.id == organization_id)
            )
        ).scalar_one()
        feature_df, regime_df = await _load_backtest_frames(session, symbol)
        if feature_df.empty:
            raise ValueError(f"No feature data for {symbol}; ingest it first")

        strategy_dict = {
            "entry_rules": strategy.entry_rules,
            "exit_rules": strategy.exit_rules,
            "risk_constraints": strategy.risk_constraints,
        }
        full_backtest = run_regime_aware_backtest(strategy_dict, feature_df, regime_df)
        tolerance = (
            organization.risk_tolerance_max_drawdown_pct
            or settings.DEFAULT_RISK_TOLERANCE_MAX_DD_PCT
        ) / 100.0

        report = run_validation(
            strategy_dict,
            feature_df,
            regime_df,
            full_backtest,
            risk_tolerance=tolerance,
            n_folds=settings.VALIDATION_WALK_FORWARD_FOLDS,
            n_sims=settings.VALIDATION_MONTE_CARLO_SIMS,
            seed=settings.VALIDATION_RANDOM_SEED,
            alpha=settings.VALIDATION_PERSISTENCE_ALPHA,
        )

        await session.execute(
            sa_delete(ValidationResult)
            .where(ValidationResult.organization_id == organization_id)
            .where(ValidationResult.strategy_id == strategy_id)
        )
        session.add(
            ValidationResult(
                strategy_id=strategy_id,
                walk_forward_score=report.sub_scores["walk_forward"],
                regime_cv_score=report.sub_scores["regime_cv"],
                monte_carlo_score=report.sub_scores["monte_carlo"],
                persistence_score=report.sub_scores["persistence"],
                stress_test_score=report.sub_scores["stress_test"],
                composite_score=report.composite_score,
                classification=report.classification,
                method_details=report.method_details,
            )
        )
        # The validated composite becomes the gate score (Batch 4 candidate→active).
        strategy.robustness_score = report.composite_score
        strategy.regime_compatibility = full_backtest.regime_compatibility
        await maybe_notify_approval_requested(session, strategy)
        await session.commit()

    validations_run_total.inc()
    return {
        "strategy_id": str(strategy_id),
        "symbol": symbol,
        "composite_score": report.composite_score,
        "classification": report.classification.value,
    }
