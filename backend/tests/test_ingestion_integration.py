"""Integration: real AAPL OHLCV pulled end-to-end through Celery into live Postgres.

Opt-in (needs network + a live DB): RUN_INTEGRATION=1. Run with the backend pointed at
a real database (backend/.env). Verifies the full pipeline AND spot-checks SMA-20
against an independent manual mean.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

pytestmark = pytest.mark.integration


def test_real_aapl_ingestion_through_celery():
    from app.db.session import dispose_engine, get_system_session, get_tenant_session
    from app.models.feature_matrix import FeatureMatrix
    from app.models.ingestion_job import IngestionJob, IngestionStatus
    from app.models.market_data import MarketData
    from app.models.organization import Organization, OrganizationTier
    from app.worker.tasks import ingest_market_data

    slug = "int-" + uuid.uuid4().hex[:8]

    async def setup():
        async with get_system_session() as s:
            org = Organization(
                name="Integration Co",
                slug=slug,
                tier=OrganizationTier.STARTER,
                max_strategies=25,
                is_active=True,
            )
            s.add(org)
            await s.flush()
            org_id = org.id
        async with get_tenant_session(org_id) as s:
            job = IngestionJob(
                symbol="AAPL",
                start_date=date(2024, 1, 2),
                end_date=date(2024, 3, 1),
                interval="1d",
                provider="yfinance",
                status=IngestionStatus.PENDING,
            )
            s.add(job)
            await s.flush()
            job_id = job.id
        await dispose_engine()
        return org_id, job_id

    org_id, job_id = asyncio.run(setup())

    # Run the ingest THROUGH Celery (eager .apply — no broker needed).
    result = ingest_market_data.apply(
        kwargs=dict(
            job_id=str(job_id),
            organization_id=str(org_id),
            symbol="AAPL",
            start="2024-01-02",
            end="2024-03-01",
            interval="1d",
            provider="yfinance",
        )
    )
    assert result.successful(), getattr(result, "traceback", None)

    async def verify():
        async with get_tenant_session(org_id) as s:
            job = (
                await s.execute(select(IngestionJob).where(IngestionJob.id == job_id))
            ).scalar_one()
            n_md = await s.scalar(
                select(func.count()).select_from(MarketData).where(MarketData.symbol == "AAPL")
            )
            n_ft = await s.scalar(
                select(func.count()).select_from(FeatureMatrix).where(FeatureMatrix.symbol == "AAPL")
            )
            md = (
                await s.execute(
                    select(MarketData).where(MarketData.symbol == "AAPL").order_by(MarketData.timestamp)
                )
            ).scalars().all()
            fm = (
                await s.execute(
                    select(FeatureMatrix).where(FeatureMatrix.symbol == "AAPL").order_by(FeatureMatrix.timestamp)
                )
            ).scalars().all()
        await dispose_engine()
        return job, n_md, n_ft, md, fm

    job, n_md, n_ft, md, fm = asyncio.run(verify())

    assert job.status == IngestionStatus.DONE, job.error
    assert n_md > 20, f"expected >20 daily bars, got {n_md}"
    assert n_ft == n_md, "feature rows must match market_data rows"

    # SMA-20 at the last bar must equal the manual mean of the last 20 closes.
    closes = [r.close for r in md]
    expected_sma20 = sum(closes[-20:]) / 20
    last_sma20 = fm[-1].sma_20
    assert last_sma20 is not None
    assert abs(last_sma20 - expected_sma20) < 1e-6, f"{last_sma20} != {expected_sma20}"
    # JSONB features bag is populated alongside the typed columns.
    assert "rsi_14" in fm[-1].features
