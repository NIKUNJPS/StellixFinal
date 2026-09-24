"""Batch 26 Part B — signal generation service + delivery + permission gate.

Covers: signals only from genuinely-Active strategies (the real ADR-0008 gate, not a
parallel check), reuse of the REAL DSL evaluator, HOLD from position replay, LLM
import isolation, org isolation, org-scoped realtime delivery, and the signals.view
permission gate. No test makes a live network call.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

import pandas as pd
import pytest
from app.core.security import create_access_token
from app.db.tenant import bind_organization
from app.models.approval_record import ApprovalAction, ApprovalRecord
from app.models.feature_matrix import FeatureMatrix
from app.models.market_data import MarketData
from app.models.regime_label import RegimeLabelRecord
from app.models.strategy import Strategy, StrategyCreator, StrategyStatus
from app.models.strategy_signal import SignalType, StrategySignal
from app.models.user import UserRole
from app.models.validation_result import ValidationResult
from app.rbac.catalog import P
from app.regime.taxonomy import RegimeLabel
from app.validation.composite import ValidationClassification
from sqlalchemy import select

from tests.helpers import add_user_to_org, bearer, create_org_user

_ENTRY = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": "<", "value": 32}]}
_EXIT = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": ">", "value": 62}]}
_RISK = {"max_drawdown_pct": 20, "max_position_size_pct": 10, "stop_loss_pct": 5}


# --------------------------------------------------------------------------- helpers
class InMemoryRedis:
    def __init__(self) -> None:
        self.published: list[tuple[str, str]] = []

    async def publish(self, channel, message):
        self.published.append((channel, message))
        return 1


@pytest.fixture
def memory_redis(monkeypatch):
    from app.clients import redis_client

    fake = InMemoryRedis()
    monkeypatch.setattr(redis_client, "get_client", lambda: fake)
    return fake


def _token(user) -> dict[str, str]:
    return bearer(create_access_token(user_id=user.id, organization_id=user.organization_id, role=user.role.value))


async def _seed_symbol(maker, org_id: uuid.UUID, symbol: str, rsi_series: list[float], regime: str = "Low-Volatility"):
    """Insert market_data + feature_matrix (rsi_14) + regime_labels for `symbol`."""
    start = datetime(2024, 1, 1, tzinfo=UTC)
    async with maker() as session:
        bind_organization(session.sync_session, org_id)
        for i, rsi in enumerate(rsi_series):
            ts = start + timedelta(days=i)
            session.add(MarketData(symbol=symbol, timestamp=ts, open=100.0, high=101.0, low=99.0, close=100.0, volume=1e6, source="test"))
            await session.flush()
            session.add(FeatureMatrix(symbol=symbol, timestamp=ts, features={}, rsi_14=rsi))
            await session.flush()
            session.add(RegimeLabelRecord(
                symbol=symbol, timestamp=ts, regime_label=RegimeLabel(regime), confidence_score=0.75,
                model_votes={"hmm": regime}, transition_probs={"matrix": [[1.0]]},
            ))
            await session.flush()
        await session.commit()


async def _make_strategy(
    maker, org_id: uuid.UUID, *, symbol: str | None = "SPY", status=StrategyStatus.ACTIVE,
    robustness: float = 0.8, approved: bool = True, name: str = "SPY RSI",
) -> uuid.UUID:
    async with maker() as session:
        bind_organization(session.sync_session, org_id)
        strat = Strategy(
            name=name, symbol=symbol, creator=StrategyCreator.HUMAN, status=status, version="v1.0",
            parameters={}, entry_rules=_ENTRY, exit_rules=_EXIT, risk_constraints=_RISK,
            robustness_score=robustness,
        )
        session.add(strat)
        await session.flush()
        session.add(ValidationResult(
            strategy_id=strat.id, strategy_version="v1.0", walk_forward_score=robustness,
            regime_cv_score=robustness, monte_carlo_score=robustness, persistence_score=robustness,
            stress_test_score=robustness, composite_score=robustness,
            classification=ValidationClassification.ELIGIBLE_ACTIVE if robustness >= 0.70 else ValidationClassification.CANDIDATE,
            method_details={"seeded": True},
        ))
        if approved:
            session.add(ApprovalRecord(
                strategy_id=strat.id, approved_by_user_id=None, action=ApprovalAction.APPROVE,
                justification="seeded approval",
            ))
        await session.commit()
        await session.refresh(strat)
        return strat.id


async def _load_strategy(maker, org_id, strategy_id) -> Strategy:
    async with maker() as session:
        bind_organization(session.sync_session, org_id)
        return (await session.execute(select(Strategy).where(Strategy.id == strategy_id))).scalar_one()


# --------------------------------------------------------------------------- gate
@pytest.mark.parametrize("status", [StrategyStatus.DRAFT, StrategyStatus.CANDIDATE, StrategyStatus.FAILED, StrategyStatus.RETIRED])
async def test_signal_only_for_genuinely_active_strategies(db_session_factory, status):
    """A non-Active strategy produces no signal even when its rules would fire true on
    the latest bar. Only a genuinely-Active (validated + approved, robustness>=0.70)
    strategy does."""
    from app.services import signals as sig

    org, _ = await create_org_user(db_session_factory, org_name="Sig A", slug="sig-a", email="a@sig.io")
    # latest bar rsi = 25 < 32 -> a BUY WOULD fire if the strategy were active.
    await _seed_symbol(db_session_factory, org.id, "SPY", [50, 40, 25])

    not_active = await _make_strategy(db_session_factory, org.id, status=status, approved=False, name=f"{status.value}")
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        strat = (await session.execute(select(Strategy).where(Strategy.id == not_active))).scalar_one()
        assert await sig.is_genuinely_active(session, strat) is False
        assert await sig.evaluate_strategy_signal(session, strat) is None

    active = await _make_strategy(db_session_factory, org.id, status=StrategyStatus.ACTIVE, approved=True, name="active")
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        strat = (await session.execute(select(Strategy).where(Strategy.id == active))).scalar_one()
        assert await sig.is_genuinely_active(session, strat) is True
        outcome = await sig.evaluate_strategy_signal(session, strat, persist=True, publish=False)
        assert outcome is not None and outcome.signal_type == SignalType.BUY


async def test_active_without_approval_or_validation_produces_no_signal(db_session_factory):
    """The gate is the SAME one activation uses: ACTIVE status alone is not enough."""
    from app.services import signals as sig

    org, _ = await create_org_user(db_session_factory, org_name="Sig G", slug="sig-g", email="g@sig.io")
    await _seed_symbol(db_session_factory, org.id, "SPY", [50, 40, 25])
    # ACTIVE but never approved -> gate not met.
    sid = await _make_strategy(db_session_factory, org.id, status=StrategyStatus.ACTIVE, approved=False)
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        strat = (await session.execute(select(Strategy).where(Strategy.id == sid))).scalar_one()
        assert await sig.is_genuinely_active(session, strat) is False
        assert await sig.evaluate_strategy_signal(session, strat) is None


# --------------------------------------------------------------------------- real DSL
async def test_signal_reuses_real_dsl_evaluator(db_session_factory, monkeypatch):
    """Signal generation must call the real dsl.evaluate — not a second engine."""
    from app.services import signals as sig
    from app.strategy import dsl

    calls: list[int] = []
    real = dsl.evaluate

    def spy(rule, prev, curr):
        calls.append(1)
        return real(rule, prev, curr)

    monkeypatch.setattr(dsl, "evaluate", spy)

    org, _ = await create_org_user(db_session_factory, org_name="Sig D", slug="sig-d", email="d@sig.io")
    await _seed_symbol(db_session_factory, org.id, "SPY", [50, 40, 25])
    sid = await _make_strategy(db_session_factory, org.id)
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        strat = (await session.execute(select(Strategy).where(Strategy.id == sid))).scalar_one()
        await sig.evaluate_strategy_signal(session, strat, persist=False, publish=False)
    assert calls, "dsl.evaluate was never called — a parallel evaluation engine may be in use"


# --------------------------------------------------------------------------- replay
def test_hold_state_from_position_replay():
    """A synthetic entry->exit->entry sequence yields the correct current position and
    latest-bar event (HOLD is derived from replayed state, not just 'no event today')."""
    from app.services.signals import replay_position_and_event

    def df(rsis):
        return pd.DataFrame({"rsi_14": rsis})

    # entry(rsi<32) at 0, exit(rsi>62) at 2, entry at 4, then a quiet bar 5.
    in_pos, event = replay_position_and_event(_ENTRY, _EXIT, df([25, 50, 70, 50, 25, 50]))
    assert in_pos is True and event == "none"  # currently holding, no new event -> HOLD

    # Sequence ending exactly on the re-entry bar -> BUY event, holding.
    in_pos, event = replay_position_and_event(_ENTRY, _EXIT, df([25, 50, 70, 50, 25]))
    assert in_pos is True and event == "enter"

    # Sequence ending on the exit bar -> SELL event, flat.
    in_pos, event = replay_position_and_event(_ENTRY, _EXIT, df([25, 50, 70]))
    assert in_pos is False and event == "exit"

    # An exit while already flat does nothing (mirrors vectorbt from_signals).
    in_pos, event = replay_position_and_event(_ENTRY, _EXIT, df([50, 70]))
    assert in_pos is False and event == "none"


# --------------------------------------------------------------------------- LLM isolation
def test_signal_service_has_no_import_path_to_llm_layer():
    """Architectural guarantee (same import-graph mechanism as Safeguard 2): the signal
    service cannot import the LLM layer, directly or transitively."""
    from app.llm.architecture_check import find_banned_imports

    assert find_banned_imports("app.services.signals", banned_prefixes=("app.llm",)) == []
    assert find_banned_imports("app.api.routes.signals", banned_prefixes=("app.llm",)) == []
    # Non-vacuous: the detector DOES catch a real, known llm import.
    assert find_banned_imports("app.services.llm_explain", banned_prefixes=("app.llm",))


# --------------------------------------------------------------------------- org isolation
async def test_signal_respects_org_isolation(db_session_factory):
    from app.services import signals as sig

    org_a, _ = await create_org_user(db_session_factory, org_name="Iso A", slug="iso-a", email="a@iso.io")
    org_b, _ = await create_org_user(db_session_factory, org_name="Iso B", slug="iso-b", email="b@iso.io")
    for org in (org_a, org_b):
        await _seed_symbol(db_session_factory, org.id, "SPY", [50, 40, 25])
        await _make_strategy(db_session_factory, org.id)

    # Evaluate only org A.
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org_a.id)
        outcomes = await sig.evaluate_org_signals(session, org_a.id, persist=True, publish=False)
    assert len(outcomes) == 1

    # Org A has a persisted signal; org B has none.
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org_a.id)
        assert len((await session.execute(select(StrategySignal))).scalars().all()) == 1
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org_b.id)
        assert (await session.execute(select(StrategySignal))).scalars().all() == []


# --------------------------------------------------------------------------- WS scope
async def test_websocket_signal_event_scoped_to_org_not_global(memory_redis):
    """strategy_signal must publish on the ORGANIZATION scope, never the global scope
    used by market_quotes — proving org A never receives org B's signal."""
    from app.ws.events import SCOPE_GLOBAL, SCOPE_ORGANIZATION, WS_CHANNEL, publish_strategy_signal

    org_id = str(uuid.uuid4())
    await publish_strategy_signal(
        org_id=org_id, strategy_id=str(uuid.uuid4()), strategy_name="SPY RSI", symbol="SPY",
        signal_type="HOLD", regime="Low-Volatility", robustness_score=0.8,
    )
    assert len(memory_redis.published) == 1
    channel, raw = memory_redis.published[0]
    assert channel == WS_CHANNEL
    envelope = json.loads(raw)
    assert envelope["scope"] == SCOPE_ORGANIZATION
    assert envelope["scope"] != SCOPE_GLOBAL
    assert envelope["organization_id"] == org_id  # addressed to exactly one org
    assert envelope["payload"]["type"] == "strategy_signal"
    assert envelope["payload"]["signal_type"] == "HOLD"


# --------------------------------------------------------------------------- permission
async def test_signal_permission_gate(client, db_session_factory):
    """signals.view gates the endpoint: a user without it gets 403 (not partial data);
    a user with it gets 200."""
    org, admin = await create_org_user(db_session_factory, org_name="Perm", slug="perm-sig", email="admin@perm.sig.io", role=UserRole.ADMIN)

    # A custom role with NO signals.view.
    created = await client.post(
        "/roles", json={"name": "No Signals", "description": "x", "permissions": [P.MEMBERS_VIEW]},
        headers=_token(admin),
    )
    assert created.status_code == 201, created.text
    role_id = created.json()["id"]
    member = await add_user_to_org(db_session_factory, organization_id=org.id, email="m@perm.sig.io", role=UserRole.RESEARCHER)
    assigned = await client.put(f"/users/{member.id}/role", json={"role_id": role_id}, headers=_token(admin))
    assert assigned.status_code == 200

    denied = await client.get("/signals", headers=_token(member))
    assert denied.status_code == 403

    # The admin (has signals.view via the Admin superset) gets 200.
    ok = await client.get("/signals", headers=_token(admin))
    assert ok.status_code == 200
    assert "items" in ok.json()
