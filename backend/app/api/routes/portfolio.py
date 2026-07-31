"""Portfolio cross-strategy view endpoints (Batch 20).

- GET /portfolio/overview      equal-weighted KPIs + regime specialisation + risk alerts
- GET /portfolio/correlation   daily-return correlation over real stored equity curves

Both are tenant-scoped through ``get_tenant_db`` (the session is bound to the
caller's org from the JWT), and every number is computed from real stored data —
see app/services/portfolio.py.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_tenant_db
from app.models.user import User
from app.schemas.portfolio import CorrelationResponse, PortfolioOverviewResponse
from app.services import portfolio as portfolio_service

router = APIRouter(prefix="/portfolio", tags=["Portfolio"])


@router.get("/overview", response_model=PortfolioOverviewResponse)
async def portfolio_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> PortfolioOverviewResponse:
    """Equal-weighted portfolio KPIs across the org's ACTIVE strategies.

    ``regime_exposure`` is regime *specialisation* (each active strategy's dominant
    regime, argmax of its stored regime_compatibility), not a live "currently
    trading in regime X" figure — strategies do not persist a symbol, so there is
    no honest symbol->current-regime join. See the schema docstring.
    """
    return await portfolio_service.compute_overview(db, current_user.organization_id)


@router.get("/correlation", response_model=CorrelationResponse)
async def portfolio_correlation(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> CorrelationResponse:
    """Pairwise daily-return correlation of active strategies' real equity curves.

    Strategies without enough stored history are named in ``excluded`` rather than
    padded — a fabricated return in this matrix is exactly what the batch forbids.
    """
    return await portfolio_service.compute_correlation(db, current_user.organization_id)
