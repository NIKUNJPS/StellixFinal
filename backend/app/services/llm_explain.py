"""Orchestrates explain_failure: loads the real Failure record, calls LLMService,
and persists the result back onto that same row (the one narrowly-granted UPDATE
on an otherwise append-only table — see migration 0009 / docs/schemas.md).

Deliberately its own module, separate from app/llm/service.py, so LLMService
itself never needs to import app.models.failure or touch a Failure row directly.
"""

from __future__ import annotations

import uuid
from typing import Literal

from sqlalchemy import select

from app.db.session import get_tenant_session
from app.llm.router import llm_router
from app.llm.service import LLMService, LLMUnavailableError
from app.models.audit_log import AuditEventType
from app.models.failure import Failure
from app.models.strategy import Strategy
from app.services.audit import write_audit_log

# The demo seed stores this instead of calling a real LLM (scripts/seed_demo_data.py).
PLACEHOLDER_PREFIX = "[LLM content pending"

ExplanationStatus = Literal["generated", "queued", "unavailable"]


def has_real_explanation(failure: Failure) -> bool:
    text = failure.llm_generated_explanation
    return bool(text) and not text.startswith(PLACEHOLDER_PREFIX)


def explanation_status(failure: Failure) -> ExplanationStatus:
    """Batch 25: the honest state of a failure's AI explanation.

    ``generated`` — real model output is stored. ``unavailable`` — no provider that
    can serve ``explain_failure`` is configured, so nothing is coming until one is.
    ``queued`` — a provider is configured and generation has been (or can be) queued.
    """
    if has_real_explanation(failure):
        return "generated"
    if not llm_router.can_serve("explain_failure", "high"):
        return "unavailable"
    return "queued"


def _failure_record_dict(failure: Failure) -> dict:
    return {
        "regime_at_failure": failure.regime_at_failure,
        "trigger_condition": failure.trigger_condition.value,
        "performance_metrics_at_failure": failure.performance_metrics_at_failure,
        "feature_attribution": failure.feature_attribution,
        "market_context_snapshot": failure.market_context_snapshot,
        "failure_timestamp": failure.failure_timestamp.isoformat(),
    }


async def explain_failure_and_persist(
    organization_id: uuid.UUID,
    failure_id: uuid.UUID,
    requested_by_user_id: uuid.UUID | None = None,
) -> dict:
    """``requested_by_user_id`` is the person who caused this generation (the manual
    /fail trigger, or "Generate explanation" on the page); None only for the
    automatic monitor sweep, which no human initiated."""
    async with get_tenant_session(organization_id) as session:
        failure = (
            await session.execute(select(Failure).where(Failure.id == failure_id))
        ).scalar_one_or_none()
        if failure is None:
            return {"failure_id": str(failure_id), "explained": False, "reason": "not found"}

        llm = LLMService(session, organization_id=organization_id, user_id=requested_by_user_id)
        try:
            explanation, numeric_validation_passed = await llm.explain_failure(
                failure_record=_failure_record_dict(failure)
            )
        except LLMUnavailableError:
            # Batch 12 pre-note 1: no ANTHROPIC_API_KEY configured yet is an
            # expected, documented deferral, not a real task failure — leave
            # llm_generated_explanation null (the Failure Intelligence page
            # already renders that as "no explanation yet", not a crash)
            # rather than marking this Celery task FAILED for every failure
            # detected until a key is configured.
            return {"failure_id": str(failure_id), "explained": False, "reason": "llm_unavailable"}

        failure.llm_generated_explanation = explanation.explanation_text
        failure.llm_numeric_validation_passed = numeric_validation_passed
        strategy = await session.get(Strategy, failure.strategy_id)
        await write_audit_log(
            session,
            organization_id=organization_id,
            actor_user_id=requested_by_user_id,
            event_type=AuditEventType.LLM_EXPLANATION_GENERATED,
            entity_type="failure",
            entity_id=failure.id,
            entity_name=strategy.name if strategy else None,
            after_state={"numeric_validation_passed": numeric_validation_passed},
        )
        await session.commit()

        return {
            "failure_id": str(failure_id),
            "explained": True,
            "numeric_validation_passed": numeric_validation_passed,
        }
