"""Research-signals endpoints (Batch 26 Part B).

Gated on ``signals.view``. Returns the org's genuinely-Active strategies with their
current, deterministically-computed Buy/Sell/Hold signal. Signals are private research
output per organization — the tenant session scopes every read/write, and the realtime
``strategy_signal`` event is org-scoped (see app/ws/events.py).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_tenant_db, require_permission
from app.models.user import User
from app.rbac.catalog import P
from app.schemas.signal import SignalItem, SignalListResponse
from app.services import signals as signals_service

router = APIRouter(prefix="/signals", tags=["signals"])


@router.get("", response_model=SignalListResponse)
async def list_signals(
    current_user: User = Depends(require_permission(P.SIGNALS_VIEW)),
    db: AsyncSession = Depends(get_tenant_db),
) -> SignalListResponse:
    """Current signal for each genuinely-Active strategy in the caller's organization.

    Evaluation is deterministic (real DSL + position replay) and persisted on change;
    broadcasting is left to the periodic sweep, so a read never emits a WS event.
    """
    strategies = await signals_service.active_strategies(db, current_user.organization_id)
    items: list[SignalItem] = []
    for strategy in strategies:
        outcome = await signals_service.evaluate_strategy_signal(
            db, strategy, persist=True, publish=False
        )
        if outcome is None:
            items.append(
                SignalItem(
                    strategy_id=strategy.id,
                    strategy_name=strategy.name,
                    symbol=strategy.symbol,
                    signal_type=None,
                    robustness_score=strategy.robustness_score,
                    regime_at_signal=None,
                    evaluated_at=None,
                    last_evaluated_at=None,
                    unavailable_reason=(
                        "No market data available for this symbol yet."
                        if strategy.symbol
                        else "This strategy has no symbol set."
                    ),
                )
            )
            continue
        row = await signals_service.current_signal_row(db, strategy.id)
        items.append(
            SignalItem(
                strategy_id=strategy.id,
                strategy_name=strategy.name,
                symbol=outcome.symbol,
                signal_type=outcome.signal_type,
                robustness_score=outcome.robustness_score_at_signal,
                regime_at_signal=outcome.regime_at_signal,
                evaluated_at=row.evaluated_at if row else None,
                last_evaluated_at=row.last_evaluated_at if row else None,
                rule_snapshot=outcome.rule_snapshot,
            )
        )
    return SignalListResponse(count=len(items), items=items)
