"""Multi-agent desk orchestration (Batch 30, ADR 0009).

Create -> run (Celery) -> settle. Every run:

1. resolves the point-in-time Stellix context (regime, strategy evidence, failures,
   lessons) and stores exactly what was injected;
2. runs the TradingAgents pipeline in a worker thread, persisting + publishing each
   finished agent as a progress stage;
3. writes every captured LLM call to ``llm_audit_log`` BEFORE marking the run complete
   (log-then-return) — on failure too;
4. stores the redacted reports and the rating (Safeguard 1 — no price levels);
5. interactive runs only: writes a ResearchNote, syncs an ``AgentAnalysis`` graph node,
   and records an audit event.

Settlement later appends realised return / alpha and a reflection, once, when the
holding window has traded. Nothing here writes a Strategy, a signal or an order —
there is no import path to the strategy write path (Safeguard 2's isolation).
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents import runner
from app.agents.audit_callback import AgentAuditCallback, CapturedCall
from app.agents.context import build_desk_context
from app.agents.scoring import ScoredCall, summarize
from app.db.session import get_system_session, get_tenant_session
from app.db.tenant import mark_session_unscoped
from app.graph.sync_service import GraphSyncService
from app.models.agent_analysis import AgentAnalysis, AgentBacktestRun, AgentRunStatus
from app.models.audit_log import AuditEventType
from app.models.llm_audit_log import LLMAuditLog
from app.models.organization import Organization, OrganizationStatus
from app.models.research_note import ResearchNoteStatus
from app.services.audit import write_audit_log
from app.services.research_note import create_note
from app.ws.events import publish_agent_progress

logger = logging.getLogger(__name__)

TADESK_VERSION = "TradingAgents v0.5.1"


def _now() -> datetime:
    return datetime.now(UTC)


# --------------------------------------------------------------------------- create
async def create_analysis(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID | None,
    ticker: str,
    trade_date: date,
    selected_analysts: list[str],
    backtest_run_id: uuid.UUID | None = None,
    portfolio: dict | None = None,
    output_language: str | None = None,
    commit: bool = True,
) -> AgentAnalysis:
    desk = runner.desk_settings(output_language)
    asset_type = runner.asset_type_for(ticker)
    analysis = AgentAnalysis(
        organization_id=organization_id,
        requested_by_user_id=user_id,
        backtest_run_id=backtest_run_id,
        ticker=ticker,
        trade_date=trade_date,
        asset_type=asset_type,
        status=AgentRunStatus.QUEUED,
        selected_analysts=runner.analysts_for(selected_analysts, asset_type),
        llm_provider=desk.provider,
        deep_model=desk.deep_model,
        quick_model=desk.quick_model,
        config_snapshot=desk.snapshot(),
        portfolio=runner.validate_portfolio(portfolio),
        regime_context={},
        progress=[],
        reports={},
    )
    session.add(analysis)
    if commit:
        await session.commit()
        await session.refresh(analysis)
    else:
        await session.flush()
    return analysis


def _add(a: int | None, b: int | None) -> int | None:
    return None if a is None and b is None else (a or 0) + (b or 0)


# --------------------------------------------------------------------------- audit rows
def _persist_llm_calls(
    session: AsyncSession,
    calls: list[CapturedCall],
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID | None,
    provider: str,
    node_override: str | None = None,
) -> tuple[int, int | None, int | None]:
    in_total: int | None = None
    out_total: int | None = None
    for call in calls:
        node = node_override or call.node
        session.add(
            LLMAuditLog(
                organization_id=organization_id,
                user_id=user_id,
                function_name=f"agent:{node}"[:64],
                full_prompt=call.prompt or "(empty prompt)",
                full_response=call.response or ("(no response recorded)" if not call.finished else ""),
                model_used=call.model[:64],
                model_key=provider[:16],
                input_tokens=call.input_tokens,
                output_tokens=call.output_tokens,
                # No published per-token price for these models in router.py — NULL,
                # never an estimate (Safeguard 4: the cost column is a compliance figure).
                estimated_cost_usd=None,
                numeric_validation_passed=None,
            )
        )
        if call.input_tokens is not None:
            in_total = (in_total or 0) + call.input_tokens
        if call.output_tokens is not None:
            out_total = (out_total or 0) + call.output_tokens
    return len(calls), in_total, out_total


async def _publish(analysis: AgentAnalysis, *, stage: str | None, status: str) -> None:
    await publish_agent_progress(
        org_id=str(analysis.organization_id),
        analysis_id=str(analysis.id),
        ticker=analysis.ticker,
        stage=stage,
        status=status,
        rating=analysis.rating,
        backtest_run_id=str(analysis.backtest_run_id) if analysis.backtest_run_id else None,
        stages_done=len(analysis.progress or []),
        stages_total=len(runner.expected_stages(list(analysis.selected_analysts or []))),
    )


# --------------------------------------------------------------------------- run
def _note_content(analysis: AgentAnalysis) -> str:
    reports = analysis.reports or {}
    regime = (
        f"{analysis.regime_at_analysis} (confidence {analysis.regime_confidence:.2f})"
        if analysis.regime_at_analysis and analysis.regime_confidence is not None
        else analysis.regime_at_analysis or "no regime label on this date"
    )
    return "\n".join(
        [
            f"# {analysis.ticker} — {analysis.rating} ({analysis.trade_date.isoformat()})",
            "",
            f"**Regime at analysis:** {regime}  ",
            f"**Trader action:** {analysis.trader_action or 'n/a'}  ",
            f"**Time horizon:** {analysis.time_horizon or 'n/a'}",
            "",
            "## Portfolio Manager decision",
            reports.get("final_trade_decision") or "",
            "",
            "## Research Manager plan",
            reports.get("investment_plan") or "",
            "",
            "---",
            f"Generated by the Stellix multi-agent desk ({TADESK_VERSION}), analysis `{analysis.id}`. "
            "Research output only — no strategy, signal or order was created.",
        ]
    )


async def _write_research_note(session: AsyncSession, analysis: AgentAnalysis) -> None:
    if analysis.requested_by_user_id is None:
        return
    analysts = ", ".join(analysis.selected_analysts or [])
    cfg = analysis.config_snapshot or {}
    note = await create_note(
        session,
        user_id=analysis.requested_by_user_id,
        data={
            "title": f"Agent desk: {analysis.ticker} {analysis.trade_date.isoformat()} — {analysis.rating}"[:255],
            "content": _note_content(analysis),
            "method": (
                f"Multi-agent desk ({TADESK_VERSION}): analysts [{analysts}], bull/bear debate "
                f"x{cfg.get('max_debate_rounds')}, risk debate x{cfg.get('max_risk_discuss_rounds')}, "
                f"models {analysis.deep_model} / {analysis.quick_model}; conditioned on the Stellix regime."
            ),
            "status": ResearchNoteStatus.COMPLETED,
            "tags": [t for t in ("agent-desk", analysis.ticker, analysis.rating, analysis.regime_at_analysis) if t],
        },
    )
    analysis.research_note_id = note.id
    await session.commit()


async def run_analysis_in_session(
    session: AsyncSession, analysis: AgentAnalysis, *, interactive: bool = True
) -> AgentAnalysis:
    """Run one analysis to completion or failure. Never raises for a pipeline error —
    a failed run is recorded (Pillar 2) and returned.

    A retried analysis resumes from its own checkpoint when checkpointing is on:
    its earlier progress is kept and its earlier LLM calls (already audited) are
    added to, not replaced."""
    desk = runner.desk_settings((analysis.config_snapshot or {}).get("output_language"))
    # Record what actually runs (settings may have changed since the row was queued).
    analysis.llm_provider, analysis.deep_model, analysis.quick_model = desk.provider, desk.deep_model, desk.quick_model
    analysis.config_snapshot = desk.snapshot()
    if not desk.checkpoint_enabled:
        analysis.progress = []  # no checkpoint to resume from: this attempt starts over
    prior_calls = analysis.llm_call_count or 0
    prior_in, prior_out = analysis.input_tokens, analysis.output_tokens
    analysis.status = AgentRunStatus.RUNNING
    analysis.started_at = _now()
    analysis.error = None
    await session.commit()
    await _publish(analysis, stage=None, status="running")

    callback = AgentAuditCallback()
    try:
        ctx = await build_desk_context(
            session, ticker=analysis.ticker, trade_date=analysis.trade_date, exclude_analysis_id=analysis.id
        )
        analysis.regime_at_analysis = ctx.regime
        analysis.regime_confidence = ctx.regime_confidence
        analysis.regime_context = ctx.as_record()
        await session.commit()

        loop = asyncio.get_running_loop()

        async def _record_stage(stage: str) -> None:
            # Runs on the loop while the pipeline thread is blocked in LLM calls; the
            # outer coroutine is suspended in to_thread, so the session is not in use.
            if any(p.get("stage") == stage for p in analysis.progress or []):
                return  # finished in an earlier attempt; resumed runs do not repeat it
            analysis.progress = [*(analysis.progress or []), {"stage": stage, "at": _now().isoformat()}]
            await session.commit()
            await _publish(analysis, stage=stage, status="running")

        def _on_stage(stage: str) -> None:
            future = asyncio.run_coroutine_threadsafe(_record_stage(stage), loop)
            try:
                future.result(timeout=15)
            except Exception:  # noqa: BLE001 — progress is best-effort; never stall the run
                logger.warning("agent progress update failed for %s", analysis.id, exc_info=True)

        result = await asyncio.to_thread(
            runner.run_pipeline,
            desk=desk,
            ticker=analysis.ticker,
            trade_date=analysis.trade_date,
            asset_type=analysis.asset_type,
            selected_analysts=list(analysis.selected_analysts),
            stellix_instrument_text=ctx.instrument_text,
            past_context_text=ctx.past_context_text,
            callbacks=[callback],
            on_stage=_on_stage,
            portfolio=analysis.portfolio,
            analysis_id=str(analysis.id),
        )
        outcome = runner.extract_outcome(result.final_state)

        # Log-then-return: the audit rows land in the same commit that completes the run.
        count, in_tok, out_tok = _persist_llm_calls(
            session,
            callback.calls,
            organization_id=analysis.organization_id,
            user_id=analysis.requested_by_user_id,
            provider=desk.provider,
        )
        analysis.llm_call_count = prior_calls + count
        analysis.input_tokens = _add(prior_in, in_tok)
        analysis.output_tokens = _add(prior_out, out_tok)
        analysis.reports = outcome.reports
        analysis.rating = outcome.rating
        analysis.trader_action = outcome.trader_action
        analysis.time_horizon = outcome.time_horizon
        analysis.position_sizing = outcome.position_sizing
        analysis.status = AgentRunStatus.COMPLETED
        analysis.completed_at = _now()
        await session.commit()
        runner.clear_checkpoint_dir(desk, str(analysis.id))
    except Exception as exc:  # noqa: BLE001 — a failed run is a kept research record
        logger.warning("agent analysis %s failed", analysis.id, exc_info=True)
        await session.rollback()
        await session.refresh(analysis)  # rollback expires every loaded object
        count, in_tok, out_tok = _persist_llm_calls(
            session,
            callback.calls,
            organization_id=analysis.organization_id,
            user_id=analysis.requested_by_user_id,
            provider=desk.provider,
        )
        analysis.llm_call_count = prior_calls + count
        analysis.input_tokens = _add(prior_in, in_tok)
        analysis.output_tokens = _add(prior_out, out_tok)
        analysis.status = AgentRunStatus.FAILED
        analysis.error = f"{type(exc).__name__}: {exc}"[:4000]
        analysis.completed_at = _now()
        await session.commit()
        await _publish(analysis, stage=None, status="failed")
        return analysis

    if interactive:
        await _write_research_note(session, analysis)
        await GraphSyncService().sync_agent_analysis_node(session, analysis)
        await write_audit_log(
            session,
            organization_id=analysis.organization_id,
            actor_user_id=analysis.requested_by_user_id,
            event_type=AuditEventType.AGENT_ANALYSIS_COMPLETED,
            entity_type="agent_analysis",
            entity_id=analysis.id,
            after_state={
                "ticker": analysis.ticker,
                "trade_date": analysis.trade_date.isoformat(),
                "rating": analysis.rating,
                "regime": analysis.regime_at_analysis,
                "llm_calls": analysis.llm_call_count,
            },
            entity_name=f"{analysis.ticker} {analysis.trade_date.isoformat()}",
        )
        await session.commit()
    await _publish(analysis, stage=None, status="completed")
    return analysis


async def run_analysis(organization_id: uuid.UUID, analysis_id: uuid.UUID) -> dict:
    """Celery entry point: its own tenant-scoped session."""
    async with get_tenant_session(organization_id) as session:
        analysis = (
            await session.execute(select(AgentAnalysis).where(AgentAnalysis.id == analysis_id))
        ).scalar_one()
        analysis = await run_analysis_in_session(session, analysis, interactive=True)
        return {"analysis_id": str(analysis.id), "status": analysis.status.value, "rating": analysis.rating}


# --------------------------------------------------------------------------- retry
STALE_RUNNING_AFTER = timedelta(hours=2)


def retry_blocker(analysis: AgentAnalysis) -> str | None:
    """Why this analysis cannot be retried, or None. A failed run can be; so can a
    run stuck in running/queued (its worker died) once it is clearly stale."""
    if analysis.status == AgentRunStatus.FAILED:
        return None
    if analysis.status in (AgentRunStatus.RUNNING, AgentRunStatus.QUEUED):
        since = analysis.started_at or analysis.created_at
        if since is not None and since.tzinfo is None:
            since = since.replace(tzinfo=UTC)
        if since is not None and _now() - since > STALE_RUNNING_AFTER:
            return None
        return "This analysis is still in progress."
    return "Only failed or stalled analyses can be retried; completed analyses are write-once."


async def mark_for_retry(session: AsyncSession, analysis: AgentAnalysis) -> AgentAnalysis:
    analysis.status = AgentRunStatus.QUEUED
    analysis.error = None
    analysis.completed_at = None
    await session.commit()
    return analysis


# --------------------------------------------------------------------------- settle
async def settle_analysis(session: AsyncSession, analysis: AgentAnalysis) -> bool:
    """Append the realised outcome once the holding window has traded. Idempotent:
    a settled or non-completed analysis is left untouched."""
    if analysis.status != AgentRunStatus.COMPLETED or analysis.settled_at is not None or not analysis.rating:
        return False
    desk = runner.desk_settings()
    holding_days = int((analysis.config_snapshot or {}).get("holding_period_days") or desk.holding_days)
    benchmark, (raw, alpha, days, resolution) = await asyncio.to_thread(
        runner.fetch_outcome, analysis.ticker, analysis.trade_date, holding_days
    )
    if raw is None:
        return False  # window not traded yet, or no prices — retry next sweep

    reflection: str | None = None
    callback = AgentAuditCallback()
    if runner.is_configured(desk):
        try:
            reflection = await asyncio.to_thread(
                runner.reflect,
                desk=desk,
                decision=(analysis.reports or {}).get("final_trade_decision") or "",
                raw=raw,
                alpha=alpha,
                benchmark=benchmark,
                callbacks=[callback],
            )
        except Exception:  # noqa: BLE001 — the outcome still settles without a reflection
            logger.warning("reflection failed for agent analysis %s", analysis.id, exc_info=True)
    _persist_llm_calls(
        session,
        callback.calls,
        organization_id=analysis.organization_id,
        user_id=None,
        provider=desk.provider,
        node_override="reflection",
    )
    analysis.benchmark = benchmark
    analysis.holding_days = days
    analysis.settled_raw_return = raw
    analysis.settled_alpha = alpha
    analysis.settled_resolution_date = date.fromisoformat(resolution) if resolution else None
    analysis.settled_reflection = (reflection or "").strip() or None
    analysis.settled_at = _now()
    await session.commit()
    if analysis.backtest_run_id is None:
        await GraphSyncService().sync_agent_analysis_node(session, analysis)
    return True


async def settle_org_pending(session: AsyncSession) -> dict:
    pending = (
        await session.execute(
            select(AgentAnalysis).where(
                AgentAnalysis.status == AgentRunStatus.COMPLETED, AgentAnalysis.settled_at.is_(None)
            )
        )
    ).scalars().all()
    settled = 0
    for analysis in pending:
        if await settle_analysis(session, analysis):
            settled += 1
    return {"pending": len(pending), "settled": settled}


async def settle_all_orgs() -> dict:
    async with get_system_session() as s:
        mark_session_unscoped(s.sync_session)
        org_ids = (
            await s.execute(select(Organization.id).where(Organization.status == OrganizationStatus.ACTIVE))
        ).scalars().all()
    totals = {"orgs": len(org_ids), "pending": 0, "settled": 0}
    for org_id in org_ids:
        async with get_tenant_session(org_id) as session:
            result = await settle_org_pending(session)
            totals["pending"] += result["pending"]
            totals["settled"] += result["settled"]
    return totals


# --------------------------------------------------------------------------- backtest
async def create_backtest(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    tickers: list[str],
    trade_dates: list[str],
    selected_analysts: list[str],
) -> AgentBacktestRun:
    run = AgentBacktestRun(
        organization_id=organization_id,
        requested_by_user_id=user_id,
        tickers=tickers,
        trade_dates=trade_dates,
        selected_analysts=selected_analysts,
        status=AgentRunStatus.QUEUED,
        total_cells=len(tickers) * len(trade_dates),
        summary={},
    )
    session.add(run)
    await session.commit()
    await session.refresh(run)
    return run


async def backtest_cells(session: AsyncSession, run_id: uuid.UUID) -> list[AgentAnalysis]:
    return list(
        (
            await session.execute(
                select(AgentAnalysis)
                .where(AgentAnalysis.backtest_run_id == run_id)
                .order_by(AgentAnalysis.trade_date, AgentAnalysis.ticker)
            )
        ).scalars().all()
    )


def summarize_cells(cells: list[AgentAnalysis]) -> dict:
    return summarize(
        ScoredCall(regime=c.regime_at_analysis, rating=c.rating, alpha=c.settled_alpha)
        for c in cells
        if c.status == AgentRunStatus.COMPLETED
    )


async def run_backtest_in_session(session: AsyncSession, run: AgentBacktestRun) -> AgentBacktestRun:
    """Dates outer, tickers inner — chronological, so each cell's lessons can include
    earlier cells whose outcome resolved before its date (point-in-time compounding)."""
    run.status = AgentRunStatus.RUNNING
    run.started_at = _now()
    await session.commit()
    done = {(c.ticker, c.trade_date.isoformat()) for c in await backtest_cells(session, run.id)}
    try:
        for day in sorted(run.trade_dates):
            for ticker in run.tickers:
                if (ticker, day) in done:
                    continue  # resume: this cell already ran
                cell = await create_analysis(
                    session,
                    organization_id=run.organization_id,
                    user_id=run.requested_by_user_id,
                    ticker=ticker,
                    trade_date=date.fromisoformat(day),
                    selected_analysts=list(run.selected_analysts),
                    backtest_run_id=run.id,
                )
                cell = await run_analysis_in_session(session, cell, interactive=False)
                if cell.status == AgentRunStatus.COMPLETED:
                    run.completed_cells += 1
                    await settle_analysis(session, cell)
                else:
                    run.failed_cells += 1
                run.summary = summarize_cells(await backtest_cells(session, run.id))
                await session.commit()
        run.status = AgentRunStatus.COMPLETED
    except Exception as exc:  # noqa: BLE001 — keep what ran; record why it stopped
        logger.warning("agent backtest %s stopped", run.id, exc_info=True)
        await session.rollback()
        await session.refresh(run)
        run.status = AgentRunStatus.FAILED
        run.error = f"{type(exc).__name__}: {exc}"[:4000]
    run.summary = summarize_cells(await backtest_cells(session, run.id))
    run.completed_at = _now()
    await session.commit()
    await write_audit_log(
        session,
        organization_id=run.organization_id,
        actor_user_id=run.requested_by_user_id,
        event_type=AuditEventType.AGENT_BACKTEST_COMPLETED,
        entity_type="agent_backtest_run",
        entity_id=run.id,
        after_state={
            "status": run.status.value,
            "tickers": run.tickers,
            "cells": run.total_cells,
            "completed": run.completed_cells,
            "failed": run.failed_cells,
            "scored": run.summary.get("scored_cells"),
        },
        entity_name=f"{', '.join(run.tickers)} x {len(run.trade_dates)} dates",
    )
    await session.commit()
    return run


async def run_backtest(organization_id: uuid.UUID, run_id: uuid.UUID) -> dict:
    async with get_tenant_session(organization_id) as session:
        run = (await session.execute(select(AgentBacktestRun).where(AgentBacktestRun.id == run_id))).scalar_one()
        run = await run_backtest_in_session(session, run)
        return {"run_id": str(run.id), "status": run.status.value, "completed": run.completed_cells}


# --------------------------------------------------------------------------- memory view
async def track_record(session: AsyncSession, *, ticker: str | None = None) -> dict:
    """The desk's settled calls (interactive and backtest), scored by regime x rating."""
    query = select(AgentAnalysis).where(
        AgentAnalysis.status == AgentRunStatus.COMPLETED, AgentAnalysis.settled_at.is_not(None)
    )
    if ticker:
        query = query.where(AgentAnalysis.ticker == ticker)
    return summarize_cells(list((await session.execute(query)).scalars().all()))
