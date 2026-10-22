"""Multi-agent desk endpoints (Batch 30, ADR 0009).

Starting work is gated on ``agents.run`` and the per-org ``agent_run_rate_limiter``
(every run is dozens of billed LLM calls); reading is open to every member, like
research notes. Every run executes in Celery — these handlers only validate, enqueue
and read. The desk is inert until its provider key is configured: start endpoints then
return a clean 503, never an opaque 500.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents import runner
from app.api.deps import get_current_user, get_tenant_db, require_permission
from app.core.config import settings
from app.core.logging import get_current_request_id
from app.core.rate_limit import agent_run_rate_limiter
from app.models.agent_analysis import AgentAnalysis, AgentBacktestRun
from app.models.user import User
from app.rbac.catalog import P
from app.schemas.agent_desk import (
    AgentAnalysisDetail,
    AgentAnalysisEnqueued,
    AgentAnalysisListResponse,
    AgentAnalysisRequest,
    AgentAnalysisSummary,
    AgentBacktestDetail,
    AgentBacktestEnqueued,
    AgentBacktestListResponse,
    AgentBacktestRequest,
    AgentBacktestSummary,
    DeskStatus,
    TrackRecordResponse,
)
from app.services import agent_desk

router = APIRouter(prefix="/agents", tags=["Multi-Agent Desk"])


def _require_configured() -> None:
    reason = runner.not_configured_reason()
    if reason:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=reason)


def _today():
    return datetime.now(UTC).date()


def _summary(a: AgentAnalysis, cls=AgentAnalysisSummary):
    out = cls.model_validate(a)
    out.expected_stages = runner.expected_stages(list(a.selected_analysts or []))
    return out


@router.get("/status", response_model=DeskStatus)
async def desk_status(current_user: User = Depends(get_current_user)) -> DeskStatus:
    desk = runner.desk_settings()
    return DeskStatus(
        configured=runner.is_configured(desk),
        reason=runner.not_configured_reason(desk),
        provider=desk.provider,
        deep_model=desk.deep_model,
        quick_model=desk.quick_model,
        max_debate_rounds=desk.max_debate_rounds,
        max_risk_rounds=desk.max_risk_rounds,
        holding_days=desk.holding_days,
        backtest_max_cells=settings.AGENTS_BACKTEST_MAX_CELLS,
        framework=agent_desk.TADESK_VERSION,
        analysts=list(runner.ANALYST_KEYS),
        pipeline=list(runner.PIPELINE_STAGES),
        supported_providers=runner.supported_providers(),
        output_language=desk.output_language,
        fundamentals_vendors=desk.fundamentals_vendors,
        sec_edgar_enabled="sec_edgar" in desk.fundamentals_vendors,
        sec_edgar_user_agent_set=bool(settings.SEC_EDGAR_USER_AGENT),
        jev_screening_enabled=bool(settings.TYPESAFE_API_KEY),
        checkpoint_enabled=desk.checkpoint_enabled,
    )


@router.post(
    "/analyses",
    response_model=AgentAnalysisEnqueued,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(agent_run_rate_limiter)],
)
async def start_analysis(
    payload: AgentAnalysisRequest,
    current_user: User = Depends(require_permission(P.AGENTS_RUN)),
    db: AsyncSession = Depends(get_tenant_db),
) -> AgentAnalysisEnqueued:
    _require_configured()
    trade_date = payload.trade_date or _today()
    if trade_date > _today():
        raise HTTPException(status_code=422, detail="trade_date cannot be in the future")
    analysis = await agent_desk.create_analysis(
        db,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        ticker=runner.normalize_ticker(payload.ticker),
        trade_date=trade_date,
        selected_analysts=list(payload.selected_analysts),
        portfolio=await _book(payload, current_user, db),
        output_language=payload.output_language,
    )
    return _enqueue(analysis, current_user, "Analysis queued. Progress streams over the agent_progress WebSocket event.")


async def _book(payload: AgentAnalysisRequest, current_user: User, db: AsyncSession) -> dict | None:
    """The run's portfolio: given inline, or derived from the caller's own tracked
    holdings (Market Terminal, Batch 31) — never someone else's."""
    if payload.holdings_portfolio_id is None:
        return payload.portfolio.model_dump() if payload.portfolio is not None else None
    from app.terminal import userdata

    try:
        return await userdata.as_agent_portfolio(db, current_user, payload.holdings_portfolio_id)
    except userdata.NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _enqueue(analysis: AgentAnalysis, current_user: User, message: str) -> AgentAnalysisEnqueued:
    from app.worker.tasks import run_agent_analysis_task

    result = run_agent_analysis_task.delay(
        organization_id=str(current_user.organization_id),
        analysis_id=str(analysis.id),
        request_id=get_current_request_id(),
    )
    return AgentAnalysisEnqueued(analysis_id=analysis.id, task_id=result.id, message=message)


@router.post(
    "/analyses/{analysis_id}/retry",
    response_model=AgentAnalysisEnqueued,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(agent_run_rate_limiter)],
)
async def retry_analysis(
    analysis_id: uuid.UUID,
    current_user: User = Depends(require_permission(P.AGENTS_RUN)),
    db: AsyncSession = Depends(get_tenant_db),
) -> AgentAnalysisEnqueued:
    """Re-run a failed (or stalled) analysis. With checkpointing on it resumes from
    the last agent that finished, so the completed agents are not paid for twice."""
    _require_configured()
    analysis = (
        await db.execute(select(AgentAnalysis).where(AgentAnalysis.id == analysis_id))
    ).scalar_one_or_none()
    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    blocker = agent_desk.retry_blocker(analysis)
    if blocker:
        raise HTTPException(status_code=409, detail=blocker)
    await agent_desk.mark_for_retry(db, analysis)
    return _enqueue(analysis, current_user, "Retry queued; it resumes from the last finished agent.")


@router.get("/analyses", response_model=AgentAnalysisListResponse)
async def list_analyses(
    ticker: str | None = Query(default=None, max_length=32),
    include_backtests: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> AgentAnalysisListResponse:
    query = select(AgentAnalysis)
    if ticker:
        query = query.where(AgentAnalysis.ticker == ticker.strip().upper())
    if not include_backtests:
        query = query.where(AgentAnalysis.backtest_run_id.is_(None))
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (await db.execute(query.order_by(AgentAnalysis.created_at.desc()).limit(limit))).scalars().all()
    return AgentAnalysisListResponse(count=total or 0, items=[_summary(a) for a in rows])


@router.get("/analyses/{analysis_id}", response_model=AgentAnalysisDetail)
async def get_analysis(
    analysis_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> AgentAnalysisDetail:
    analysis = (
        await db.execute(select(AgentAnalysis).where(AgentAnalysis.id == analysis_id))
    ).scalar_one_or_none()
    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return _summary(analysis, AgentAnalysisDetail)


@router.post("/settle", status_code=status.HTTP_202_ACCEPTED)
async def settle_now(current_user: User = Depends(require_permission(P.AGENTS_RUN))) -> dict:
    """Score this org's completed calls whose holding window has traded (also nightly)."""
    from app.worker.tasks import settle_agent_analyses_task

    result = settle_agent_analyses_task.delay(
        organization_id=str(current_user.organization_id), request_id=get_current_request_id()
    )
    return {"task_id": result.id, "message": "Settlement queued."}


@router.get("/track-record", response_model=TrackRecordResponse)
async def track_record(
    ticker: str | None = Query(default=None, max_length=32),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> TrackRecordResponse:
    symbol = ticker.strip().upper() if ticker else None
    return TrackRecordResponse(ticker=symbol, summary=await agent_desk.track_record(db, ticker=symbol))


@router.post(
    "/backtests",
    response_model=AgentBacktestEnqueued,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(agent_run_rate_limiter)],
)
async def start_backtest(
    payload: AgentBacktestRequest,
    current_user: User = Depends(require_permission(P.AGENTS_RUN)),
    db: AsyncSession = Depends(get_tenant_db),
) -> AgentBacktestEnqueued:
    _require_configured()
    if payload.start_date > _today():
        raise HTTPException(status_code=422, detail="start_date cannot be in the future")
    dates = runner.grid_dates(payload.start_date, payload.end_date, payload.every_n_days)
    tickers = [runner.normalize_ticker(t) for t in payload.tickers]
    cells = len(dates) * len(tickers)
    if cells == 0:
        raise HTTPException(status_code=422, detail="The grid has no dates up to today")
    if cells > settings.AGENTS_BACKTEST_MAX_CELLS:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{cells} cells requested ({len(tickers)} tickers x {len(dates)} dates); the limit is "
                f"{settings.AGENTS_BACKTEST_MAX_CELLS}. Each cell is a full multi-agent run — widen "
                "every_n_days or narrow the range."
            ),
        )
    run = await agent_desk.create_backtest(
        db,
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        tickers=tickers,
        trade_dates=dates,
        selected_analysts=list(payload.selected_analysts),
    )
    from app.worker.tasks import run_agent_backtest_task

    result = run_agent_backtest_task.delay(
        organization_id=str(current_user.organization_id),
        run_id=str(run.id),
        request_id=get_current_request_id(),
    )
    return AgentBacktestEnqueued(
        run_id=run.id, total_cells=cells, task_id=result.id, message="Agent backtest queued."
    )


@router.get("/backtests", response_model=AgentBacktestListResponse)
async def list_backtests(
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> AgentBacktestListResponse:
    total = await db.scalar(select(func.count()).select_from(AgentBacktestRun))
    rows = (
        await db.execute(select(AgentBacktestRun).order_by(AgentBacktestRun.created_at.desc()).limit(limit))
    ).scalars().all()
    return AgentBacktestListResponse(count=total or 0, items=[AgentBacktestSummary.model_validate(r) for r in rows])


@router.get("/backtests/{run_id}", response_model=AgentBacktestDetail)
async def get_backtest(
    run_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> AgentBacktestDetail:
    run = (await db.execute(select(AgentBacktestRun).where(AgentBacktestRun.id == run_id))).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Backtest not found")
    cells = await agent_desk.backtest_cells(db, run.id)
    base = AgentBacktestSummary.model_validate(run).model_dump()
    return AgentBacktestDetail(**base, cells=[_summary(c) for c in cells])
