"""LLM graceful degradation: when ANTHROPIC_API_KEY is not configured, every
LLM-calling endpoint must surface a clean 503 with a readable detail message —
not an unhandled 500 (which, observed live, the browser reports as an opaque
"Failed to fetch" with no usable message at all).

An unconfigured key is no longer this deployment's ambient state (Batch 12
pre-note 1 described it as a temporary deferral, and it has since been
configured). It remains a state we must degrade cleanly in — a key can be
absent in CI, in a fresh clone, or after a revocation — so these tests force
the key off themselves rather than inheriting it from the environment. See the
_unset_api_key fixture: without it, these tests would make live, billed API
calls and fail on a false premise.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from app.core.config import settings
from app.llm.service import LLMUnavailableError

from tests.data_helpers import seed_strategy
from tests.helpers import bearer, register_org


@pytest.fixture(autouse=True)
def _unset_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force the fully-unconfigured state for every test in this module.

    Two dimensions, both load-bearing.

    Per provider: patching ``settings`` covers the app code (every module shares
    this one Settings instance, so mutating the attribute is visible to
    app.llm.router). Deleting the env var covers the SDK, which falls back to
    reading the key from os.environ directly when passed api_key=None — leaving it
    set would let a real key back in through the side door and put a live network
    call in the test suite.

    Across providers (Batch 18): BOTH lanes must be unset. "The LLM is
    unconfigured" now means the cost router has nowhere to route: /llm/hypothesis
    goes to Gemini, so clearing only ANTHROPIC_API_KEY would leave these tests
    asserting a 503 against an endpoint that happily answers via a live, billed
    Gemini call.
    """
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", None)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)


@pytest.mark.anyio
async def test_hypothesis_returns_clean_503_when_api_key_unset(client):
    token, _org = await register_org(client, org_name="LlmDegradeCo", email="d@llmdegradeco.com")

    resp = await client.post(
        "/llm/hypothesis",
        json={"symbol": "SPY", "user_prompt": "Focus on regime-conditioned mean reversion."},
        headers=bearer(token),
    )
    assert resp.status_code == 503
    assert "not configured" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_critique_returns_clean_503_when_api_key_unset(client, db_session_factory):
    token, org = await register_org(client, org_name="LlmDegradeCo2", email="d2@llmdegradeco.com")
    strategy_id = await seed_strategy(db_session_factory, organization_id=org, valid_rules=True)

    resp = await client.post(f"/llm/critique/{strategy_id}", headers=bearer(token))
    assert resp.status_code == 503
    assert "not configured" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_llm_service_raises_llmunavailable_not_a_raw_typeerror():
    """Unit-level: the SDK's real failure mode for a missing key is a plain
    TypeError from its own header validation (confirmed via a live call) —
    LLMService must translate that into LLMUnavailableError, not let it
    propagate raw."""
    from app.llm.schemas import HypothesisResult
    from app.llm.service import LLMService

    svc = LLMService(AsyncMock(), organization_id=uuid.uuid4(), user_id=None)
    with pytest.raises(LLMUnavailableError):
        await svc._call_tool(
            function_name="generate_hypothesis",
            system_prompt="sys",
            user_prompt="user",
            output_model=HypothesisResult,
        )


@pytest.mark.anyio
async def test_explain_failure_skips_gracefully_when_api_key_unset(client, db_session_factory):
    """The async failure-explanation pipeline (Celery) must not record a hard
    task failure when the LLM is simply unconfigured — llm_generated_explanation
    stays null, and the Failure Intelligence page already renders that as
    "no explanation yet", not a crash.

    explain_failure_and_persist() opens its own get_tenant_session() (the
    established "session-opening, real-Postgres-only" pattern elsewhere in
    this codebase — see monitor_and_fail/run_evolution), which can't see data
    inserted via this test's own hermetic SQLite session. Patched here to
    open the SAME hermetic session instead, purely for this test's isolation —
    the function under test is otherwise called unmodified.
    """
    from contextlib import asynccontextmanager

    import app.services.llm_explain as llm_explain_module
    from app.db.tenant import bind_organization
    from app.models.failure import Failure, FailureTrigger

    token, org = await register_org(client, org_name="LlmDegradeCo3", email="d3@llmdegradeco.com")
    strategy_id = await seed_strategy(db_session_factory, organization_id=org, valid_rules=True)

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org)
        failure = Failure(
            strategy_id=strategy_id,
            strategy_version="v1.0",
            failure_timestamp=datetime(2024, 1, 15, tzinfo=UTC),
            regime_at_failure="Bear",
            trigger_condition=FailureTrigger.DRAWDOWN_BREACH,
            performance_metrics_at_failure={"sharpe": -0.5, "max_drawdown": -0.4, "win_rate": 0.3},
            feature_attribution=[],
            market_context_snapshot={},
            related_failure_ids=[],
        )
        session.add(failure)
        await session.commit()
        await session.refresh(failure)
        failure_id = failure.id

    @asynccontextmanager
    async def _fake_tenant_session(organization_id):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, organization_id)
            yield session
            await session.commit()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(llm_explain_module, "get_tenant_session", _fake_tenant_session)
        result = await llm_explain_module.explain_failure_and_persist(org, failure_id)

    assert result == {"failure_id": str(failure_id), "explained": False, "reason": "llm_unavailable"}

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org)
        refreshed = await session.get(Failure, failure_id)
        assert refreshed.llm_generated_explanation is None
