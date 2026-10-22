"""Batch 30 (ADR 0009) — the multi-agent desk (TradingAgents integration).

The pipeline under test is a real LangGraph graph over TradingAgents' real
``AgentState``, driven through TradingAgents' real ``Propagator``, with its outputs
produced by TradingAgents' real renderers (``render_trader_proposal`` /
``render_pm_decision``) and parsed by its real ``parse_rating``. Only the LLM is fake
(LangChain's ``FakeListChatModel``) — so the audit-callback path, node attribution,
stage streaming and outcome parsing are exercised end to end. No test makes a network
call or a billed LLM call.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from app.agents import runner
from app.agents.context import build_desk_context
from app.agents.redaction import REDACTED, redact_price_levels
from app.agents.scoring import ScoredCall, summarize
from app.core.config import settings
from app.core.security import create_access_token
from app.db.tenant import bind_organization
from app.models.agent_analysis import AgentAnalysis, AgentBacktestRun, AgentRunStatus
from app.models.audit_log import AuditEventType, AuditLog
from app.models.failure import Failure, FailureTrigger
from app.models.llm_audit_log import LLMAuditLog
from app.models.regime_label import RegimeLabelRecord
from app.models.research_note import ResearchNote
from app.models.strategy import Strategy, StrategyCreator, StrategyStatus
from app.models.user import UserRole
from app.regime.taxonomy import RegimeLabel
from app.services import agent_desk
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langgraph.graph import END, START, StateGraph
from sqlalchemy import select
from tradingagents.agents.schemas import (
    PortfolioDecision,
    PortfolioRating,
    TraderAction,
    TraderProposal,
    render_pm_decision,
    render_trader_proposal,
)
from tradingagents.agents.state import AgentState
from tradingagents.graph.propagation import Propagator

from tests.helpers import add_user_to_org, bearer, create_org_user

TRADE_DATE = date(2026, 6, 1)


# --------------------------------------------------------------------------- fakes
class InMemoryRedis:
    def __init__(self) -> None:
        self.published: list[tuple[str, str]] = []

    async def publish(self, channel, message):
        self.published.append((channel, message))
        return 1

    def events(self, type_: str) -> list[dict]:
        out = []
        for _channel, raw in self.published:
            payload = json.loads(raw)["payload"]
            if payload.get("type") == type_:
                out.append(payload)
        return out


@pytest.fixture
def memory_redis(monkeypatch):
    from app.clients import redis_client

    fake = InMemoryRedis()
    monkeypatch.setattr(redis_client, "get_client", lambda: fake)
    return fake


@pytest.fixture
def configured(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "AGENTS_LLM_PROVIDER", "google")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key-not-real")
    monkeypatch.setattr(settings, "AGENTS_DATA_DIR", str(tmp_path / "ta"))
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)


class FakeTAGraph:
    """Same surface the adapter uses on ``TradingAgentsGraph``."""

    last: FakeTAGraph | None = None
    configs: list[dict] = []  # every TradingAgents config the adapter built, in order

    def __init__(self, selected_analysts, config, *, rating=PortfolioRating.OVERWEIGHT, fail_at: str | None = None):
        self.config = config
        self.propagator = Propagator()
        self.seen_state: dict | None = None
        self.llm = FakeListChatModel(responses=[f"response {i}" for i in range(64)])
        self.rating = rating
        self.fail_at = fail_at
        self.nodes_run: list[str] = []
        # Same shape as TradingAgentsGraph: the uncompiled workflow + a compiled graph.
        self.workflow = self._build(list(selected_analysts))
        self.graph = self.workflow.compile()
        FakeTAGraph.last = self
        FakeTAGraph.configs.append(config)

    def resolve_instrument_context(self, ticker, asset_type, curr_date):
        return f"The instrument is {ticker} ({asset_type}) as of {curr_date}."

    def _node(self, name, update):
        def fn(state):
            if self.seen_state is None:
                self.seen_state = dict(state)
            self.nodes_run.append(name)
            if self.fail_at == name:
                raise RuntimeError(f"provider error in {name}")
            self.llm.invoke(f"[{name}] {state['instrument_context'][:80]}")
            return update(state)

        return fn

    def _build(self, analysts):
        g = StateGraph(AgentState)
        order: list[str] = []
        reports = {"market": ("Market Analyst", "market_report"), "social": ("Sentiment Analyst", "sentiment_report"),
                   "news": ("News Analyst", "news_report"), "fundamentals": ("Fundamentals Analyst", "fundamentals_report")}
        for key in analysts:
            node, field = reports[key]
            g.add_node(node, self._node(node, lambda s, f=field, n=node: {f: f"{n}: support near prior lows."}))
            g.add_node(f"Msg Clear {key}", lambda s: {})  # plumbing node, not a stage
            order += [node, f"Msg Clear {key}"]
        g.add_node("Bull Researcher", self._node("Bull Researcher", lambda s: {"investment_debate_state": {
            **s["investment_debate_state"], "bull_history": "Bull: demand is strong.", "count": 1}}))
        g.add_node("Bear Researcher", self._node("Bear Researcher", lambda s: {"investment_debate_state": {
            **s["investment_debate_state"], "bear_history": "Bear: valuation is stretched.", "count": 2}}))
        g.add_node("Research Manager", self._node("Research Manager", lambda s: {
            "investment_plan": "**Recommendation**: Overweight", "investment_debate_state": {
                **s["investment_debate_state"], "judge_decision": "Bull wins narrowly."}}))
        g.add_node("Trader", self._node("Trader", lambda s: {"trader_investment_plan": render_trader_proposal(
            TraderProposal(action=TraderAction.BUY, reasoning="Momentum with regime support.",
                           entry_price=189.5, stop_loss=172.0, position_sizing="5% of portfolio"))}))
        for risk in ("Aggressive Analyst", "Conservative Analyst", "Neutral Analyst"):
            g.add_node(risk, self._node(risk, lambda s, r=risk: {"risk_debate_state": {
                **s["risk_debate_state"], "history": s["risk_debate_state"]["history"] + f"\n{r}: view."}}))
        g.add_node("Portfolio Manager", self._node("Portfolio Manager", lambda s: {
            "final_trade_decision": render_pm_decision(PortfolioDecision(
                rating=self.rating, executive_summary="Add on weakness.", investment_thesis="Regime-supported trend.",
                price_target=212.5, time_horizon="3-6 months")),
            "risk_debate_state": {**s["risk_debate_state"], "judge_decision": "Overweight approved."}}))
        order += ["Bull Researcher", "Bear Researcher", "Research Manager", "Trader",
                  "Aggressive Analyst", "Conservative Analyst", "Neutral Analyst", "Portfolio Manager"]
        g.add_edge(START, order[0])
        for a, b in zip(order, order[1:], strict=False):
            g.add_edge(a, b)
        g.add_edge(order[-1], END)
        return g


@pytest.fixture
def fake_graph(monkeypatch, configured):
    options: dict = {}

    FakeTAGraph.configs = []

    def factory(selected_analysts, ta_config):
        return FakeTAGraph(selected_analysts, ta_config, **options)

    monkeypatch.setattr(runner, "create_graph", factory)
    return options


@pytest.fixture
def no_celery(monkeypatch):
    calls: list[tuple[str, dict]] = []

    class _Result:
        id = "task-test"

    def _delay_for(name):
        def delay(**kwargs):
            calls.append((name, kwargs))
            return _Result()

        return delay

    from app.worker import tasks

    for name in ("run_agent_analysis_task", "run_agent_backtest_task", "settle_agent_analyses_task"):
        monkeypatch.setattr(getattr(tasks, name), "delay", _delay_for(name))
    return calls


def _token(user) -> dict[str, str]:
    return bearer(create_access_token(user_id=user.id, organization_id=user.organization_id, role=user.role.value))


async def _org(maker, slug: str, role: UserRole = UserRole.RESEARCHER):
    return await create_org_user(maker, org_name=f"Org {slug}", slug=slug, email=f"{slug}@desk.io", role=role)


async def _seed_regimes(maker, org_id, symbol: str, labels: list[tuple[date, RegimeLabel]]):
    async with maker() as session:
        bind_organization(session.sync_session, org_id)
        for day, label in labels:
            session.add(RegimeLabelRecord(
                symbol=symbol, timestamp=datetime(day.year, day.month, day.day, tzinfo=UTC),
                regime_label=label, confidence_score=0.8, model_votes={}))
            await session.flush()  # one row per flush: SQLite + tz-aware composite PK (see test_signals)
        await session.commit()


async def _completed(maker, org_id, **fields) -> AgentAnalysis:
    async with maker() as session:
        bind_organization(session.sync_session, org_id)
        row = AgentAnalysis(
            organization_id=org_id, ticker=fields.pop("ticker", "NVDA"), trade_date=fields.pop("trade_date"),
            status=AgentRunStatus.COMPLETED, selected_analysts=["market"], llm_provider="google",
            deep_model="d", quick_model="q", config_snapshot={"holding_period_days": 5}, regime_context={},
            progress=[], reports={"final_trade_decision": "**Rating**: Buy"}, **fields)
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row


# --------------------------------------------------------------------------- redaction
def test_redaction_removes_real_tradingagents_price_levels_only():
    pm = render_pm_decision(PortfolioDecision(
        rating=PortfolioRating.BUY, executive_summary="s", investment_thesis="t", price_target=212.5,
        time_horizon="3-6 months"))
    trader = render_trader_proposal(TraderProposal(
        action=TraderAction.BUY, reasoning="r", entry_price=189.5, stop_loss=172.0, position_sizing="5%"))
    red_pm, red_trader = redact_price_levels(pm), redact_price_levels(trader)
    assert "212.5" not in red_pm and f"**Price Target**: {REDACTED}" in red_pm
    assert "189.5" not in red_trader and "172.0" not in red_trader
    assert red_trader.count(REDACTED) == 2
    # Everything else is untouched: rating, horizon, sizing, the FINAL line.
    assert "**Rating**: Buy" in red_pm and "3-6 months" in red_pm
    assert "5%" in red_trader and "FINAL TRANSACTION PROPOSAL: **BUY**" in red_trader
    # A level the model declined to give is not dressed up as a redaction.
    none_given = render_pm_decision(PortfolioDecision(
        rating=PortfolioRating.HOLD, executive_summary="s", investment_thesis="t"))
    assert redact_price_levels(none_given) == none_given


def test_extract_outcome_parses_real_renderers_and_stores_no_levels():
    state = {
        "final_trade_decision": render_pm_decision(PortfolioDecision(
            rating=PortfolioRating.UNDERWEIGHT, executive_summary="s", investment_thesis="t",
            price_target=99.0, time_horizon="1-3 months")),
        "trader_investment_plan": render_trader_proposal(TraderProposal(
            action=TraderAction.SELL, reasoning="r", entry_price=101.0, stop_loss=110.0,
            position_sizing="2% of book")),
        "investment_debate_state": {"bull_history": "b", "bear_history": "B", "judge_decision": "j"},
        "risk_debate_state": {"aggressive_history": "a", "conservative_history": "c", "neutral_history": "n",
                              "judge_decision": "Target price: 95"},
    }
    out = runner.extract_outcome(state)
    assert (out.rating, out.trader_action) == ("Underweight", "Sell")
    assert (out.time_horizon, out.position_sizing) == ("1-3 months", "2% of book")
    blob = json.dumps(out.reports)
    for level in ("99.0", "101.0", "110.0", ": 95"):
        assert level not in blob


def test_extract_outcome_unparseable_rating_is_review_not_hold():
    out = runner.extract_outcome({"final_trade_decision": "The evidence is mixed; I cannot decide."})
    assert out.rating == "REVIEW"


# --------------------------------------------------------------------------- scoring
def test_scoring_groups_by_regime_and_rating():
    summary = summarize([
        ScoredCall("Bull", "Buy", 0.02), ScoredCall("Bull", "Buy", -0.01), ScoredCall("Bull", "Sell", -0.03),
        ScoredCall("Crisis", "Buy", -0.05), ScoredCall("Crisis", "Hold", 0.01), ScoredCall(None, "Overweight", 0.01),
        ScoredCall("Bull", "Buy", None),  # not settled yet
    ])
    rows = {(r["regime"], r["rating"]): r for r in summary["by_regime_rating"]}
    assert rows[("Bull", "Buy")]["n"] == 2 and rows[("Bull", "Buy")]["hit_rate"] == 0.5
    assert rows[("Bull", "Sell")]["hit_rate"] == 1.0
    assert rows[("Crisis", "Buy")]["hit_rate"] == 0.0
    assert rows[("Crisis", "Hold")]["hit_rate"] is None  # Hold is not a directional call
    assert ("Unlabelled", "Overweight") in rows
    by_regime = {r["regime"]: r for r in summary["by_regime"]}
    assert by_regime["Bull"]["hit_rate"] == pytest.approx(2 / 3)
    assert summary["scored_cells"] == 6 and summary["unscored_cells"] == 1


# --------------------------------------------------------------------------- point-in-time
@pytest.mark.anyio
async def test_desk_context_is_point_in_time(db_session_factory):
    org, user = await _org(db_session_factory, "pit")
    d = TRADE_DATE
    await _seed_regimes(db_session_factory, org.id, "NVDA", [
        (d - timedelta(days=3), RegimeLabel.BULL), (d - timedelta(days=1), RegimeLabel.HIGH_VOLATILITY),
        (d + timedelta(days=1), RegimeLabel.CRISIS),  # the future — must not leak
    ])
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        strat = Strategy(name="NVDA Trend", symbol="NVDA", creator=StrategyCreator.HUMAN, status=StrategyStatus.ACTIVE,
                         robustness_score=0.74, regime_compatibility={"High-Volatility": -0.4, "Bull": 1.3},
                         created_by_user_id=user.id, created_at=datetime(2026, 1, 5, tzinfo=UTC))
        later = Strategy(name="NVDA Created Later", symbol="NVDA", creator=StrategyCreator.HUMAN,
                         status=StrategyStatus.CANDIDATE, robustness_score=0.9, created_by_user_id=user.id)
        session.add_all([strat, later])
        await session.flush()
        for when in (d - timedelta(days=10), d + timedelta(days=2)):
            session.add(Failure(strategy_id=strat.id, strategy_version="v1.0",
                                failure_timestamp=datetime(when.year, when.month, when.day, tzinfo=UTC),
                                regime_at_failure="High-Volatility", trigger_condition=FailureTrigger.DRAWDOWN_BREACH,
                                performance_metrics_at_failure={}, market_context_snapshot={}))
        await session.commit()
    # Lessons: resolved before d (kept), resolved on d (not yet known -> dropped),
    # another ticker in the same regime (kept as a cross-ticker lesson).
    await _completed(db_session_factory, org.id, trade_date=d - timedelta(days=20), rating="Buy",
                     regime_at_analysis="Bull", settled_alpha=0.03, settled_raw_return=0.05, benchmark="SPY",
                     holding_days=5, settled_resolution_date=d - timedelta(days=13), settled_reflection="Trend held.",
                     settled_at=datetime.now(UTC))
    await _completed(db_session_factory, org.id, trade_date=d - timedelta(days=7), rating="Sell",
                     regime_at_analysis="Bull", settled_alpha=-0.02, benchmark="SPY", holding_days=5,
                     settled_resolution_date=d, settled_reflection="FUTURE LESSON", settled_at=datetime.now(UTC))
    await _completed(db_session_factory, org.id, ticker="AMD", trade_date=d - timedelta(days=30), rating="Sell",
                     regime_at_analysis="High-Volatility", settled_alpha=0.04, benchmark="SPY", holding_days=5,
                     settled_resolution_date=d - timedelta(days=23), settled_reflection="Shorting vol spikes failed.",
                     settled_at=datetime.now(UTC))

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        ctx = await build_desk_context(session, ticker="NVDA", trade_date=d)

    assert ctx.regime == "High-Volatility" and ctx.regime_as_of == (d - timedelta(days=1)).isoformat()
    assert [s["regime"] for s in ctx.regime_path] == ["Bull", "High-Volatility"]
    assert [s["name"] for s in ctx.strategies] == ["NVDA Trend"]  # created after d -> invisible
    assert ctx.strategies[0]["sharpe_in_current_regime"] == -0.4
    assert len(ctx.failures) == 1  # the post-date failure is invisible
    assert [x["reflection"] for x in ctx.lessons_same_ticker] == ["Trend held."]
    assert [x["ticker"] for x in ctx.lessons_same_regime] == ["AMD"]
    assert "Crisis" not in ctx.instrument_text and "FUTURE LESSON" not in ctx.past_context_text
    assert "High-Volatility" in ctx.instrument_text and "Shorting vol spikes failed." in ctx.past_context_text


# --------------------------------------------------------------------------- API gates
@pytest.mark.anyio
async def test_start_returns_503_when_provider_key_missing(client, db_session_factory, monkeypatch, no_celery):
    monkeypatch.setattr(settings, "AGENTS_LLM_PROVIDER", "google")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", None)
    _org_row, user = await _org(db_session_factory, "nokey")
    status_resp = await client.get("/agents/status", headers=_token(user))
    assert status_resp.status_code == 200 and status_resp.json()["configured"] is False
    resp = await client.post("/agents/analyses", json={"ticker": "NVDA"}, headers=_token(user))
    assert resp.status_code == 503 and "GEMINI_API_KEY" in resp.json()["detail"]
    assert no_celery == []


@pytest.mark.anyio
async def test_permission_future_date_and_backtest_cap(client, db_session_factory, configured, no_celery, monkeypatch):
    org, user = await _org(db_session_factory, "gates")
    compliance = await add_user_to_org(db_session_factory, organization_id=org.id, email="c@gates.io",
                                       role=UserRole.COMPLIANCE_OFFICER)
    resp = await client.post("/agents/analyses", json={"ticker": "NVDA"}, headers=_token(compliance))
    assert resp.status_code == 403
    # Compliance can still read the desk.
    assert (await client.get("/agents/analyses", headers=_token(compliance))).status_code == 200

    future = (datetime.now(UTC).date() + timedelta(days=2)).isoformat()
    resp = await client.post("/agents/analyses", json={"ticker": "NVDA", "trade_date": future}, headers=_token(user))
    assert resp.status_code == 422

    monkeypatch.setattr(settings, "AGENTS_BACKTEST_MAX_CELLS", 4)
    resp = await client.post("/agents/backtests", json={
        "tickers": ["NVDA", "AMD"], "start_date": "2026-01-01", "end_date": "2026-01-31", "every_n_days": 7,
    }, headers=_token(user))
    assert resp.status_code == 422 and "limit is 4" in resp.json()["detail"]
    assert no_celery == []


# --------------------------------------------------------------------------- end to end
@pytest.mark.anyio
async def test_full_run_persists_audits_notes_graph_and_streams(
    client, db_session_factory, fake_graph, no_celery, memory_redis, fake_graph_repo
):
    org, user = await _org(db_session_factory, "e2e")
    await _seed_regimes(db_session_factory, org.id, "NVDA", [(TRADE_DATE - timedelta(days=1), RegimeLabel.BULL)])

    resp = await client.post("/agents/analyses", json={
        "ticker": "nvda", "trade_date": TRADE_DATE.isoformat(), "selected_analysts": ["news", "market"],
    }, headers=_token(user))
    assert resp.status_code == 202, resp.text
    analysis_id = uuid.UUID(resp.json()["analysis_id"])
    assert no_celery[0][0] == "run_agent_analysis_task"

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        row = (await session.execute(select(AgentAnalysis).where(AgentAnalysis.id == analysis_id))).scalar_one()
        assert row.status == AgentRunStatus.QUEUED and row.selected_analysts == ["market", "news"]
        row = await agent_desk.run_analysis_in_session(session, row, interactive=True)

    assert row.status == AgentRunStatus.COMPLETED, row.error
    assert (row.rating, row.trader_action, row.time_horizon) == ("Overweight", "Buy", "3-6 months")
    assert row.regime_at_analysis == "Bull"
    # The agents were actually given the Stellix context (every agent reads instrument_context).
    seen = FakeTAGraph.last.seen_state
    assert "STELLIX INSTITUTIONAL CONTEXT" in seen["instrument_context"] and "Bull" in seen["instrument_context"]
    assert seen["instrument_context"].startswith("The instrument is NVDA")
    # Stages streamed in pipeline order; plumbing nodes are not stages.
    stages = [p["stage"] for p in row.progress]
    assert stages == runner.expected_stages(["market", "news"])
    # Safeguard 1: no price level anywhere in what was stored.
    blob = json.dumps(row.reports)
    assert "212.5" not in blob and "189.5" not in blob and "172.0" not in blob

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        audits = (await session.execute(select(LLMAuditLog))).scalars().all()
        assert len(audits) == row.llm_call_count == len(stages)  # one fake LLM call per agent
        assert {a.function_name for a in audits} >= {"agent:Market Analyst", "agent:Portfolio Manager"}
        assert all(a.model_key == "google" and a.user_id == user.id for a in audits)
        note = (await session.execute(select(ResearchNote).where(ResearchNote.id == row.research_note_id))).scalar_one()
        assert "agent-desk" in note.tags and "Overweight" in note.title and "212.5" not in note.content
        event = (await session.execute(
            select(AuditLog).where(AuditLog.event_type == AuditEventType.AGENT_ANALYSIS_COMPLETED))).scalar_one()
        assert event.entity_id == row.id

    nodes = {(k[1], k[2]) for k in fake_graph_repo._nodes}
    assert ("AgentAnalysis", str(row.id)) in nodes
    assert any("ANALYZED_IN" in identity for identity in fake_graph_repo._edges)

    events = memory_redis.events("agent_progress")
    assert events[0]["status"] == "running" and events[-1]["status"] == "completed"
    assert events[-1]["rating"] == "Overweight"
    assert {e["stage"] for e in events if e["stage"]} == set(stages)

    detail = await client.get(f"/agents/analyses/{row.id}", headers=_token(user))
    assert detail.status_code == 200 and detail.json()["rating"] == "Overweight"
    assert detail.json()["expected_stages"] == stages

    # Tenant isolation: another org cannot see it.
    _other_org, outsider = await _org(db_session_factory, "outsider")
    assert (await client.get(f"/agents/analyses/{row.id}", headers=_token(outsider))).status_code == 404


@pytest.mark.anyio
async def test_failed_run_is_kept_with_its_audit_rows(db_session_factory, fake_graph, memory_redis):
    fake_graph["fail_at"] = "Trader"
    org, user = await _org(db_session_factory, "failrun")
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        row = await agent_desk.create_analysis(session, organization_id=org.id, user_id=user.id, ticker="NVDA",
                                               trade_date=TRADE_DATE, selected_analysts=["market"])
        row = await agent_desk.run_analysis_in_session(session, row)
    assert row.status == AgentRunStatus.FAILED and "provider error in Trader" in row.error
    assert row.llm_call_count == 4  # market, bull, bear, research manager — all still audited
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        assert len((await session.execute(select(LLMAuditLog))).scalars().all()) == 4
        assert (await session.execute(select(ResearchNote))).scalars().all() == []
    assert memory_redis.events("agent_progress")[-1]["status"] == "failed"


# --------------------------------------------------------------------------- settlement
@pytest.mark.anyio
async def test_settlement_appends_once(db_session_factory, configured, monkeypatch):
    org, _user = await _org(db_session_factory, "settle")
    row = await _completed(db_session_factory, org.id, trade_date=TRADE_DATE, rating="Buy")
    calls = {"fetch": 0}

    def fake_fetch(ticker, trade_date, holding_days):
        calls["fetch"] += 1
        return "SPY", (0.05, 0.021, holding_days, "2026-06-08")

    monkeypatch.setattr(runner, "fetch_outcome", fake_fetch)
    monkeypatch.setattr(runner, "reflect", lambda **kw: "  Alpha +2.1% supports the call.  ")
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        row = (await session.execute(select(AgentAnalysis).where(AgentAnalysis.id == row.id))).scalar_one()
        assert await agent_desk.settle_analysis(session, row) is True
        assert await agent_desk.settle_analysis(session, row) is False  # write-once
    assert calls["fetch"] == 1
    assert (row.settled_alpha, row.benchmark, row.settled_resolution_date) == (0.021, "SPY", date(2026, 6, 8))
    assert row.settled_reflection == "Alpha +2.1% supports the call."


@pytest.mark.anyio
async def test_settlement_waits_for_the_holding_window(db_session_factory, configured, monkeypatch):
    org, _user = await _org(db_session_factory, "wait")
    row = await _completed(db_session_factory, org.id, trade_date=TRADE_DATE, rating="Hold")
    monkeypatch.setattr(runner, "fetch_outcome", lambda *a: ("SPY", (None, None, None, None)))
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        result = await agent_desk.settle_org_pending(session)
    assert result == {"pending": 1, "settled": 0}
    assert row.settled_at is None


# --------------------------------------------------------------------------- backtest
@pytest.mark.anyio
async def test_backtest_runs_chronologically_scores_by_regime_and_resumes(
    db_session_factory, fake_graph, memory_redis, monkeypatch
):
    org, user = await _org(db_session_factory, "bt")
    d1, d2 = date(2026, 5, 1), date(2026, 5, 15)
    await _seed_regimes(db_session_factory, org.id, "NVDA", [(d1, RegimeLabel.BULL), (d2, RegimeLabel.CRISIS)])
    await _seed_regimes(db_session_factory, org.id, "AMD", [(d1, RegimeLabel.BULL)])
    alpha = {"NVDA": 0.03, "AMD": -0.02}
    monkeypatch.setattr(runner, "fetch_outcome", lambda t, d, h: ("SPY", (alpha[t], alpha[t], h, (d + timedelta(days=7)).isoformat())))
    monkeypatch.setattr(runner, "reflect", lambda **kw: "lesson")

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        run = await agent_desk.create_backtest(session, organization_id=org.id, user_id=user.id,
                                               tickers=["NVDA", "AMD"], trade_dates=[d2.isoformat(), d1.isoformat()],
                                               selected_analysts=["market"])
        run = await agent_desk.run_backtest_in_session(session, run)
        cells = await agent_desk.backtest_cells(session, run.id)

    assert run.status == AgentRunStatus.COMPLETED and run.completed_cells == 4 and run.failed_cells == 0
    assert [(c.trade_date, c.ticker) for c in cells] == [(d1, "AMD"), (d1, "NVDA"), (d2, "AMD"), (d2, "NVDA")]
    assert all(c.settled_alpha is not None and c.research_note_id is None for c in cells)  # no notebook spam
    # The d2 cells were given the d1 cells as lessons — resolved (d1+7) before d2.
    d2_nvda = next(c for c in cells if c.trade_date == d2 and c.ticker == "NVDA")
    assert d2_nvda.regime_at_analysis == "Crisis"
    assert {x["trade_date"] for x in d2_nvda.regime_context["lessons_same_ticker"]} == {d1.isoformat()}
    rows = {(r["regime"], r["rating"]): r for r in run.summary["by_regime_rating"]}
    assert rows[("Bull", "Overweight")]["n"] == 3 and rows[("Crisis", "Overweight")]["n"] == 1
    assert rows[("Crisis", "Overweight")]["hit_rate"] == 1.0

    # Resume: re-running the same run adds no duplicate cells.
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        run = (await session.execute(select(AgentBacktestRun).where(AgentBacktestRun.id == run.id))).scalar_one()
        await agent_desk.run_backtest_in_session(session, run)
        assert len(await agent_desk.backtest_cells(session, run.id)) == 4


# --------------------------------------------------------------------------- architecture
def test_desk_has_no_path_to_strategy_write_services():
    """Safeguard 2's isolation: the desk writes research records, never strategies,
    failures, evolution runs or signals. (The route module is not listed: like the
    evolution route it lazily imports the Celery task registry to enqueue work, and
    that registry imports every task's service by design.)"""
    from app.llm.architecture_check import find_banned_imports

    banned = ("app.services.strategy", "app.services.failure", "app.services.evolution", "app.services.signals")
    modules = ("app.services.agent_desk", "app.agents.runner", "app.agents.context",
               "app.agents.audit_callback", "app.agents.scoring", "app.agents.redaction")
    for module in modules:
        assert find_banned_imports(module, banned_prefixes=banned) == [], module


def test_only_app_agents_imports_tradingagents():
    from pathlib import Path

    root = Path(__file__).resolve().parents[1] / "app"
    offenders = [
        str(p.relative_to(root)) for p in root.rglob("*.py")
        if "tradingagents" in p.read_text(encoding="utf-8").replace("# ", "")
        and "import" in p.read_text(encoding="utf-8")
        and any(line.lstrip().startswith(("from tradingagents", "import tradingagents"))
                for line in p.read_text(encoding="utf-8").splitlines())
        and p.parent.name != "agents"
    ]
    assert offenders == []


# =========================================================================== Batch 30b
# Portfolio-aware runs, output language, SEC EDGAR + Jev wiring, every provider,
# per-analysis checkpoint resume, retry endpoint.


@pytest.mark.anyio
async def test_retry_resumes_from_checkpoint_without_rerunning_finished_agents(
    db_session_factory, fake_graph, memory_redis, tmp_path
):
    fake_graph["fail_at"] = "Trader"
    org, user = await _org(db_session_factory, "resume")
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        row = await agent_desk.create_analysis(session, organization_id=org.id, user_id=user.id, ticker="NVDA",
                                               trade_date=TRADE_DATE, selected_analysts=["market"])
        row = await agent_desk.run_analysis_in_session(session, row)
        assert row.status == AgentRunStatus.FAILED and row.llm_call_count == 4
        ckpt = runner.checkpoint_dir(runner.desk_settings(), str(row.id))
        assert ckpt.exists()  # this analysis's own checkpoint directory

        assert agent_desk.retry_blocker(row) is None
        fake_graph.pop("fail_at")
        await agent_desk.mark_for_retry(session, row)
        row = await agent_desk.run_analysis_in_session(session, row)

    assert row.status == AgentRunStatus.COMPLETED, row.error
    second = FakeTAGraph.last.nodes_run
    # Resumed at the Trader: the four agents that finished before are not paid for twice.
    assert second[0] == "Trader" and "Market Analyst" not in second
    # Their outputs still reach the final state, from the checkpoint.
    assert "Market Analyst" in row.reports["market_report"]
    assert [p["stage"] for p in row.progress] == runner.expected_stages(["market"])  # no duplicates
    assert row.llm_call_count == 4 + 5  # both attempts, all audited
    assert not ckpt.exists()  # cleared once the analysis completed
    assert agent_desk.retry_blocker(row) is not None  # completed analyses are write-once


@pytest.mark.anyio
async def test_checkpoints_are_isolated_per_analysis(db_session_factory, fake_graph, memory_redis):
    """TradingAgents keys threads by ticker+date only; two orgs analysing the same
    ticker on the same date must never resume each other's saved state."""
    fake_graph["fail_at"] = "Trader"
    org_a, user_a = await _org(db_session_factory, "iso-a")
    org_b, user_b = await _org(db_session_factory, "iso-b")
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org_a.id)
        a = await agent_desk.create_analysis(session, organization_id=org_a.id, user_id=user_a.id, ticker="NVDA",
                                             trade_date=TRADE_DATE, selected_analysts=["market"])
        await agent_desk.run_analysis_in_session(session, a)
    fake_graph.pop("fail_at")
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org_b.id)
        b = await agent_desk.create_analysis(session, organization_id=org_b.id, user_id=user_b.id, ticker="NVDA",
                                             trade_date=TRADE_DATE, selected_analysts=["market"])
        b = await agent_desk.run_analysis_in_session(session, b)
    assert FakeTAGraph.last.nodes_run[0] == "Market Analyst"  # started fresh, not from org A's save
    assert b.status == AgentRunStatus.COMPLETED


@pytest.mark.anyio
async def test_portfolio_language_and_vendors_reach_tradingagents(db_session_factory, fake_graph, memory_redis):
    org, user = await _org(db_session_factory, "book")
    book = {"cash": 25000.0, "currency": "USD",
            "positions": [{"ticker": "NVDA", "quantity": 120, "average_price": 150.0}]}
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        row = await agent_desk.create_analysis(session, organization_id=org.id, user_id=user.id, ticker="NVDA",
                                               trade_date=TRADE_DATE, selected_analysts=["market"],
                                               portfolio=book, output_language="Chinese")
        row = await agent_desk.run_analysis_in_session(session, row)
    assert row.status == AgentRunStatus.COMPLETED
    seen = FakeTAGraph.last.seen_state["portfolio_context"]
    assert "Current position in NVDA: 120 units, average price 150.00" in seen and "25,000.00 USD" in seen
    assert row.portfolio["positions"][0]["ticker"] == "NVDA"
    cfg = FakeTAGraph.configs[-1]
    assert cfg["output_language"] == "Chinese" and row.config_snapshot["output_language"] == "Chinese"
    assert cfg["data_vendors"]["fundamental_data"] == "sec_edgar,yfinance"


@pytest.mark.anyio
async def test_flat_book_differs_from_no_portfolio(db_session_factory, fake_graph, memory_redis):
    org, user = await _org(db_session_factory, "flat")
    seen = {}
    for label, book in (("flat", {"positions": []}), ("none", None)):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, org.id)
            row = await agent_desk.create_analysis(session, organization_id=org.id, user_id=user.id, ticker="NVDA",
                                                   trade_date=TRADE_DATE, selected_analysts=["market"], portfolio=book)
            await agent_desk.run_analysis_in_session(session, row)
        seen[label] = FakeTAGraph.last.seen_state["portfolio_context"]
    assert "No current position in NVDA" in seen["flat"]
    assert seen["none"] == ""


def test_every_tradingagents_provider_is_selectable(monkeypatch, tmp_path):
    from tradingagents.llm_clients.openai_client import OPENAI_COMPATIBLE_PROVIDERS

    assert set(runner.supported_providers()) == {"google", "anthropic", *OPENAI_COMPATIBLE_PROVIDERS}
    monkeypatch.setattr(settings, "AGENTS_LLM_API_KEY", None)
    monkeypatch.setattr(settings, "AGENTS_LLM_BACKEND_URL", None)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    monkeypatch.setattr(settings, "AGENTS_LLM_PROVIDER", "groq")
    assert "AGENTS_LLM_API_KEY" in runner.not_configured_reason()
    monkeypatch.setattr(settings, "AGENTS_LLM_API_KEY", "gsk-test")
    assert runner.is_configured()

    monkeypatch.setattr(settings, "AGENTS_LLM_PROVIDER", "ollama")  # keyless local
    monkeypatch.setattr(settings, "AGENTS_LLM_API_KEY", None)
    assert runner.is_configured()

    monkeypatch.setattr(settings, "AGENTS_LLM_PROVIDER", "openai_compatible")
    assert "AGENTS_LLM_BACKEND_URL" in runner.not_configured_reason()
    monkeypatch.setattr(settings, "AGENTS_LLM_BACKEND_URL", "http://localhost:8000/v1")
    assert runner.is_configured()
    assert runner.build_ta_config(runner.desk_settings())["backend_url"] == "http://localhost:8000/v1"

    monkeypatch.setattr(settings, "AGENTS_LLM_PROVIDER", "not-a-provider")
    assert "not supported" in runner.not_configured_reason()


def test_environment_export_for_provider_sec_and_jev(monkeypatch, tmp_path):
    # setenv first so monkeypatch restores the original (absent) values afterwards.
    for name in ("GROQ_API_KEY", "SEC_EDGAR_USER_AGENT", "TYPESAFE_API_KEY", "TYPESAFE_DEFAULT_MODEL"):
        monkeypatch.setenv(name, "placeholder")
        monkeypatch.delenv(name)
    monkeypatch.setattr(settings, "AGENTS_LLM_PROVIDER", "groq")
    monkeypatch.setattr(settings, "AGENTS_LLM_API_KEY", "gsk-test")
    monkeypatch.setattr(settings, "SEC_EDGAR_USER_AGENT", "Desk Test desk@example.com")
    monkeypatch.setattr(settings, "TYPESAFE_API_KEY", "ts-test")
    monkeypatch.setattr(settings, "TYPESAFE_DEFAULT_MODEL", "jev-1.13.0")
    runner._export_environment(runner.desk_settings())
    import os

    assert os.environ["GROQ_API_KEY"] == "gsk-test"
    assert os.environ["SEC_EDGAR_USER_AGENT"] == "Desk Test desk@example.com"
    assert os.environ["TYPESAFE_API_KEY"] == "ts-test" and os.environ["TYPESAFE_DEFAULT_MODEL"] == "jev-1.13.0"
    assert runner.desk_settings().snapshot()["jev_screening"] is True


@pytest.mark.anyio
async def test_api_portfolio_language_status_and_retry(client, db_session_factory, fake_graph, no_celery, memory_redis):
    org, user = await _org(db_session_factory, "api30b")
    status_body = (await client.get("/agents/status", headers=_token(user))).json()
    assert status_body["sec_edgar_enabled"] is True and status_body["checkpoint_enabled"] is True
    assert "ollama" in status_body["supported_providers"]

    bad = await client.post("/agents/analyses", json={"ticker": "NVDA", "output_language": "DROP TABLE;"},
                            headers=_token(user))
    assert bad.status_code == 422
    bad = await client.post("/agents/analyses", json={"ticker": "NVDA", "portfolio": {
        "positions": [{"ticker": "../x", "quantity": 1}]}}, headers=_token(user))
    assert bad.status_code == 422

    fake_graph["fail_at"] = "Trader"
    resp = await client.post("/agents/analyses", json={
        "ticker": "NVDA", "trade_date": TRADE_DATE.isoformat(), "selected_analysts": ["market"],
        "output_language": "Hindi", "portfolio": {"cash": 1000, "positions": []},
    }, headers=_token(user))
    assert resp.status_code == 202, resp.text
    analysis_id = uuid.UUID(resp.json()["analysis_id"])
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        row = (await session.execute(select(AgentAnalysis).where(AgentAnalysis.id == analysis_id))).scalar_one()
        assert row.config_snapshot["output_language"] == "Hindi" and row.portfolio["cash"] == 1000
        await agent_desk.run_analysis_in_session(session, row)

    retry = await client.post(f"/agents/analyses/{analysis_id}/retry", headers=_token(user))
    assert retry.status_code == 202 and no_celery[-1][0] == "run_agent_analysis_task"
    detail = (await client.get(f"/agents/analyses/{analysis_id}", headers=_token(user))).json()
    assert detail["status"] == "queued" and detail["portfolio"]["cash"] == 1000
    again = await client.post(f"/agents/analyses/{analysis_id}/retry", headers=_token(user))
    assert again.status_code == 409  # queued and not stale: still in progress
