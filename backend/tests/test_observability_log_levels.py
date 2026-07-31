"""Log levels for pre-existing WARNING-worthy events (Batch 13, task: confirm
Batch 2 data-quality flags and Batch 9 numeric-validation failures are
actually logged, not just silently stored where only a targeted query would
surface them)."""

from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest
from app.core.security import hash_password
from app.db.tenant import bind_organization, mark_session_unscoped
from app.models.ingestion_job import IngestionJob, IngestionStatus
from app.models.organization import Organization, OrganizationTier
from app.models.user import User, UserRole

from tests.data_helpers import make_synthetic_ohlcv
from tests.llm_test_helpers import patch_llm_providers

pytestmark = pytest.mark.anyio


async def test_ingestion_data_quality_warnings_are_logged(db_session_factory, caplog):
    import app.services.ingestion as ingestion_module

    org_id = uuid.uuid4()
    job_id = uuid.uuid4()

    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        session.add(Organization(id=org_id, name="LogLevelCo", slug="log-level-co", tier=OrganizationTier.STARTER, max_strategies=25, is_active=True))
        await session.commit()

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org_id)
        session.add(
            IngestionJob(
                id=job_id, symbol="BADCO", start_date=date(2024, 1, 1), end_date=date(2024, 1, 10),
                interval="1d", provider="test", status=IngestionStatus.PENDING,
            )
        )
        await session.commit()

    # A real, deterministic OHLC series (enough history for every indicator's
    # window) with one row's close NaN'd out -> validate_and_clean produces a
    # "nan_rows_dropped" warning dict, dropping 1 of 60 rows (well within
    # DATA_NAN_TOLERANCE for the rest of the pipeline to still succeed).
    raw = make_synthetic_ohlcv(n=60)
    raw.loc[30, "close"] = float("nan")

    class _FakeProvider:
        name = "test"

        def fetch_ohlcv(self, symbol, start, end, interval):
            return raw

    @asynccontextmanager
    async def _fake_tenant_session(organization_id):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, organization_id)
            yield session
            await session.commit()

    # persist_market_data/persist_features do a genuine bulk INSERT, which
    # trips a SQLAlchemy insertmanyvalues sentinel-matching quirk specific to
    # SQLite on a composite-PK + tz-datetime table (the same reason
    # tests/data_helpers.py's seed_market_data flushes one row at a time,
    # and why the full pipeline's own test is an `integration` test against
    # real Postgres). Stubbed out here since this test only cares whether
    # the data-quality warning gets logged, not that persistence succeeds.
    with (
        patch.object(ingestion_module, "get_provider", return_value=_FakeProvider()),
        patch.object(ingestion_module, "get_tenant_session", _fake_tenant_session),
        patch.object(ingestion_module, "persist_market_data", AsyncMock(return_value=59)),
        patch.object(ingestion_module, "persist_features", AsyncMock(return_value=59)),
    ):
        with caplog.at_level(logging.WARNING, logger="app.services.ingestion"):
            await ingestion_module.run_ingestion(
                job_id=job_id, organization_id=org_id, symbol="BADCO",
                start=date(2024, 1, 1), end=date(2024, 1, 10), interval="1d", provider_name="test",
            )

    warning_records = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert any("Data-quality warnings" in r.message for r in warning_records), (
        f"no data-quality warning logged; records: {[r.message for r in caplog.records]}"
    )
    assert any("BADCO" in r.message for r in warning_records)


async def test_llm_numeric_hallucination_is_logged_at_warning(db_session_factory, caplog):
    from app.llm.service import LLMService

    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        org = Organization(name="HallucinationLogCo", slug="hallucination-log-co", tier=OrganizationTier.STARTER, max_strategies=25, is_active=True)
        session.add(org)
        await session.flush()
        user = User(
            organization_id=org.id, email="h@hallucinationlogco.com",
            hashed_password=hash_password("supersecret1"), full_name=None,
            role=UserRole.RESEARCHER, is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(org)
        await session.refresh(user)

    real_failure_record = {"sharpe_ratio": 0.45, "max_drawdown": -0.12, "win_rate": 0.35}

    with patch_llm_providers({
        "explanation_text": "The strategy failed with an excellent Sharpe of 1.9.",
        "regime_context_summary": "Bear regime.",
        "suggested_mitigation": "Reduce position size.",
        "numeric_claims": [{"metric_name": "sharpe_ratio", "claimed_value": 1.9}],
    }):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, org.id)
            llm = LLMService(session, organization_id=org.id, user_id=user.id)
            with caplog.at_level(logging.WARNING, logger="app.llm.service"):
                _explanation, numeric_validation_passed = await llm.explain_failure(
                    failure_record=real_failure_record
                )

    assert numeric_validation_passed is False
    warning_records = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert any("hallucination guard failed" in r.message for r in warning_records), (
        f"no hallucination-guard warning logged; records: {[r.message for r in caplog.records]}"
    )
