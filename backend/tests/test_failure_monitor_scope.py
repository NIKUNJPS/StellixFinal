"""The failure monitor judges a strategy against ITS OWN symbol only.

Regression for the Batch 29 finding (docs/PLATFORM_STATE.md): ``monitor_sweep`` crossed
every active strategy with every symbol the org held data for, so a SPY strategy was
failed on another instrument's regime. ``monitor_and_fail`` is stubbed to record which
(strategy, symbol) pairs the sweep / ingestion hook asks about.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime

import pytest
from app.db.tenant import bind_organization, mark_session_unscoped
from app.models.market_data import MarketData
from app.models.strategy import Strategy, StrategyStatus
from app.services import failure as failure_service
from sqlalchemy import select

from tests.data_helpers import seed_strategy
from tests.helpers import create_org_user


async def _symbol(maker, org_id, strategy_id, symbol):
    async with maker() as session:
        bind_organization(session.sync_session, org_id)
        row = (await session.execute(select(Strategy).where(Strategy.id == strategy_id))).scalar_one()
        row.symbol = symbol
        await session.commit()


async def _market_data(maker, org_id, symbols):
    async with maker() as session:
        bind_organization(session.sync_session, org_id)
        for symbol in symbols:
            session.add(MarketData(symbol=symbol, timestamp=datetime(2026, 1, 2, tzinfo=UTC), open=1.0, high=1.0,
                                   low=1.0, close=1.0, volume=1.0, source="test"))
            await session.flush()
        await session.commit()


@pytest.fixture
def recorded(monkeypatch, db_session_factory):
    calls: list[tuple[str, str]] = []

    @asynccontextmanager
    async def system_session():
        async with db_session_factory() as s:
            mark_session_unscoped(s.sync_session)
            yield s

    @asynccontextmanager
    async def tenant_session(org_id):
        async with db_session_factory() as s:
            bind_organization(s.sync_session, org_id)
            yield s

    async def fake_monitor_and_fail(org_id, strategy_id, symbol, **kwargs):
        calls.append((str(strategy_id), symbol))
        return None

    monkeypatch.setattr(failure_service, "get_system_session", system_session)
    monkeypatch.setattr(failure_service, "get_tenant_session", tenant_session)
    monkeypatch.setattr(failure_service, "monitor_and_fail", fake_monitor_and_fail)
    return calls


@pytest.mark.anyio
async def test_sweep_pairs_each_active_strategy_with_its_own_symbol_only(db_session_factory, recorded):
    org, _user = await create_org_user(db_session_factory, org_name="Scope Co", slug="scope-co", email="s@scope.io")
    spy = await seed_strategy(db_session_factory, organization_id=org.id, name="SPY strat", status=StrategyStatus.ACTIVE)
    qqq = await seed_strategy(db_session_factory, organization_id=org.id, name="QQQ strat", status=StrategyStatus.ACTIVE)
    nosym = await seed_strategy(db_session_factory, organization_id=org.id, name="No symbol", status=StrategyStatus.ACTIVE)
    retired = await seed_strategy(db_session_factory, organization_id=org.id, name="Old", status=StrategyStatus.RETIRED)
    await _symbol(db_session_factory, org.id, spy, "SPY")
    await _symbol(db_session_factory, org.id, qqq, "qqq")  # case-insensitive match
    await _symbol(db_session_factory, org.id, retired, "SPY")
    # The org holds data for many unrelated symbols — the old code judged every strategy on all of them.
    await _market_data(db_session_factory, org.id, ["SPY", "QQQ", "ACGL", "CRM", "AVB"])

    await failure_service.monitor_sweep()

    assert sorted(recorded) == sorted([(str(spy), "SPY"), (str(qqq), "QQQ")])
    assert str(nosym) not in {sid for sid, _ in recorded}  # no symbol -> cannot be monitored
    assert str(retired) not in {sid for sid, _ in recorded}  # not active


@pytest.mark.anyio
async def test_ingestion_hook_only_checks_strategies_on_the_ingested_symbol(db_session_factory, recorded):
    org, _user = await create_org_user(db_session_factory, org_name="Hook Co", slug="hook-co", email="h@hook.io")
    spy = await seed_strategy(db_session_factory, organization_id=org.id, name="SPY strat", status=StrategyStatus.ACTIVE)
    qqq = await seed_strategy(db_session_factory, organization_id=org.id, name="QQQ strat", status=StrategyStatus.ACTIVE)
    await _symbol(db_session_factory, org.id, spy, "SPY")
    await _symbol(db_session_factory, org.id, qqq, "QQQ")

    await failure_service.monitor_symbol(org.id, "acgl")  # an unrelated symbol is ingested
    assert recorded == []

    await failure_service.monitor_symbol(org.id, " spy ")
    assert [sid for sid, _ in recorded] == [str(spy)]  # only the SPY strategy, not the QQQ one
