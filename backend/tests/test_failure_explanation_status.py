"""Batch 25 Task 3/4: failure explanations report an honest state (never an indefinite
"pending"), generation is attributed in the audit trail, the prompt asks for plain
language WITHOUT loosening Safeguard 5, and failures remember the instrument they were
detected on so the timeline overlays them on the right symbol."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from app.core.config import settings
from app.db.tenant import bind_organization
from app.failure.detection import FailureAssessment
from app.models.audit_log import AuditEventType, AuditLog
from app.models.failure import Failure, FailureTrigger
from app.models.strategy import Strategy, StrategyStatus
from app.models.user import UserRole
from sqlalchemy import select

from tests.data_helpers import seed_strategy
from tests.helpers import bearer, create_org_user, token_for
from tests.llm_test_helpers import patch_llm_providers

_PLACEHOLDER = "[LLM content pending — run scripts/backfill_llm_content.py once ANTHROPIC_API_KEY is configured]"


async def _failure(maker, org_id, *, explanation: str | None = None, context: dict | None = None):
    strategy_id = await seed_strategy(maker, organization_id=org_id, name="SPY Momentum", valid_rules=True)
    async with maker() as session:
        bind_organization(session.sync_session, org_id)
        failure = Failure(
            strategy_id=strategy_id,
            strategy_version="v1.0",
            failure_timestamp=datetime(2024, 12, 30, tzinfo=UTC),
            regime_at_failure="Low-Volatility",
            trigger_condition=FailureTrigger.DRAWDOWN_BREACH,
            performance_metrics_at_failure={"max_drawdown": -14.17, "sharpe_ratio": 0.47, "win_rate": 56.25},
            feature_attribution=[{"feature_name": "rsi_14", "shap_value": 0.03, "direction": "negative"}],
            market_context_snapshot=context or {},
            llm_generated_explanation=explanation,
            related_failure_ids=[],
        )
        session.add(failure)
        await session.commit()
        await session.refresh(failure)
        return failure.id


async def _user(maker, tag, role=UserRole.RISK_MANAGER):
    return await create_org_user(maker, org_name=f"Explain {tag}", slug=f"explain-{tag}", email=f"u@{tag}.io", role=role)


async def test_without_a_key_the_explanation_is_honestly_unavailable(client, db_session_factory, monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", None)
    org, user = await _user(db_session_factory, "nokey")
    fid = await _failure(db_session_factory, org.id)
    token = await token_for(client, user.email)

    listing = (await client.get("/failures", headers=bearer(token))).json()
    assert listing["items"][0]["llm_explanation_status"] == "unavailable"
    assert listing["items"][0]["strategy_name"] == "SPY Momentum"
    detail = (await client.get(f"/failures/{fid}", headers=bearer(token))).json()
    assert detail["llm_explanation_status"] == "unavailable"

    with patch("app.worker.tasks.run_failure_explanation.delay") as delay:
        resp = await client.post(f"/failures/{fid}/explanation", headers=bearer(token))
    assert resp.status_code == 503
    assert "API key" in resp.json()["detail"]
    delay.assert_not_called()


async def test_gemini_only_cannot_serve_failure_explanations(client, db_session_factory, monkeypatch):
    """explain_failure is Claude-routed and Claude never falls back to Gemini."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-gemini-key")
    org, user = await _user(db_session_factory, "geminionly")
    await _failure(db_session_factory, org.id)
    listing = (await client.get("/failures", headers=bearer(await token_for(client, user.email)))).json()
    assert listing["items"][0]["llm_explanation_status"] == "unavailable"


async def test_placeholder_is_not_treated_as_a_generated_explanation(client, db_session_factory, monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")
    org, user = await _user(db_session_factory, "placeholder")
    fid = await _failure(db_session_factory, org.id, explanation=_PLACEHOLDER)
    token = await token_for(client, user.email)
    with patch("app.api.routes.failures.is_worker_online", return_value=False):
        detail = (await client.get(f"/failures/{fid}", headers=bearer(token))).json()
    assert detail["llm_explanation_status"] == "queued"
    assert detail["background_worker_online"] is False

    with patch("app.worker.tasks.run_failure_explanation.delay") as delay:
        delay.return_value.id = "task-123"
        resp = await client.post(f"/failures/{fid}/explanation", headers=bearer(token))
    assert resp.status_code == 202
    assert resp.json()["llm_explanation_status"] == "queued"
    kwargs = delay.call_args.kwargs
    assert kwargs["failure_id"] == str(fid)
    assert kwargs["requested_by_user_id"] == str(user.id)


@pytest.mark.anyio
async def test_configured_key_generates_explanation_end_to_end_and_audits_it(db_session_factory, monkeypatch):
    import app.services.llm_explain as llm_explain_module

    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")
    org, user = await _user(db_session_factory, "generate")
    fid = await _failure(db_session_factory, org.id)

    @asynccontextmanager
    async def _session(organization_id):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, organization_id)
            yield session

    tool_input = {
        "explanation_text": "The strategy's losses from its highest point grew past its allowed limit.",
        "regime_context_summary": "A calm market with small daily price moves.",
        "suggested_mitigation": "Tighten the exit rule in quiet markets.",
        "numeric_claims": [{"metric_name": "max_drawdown", "claimed_value": -14.17}],
    }
    monkeypatch.setattr(llm_explain_module, "get_tenant_session", _session)
    with patch_llm_providers(tool_input) as (gemini, claude):
        result = await llm_explain_module.explain_failure_and_persist(org.id, fid, requested_by_user_id=user.id)
    assert result == {"failure_id": str(fid), "explained": True, "numeric_validation_passed": True}
    assert claude.call_count == 1 and gemini.call_count == 0

    system_prompt = claude.call_args.args[0]
    assert "NOT a quantitative specialist" in system_prompt
    assert "no headings, bullet points, bold text or other markdown" in system_prompt
    assert "numeric_claims" in system_prompt  # verification requirement kept

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        failure = await session.get(Failure, fid)
        assert failure.llm_generated_explanation.startswith("The strategy's losses")
        assert llm_explain_module.explanation_status(failure) == "generated"
        [audit] = (
            await session.execute(
                select(AuditLog).where(AuditLog.event_type == AuditEventType.LLM_EXPLANATION_GENERATED)
            )
        ).scalars().all()
    assert audit.actor_email == user.email
    assert audit.entity_type == "failure" and audit.entity_name == "SPY Momentum"


@pytest.mark.anyio
async def test_plain_language_does_not_weaken_numeric_cross_validation(db_session_factory, monkeypatch):
    import app.services.llm_explain as llm_explain_module

    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")
    org, _ = await _user(db_session_factory, "hallucinate")
    fid = await _failure(db_session_factory, org.id)

    @asynccontextmanager
    async def _session(organization_id):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, organization_id)
            yield session

    tool_input = {
        "explanation_text": "Losses reached about 40%.",
        "regime_context_summary": "Calm market.",
        "suggested_mitigation": "Review exits.",
        "numeric_claims": [{"metric_name": "max_drawdown", "claimed_value": -40.0}],
    }
    monkeypatch.setattr(llm_explain_module, "get_tenant_session", _session)
    with patch_llm_providers(tool_input):
        result = await llm_explain_module.explain_failure_and_persist(org.id, fid)
    assert result["numeric_validation_passed"] is False


async def test_failure_records_its_symbol_and_list_exposes_it(client, db_session_factory):
    from app.services.failure import persist_failure

    org, user = await _user(db_session_factory, "symbol")
    sid = await seed_strategy(
        db_session_factory, organization_id=org.id, status=StrategyStatus.ACTIVE, valid_rules=True, robustness_score=0.8
    )
    assessment = FailureAssessment(
        trigger=FailureTrigger.DRAWDOWN_BREACH,
        failure_timestamp=datetime(2025, 3, 3, tzinfo=UTC),
        regime_at_failure="Bear",
        performance_metrics={"max_drawdown": -0.3},
        market_context={"close": 101.0},
        feature_attribution=[],
    )
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        strategy = await session.get(Strategy, sid)
        failure = await persist_failure(session, strategy=strategy, assessment=assessment, symbol="QQQ")
        await session.commit()
        assert failure.market_context_snapshot["symbol"] == "QQQ"
    await _failure(db_session_factory, org.id)  # legacy row: no symbol recorded

    items = (await client.get("/failures", headers=bearer(await token_for(client, user.email)))).json()["items"]
    assert sorted((i["symbol"] or "") for i in items) == ["", "QQQ"]
