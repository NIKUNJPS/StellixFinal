"""Backtest Results (Page 13, Batch 12): GET /strategies/{id}/backtest-results
and GET /strategies/top-performers, against constructed fixtures with known
expected output, per the batch's own DoD wording. Also covers the
organization benchmark_symbol settings endpoint (pre-note 3)."""

from __future__ import annotations

from datetime import UTC, datetime

from app.db.tenant import bind_organization
from app.models.performance_snapshot import AGGREGATE_LABEL, PerformanceSnapshot
from app.models.trade_record import TradeRecord
from app.services.backtest_cache import record_backtest_charts
from sqlalchemy.ext.asyncio import async_sessionmaker

from tests.data_helpers import seed_strategy
from tests.helpers import bearer, register_org


async def _seed_snapshot(
    maker: async_sessionmaker, *, organization_id, strategy_id, regime_label: str, sharpe: float | None
) -> None:
    async with maker() as session:
        bind_organization(session.sync_session, organization_id)
        session.add(
            PerformanceSnapshot(
                strategy_id=strategy_id,
                regime_label=regime_label,
                sharpe_ratio=sharpe,
                sortino_ratio=1.1,
                max_drawdown=-0.15,
                win_rate=0.6,
                profit_factor=1.8,
                calmar_ratio=0.9,
                trade_count=5,
                beta_vs_benchmark=0.8 if regime_label == AGGREGATE_LABEL else None,
                annualized_return=0.12 if regime_label == AGGREGATE_LABEL else None,
                volatility=0.2 if regime_label == AGGREGATE_LABEL else None,
            )
        )
        await session.commit()


async def _seed_trade(maker: async_sessionmaker, *, organization_id, strategy_id, day: int, pnl: float) -> None:
    async with maker() as session:
        bind_organization(session.sync_session, organization_id)
        session.add(
            TradeRecord(
                strategy_id=strategy_id,
                entry_timestamp=datetime(2024, 1, day, tzinfo=UTC),
                exit_timestamp=datetime(2024, 1, day + 1, tzinfo=UTC),
                direction="Long",
                entry_price=100.0,
                exit_price=100.0 + pnl,
                pnl=pnl,
                return_pct=pnl / 100.0,
                regime_at_entry="Bull",
            )
        )
        await session.commit()


async def test_backtest_results_empty_before_any_run(client, db_session_factory):
    token, org = await register_org(client, org_name="NeverRunCo2", email="n2@neverrunco.com")
    strategy_id = await seed_strategy(db_session_factory, organization_id=org)

    resp = await client.get(f"/strategies/{strategy_id}/backtest-results", headers=bearer(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_run"] is False
    assert body["aggregate"] is None
    assert body["per_regime"] == []
    assert body["trades"] == []
    assert body["charts"] is None


async def test_backtest_results_known_fixture(client, db_session_factory):
    token, org = await register_org(client, org_name="BacktestResCo", email="b@backtestresco.com")
    strategy_id = await seed_strategy(db_session_factory, organization_id=org)

    await _seed_snapshot(db_session_factory, organization_id=org, strategy_id=strategy_id, regime_label=AGGREGATE_LABEL, sharpe=1.5)
    await _seed_snapshot(db_session_factory, organization_id=org, strategy_id=strategy_id, regime_label="Bull", sharpe=2.0)
    await _seed_trade(db_session_factory, organization_id=org, strategy_id=strategy_id, day=1, pnl=50.0)
    await _seed_trade(db_session_factory, organization_id=org, strategy_id=strategy_id, day=3, pnl=-20.0)

    import pandas as pd

    idx = pd.date_range("2024-01-01", periods=3, freq="D", tz="UTC")
    await record_backtest_charts(
        strategy_id,
        equity_curve=pd.Series([100_000.0, 100_050.0, 100_030.0], index=idx),
        drawdown_series=pd.Series([0.0, 0.0, -0.0002], index=idx),
        rolling_sharpe=pd.Series([None, None, None], index=idx),
    )

    resp = await client.get(f"/strategies/{strategy_id}/backtest-results", headers=bearer(token))
    assert resp.status_code == 200
    body = resp.json()

    assert body["has_run"] is True
    assert body["aggregate"]["regime_label"] == AGGREGATE_LABEL
    assert body["aggregate"]["sharpe_ratio"] == 1.5
    assert body["aggregate"]["beta_vs_benchmark"] == 0.8
    assert body["aggregate"]["annualized_return"] == 0.12
    assert body["aggregate"]["volatility"] == 0.2

    assert len(body["per_regime"]) == 1
    assert body["per_regime"][0]["regime_label"] == "Bull"
    assert body["per_regime"][0]["sharpe_ratio"] == 2.0
    # Beta/annualized_return/volatility are aggregate-only -> None on the per-regime row.
    assert body["per_regime"][0]["beta_vs_benchmark"] is None

    assert len(body["trades"]) == 2
    assert {t["pnl"] for t in body["trades"]} == {50.0, -20.0}

    assert body["charts"] is not None
    assert len(body["charts"]["equity_curve"]) == 3
    assert body["charts"]["equity_curve"][1]["value"] == 100_050.0


async def test_backtest_results_404_for_unknown_strategy(client):
    token, _org = await register_org(client, org_name="Unknown404Co", email="u@unknown404co.com")
    import uuid

    resp = await client.get(f"/strategies/{uuid.uuid4()}/backtest-results", headers=bearer(token))
    assert resp.status_code == 404


async def test_top_performers_ranks_by_sharpe_and_skips_uncached(client, db_session_factory):
    token, org = await register_org(client, org_name="TopPerfCo", email="t@topperfco.com")

    high = await seed_strategy(db_session_factory, organization_id=org, name="High Sharpe")
    mid = await seed_strategy(db_session_factory, organization_id=org, name="Mid Sharpe")
    uncached = await seed_strategy(db_session_factory, organization_id=org, name="Uncached")

    await _seed_snapshot(db_session_factory, organization_id=org, strategy_id=high, regime_label=AGGREGATE_LABEL, sharpe=2.5)
    await _seed_snapshot(db_session_factory, organization_id=org, strategy_id=mid, regime_label=AGGREGATE_LABEL, sharpe=1.0)
    # Highest Sharpe of all, but never had its equity curve cached (e.g. cache expired)
    # -> must be excluded rather than shown with a broken/empty overlay line.
    await _seed_snapshot(db_session_factory, organization_id=org, strategy_id=uncached, regime_label=AGGREGATE_LABEL, sharpe=9.0)

    import pandas as pd

    idx = pd.date_range("2024-01-01", periods=2, freq="D", tz="UTC")
    for sid in (high, mid):
        await record_backtest_charts(
            sid,
            equity_curve=pd.Series([100_000.0, 100_100.0], index=idx),
            drawdown_series=pd.Series([0.0, 0.0], index=idx),
            rolling_sharpe=pd.Series([None, None], index=idx),
        )

    resp = await client.get("/strategies/top-performers?limit=5", headers=bearer(token))
    assert resp.status_code == 200
    items = resp.json()["items"]

    assert [i["name"] for i in items] == ["High Sharpe", "Mid Sharpe"]
    assert items[0]["sharpe_ratio"] == 2.5
    assert len(items[0]["equity_curve"]) == 2


async def test_organization_benchmark_symbol_admin_only(client):
    token, _org = await register_org(client, org_name="BenchSymCo", email="admin@benchsymco.com")

    me = await client.get("/auth/me", headers=bearer(token))
    assert me.json()["organization"]["benchmark_symbol"] == "SPY"  # model default

    resp = await client.patch(
        "/organizations/me", json={"benchmark_symbol": "qqq"}, headers=bearer(token)
    )
    assert resp.status_code == 200
    assert resp.json()["benchmark_symbol"] == "QQQ"  # normalized upper-case

    me_after = await client.get("/auth/me", headers=bearer(token))
    assert me_after.json()["organization"]["benchmark_symbol"] == "QQQ"


async def test_organization_benchmark_symbol_rejects_non_admin(client, db_session_factory):
    from app.models.user import UserRole

    from tests.helpers import create_org_user
    from tests.helpers import login as do_login

    await create_org_user(
        db_session_factory, org_name="NonAdminBenchCo", slug="non-admin-bench-co",
        email="researcher@nonadminbenchco.com", role=UserRole.RESEARCHER,
    )

    login_resp = await do_login(client, email="researcher@nonadminbenchco.com")
    token = login_resp.json()["access_token"]

    resp = await client.patch(
        "/organizations/me", json={"benchmark_symbol": "QQQ"}, headers=bearer(token)
    )
    assert resp.status_code == 403
