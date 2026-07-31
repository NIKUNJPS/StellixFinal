"""Test 5 (required order): mock a deliberately wrong Sharpe ratio claim and assert
numeric_validation_passed is correctly False."""

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


async def _seed_org_and_user(db_session_factory, slug: str):
    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        org = Organization(name=slug, slug=slug, tier=OrganizationTier.STARTER, max_strategies=25, is_active=True)
        session.add(org)
        await session.flush()
        user = User(
            organization_id=org.id, email=f"{slug}@llm.io", hashed_password=hash_password("supersecret1"),
            full_name=None, role=UserRole.RESEARCHER, is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(org)
        await session.refresh(user)
        return org, user


@pytest.mark.anyio
async def test_deliberately_wrong_sharpe_claim_fails_numeric_validation(db_session_factory):
    org, user = await _seed_org_and_user(db_session_factory, "numeric-wrong")

    # Real stored data: sharpe_ratio is 0.45. The model deliberately claims 1.9 —
    # wildly outside tolerance — simulating a hallucinated number.
    real_failure_record = {"sharpe_ratio": 0.45, "max_drawdown": -0.12, "win_rate": 0.35}

    with patch_llm_providers({
            "explanation_text": "The strategy failed with an excellent Sharpe of 1.9, which is surprising.",
            "regime_context_summary": "Bear regime.",
            "suggested_mitigation": "Reduce position size.",
            "numeric_claims": [{"metric_name": "sharpe_ratio", "claimed_value": 1.9}],
        }):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, org.id)
            llm = LLMService(session, organization_id=org.id, user_id=user.id)
            explanation, numeric_validation_passed = await llm.explain_failure(
                failure_record=real_failure_record
            )

    assert numeric_validation_passed is False

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        row = (await session.execute(select(LLMAuditLog))).scalar_one()
        assert row.numeric_validation_passed is False  # persisted to the audit log too


@pytest.mark.anyio
async def test_correct_sharpe_claim_passes_numeric_validation(db_session_factory):
    """Control case: the same shape of claim, but numerically correct, must pass —
    proving the check discriminates rather than always failing."""
    org, user = await _seed_org_and_user(db_session_factory, "numeric-correct")

    real_failure_record = {"sharpe_ratio": 0.45, "max_drawdown": -0.12, "win_rate": 0.35}

    with patch_llm_providers({
            "explanation_text": "The strategy failed with a modest Sharpe of 0.45.",
            "regime_context_summary": "Bear regime.",
            "suggested_mitigation": "Reduce position size.",
            "numeric_claims": [{"metric_name": "sharpe_ratio", "claimed_value": 0.45}],
        }):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, org.id)
            llm = LLMService(session, organization_id=org.id, user_id=user.id)
            _explanation, numeric_validation_passed = await llm.explain_failure(
                failure_record=real_failure_record
            )

    assert numeric_validation_passed is True


@pytest.mark.anyio
async def test_wrong_claim_in_critique_strategy_also_fails_validation(db_session_factory):
    """The same mechanism applies to critique_strategy, not just explain_failure."""
    org, user = await _seed_org_and_user(db_session_factory, "numeric-critique-wrong")

    real_strategy_record = {"robustness_score": 0.55, "name": "X"}

    with patch_llm_providers({
            "strengths": ["Simple rules"],
            "weaknesses": [],
            "overfitting_risks": [],
            "edge_cases": [],
            "numeric_claims": [{"metric_name": "robustness_score", "claimed_value": 0.95}],  # real is 0.55
        }):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, org.id)
            llm = LLMService(session, organization_id=org.id, user_id=user.id)
            _critique, numeric_validation_passed = await llm.critique_strategy(
                strategy_record=real_strategy_record
            )

    assert numeric_validation_passed is False


@pytest.mark.anyio
async def test_claim_referencing_unknown_metric_fails_validation(db_session_factory):
    """A claim about a metric we have no ground truth for at all is unverifiable,
    which must also count as a failure (not silently pass as 'no data to contradict')."""
    org, user = await _seed_org_and_user(db_session_factory, "numeric-unknown")

    with patch_llm_providers({
            "explanation_text": "The Calmar ratio was 3.2, indicating strong risk-adjusted return.",
            "regime_context_summary": "Bull regime.",
            "suggested_mitigation": "None needed.",
            "numeric_claims": [{"metric_name": "calmar_ratio", "claimed_value": 3.2}],
        }):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, org.id)
            llm = LLMService(session, organization_id=org.id, user_id=user.id)
            _explanation, numeric_validation_passed = await llm.explain_failure(
                failure_record={"sharpe_ratio": 0.45}  # no calmar_ratio provided at all
            )

    assert numeric_validation_passed is False


# --------------------------------------------------------------------------- #
# ADR-0005: ground truth covers EVERY source the model was shown.
#
# Regression tests for a live false-positive: explain_failure hands the model
# market_context_snapshot and feature_attribution and tells it to restate every
# number it mentions, but ground truth was built only from the performance metrics.
# Its truthful citations of close/rsi_14/shap_* were unverifiable, so all 6 seeded
# demo failures were flagged as hallucinations while citing correct values.
#
# The record below mirrors a REAL seeded row, including the two traps that shape
# the fix: `atr_14` appears in BOTH market context (6.83) and feature attribution
# (shap 0.0157), and `recent_sharpe` is null.
# --------------------------------------------------------------------------- #
_REAL_SHAPED_RECORD = {
    "regime_at_failure": "Bear",
    "trigger_condition": "drawdown_breach",
    "performance_metrics_at_failure": {
        "sharpe": 0.13738311440223688,
        "win_rate": 0.3076923076923077,
        "max_drawdown": -0.1417245975346071,
        "recent_sharpe": None,
    },
    "market_context_snapshot": {
        "macd": -0.17366180420231103,
        "close": 588.219970703125,
        "atr_14": 6.8339440562969305,
        "rsi_14": 41.88246375285717,
        "sma_50": 592.7882006835938,
        "realized_vol_20": 0.009082574510215222,
    },
    "feature_attribution": [
        {"feature_name": "macd", "shap_value": 0.008939485821629487, "direction": "negative"},
        {"feature_name": "atr_14", "shap_value": 0.015737712791068312, "direction": "positive"},
    ],
}


@pytest.mark.anyio
async def test_safeguard5_accepts_correct_claims_from_all_sources(db_session_factory):
    """Correct numbers drawn from every source the model was shown must validate.

    The claim set is the real one that failed live: headline metric, market-context
    values, and SHAP values in both naming forms the model actually alternates
    between (`shap_x` and `shap_value_x`). `atr_14` here is the CONTEXT value, not
    the SHAP one — the guard must tell those two apart rather than accepting either.
    """
    org, user = await _seed_org_and_user(db_session_factory, "numeric-all-sources")

    with patch_llm_providers({
            "explanation_text": "Sharpe was 0.137 as price closed at 588.22 below the 592.79 SMA-50.",
            "regime_context_summary": "Bear regime; RSI 41.88, ATR 6.83.",
            "suggested_mitigation": "Widen the stop.",
            "numeric_claims": [
                {"metric_name": "sharpe_ratio", "claimed_value": 0.13738311440223688},
                {"metric_name": "win_rate", "claimed_value": 0.3076923076923077},
                {"metric_name": "close", "claimed_value": 588.219970703125},
                {"metric_name": "context_close", "claimed_value": 588.219970703125},
                {"metric_name": "sma_50", "claimed_value": 592.7882006835938},
                {"metric_name": "rsi_14", "claimed_value": 41.88246375285717},
                {"metric_name": "atr_14", "claimed_value": 6.8339440562969305},
                {"metric_name": "shap_macd", "claimed_value": 0.008939485821629487},
                {"metric_name": "shap_value_atr_14", "claimed_value": 0.015737712791068312},
            ],
        }):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, org.id)
            llm = LLMService(session, organization_id=org.id, user_id=user.id)
            _explanation, numeric_validation_passed = await llm.explain_failure(
                failure_record=_REAL_SHAPED_RECORD
            )

    assert numeric_validation_passed is True


@pytest.mark.anyio
async def test_safeguard5_still_catches_invented_key(db_session_factory):
    """Widening ground truth must not become a skip-unknown-keys escape hatch: a
    metric that exists in NO source the model was shown is still a hallucination."""
    org, user = await _seed_org_and_user(db_session_factory, "numeric-invented-key")

    with patch_llm_providers({
            "explanation_text": "The sharpe_ratio_v2 came in at 1.4.",
            "regime_context_summary": "Bear regime.",
            "suggested_mitigation": "None.",
            "numeric_claims": [
                # Real and correct — proves the failure below is caused by the
                # invented key alone, not by the whole claim set being rejected.
                {"metric_name": "close", "claimed_value": 588.219970703125},
                {"metric_name": "sharpe_ratio_v2", "claimed_value": 1.4},
            ],
        }):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, org.id)
            llm = LLMService(session, organization_id=org.id, user_id=user.id)
            _explanation, numeric_validation_passed = await llm.explain_failure(
                failure_record=_REAL_SHAPED_RECORD
            )

    assert numeric_validation_passed is False


@pytest.mark.anyio
async def test_safeguard5_still_catches_wrong_value(db_session_factory):
    """Tolerance is unchanged: a known metric with a wrong value still fails, and a
    SHAP value claimed under a real feature name still has to be the real one."""
    org, user = await _seed_org_and_user(db_session_factory, "numeric-wrong-value")

    with patch_llm_providers({
            "explanation_text": "Sharpe was a stellar 99.9.",
            "regime_context_summary": "Bear regime.",
            "suggested_mitigation": "None.",
            "numeric_claims": [{"metric_name": "sharpe_ratio", "claimed_value": 99.9}],
        }):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, org.id)
            llm = LLMService(session, organization_id=org.id, user_id=user.id)
            _explanation, numeric_validation_passed = await llm.explain_failure(
                failure_record=_REAL_SHAPED_RECORD
            )

    assert numeric_validation_passed is False


@pytest.mark.anyio
async def test_safeguard5_catches_wrong_shap_value_for_real_feature(db_session_factory):
    """The collision guard, from the other side: `atr_14` names two different real
    numbers (context 6.83, SHAP 0.0157). Claiming the CONTEXT value under a SHAP
    alias must fail — otherwise the aliases would let any real number in the record
    validate under any name."""
    org, user = await _seed_org_and_user(db_session_factory, "numeric-shap-collision")

    with patch_llm_providers({
            "explanation_text": "The SHAP value for atr_14 was 6.83.",
            "regime_context_summary": "Bear regime.",
            "suggested_mitigation": "None.",
            "numeric_claims": [{"metric_name": "shap_atr_14", "claimed_value": 6.8339440562969305}],
        }):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, org.id)
            llm = LLMService(session, organization_id=org.id, user_id=user.id)
            _explanation, numeric_validation_passed = await llm.explain_failure(
                failure_record=_REAL_SHAPED_RECORD
            )

    assert numeric_validation_passed is False


@pytest.mark.anyio
async def test_safeguard5_rejects_number_claimed_for_null_field(db_session_factory):
    """`recent_sharpe` is a real field that is null in real records. The model was
    shown null, so any number it claims for it is unverifiable — and stays a
    failure. Registering nulls as ground truth would have made this pass."""
    org, user = await _seed_org_and_user(db_session_factory, "numeric-null-field")

    with patch_llm_providers({
            "explanation_text": "Recent sharpe was 1.23.",
            "regime_context_summary": "Bear regime.",
            "suggested_mitigation": "None.",
            "numeric_claims": [{"metric_name": "recent_sharpe", "claimed_value": 1.23}],
        }):
        async with db_session_factory() as session:
            bind_organization(session.sync_session, org.id)
            llm = LLMService(session, organization_id=org.id, user_id=user.id)
            _explanation, numeric_validation_passed = await llm.explain_failure(
                failure_record=_REAL_SHAPED_RECORD
            )

    assert numeric_validation_passed is False
