"""Shared helpers for stubbing LLM providers in tests.

Batch 18 moved the provider call out of LLMService and behind LLMCostRouter, so
these helpers patch at the router's **provider boundary** (``_call_gemini`` /
``_call_claude``) rather than at the Anthropic SDK class. That seam is the right
one for two reasons:

  * Everything worth testing stays real. Routing, Safeguard 1 (which runs inside
    ``call_tool``, above the provider), the Gemini->Claude fallback, cost
    arithmetic from token counts, and Safeguard 4 audit logging are all still
    executed — only the network call is replaced.
  * It is provider-agnostic. Patching the Anthropic SDK alone would leave the
    Gemini-routed functions (generate_hypothesis, summarize_graph_query_result)
    making live, billed calls the moment GEMINI_API_KEY is set. Both lanes are
    stubbed here so no test can reach any provider regardless of configuration.

The stub receives the real ``output_model`` the service asked for, so one injected
``tool_input`` dict works for every function without the caller naming the schema.
"""

from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import patch

from app.llm.router import RouterResult, llm_router


def fake_provider_call(
    tool_input: dict,
    *,
    model_key: str = "claude",
    input_tokens: int = 100,
    output_tokens: int = 50,
):
    """Build an async stand-in for ``_call_claude`` / ``_call_gemini``.

    Validates ``tool_input`` against whatever ``output_model`` the caller passed,
    exactly as the real provider paths do — so a payload that wouldn't satisfy the
    schema fails here too, instead of sailing through as a MagicMock.
    """

    async def _call(system_prompt: str, user_prompt: str, output_model):
        return RouterResult(
            result=output_model.model_validate(tool_input),
            model_key=model_key,
            model_name=f"{model_key}-test-model",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=llm_router.cost_usd(model_key, input_tokens, output_tokens),
            raw_response_json='{"mock": "response"}',
        )

    return _call


@contextmanager
def patch_llm_providers(tool_input: dict, **kwargs):
    """Stub BOTH provider lanes to return ``tool_input``, whichever one is routed to.

    Yields the two mocks as (gemini, claude) so a test can assert which lane ran —
    or that neither did, which is how the price-guard tests prove nothing reached
    an API.
    """
    with (
        patch.object(
            llm_router,
            "_call_gemini",
            side_effect=fake_provider_call(tool_input, model_key="gemini", **kwargs),
        ) as gemini,
        patch.object(
            llm_router,
            "_call_claude",
            side_effect=fake_provider_call(tool_input, model_key="claude", **kwargs),
        ) as claude,
    ):
        yield gemini, claude
