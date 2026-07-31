"""Regime endpoints (Batch 3).

- POST /regimes/detect          manual re-run (enqueues the ensemble; never blocks)
- GET  /regimes/current?symbol  most recent regime object (incl. transition matrix)
- GET  /regimes/history?symbol  full labeled timeline for charting (tenant-scoped)
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_tenant_db
from app.core.logging import get_current_request_id
from app.models.regime_label import RegimeLabelRecord
from app.models.user import User
from app.schemas.regime import (
    RegimeDetectEnqueued,
    RegimeDetectRequest,
    RegimeHistoryResponse,
    RegimeObject,
    RegimePoint,
    RegimeStatisticsItem,
    RegimeStatisticsResponse,
    StrategyCompatibilityAlert,
    StrategyCompatibilityAlertsResponse,
)
from app.services import regime as regime_svc

router = APIRouter(prefix="/regimes", tags=["Regime Detection"])


@router.post(
    "/detect",
    response_model=RegimeDetectEnqueued,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Re-run regime detection for a symbol",
)
async def detect(
    payload: RegimeDetectRequest,
    current_user: User = Depends(get_current_user),
) -> RegimeDetectEnqueued:
    from app.worker.tasks import run_regime_detection

    result = run_regime_detection.delay(
        organization_id=str(current_user.organization_id),
        symbol=payload.symbol,
        request_id=get_current_request_id(),
    )
    return RegimeDetectEnqueued(
        symbol=payload.symbol,
        message="Regime detection enqueued. Poll /regimes/history for results.",
        task_id=result.id,
    )


@router.get("/current", response_model=RegimeObject, summary="Most recent regime")
async def current(
    symbol: str = Query(..., min_length=1, max_length=32),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> RegimeObject:
    symbol = symbol.strip().upper()
    row = (
        await db.execute(
            select(RegimeLabelRecord)
            .where(RegimeLabelRecord.symbol == symbol)
            .order_by(RegimeLabelRecord.timestamp.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No regime data for symbol")
    return RegimeObject.model_validate(row)


# Cross-asset regime divergence (Batch 22). Defaults to the four assets the seed
# data actually carries; the caller can pass any comma-separated symbol list.
_CROSS_ASSET_DEFAULT = ["SPY", "QQQ", "GLD", "BTC-USD"]


def compute_regime_divergences(detected: dict[str, str]) -> tuple[list[dict], bool]:
    """Given {symbol: regime} for symbols that ACTUALLY have a stored regime, return
    (divergences, synchronized). Divergences only fire on real combinations — never
    forced to appear. ``synchronized`` is True when every asset shares one regime."""
    divergences: list[dict] = []
    symbols = list(detected)

    # Regime divergence: one asset Bull while another is Bear or Crisis.
    for i in range(len(symbols)):
        for j in range(i + 1, len(symbols)):
            a, b = symbols[i], symbols[j]
            pair = {detected[a], detected[b]}
            if "Bull" in pair and ("Bear" in pair or "Crisis" in pair):
                divergences.append(
                    {
                        "asset_a": a,
                        "asset_b": b,
                        "type": "regime_divergence",
                        "message": f"{a} is {detected[a]} while {b} is {detected[b]} — a regime divergence.",
                    }
                )

    # Isolated stress: exactly one asset in Crisis while the others are not.
    crisis = [s for s in symbols if detected[s] == "Crisis"]
    if len(crisis) == 1 and len(symbols) > 1:
        c = crisis[0]
        divergences.append(
            {
                "asset_a": c,
                "asset_b": None,
                "type": "isolated_stress",
                "message": f"{c} is in Crisis while the other tracked assets are not — isolated stress.",
            }
        )

    synchronized = len(set(detected.values())) == 1
    return divergences, synchronized


@router.get(
    "/cross-asset",
    summary="Cross-asset regime divergence across several symbols (reads stored regimes)",
)
async def cross_asset(
    symbols: str = Query(default=",".join(_CROSS_ASSET_DEFAULT), max_length=255),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> dict:
    requested = [s.strip().upper() for s in symbols.split(",") if s.strip()][:12]

    assets: dict[str, dict] = {}
    for sym in requested:
        row = (
            await db.execute(
                select(RegimeLabelRecord)
                .where(RegimeLabelRecord.symbol == sym)
                .order_by(RegimeLabelRecord.timestamp.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        # Only symbols with a REAL stored detection appear — never fabricate a regime
        # for a symbol that was never detected.
        if row is not None:
            assets[sym] = {
                "regime": row.regime_label.value,
                "confidence": row.confidence_score,
                "detected_at": row.timestamp.isoformat(),
            }

    detected = {s: a["regime"] for s, a in assets.items()}
    result: dict = {
        "as_of": datetime.now(UTC).isoformat(),
        "requested_symbols": requested,
        "assets": assets,
        "divergences": [],
        "synchronized": False,
        "insufficient_data": len(detected) < 2,
    }
    if len(detected) >= 2:
        result["divergences"], result["synchronized"] = compute_regime_divergences(detected)
    return result


@router.get("/history", response_model=RegimeHistoryResponse, summary="Regime timeline")
async def history(
    symbol: str = Query(..., min_length=1, max_length=32),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    limit: int = Query(default=5000, ge=1, le=20000),
) -> RegimeHistoryResponse:
    symbol = symbol.strip().upper()
    stmt = (
        select(RegimeLabelRecord)
        .where(RegimeLabelRecord.symbol == symbol)
        .order_by(RegimeLabelRecord.timestamp.asc())
        .limit(limit)
    )
    if start is not None:
        stmt = stmt.where(RegimeLabelRecord.timestamp >= start)
    if end is not None:
        stmt = stmt.where(RegimeLabelRecord.timestamp <= end)

    rows = (await db.execute(stmt)).scalars().all()
    return RegimeHistoryResponse(
        symbol=symbol,
        count=len(rows),
        points=[RegimePoint.model_validate(r) for r in rows],
    )


@router.get(
    "/statistics",
    response_model=RegimeStatisticsResponse,
    summary="Duration/avg return/avg volatility/avg Sharpe per regime label (Batch 12)",
)
async def statistics(
    symbol: str = Query(..., min_length=1, max_length=32),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> RegimeStatisticsResponse:
    symbol = symbol.strip().upper()
    items = await regime_svc.compute_regime_statistics(db, symbol=symbol)
    return RegimeStatisticsResponse(
        symbol=symbol, items=[RegimeStatisticsItem(**item) for item in items]
    )


@router.get(
    "/compatibility-alerts",
    response_model=StrategyCompatibilityAlertsResponse,
    summary="Active strategies not validated for the symbol's current regime (Batch 12)",
)
async def compatibility_alerts(
    symbol: str = Query(..., min_length=1, max_length=32),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> StrategyCompatibilityAlertsResponse:
    symbol = symbol.strip().upper()
    result = await regime_svc.compute_strategy_compatibility_alerts(db, symbol=symbol)
    return StrategyCompatibilityAlertsResponse(
        symbol=symbol,
        current_regime=result["current_regime"],
        alerts=[StrategyCompatibilityAlert(**a) for a in result["alerts"]],
    )
