"""Multi-model cost router (Batch 18).

Routing is a pure function, so those tests need no mocking at all. The rest patch
at the *provider boundary* (``_call_gemini`` / ``_call_claude``) rather than at the
SDK, which keeps the real routing, guard, fallback, cost, and audit-logging code
under test while guaranteeing no live API call — these tests must never spend money
or need a network, and must pass whether or not a key is configured (see
tests/test_llm_graceful_degradation.py for what happens when that isn't enforced).
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from app.llm.guard import PricePredictionRejected
from app.llm.router import LLMCostRouter, LLMUnavailableError, RouterResult, llm_router
from app.llm.schemas import GraphSummary

from tests.helpers import bearer, register_org


def _router_result(model_key: str) -> RouterResult:
    """A stand-in for one completed provider call, shaped like the real thing."""
    return RouterResult(
        result=GraphSummary(summary_text="ok", key_findings=["f"]),
        model_key=model_key,
        model_name=f"{model_key}-test-model",
        input_tokens=1000,
        output_tokens=1000,
        cost_usd=llm_router.cost_usd(model_key, 1000, 1000),
        raw_response_json='{"stub": true}',
    )


# --------------------------------------------------------------------------- #
# Routing table — pure function, no I/O
# --------------------------------------------------------------------------- #
def test_route_hypothesis_returns_gemini():
    assert LLMCostRouter().route("generate_hypothesis", "low") == "gemini"


def test_route_explain_failure_returns_claude():
    # Claude regardless of stakes: it reasons over a real stored Failure row.
    assert LLMCostRouter().route("explain_failure", "low") == "claude"
    assert LLMCostRouter().route("explain_failure", "high") == "claude"


def test_route_high_stakes_returns_claude():
    router = LLMCostRouter()
    # Same request type, opposite lane, decided only by stakes.
    assert router.route("chat", "low") == "gemini"
    assert router.route("chat", "high") == "claude"


# --------------------------------------------------------------------------- #
# Fallback
# --------------------------------------------------------------------------- #
@pytest.mark.anyio
async def test_fallback_gemini_to_claude_on_failure(monkeypatch):
    router = LLMCostRouter()
    gemini = AsyncMock(side_effect=LLMUnavailableError("gemini down"))
    claude = AsyncMock(return_value=_router_result("claude"))
    monkeypatch.setattr(router, "_call_gemini", gemini)
    monkeypatch.setattr(router, "_call_claude", claude)

    routed = await router.call_tool(
        model_key="gemini",
        function_name="summarize_graph_query_result",
        system_prompt="sys",
        user_prompt="user",
        output_model=GraphSummary,
    )

    assert gemini.await_count == 1
    assert claude.await_count == 1
    # The result must report the model that ACTUALLY served it, not the one routed
    # to — the audit log records this field, so a stale value would misattribute
    # both the model and its (10x different) cost.
    assert routed.model_key == "claude"


@pytest.mark.anyio
async def test_claude_failure_does_not_fall_back(monkeypatch):
    """Claude is the fallback of last resort — there is nowhere else to go, and
    silently retrying on Gemini would move a high-stakes call onto the lane it was
    deliberately routed away from."""
    router = LLMCostRouter()
    gemini = AsyncMock(return_value=_router_result("gemini"))
    monkeypatch.setattr(router, "_call_gemini", gemini)
    monkeypatch.setattr(
        router, "_call_claude", AsyncMock(side_effect=LLMUnavailableError("claude down"))
    )

    with pytest.raises(LLMUnavailableError):
        await router.call_tool(
            model_key="claude",
            function_name="explain_failure",
            system_prompt="sys",
            user_prompt="user",
            output_model=GraphSummary,
        )
    assert gemini.await_count == 0


# --------------------------------------------------------------------------- #
# Safeguard 1 — nothing reaches ANY provider
# --------------------------------------------------------------------------- #
@pytest.mark.anyio
async def test_price_prediction_blocked_before_any_api_call(monkeypatch):
    """The guard must fire before the provider call AND outside the fallback path.

    If it were inside the try, a rejected prompt would raise, be caught as a Gemini
    failure, and get retried straight into Claude — the guard would then have
    blocked one provider and fed the other.
    """
    router = LLMCostRouter()
    gemini = AsyncMock(return_value=_router_result("gemini"))
    claude = AsyncMock(return_value=_router_result("claude"))
    monkeypatch.setattr(router, "_call_gemini", gemini)
    monkeypatch.setattr(router, "_call_claude", claude)

    with pytest.raises(PricePredictionRejected):
        await router.call_tool(
            model_key="gemini",
            function_name="generate_hypothesis",
            system_prompt="sys",
            user_prompt="What will the price of SPY be next week?",
            output_model=GraphSummary,
        )

    assert gemini.await_count == 0
    assert claude.await_count == 0


@pytest.mark.anyio
async def test_price_prediction_blocked_on_streaming_path(monkeypatch):
    router = LLMCostRouter()
    monkeypatch.setattr(router, "_stream_gemini", AsyncMock())
    monkeypatch.setattr(router, "_stream_claude", AsyncMock())

    with pytest.raises(PricePredictionRejected):
        async for _ in router.stream_text(
            model_key="gemini", system_prompt="sys", user_prompt="predict the price of TSLA"
        ):
            pass


# --------------------------------------------------------------------------- #
# Cost logging — real usage, real arithmetic
# --------------------------------------------------------------------------- #
def test_cost_is_computed_from_real_token_counts():
    router = LLMCostRouter()
    # Claude Sonnet: $3/1M in ($0.003/1k), $15/1M out ($0.015/1k).
    assert router.cost_usd("claude", 1000, 1000) == pytest.approx(0.018)
    # Gemini Flash: $0.30/1M in, $2.50/1M out.
    assert router.cost_usd("gemini", 1000, 1000) == pytest.approx(0.0028)
    # A provider that reports nothing yields None, not a fabricated 0.0 — "unknown"
    # and "free" are different claims in a compliance log.
    assert router.cost_usd("claude", None, None) is None


@pytest.mark.anyio
async def test_cost_logged_after_non_streaming_call(db_session_factory, client, monkeypatch):
    """A completed structured call writes one audit row carrying the serving model
    and its real cost (Safeguard 4)."""
    from app.db.tenant import bind_organization
    from app.llm.service import LLMService
    from app.models.llm_audit_log import LLMAuditLog
    from sqlalchemy import select

    _token, org = await register_org(client, org_name="RouterCostCo", email="a@routercost.com")

    monkeypatch.setattr(
        llm_router, "_call_gemini", AsyncMock(return_value=_router_result("gemini"))
    )

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org)
        svc = LLMService(session, organization_id=org, user_id=None)
        result, _ = await svc._call_tool(
            function_name="summarize_graph_query_result",
            system_prompt="sys",
            user_prompt="summarize this graph result",
            output_model=GraphSummary,
            stakes="low",
        )
        assert result.summary_text == "ok"

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org)
        rows = (await session.execute(select(LLMAuditLog))).scalars().all()

    assert len(rows) == 1
    row = rows[0]
    assert row.model_key == "gemini"
    assert row.model_used == "gemini-test-model"
    assert row.input_tokens == 1000 and row.output_tokens == 1000
    assert float(row.estimated_cost_usd) == pytest.approx(0.0028)


# --------------------------------------------------------------------------- #
# Streaming endpoint
# --------------------------------------------------------------------------- #
@pytest.mark.anyio
async def test_streaming_endpoint_returns_event_stream_content_type(client, monkeypatch):
    token, _org = await register_org(client, org_name="StreamCo", email="a@streamco.com")

    async def _fake_stream(*, model_key, system_prompt, user_prompt):
        yield {"chunk": "Regime-", "model": "gemini-2.5-flash"}
        yield {"chunk": "aware.", "model": "gemini-2.5-flash"}
        # No usage record: the audit write is skipped rather than logged with
        # invented numbers, so this also covers the missing-usage branch.

    monkeypatch.setattr(llm_router, "stream_text", _fake_stream)

    async with client.stream(
        "POST",
        "/llm/chat/stream",
        json={"message": "How should I think about regime-aware sizing?"},
        headers=bearer(token),
    ) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        assert resp.headers["cache-control"] == "no-cache"
        body = "".join([chunk async for chunk in resp.aiter_text()])

    assert 'data: {"chunk": "Regime-"' in body
    assert '"done": true' in body
    # SSE frames are terminated by a blank line; without it the browser's
    # EventSource/reader never dispatches an event.
    assert body.endswith("\n\n")


@pytest.mark.anyio
async def test_streaming_endpoint_rejects_price_prediction_with_400(client, monkeypatch):
    """Rejected before the stream opens, so it can still be a real 400 rather than
    a 200 carrying an error frame — and no provider is contacted."""
    token, _org = await register_org(client, org_name="StreamGuardCo", email="a@streamguard.com")

    called = AsyncMock()
    monkeypatch.setattr(llm_router, "stream_text", called)

    resp = await client.post(
        "/llm/chat/stream",
        json={"message": "What will the price of SPY be tomorrow?"},
        headers=bearer(token),
    )

    assert resp.status_code == 400
    assert "price-forecast" in resp.json()["detail"]
    assert called.await_count == 0


@pytest.mark.anyio
async def test_streaming_endpoint_requires_auth(client):
    resp = await client.post("/llm/chat/stream", json={"message": "hello"})
    assert resp.status_code in (401, 403)
