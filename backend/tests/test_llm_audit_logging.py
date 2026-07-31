"""Test 4 (required order): every LLM call (all 4 functions) logs full prompt,
full raw response, user_id, organization_id, function_name, timestamp, and token
usage to llm_audit_log BEFORE returning to the caller — assert exactly one row is
created per call, with every field populated."""

from __future__ import annotations

import pytest
from app.core.security import hash_password
from app.db.tenant import bind_organization, mark_session_unscoped
from app.llm.service import LLMService
from app.models.llm_audit_log import LLMAuditLog
from app.models.organization import Organization, OrganizationTier
from app.models.user import User, UserRole
from sqlalchemy import select

from tests.llm_test_helpers import patch_llm_providers


async def _seed_org_and_user(db_session_factory):
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        org = Organization(name="Audit Org", slug="audit-org", tier=OrganizationTier.STARTER, max_strategies=25, is_active=True)
        session.add(org)
        await session.flush()
        user = User(
            organization_id=org.id, email="audit@llm.io", hashed_password=hash_password("supersecret1"),
            full_name=None, role=UserRole.RESEARCHER, is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(org)
        await session.refresh(user)
        return org, user


async def _count_audit_rows(db_session_factory, organization_id) -> int:
    async with db_session_factory() as session:
        bind_organization(session.sync_session, organization_id)
        rows = (await session.execute(select(LLMAuditLog))).scalars().all()
        return len(rows)


def _assert_all_fields_populated(row: LLMAuditLog, *, expected_function_name: str) -> None:
    assert row.id is not None
    assert row.organization_id is not None
    assert row.function_name == expected_function_name
    assert row.full_prompt  # non-empty
    assert row.full_response  # non-empty
    assert row.model_used
    assert row.input_tokens is not None
    assert row.output_tokens is not None
    assert row.created_at is not None


@pytest.mark.anyio
async def test_generate_hypothesis_logs_exactly_one_audit_row(db_session_factory):
    org, user = await _seed_org_and_user(db_session_factory)

    with patch_llm_providers({
            "hypothesis_text": "Mean reversion works in high-vol regimes",
            "rationale": "RSI extremes revert quickly under elevated volatility",
            "suggested_parameters": [],
            "suggested_regime_focus": ["High-Volatility"],
        }):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, org.id)
            llm = LLMService(session, organization_id=org.id, user_id=user.id)
            await llm.generate_hypothesis(market_context={}, regime_history=[], related_research_notes=[])

    count = await _count_audit_rows(db_session_factory, org.id)
    assert count == 1

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        row = (await session.execute(select(LLMAuditLog))).scalar_one()
        _assert_all_fields_populated(row, expected_function_name="generate_hypothesis")
        assert row.user_id == user.id
        assert row.numeric_validation_passed is None  # not applicable to this function


@pytest.mark.anyio
async def test_explain_failure_logs_exactly_one_audit_row(db_session_factory):
    org, user = await _seed_org_and_user(db_session_factory)

    with patch_llm_providers({
            "explanation_text": "The strategy failed due to a Sharpe of 0.45 in a drawdown regime.",
            "regime_context_summary": "Bear regime, elevated volatility.",
            "suggested_mitigation": "Tighten the stop-loss.",
            "numeric_claims": [{"metric_name": "sharpe_ratio", "claimed_value": 0.45}],
        }):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, org.id)
            llm = LLMService(session, organization_id=org.id, user_id=user.id)
            await llm.explain_failure(failure_record={"sharpe_ratio": 0.45, "max_drawdown": -0.1})

    count = await _count_audit_rows(db_session_factory, org.id)
    assert count == 1

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        row = (await session.execute(select(LLMAuditLog))).scalar_one()
        _assert_all_fields_populated(row, expected_function_name="explain_failure")
        assert row.numeric_validation_passed is True  # the claim matched real data


@pytest.mark.anyio
async def test_critique_strategy_logs_exactly_one_audit_row(db_session_factory):
    org, user = await _seed_org_and_user(db_session_factory)

    with patch_llm_providers({
            "strengths": ["Clear entry logic"],
            "weaknesses": ["No volatility filter"],
            "overfitting_risks": ["Tight RSI thresholds may be curve-fit"],
            "edge_cases": ["Gaps through the RSI band"],
            "numeric_claims": [],
        }):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, org.id)
            llm = LLMService(session, organization_id=org.id, user_id=user.id)
            await llm.critique_strategy(strategy_record={"name": "X", "robustness_score": 0.6})

    count = await _count_audit_rows(db_session_factory, org.id)
    assert count == 1

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        row = (await session.execute(select(LLMAuditLog))).scalar_one()
        _assert_all_fields_populated(row, expected_function_name="critique_strategy")
        assert row.numeric_validation_passed is True  # no claims to contradict


@pytest.mark.anyio
async def test_summarize_graph_query_result_logs_exactly_one_audit_row(db_session_factory):
    org, user = await _seed_org_and_user(db_session_factory)

    with patch_llm_providers({
            "summary_text": "Three strategies are valid across 4+ regimes.",
            "key_findings": ["Strategy A is the most robust"],
        }):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, org.id)
            llm = LLMService(session, organization_id=org.id, user_id=user.id)
            await llm.summarize_graph_query_result(query_name="robust-across-regimes", raw_results={"items": []})

    count = await _count_audit_rows(db_session_factory, org.id)
    assert count == 1

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        row = (await session.execute(select(LLMAuditLog))).scalar_one()
        _assert_all_fields_populated(row, expected_function_name="summarize_graph_query_result")
        assert row.numeric_validation_passed is None  # not applicable


@pytest.mark.anyio
async def test_multiple_calls_produce_one_row_each_not_cumulative_duplicates(db_session_factory):
    org, user = await _seed_org_and_user(db_session_factory)

    with patch_llm_providers({
            "summary_text": "Summary", "key_findings": [],
        }):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, org.id)
            llm = LLMService(session, organization_id=org.id, user_id=user.id)
            await llm.summarize_graph_query_result(query_name="lineage", raw_results={})
            await llm.summarize_graph_query_result(query_name="lineage", raw_results={})
            await llm.summarize_graph_query_result(query_name="lineage", raw_results={})

    assert await _count_audit_rows(db_session_factory, org.id) == 3
