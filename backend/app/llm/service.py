"""LLMService — the research assistant's 4 functions (Batch 9; multi-model in 18).

Batch 18: provider selection moved out to ``app.llm.router`` (LLMCostRouter), which
routes each function to the cheapest capable model and performs the actual call.
This module keeps everything it owned before — prompts, Safeguard 5 numeric
cross-validation, and log-then-return audit logging — and is now provider-agnostic:
it asks the router for a validated Pydantic object and never names a provider.

The safeguards WRAP the router; they are not bypassed by it. Safeguard 1 runs inside
``router.call_tool`` before either provider's API is touched (and before the Gemini
-> Claude fallback, so a rejected prompt cannot be retried into the other provider);
Safeguard 5 runs here on the parsed result; Safeguard 4 logs here before returning.

Architectural note (Safeguard 2 — NO EXECUTION AUTHORITY): this module and
everything it imports must never depend on ``app.services.strategy``,
``app.services.failure``, or ``app.services.evolution`` (the write/mutation
service layers). It only ever returns Pydantic data structures; it never creates,
updates, or transitions a Strategy/Failure/EvolutionRun itself. Verified by
``app/llm/architecture_check.py`` + ``tests/test_llm_no_execution_authority.py``.

Every method logs the full prompt/response to ``llm_audit_log`` BEFORE returning
(Safeguard 4, "log-then-return") — this is the one, deliberate exception to "no
mutations": audit logging is a safety control, not a domain mutation.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, TypeVar

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.metrics import llm_calls_total
from app.llm.router import LLMUnavailableError, llm_router
from app.llm.schemas import FailureExplanation, GraphSummary, HypothesisResult, StrategyCritique
from app.llm.validation import validate_numeric_claims
from app.models.llm_audit_log import LLMAuditLog

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# LLMUnavailableError now lives in app.llm.router (the layer that actually talks to
# the providers), but Batch 9's callers — routes, llm_explain, tests — import it
# from here. Re-exported so that contract is unbroken; __all__ keeps linters from
# reading it as an unused import.
__all__ = ["LLMService", "LLMUnavailableError"]


class LLMService:
    def __init__(
        self, db: AsyncSession, *, organization_id: uuid.UUID, user_id: uuid.UUID | None
    ) -> None:
        self._db = db
        self._organization_id = organization_id
        self._user_id = user_id

    async def _call_tool(
        self,
        *,
        function_name: str,
        system_prompt: str,
        user_prompt: str,
        output_model: type[T],
        numeric_claims_real_data: dict[str, float | None] | None = None,
        stakes: str = "low",
    ) -> tuple[T, bool | None]:
        # Batch 18: the router picks the provider from the function name + stakes
        # and makes the call. Safeguard 1 (price prediction) runs inside call_tool
        # before any provider is touched.
        model_key = llm_router.route(function_name, stakes)
        routed = await llm_router.call_tool(
            model_key=model_key,
            function_name=function_name,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            output_model=output_model,
        )
        result = routed.result

        llm_calls_total.labels(function_name=function_name).inc()

        numeric_validation_passed: bool | None = None
        if numeric_claims_real_data is not None:
            claims = getattr(result, "numeric_claims", [])
            numeric_validation_passed = validate_numeric_claims(claims, numeric_claims_real_data)
            if numeric_validation_passed is False:
                # Batch 13: previously only reached a human via the audit log
                # viewer UI (numeric_validation_passed=False on the persisted
                # row below) — a hallucinated number is a recoverable-but-
                # notable event, so it should also surface in log monitoring.
                logger.warning(
                    "LLM numeric hallucination guard failed for %s (org=%s): claims=%s real_data=%s",
                    function_name,
                    self._organization_id,
                    claims,
                    numeric_claims_real_data,
                )

        full_prompt = f"SYSTEM:\n{system_prompt}\n\nUSER:\n{user_prompt}"

        # Log BEFORE returning (Safeguard 4 — "log-then-return"). model_used /
        # model_key / cost come from the router's report of what ACTUALLY served
        # the call, not from the routing decision above — those differ whenever the
        # Gemini -> Claude fallback fires, and the log must record what really ran.
        self._db.add(
            LLMAuditLog(
                organization_id=self._organization_id,
                user_id=self._user_id,
                function_name=function_name,
                full_prompt=full_prompt,
                full_response=routed.raw_response_json,
                model_used=routed.model_name,
                model_key=routed.model_key,
                input_tokens=routed.input_tokens,
                output_tokens=routed.output_tokens,
                estimated_cost_usd=routed.cost_usd,
                numeric_validation_passed=numeric_validation_passed,
            )
        )
        await self._db.commit()

        return result, numeric_validation_passed

    async def generate_hypothesis(
        self,
        *,
        market_context: dict[str, Any],
        regime_history: list[dict[str, Any]],
        related_research_notes: list[dict[str, Any]],
        user_prompt: str | None = None,
    ) -> HypothesisResult:
        system_prompt = (
            "You are a quantitative research assistant for Stellix Labs, a regime-adaptive "
            "trading research platform. Generate ONE testable strategy hypothesis grounded in "
            "the market context, regime history, and related research notes provided. Never "
            "make a price forecast or price target — only propose a strategy structure "
            "(indicator-based rules and parameter ranges) and the regime(s) it should target. "
            "Every hypothesis you produce starts as a draft that a human researcher must review "
            "before it can become a real strategy."
        )
        user_content = (
            f"Market context:\n{market_context}\n\n"
            f"Recent regime history:\n{regime_history}\n\n"
            f"Related research notes:\n{related_research_notes}\n"
        )
        if user_prompt:
            user_content += f"\nResearcher's framing/focus:\n{user_prompt}\n"

        # Creative + high volume, and grounded in context passed in the prompt
        # rather than cross-checked against stored numbers -> Gemini (Batch 18).
        result, _ = await self._call_tool(
            function_name="generate_hypothesis",
            system_prompt=system_prompt,
            user_prompt=user_content,
            output_model=HypothesisResult,
            stakes="low",
        )
        return result

    async def explain_failure(
        self, *, failure_record: dict[str, Any]
    ) -> tuple[FailureExplanation, bool | None]:
        system_prompt = (
            "You are a quantitative research assistant for Stellix Labs. Explain WHY a trading "
            "strategy failed, using ONLY the fields provided in the failure record below. Do not "
            "invent numbers that aren't given. For every specific number you mention in your "
            "explanation or regime summary, also list it in numeric_claims using the exact field "
            "names shown (e.g. 'sharpe_ratio', 'max_drawdown', 'win_rate') so it can be verified "
            "against the real record."
        )
        user_content = f"Failure record:\n{failure_record}\n"

        real_data = _extract_numeric_ground_truth(failure_record)
        # References a real stored Failure row and is cross-checked against it
        # (Safeguard 5) -> Claude, high stakes (Batch 18).
        result, numeric_validation_passed = await self._call_tool(
            function_name="explain_failure",
            system_prompt=system_prompt,
            user_prompt=user_content,
            output_model=FailureExplanation,
            numeric_claims_real_data=real_data,
            stakes="high",
        )
        return result, numeric_validation_passed

    async def critique_strategy(
        self, *, strategy_record: dict[str, Any]
    ) -> tuple[StrategyCritique, bool | None]:
        system_prompt = (
            "You are a quantitative research assistant for Stellix Labs. Critique a trading "
            "strategy's rules, risk constraints, and regime performance, using ONLY the fields "
            "provided below. Identify genuine strengths, weaknesses, overfitting risks, and edge "
            "cases. For every specific number you mention, also list it in numeric_claims using "
            "the exact field names shown (e.g. 'sharpe_ratio', 'robustness_score') so it can be "
            "verified against the real record."
        )
        user_content = f"Strategy record:\n{strategy_record}\n"

        real_data = _extract_numeric_ground_truth(strategy_record)
        # Deep reasoning over a real stored Strategy row, cross-checked against it
        # -> Claude, high stakes (Batch 18).
        result, numeric_validation_passed = await self._call_tool(
            function_name="critique_strategy",
            system_prompt=system_prompt,
            user_prompt=user_content,
            output_model=StrategyCritique,
            numeric_claims_real_data=real_data,
            stakes="high",
        )
        return result, numeric_validation_passed

    async def summarize_graph_query_result(
        self, *, query_name: str, raw_results: dict[str, Any]
    ) -> GraphSummary:
        system_prompt = (
            "You are a quantitative research assistant for Stellix Labs. Summarize a knowledge "
            "graph query result in plain language for a researcher, using ONLY the data provided."
        )
        user_content = f"Query: {query_name}\n\nRaw results:\n{raw_results}\n"

        # Summarization of data handed to it in the prompt -> Gemini (Batch 18).
        result, _ = await self._call_tool(
            function_name="summarize_graph_query_result",
            system_prompt=system_prompt,
            user_prompt=user_content,
            output_model=GraphSummary,
            stakes="low",
        )
        return result


def _is_number(value: Any) -> bool:
    """True for a real number. bool is an int subclass in Python, and a flag cited
    as a metric is not a numeric claim — exclude it explicitly."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _register(ground_truth: dict[str, float | None], name: str, value: Any) -> None:
    """Record one verifiable number under ``name``.

    setdefault, not assignment: the caller registers sources in descending order of
    authority, so the headline performance metrics win over an identically-named
    value that happens to appear deeper in the record.
    """
    if _is_number(value):
        ground_truth.setdefault(name, float(value))


def _register_mapping(
    ground_truth: dict[str, float | None], mapping: Any, *, prefix: str = ""
) -> None:
    """Register every numeric leaf of a (possibly nested) mapping.

    Each leaf lands under its bare key AND, when a prefix applies, a prefixed
    alias — the model may cite ``close`` or ``context_close`` for the same number,
    and both are the same true claim. Nested mappings recurse so a value is never
    invisible to the guard just because it sits one level down.
    """
    if not isinstance(mapping, dict):
        return
    for key, value in mapping.items():
        key = str(key)
        if isinstance(value, dict):
            _register_mapping(ground_truth, value, prefix=prefix)
            continue
        # A null field (e.g. performance_metrics_at_failure.recent_sharpe) has no
        # verifiable value. It is deliberately NOT registered: the model was shown
        # null, so a number claimed for it is unverifiable and must fail.
        _register(ground_truth, key, value)
        if prefix:
            _register(ground_truth, f"{prefix}{key}", value)


def _register_attribution(ground_truth: dict[str, float | None], attribution: Any) -> None:
    """Register SHAP values from ``feature_attribution`` (a list of per-feature dicts).

    Always prefixed, never bare. A feature name can collide with a market-context
    key — atr_14 is both a context value (~6.83) and a SHAP magnitude (~0.016) in
    real records — so registering SHAP values under the bare feature name would make
    one of the two true claims unverifiable.

    Three aliases per feature because the model genuinely alternates between them
    across runs: observed live output used both ``shap_atr_14`` and
    ``shap_value_macd`` for the same kind of quantity.
    """
    if not isinstance(attribution, list):
        return
    for entry in attribution:
        if not isinstance(entry, dict):
            continue
        feature = entry.get("feature_name") or entry.get("feature") or entry.get("name")
        shap_value = entry.get("shap_value")
        if not feature or not _is_number(shap_value):
            continue
        feature = str(feature)
        for alias in (f"shap_{feature}", f"shap_value_{feature}", f"{feature}_shap"):
            _register(ground_truth, alias, shap_value)


def _extract_numeric_ground_truth(record: dict[str, Any]) -> dict[str, float | None]:
    """Flatten every verifiable number out of a failure/strategy record for
    Safeguard 5 cross-validation.

    The invariant (ADR-0005): the guard checks every number the model was SHOWN.
    Ground truth must therefore cover every source serialized into the prompt, not
    a subset of them. Before ADR-0005 this read only the top-level metrics and
    performance_metrics_at_failure, while the prompt also handed the model
    market_context_snapshot and feature_attribution and instructed it to restate
    every number it mentions — so its truthful citations of close/rsi_14/shap_*
    were unverifiable and failed the whole response. Confirmed live: all 6 seeded
    demo failures were flagged while citing correct values.

    Only reads fields the caller already supplied — no separate DB fetch, which
    keeps LLMService free of any service-layer dependency.
    """
    ground_truth: dict[str, float | None] = {}

    # Most authoritative first (see _register): headline metrics, then the record's
    # own metric mappings, then context, then attribution.
    for key in ("sharpe_ratio", "max_drawdown", "win_rate", "profit_factor", "robustness_score"):
        _register(ground_truth, key, record.get(key))

    # `sharpe` -> `sharpe_ratio` needs no special case here: validation._ALIASES
    # normalizes both sides of the comparison. (The old elif that tried to do it by
    # hand was unreachable anyway — the preceding isinstance check caught every
    # number first.)
    _register_mapping(ground_truth, record.get("performance_metrics_at_failure"))
    _register_mapping(ground_truth, record.get("regime_compatibility"))
    _register_mapping(ground_truth, record.get("risk_constraints"))
    _register_mapping(ground_truth, record.get("market_context_snapshot"), prefix="context_")
    _register_attribution(ground_truth, record.get("feature_attribution"))

    return ground_truth
