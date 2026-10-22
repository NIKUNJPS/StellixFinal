"""Celery tasks for background data work.

Each task bridges Celery's sync world to our async DB layer via ``asyncio.run``. The
engine pool is disposed at the end of every run so a subsequent task (which executes
on a fresh event loop) does not reuse asyncpg connections bound to a prior loop.

Every task takes an optional `request_id` (Batch 13): the API route that enqueues it
passes `request_id=get_current_request_id()` so the same trace ID that tagged the
originating HTTP request also tags every log line this task (and anything it chains
via `.delay()`) emits. `@with_log_context` binds it into structlog's contextvars for
the duration of the task; a task invoked with no request_id (e.g. celery-beat's
schedule-triggered sweeps) gets a fresh one instead so its own logs are still traceable
as a single unit of work, just not linked back to an HTTP request that never existed.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import date

from app.core.logging import get_current_request_id
from app.db.session import dispose_engine
from app.services.ingestion import run_ingestion
from app.services.regime import RegimeRunResult
from app.services.regime import run_regime_detection as _run_regime_detection
from app.worker.celery_app import celery_app
from app.worker.logging_context import with_log_context
from app.ws.events import (
    publish_backtest_progress,
    publish_regime_change,
)

logger = logging.getLogger(__name__)


@celery_app.task(name="ingest_market_data")
@with_log_context
def ingest_market_data(
    job_id: str,
    organization_id: str,
    symbol: str,
    start: str,
    end: str,
    interval: str,
    provider: str,
    request_id: str | None = None,
) -> dict:
    async def _main() -> None:
        try:
            await run_ingestion(
                job_id=uuid.UUID(job_id),
                organization_id=uuid.UUID(organization_id),
                symbol=symbol,
                start=date.fromisoformat(start),
                end=date.fromisoformat(end),
                interval=interval,
                provider_name=provider,
            )
        finally:
            await dispose_engine()

    asyncio.run(_main())

    # Chain regime detection off the end of a successful ingest (best-effort: a
    # broker hiccup must not fail the ingest that already succeeded).
    try:
        run_regime_detection.delay(
            organization_id=organization_id, symbol=symbol, request_id=get_current_request_id()
        )
    except Exception:  # noqa: BLE001
        logger.warning("Could not enqueue regime detection for %s", symbol, exc_info=True)

    return {"job_id": job_id, "symbol": symbol}


@celery_app.task(name="run_regime_detection")
@with_log_context
def run_regime_detection(organization_id: str, symbol: str, request_id: str | None = None) -> dict:
    async def _main() -> RegimeRunResult:
        try:
            result = await _run_regime_detection(uuid.UUID(organization_id), symbol)
            # Batch 19: publish a realtime regime_update only when the head-of-series
            # label actually moved. Runs in THIS async loop, inside the worker
            # process — it publishes to Redis (app/ws/events.py), which the API
            # replicas' bridges fan out to browser sockets. A direct ws_manager call
            # here would hit the worker's own empty connection dict and reach no one.
            if result.changed:
                await publish_regime_change(
                    org_id=organization_id,
                    symbol=result.symbol,
                    old_regime=result.old_regime,
                    new_regime=result.new_regime,
                    confidence=result.confidence,
                )
            return result
        finally:
            await dispose_engine()

    result = asyncio.run(_main())

    # Chain failure monitoring off regime detection (ingest → regime → failure monitor).
    try:
        run_failure_monitor_symbol.delay(
            organization_id=organization_id, symbol=symbol, request_id=get_current_request_id()
        )
    except Exception:  # noqa: BLE001
        logger.warning("Could not enqueue failure monitor for %s", symbol, exc_info=True)

    return {"organization_id": organization_id, "symbol": symbol, "rows": result.rows}


def _enqueue_clustering(organization_id: str, failure_ids: list[str]) -> None:
    for fid in failure_ids:
        try:
            run_failure_clustering.delay(
                organization_id=organization_id, failure_id=fid, request_id=get_current_request_id()
            )
        except Exception:  # noqa: BLE001
            logger.warning("Could not enqueue clustering for failure %s", fid, exc_info=True)


def _enqueue_explanation(
    organization_id: str, failure_ids: list[str], requested_by_user_id: str | None = None
) -> None:
    for fid in failure_ids:
        try:
            run_failure_explanation.delay(
                organization_id=organization_id,
                failure_id=fid,
                requested_by_user_id=requested_by_user_id,
                request_id=get_current_request_id(),
            )
        except Exception:  # noqa: BLE001
            logger.warning("Could not enqueue LLM explanation for failure %s", fid, exc_info=True)


@celery_app.task(name="run_failure_monitor_symbol")
@with_log_context
def run_failure_monitor_symbol(organization_id: str, symbol: str, request_id: str | None = None) -> dict:
    from app.services.failure import monitor_symbol

    async def _main() -> list[str]:
        try:
            return await monitor_symbol(uuid.UUID(organization_id), symbol)
        finally:
            await dispose_engine()

    created = asyncio.run(_main())
    _enqueue_clustering(organization_id, created)
    _enqueue_explanation(organization_id, created)
    return {"organization_id": organization_id, "symbol": symbol, "failures_created": created}


@celery_app.task(name="run_manual_failure")
@with_log_context
def run_manual_failure(
    organization_id: str,
    strategy_id: str,
    symbol: str,
    reason: str,
    user_id: str | None = None,
    request_id: str | None = None,
) -> dict:
    from app.models.failure import FailureTrigger
    from app.services.failure import monitor_and_fail

    async def _main() -> str | None:
        try:
            return await monitor_and_fail(
                uuid.UUID(organization_id),
                uuid.UUID(strategy_id),
                symbol,
                force_trigger=FailureTrigger.MANUAL,
                manual_reason=reason,
                actor_user_id=uuid.UUID(user_id) if user_id else None,
            )
        finally:
            await dispose_engine()

    failure_id = asyncio.run(_main())
    if failure_id:
        _enqueue_clustering(organization_id, [failure_id])
        _enqueue_explanation(organization_id, [failure_id], requested_by_user_id=user_id)
    return {"strategy_id": strategy_id, "failure_id": failure_id}


@celery_app.task(name="run_failure_clustering")
@with_log_context
def run_failure_clustering(organization_id: str, failure_id: str, request_id: str | None = None) -> dict:
    from app.services.failure import run_clustering

    async def _main() -> list[str]:
        try:
            return await run_clustering(uuid.UUID(organization_id), uuid.UUID(failure_id))
        finally:
            await dispose_engine()

    related = asyncio.run(_main())
    return {"failure_id": failure_id, "related": related}


@celery_app.task(name="run_failure_explanation")
@with_log_context
def run_failure_explanation(
    organization_id: str,
    failure_id: str,
    requested_by_user_id: str | None = None,
    request_id: str | None = None,
) -> dict:
    from app.services.llm_explain import explain_failure_and_persist

    async def _main() -> dict:
        try:
            return await explain_failure_and_persist(
                uuid.UUID(organization_id),
                uuid.UUID(failure_id),
                uuid.UUID(requested_by_user_id) if requested_by_user_id else None,
            )
        finally:
            await dispose_engine()

    return asyncio.run(_main())


@celery_app.task(name="run_failure_monitor_sweep")
@with_log_context
def run_failure_monitor_sweep(request_id: str | None = None) -> dict:
    from app.services.failure import monitor_sweep

    async def _main() -> list[tuple[str, str]]:
        try:
            return await monitor_sweep()
        finally:
            await dispose_engine()

    results = asyncio.run(_main())  # list of (organization_id, failure_id)
    for org_id, fid in results:
        _enqueue_clustering(org_id, [fid])
        _enqueue_explanation(org_id, [fid])
    return {"failures_created": len(results)}


@celery_app.task(name="send_weekly_digests")
@with_log_context
def send_weekly_digests(request_id: str | None = None) -> dict:
    """Batch 22: weekly beat sweep — deliver the digest to every active, opted-in org
    over the existing webhook/log channel (no SMTP)."""
    from app.services.weekly_digest import send_all_active_digests

    async def _main() -> int:
        try:
            return await send_all_active_digests()
        finally:
            await dispose_engine()

    return {"digests_sent": asyncio.run(_main())}


@celery_app.task(name="refresh_market_universe")
@with_log_context
def refresh_market_universe(request_id: str | None = None) -> dict:
    """Daily continuous-data-integration sweep: keep every active org's tracked symbols
    current with the market and recompute regimes where a new bar landed. See
    app/services/market_refresh.py for the incremental, self-adjusting design."""
    from app.services.market_refresh import refresh_all_active_orgs

    async def _main() -> list[dict]:
        try:
            return await refresh_all_active_orgs()
        finally:
            await dispose_engine()

    summaries = asyncio.run(_main())
    return {
        "orgs_swept": len(summaries),
        "symbols_refreshed": sum(s["symbols_refreshed"] for s in summaries),
        "regimes_recomputed": sum(s["regimes_recomputed"] for s in summaries),
    }


@celery_app.task(name="refresh_strategy_signals")
@with_log_context
def refresh_strategy_signals(request_id: str | None = None) -> dict:
    """Batch 26 Part B: re-evaluate Buy/Sell/Hold signals for every genuinely-Active
    strategy across all active orgs, persisting + broadcasting org-scoped
    ``strategy_signal`` events on change. Deterministic rule evaluation only — the
    signal service has no import path to the LLM layer. Runs in its own asyncio loop,
    so the Redis client is recreated per loop (Batch 25 fix) and events are not
    silently dropped after the worker's first task."""
    from app.services.signals import refresh_all_active_org_signals

    async def _main() -> dict:
        try:
            return await refresh_all_active_org_signals()
        finally:
            await dispose_engine()

    return asyncio.run(_main())


@celery_app.task(name="refresh_macro_data")
@with_log_context
def refresh_macro_data(request_id: str | None = None) -> dict:
    """Batch 28: refresh FRED macro series (yield curve, VIX) and publish them on the
    realtime bridge's global scope. No-op (not an error) when FRED_API_KEY is unset —
    see app/services/macro_data.py for the honesty contract."""
    from app.services.macro_data import refresh_macro

    async def _main() -> dict:
        try:
            return await refresh_macro()
        finally:
            await dispose_engine()

    return asyncio.run(_main())


@celery_app.task(name="refresh_screener_data")
@with_log_context
def refresh_screener_data(request_id: str | None = None) -> dict:
    """Batch 28: refresh the market screener (feeds the Screener table + Sector
    Heatmap) and publish it on the realtime bridge's global scope."""
    from app.services.market_screener import refresh_screener

    async def _main() -> dict:
        try:
            return await refresh_screener()
        finally:
            await dispose_engine()

    return asyncio.run(_main())


@celery_app.task(name="refresh_global_index_quotes")
@with_log_context
def refresh_global_index_quotes(request_id: str | None = None) -> dict:
    """Batch 25: refresh delayed quotes for the global indices on the dashboard and
    publish them on the realtime bridge's global scope. See
    app/services/market_quotes.py for the honesty contract (delayed, never synthesized)."""
    from app.services.market_quotes import refresh_quotes

    async def _main() -> dict:
        return await refresh_quotes()

    return asyncio.run(_main())


@celery_app.task(name="run_strategy_backtest")
@with_log_context
def run_strategy_backtest(
    organization_id: str, strategy_id: str, symbol: str, request_id: str | None = None
) -> dict:
    from app.services.strategy import run_backtest

    async def _main() -> dict:
        try:
            # Batch 19: honest bookends, not fabricated deciles. run_backtest is one
            # vectorbt call with no internal progress loop, so there is no real 10%,
            # 20%, ... to report — emitting them would be inventing data. We publish
            # the two transitions that genuinely happen: work started, work finished.
            await publish_backtest_progress(
                org_id=organization_id,
                backtest_id=strategy_id,
                pct_complete=0,
                status="running",
                current_step="Running regime-aware backtest",
            )
            result = await run_backtest(uuid.UUID(organization_id), uuid.UUID(strategy_id), symbol)
            await publish_backtest_progress(
                org_id=organization_id,
                backtest_id=strategy_id,
                pct_complete=100,
                status="complete",
                current_step="Backtest complete",
            )
            return result
        finally:
            await dispose_engine()

    return asyncio.run(_main())


@celery_app.task(name="run_strategy_validation")
@with_log_context
def run_strategy_validation(
    organization_id: str, strategy_id: str, symbol: str, request_id: str | None = None
) -> dict:
    from app.services.strategy import run_strategy_validation as _run_validation

    async def _main() -> dict:
        try:
            return await _run_validation(uuid.UUID(organization_id), uuid.UUID(strategy_id), symbol)
        finally:
            await dispose_engine()

    return asyncio.run(_main())


@celery_app.task(name="run_evolution")
@with_log_context
def run_evolution_task(
    organization_id: str, run_id: str, user_id: str, request_id: str | None = None
) -> dict:
    from app.services.evolution import run_evolution as _run_evolution

    async def _main() -> dict:
        try:
            return await _run_evolution(uuid.UUID(organization_id), uuid.UUID(run_id), uuid.UUID(user_id))
        finally:
            await dispose_engine()

    return asyncio.run(_main())


@celery_app.task(name="run_agent_analysis")
@with_log_context
def run_agent_analysis_task(organization_id: str, analysis_id: str, request_id: str | None = None) -> dict:
    """Batch 30 (ADR 0009): one multi-agent desk run (TradingAgents pipeline). Minutes
    long and LLM-bound; progress streams as org-scoped ``agent_progress`` events."""
    from app.services.agent_desk import run_analysis

    async def _main() -> dict:
        try:
            return await run_analysis(uuid.UUID(organization_id), uuid.UUID(analysis_id))
        finally:
            await dispose_engine()

    return asyncio.run(_main())


@celery_app.task(name="run_agent_backtest")
@with_log_context
def run_agent_backtest_task(organization_id: str, run_id: str, request_id: str | None = None) -> dict:
    """Batch 30: a ticker x date grid of desk runs, scored by realised alpha per regime.
    Resumable — re-running the task skips cells that already exist."""
    from app.services.agent_desk import run_backtest

    async def _main() -> dict:
        try:
            return await run_backtest(uuid.UUID(organization_id), uuid.UUID(run_id))
        finally:
            await dispose_engine()

    return asyncio.run(_main())


@celery_app.task(name="settle_agent_analyses")
@with_log_context
def settle_agent_analyses_task(organization_id: str | None = None, request_id: str | None = None) -> dict:
    """Batch 30: append realised return / alpha + a reflection to every completed desk
    call whose holding window has now traded. One org on demand, or every active org
    from the nightly beat entry."""
    from app.db.session import get_tenant_session
    from app.services.agent_desk import settle_all_orgs, settle_org_pending

    async def _main() -> dict:
        try:
            if organization_id is None:
                return await settle_all_orgs()
            async with get_tenant_session(uuid.UUID(organization_id)) as session:
                return await settle_org_pending(session)
        finally:
            await dispose_engine()

    return asyncio.run(_main())


@celery_app.task(name="check_price_alerts")
@with_log_context
def check_price_alerts_task(request_id: str | None = None) -> dict:
    """Batch 31 (ADR 0010): fire Market Terminal price alerts whose level was crossed.
    One batched quote call for every symbol with an active alert, then per-org
    evaluation in tenant-scoped sessions (notification + owner-addressed WS event)."""
    from app.terminal.userdata import check_all_alerts

    async def _main() -> dict:
        try:
            return await check_all_alerts()
        finally:
            await dispose_engine()

    return asyncio.run(_main())


@celery_app.task(name="warm_terminal_caches")
@with_log_context
def warm_terminal_caches_task(request_id: str | None = None) -> dict:
    """Batch 31: pre-load the FINRA short-volume files for recent sessions."""
    from app.terminal.market import warm_finra

    async def _main() -> dict:
        try:
            return {"finra_days": await warm_finra()}
        finally:
            await dispose_engine()

    return asyncio.run(_main())


@celery_app.task(name="system_heartbeat")
@with_log_context
def system_heartbeat(request_id: str | None = None) -> dict:
    """Batch 12: proof-of-life for `celery beat` + at least one worker actually
    executing tasks — System Monitoring's "Celery worker" health card checks
    freshness of this timestamp, not just broker reachability.

    Batch 13: also the periodic recomputation point for the two Prometheus
    gauges that can't be updated incrementally at each of their many
    change-triggering call sites without drift risk (active_strategies_gauge,
    celery_queue_pending_gauge) — see app.services.system_health.refresh_gauge_metrics.
    """
    from app.core.metrics import refresh_gauge_metrics
    from app.services.system_health import record_heartbeat

    async def _main() -> None:
        try:
            await record_heartbeat()
            await refresh_gauge_metrics()
        finally:
            await dispose_engine()

    asyncio.run(_main())
    return {"recorded": True}


@celery_app.task(name="run_compliance_export")
@with_log_context
def run_compliance_export(job_id: str, organization_id: str, request_id: str | None = None) -> dict:
    from app.services.compliance_export import run_export

    async def _main() -> None:
        try:
            await run_export(uuid.UUID(job_id), uuid.UUID(organization_id))
        finally:
            await dispose_engine()

    asyncio.run(_main())
    return {"job_id": job_id}
