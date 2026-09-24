"""Deterministic Buy/Sell/Hold signal generation (Batch 26 Part B).

A signal is 100% deterministic rule evaluation over a strategy's own validated rules —
never a model output and never a prediction. It answers "what does THIS strategy say
about ITS symbol on the latest bar", not anything about a viewing user's holdings.

Design, per the batch spec:
  * A signal is generated ONLY for a strategy that is genuinely Active per the
    ADR-0008-corrected activation gate — queried through the SAME helpers the
    activation endpoint uses (``_validated_version`` / ``_has_approve_record`` +
    ``lifecycle.assert_activatable``), never a parallel "good enough" check.
  * Evaluation uses the REAL DSL (``app.strategy.dsl.generate_signals``) — no second
    engine.
  * HOLD is derived by REPLAYING position state the way vectorbt does during a
    backtest: walk the symbol's bars, entering only when flat and an entry event
    fires, exiting only when in a position and an exit event fires. The latest bar's
    event on top of that replayed state is the signal (enter→BUY, exit→SELL,
    none→HOLD). "No event today" is not blindly HOLD — the replay tells us whether we
    are currently flat or holding.
  * No position sizing, share counts, dollar amounts, or per-user personalization.

ARCHITECTURAL LLM ISOLATION: this module must have ZERO import path — direct or
transitive — to the LLM layer (``app.llm``). Enforced at test time by
``tests/test_signal_service_no_llm_import.py`` using the same import-graph mechanism as
Safeguard 2. Do not add an ``app.llm`` import here. (This replaces any reliance on the
price-prediction regex guard, which only inspects user-typed input.)
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_system_session, get_tenant_session
from app.db.tenant import mark_session_unscoped
from app.models.audit_log import AuditEventType
from app.models.organization import Organization, OrganizationStatus
from app.models.strategy import Strategy, StrategyStatus
from app.models.strategy_signal import SignalType, StrategySignal
from app.services.audit import write_audit_log

# Reused from the strategy service — the SAME gate evidence + data loading the
# activation and backtest paths use. app.services.strategy has no LLM import path
# (verified), so importing it keeps this module LLM-isolated.
from app.services.strategy import (
    _has_approve_record,
    _load_backtest_frames,
    _validated_version,
)
from app.strategy import lifecycle
from app.strategy.dsl import generate_signals
from app.ws import events as ws_events

_EVENT_TO_SIGNAL = {"enter": SignalType.BUY, "exit": SignalType.SELL, "none": SignalType.HOLD}


@dataclass(frozen=True)
class SignalOutcome:
    strategy_id: uuid.UUID
    symbol: str
    signal_type: SignalType
    regime_at_signal: str | None
    rule_snapshot: dict
    robustness_score_at_signal: float | None
    in_position: bool
    changed: bool  # True when a new row was persisted (the signal type changed)


# --------------------------------------------------------------------------- #
# The activation gate (reused, not re-implemented)
# --------------------------------------------------------------------------- #
async def is_genuinely_active(session: AsyncSession, strategy: Strategy) -> bool:
    """True only when ``strategy`` is ACTIVE *and* still satisfies the ADR-0008 gate
    (a validation result for its current version, robustness >= 0.70, an approve
    record). Re-checks the evidence rather than trusting the status flag alone."""
    if strategy.status != StrategyStatus.ACTIVE:
        return False
    try:
        lifecycle.assert_activatable(
            strategy,
            has_approval=await _has_approve_record(session, strategy.id),
            validated_version=await _validated_version(session, strategy.id),
        )
    except lifecycle.ActivationGateNotMet:
        return False
    return True


# --------------------------------------------------------------------------- #
# Position replay + latest-bar event (pure, deterministic)
# --------------------------------------------------------------------------- #
def replay_position_and_event(
    entry_rules: dict, exit_rules: dict, feature_df: pd.DataFrame
) -> tuple[bool, str]:
    """Replay position state across ``feature_df`` and return
    ``(in_position_after_last_bar, latest_bar_event)`` where event ∈ {enter, exit, none}.

    Mirrors ``vectorbt.Portfolio.from_signals`` default semantics: an entry only enters
    from flat; an exit only exits from a position. Uses the real DSL signal arrays, so
    it stays identical to what the backtest evaluated.
    """
    n = len(feature_df)
    if n == 0:
        return False, "none"
    entries = generate_signals(entry_rules or {}, feature_df)
    exits = generate_signals(exit_rules or {}, feature_df)
    in_pos = False
    event = "none"
    for i in range(n):
        event = "none"
        if not in_pos and entries[i]:
            in_pos = True
            event = "enter"
        elif in_pos and exits[i]:
            in_pos = False
            event = "exit"
    return in_pos, event


def _rule_snapshot(event: str, entry_rules: dict, exit_rules: dict, in_position: bool) -> dict:
    if event == "enter":
        return {"event": "entry", "rule": entry_rules or {}}
    if event == "exit":
        return {"event": "exit", "rule": exit_rules or {}}
    return {"event": "none", "note": "no change", "in_position": in_position}


def _latest_regime(regime_df: pd.DataFrame) -> str | None:
    if regime_df is None or regime_df.empty or "regime_label" not in regime_df.columns:
        return None
    if "timestamp" in regime_df.columns:
        regime_df = regime_df.sort_values("timestamp")
    return str(regime_df["regime_label"].iloc[-1])


# --------------------------------------------------------------------------- #
# Evaluate one strategy
# --------------------------------------------------------------------------- #
async def evaluate_strategy_signal(
    session: AsyncSession,
    strategy: Strategy,
    *,
    persist: bool = True,
    publish: bool = True,
) -> SignalOutcome | None:
    """Compute (and, by default, persist + broadcast) the current signal for one
    strategy. Returns None when the strategy is not genuinely Active or has no bars to
    evaluate — never a fabricated signal."""
    if not await is_genuinely_active(session, strategy):
        return None
    if not strategy.symbol:
        # An Active strategy with no symbol cannot be evaluated (no bars to read).
        return None

    feature_df, regime_df = await _load_backtest_frames(session, strategy.symbol)
    if feature_df is None or feature_df.empty:
        return None

    in_position, event = replay_position_and_event(
        strategy.entry_rules, strategy.exit_rules, feature_df
    )
    signal_type = _EVENT_TO_SIGNAL[event]
    outcome = SignalOutcome(
        strategy_id=strategy.id,
        symbol=strategy.symbol,
        signal_type=signal_type,
        regime_at_signal=_latest_regime(regime_df),
        rule_snapshot=_rule_snapshot(event, strategy.entry_rules, strategy.exit_rules, in_position),
        # ADR-0008: the validated composite, never backtest_robustness.
        robustness_score_at_signal=strategy.robustness_score,
        in_position=in_position,
        changed=False,
    )
    if persist:
        outcome = await _persist_if_changed(session, strategy, outcome, publish=publish)
    return outcome


async def current_signal_row(session: AsyncSession, strategy_id: uuid.UUID) -> StrategySignal | None:
    """The strategy's current signal row (its most recent), or None if never evaluated."""
    return await _last_signal(session, strategy_id)


async def _last_signal(session: AsyncSession, strategy_id: uuid.UUID) -> StrategySignal | None:
    return (
        await session.execute(
            select(StrategySignal)
            .where(StrategySignal.strategy_id == strategy_id)
            .order_by(StrategySignal.evaluated_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _persist_if_changed(
    session: AsyncSession, strategy: Strategy, outcome: SignalOutcome, *, publish: bool
) -> SignalOutcome:
    now = datetime.now(UTC)
    last = await _last_signal(session, strategy.id)
    if last is not None and last.signal_type == outcome.signal_type:
        # Same signal — only bump the freshness timestamp on the current row.
        last.last_evaluated_at = now
        await session.commit()
        return outcome

    row = StrategySignal(
        organization_id=strategy.organization_id,
        strategy_id=strategy.id,
        symbol=outcome.symbol,
        signal_type=outcome.signal_type,
        evaluated_at=now,
        last_evaluated_at=now,
        regime_at_signal=outcome.regime_at_signal,
        rule_snapshot=outcome.rule_snapshot,
        robustness_score_at_signal=outcome.robustness_score_at_signal,
    )
    session.add(row)
    await write_audit_log(
        session,
        organization_id=strategy.organization_id,
        actor=None,  # system-generated (deterministic rule evaluation)
        event_type=AuditEventType.SIGNAL_GENERATED,
        entity_type="strategy",
        entity_id=strategy.id,
        entity_name=strategy.name,
        after_state={
            "signal_type": outcome.signal_type.value,
            "symbol": outcome.symbol,
            "regime": outcome.regime_at_signal,
            "robustness_score": outcome.robustness_score_at_signal,
        },
        description=(
            f"Signal for {outcome.symbol} changed to {outcome.signal_type.value} "
            f"(regime {outcome.regime_at_signal or 'n/a'})"
        ),
    )
    await session.commit()
    if publish:
        await ws_events.publish_strategy_signal(
            org_id=str(strategy.organization_id),
            strategy_id=str(strategy.id),
            strategy_name=strategy.name,
            symbol=outcome.symbol,
            signal_type=outcome.signal_type.value,
            regime=outcome.regime_at_signal,
            robustness_score=outcome.robustness_score_at_signal,
        )
    return SignalOutcome(**{**outcome.__dict__, "changed": True})


# --------------------------------------------------------------------------- #
# Evaluate every genuinely-Active strategy in one org (the periodic sweep + API)
# --------------------------------------------------------------------------- #
async def active_strategies(session: AsyncSession, organization_id: uuid.UUID) -> list[Strategy]:
    """Every strategy of ``organization_id`` that is genuinely Active per the gate."""
    rows = (
        await session.execute(
            select(Strategy)
            .where(Strategy.organization_id == organization_id)
            .where(Strategy.status == StrategyStatus.ACTIVE)
            .order_by(Strategy.created_at.asc())
        )
    ).scalars().all()
    out = []
    for s in rows:
        if await is_genuinely_active(session, s):
            out.append(s)
    return out


async def evaluate_org_signals(
    session: AsyncSession, organization_id: uuid.UUID, *, persist: bool = True, publish: bool = True
) -> list[SignalOutcome]:
    outcomes: list[SignalOutcome] = []
    for strategy in await active_strategies(session, organization_id):
        outcome = await evaluate_strategy_signal(session, strategy, persist=persist, publish=publish)
        if outcome is not None:
            outcomes.append(outcome)
    return outcomes


# --------------------------------------------------------------------------- #
# Periodic sweep (Celery beat) — evaluate every active org
# --------------------------------------------------------------------------- #
async def _active_org_ids() -> list[uuid.UUID]:
    async with get_system_session() as s:
        mark_session_unscoped(s.sync_session)
        rows = (
            await s.execute(
                select(Organization.id).where(Organization.status == OrganizationStatus.ACTIVE)
            )
        ).scalars().all()
    return list(rows)


async def refresh_all_active_org_signals() -> dict:
    """Re-evaluate signals for every genuinely-Active strategy in every active org,
    persisting + broadcasting on change. Each org gets its own tenant-scoped session so
    a signal is never written or published outside its owning organization.

    The realtime client is recreated per event loop (app/clients/redis_client.py's
    Batch 25 fix), so this Celery-task loop publishes ``strategy_signal`` events
    reliably — it does not cache a Redis client across tasks.
    """
    changed = 0
    evaluated = 0
    org_ids = await _active_org_ids()
    for org_id in org_ids:
        async with get_tenant_session(org_id) as session:
            for outcome in await evaluate_org_signals(session, org_id, persist=True, publish=True):
                evaluated += 1
                if outcome.changed:
                    changed += 1
    return {"orgs": len(org_ids), "evaluated": evaluated, "changed": changed}
