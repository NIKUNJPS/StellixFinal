"""LLMCostRouter — routes each LLM request to the cheapest *capable* model (Batch 18).

Routing table (deterministic — same request_type + stakes always picks the same
provider, so cost is predictable and the choice is auditable):

    -> claude  explain_failure    (reasons over a real stored Failure row)
               critique_strategy  (deep reasoning over a real Strategy row)
               compliance         (high stakes)
               ...any stakes == "high"
    -> gemini  generate_hypothesis (creative, high volume)
               summarize_graph_query_result / summarize_graph (summarization)
               chat, document      (routine)

Why this module speaks *structured output*, not text
----------------------------------------------------
Batch 18's brief sketched a router whose call returned ``resp.content[0].text``.
That cannot work here without silently deleting two safeguards: LLMService gets a
validated Pydantic object out of forced tool-use, and Safeguard 5 cross-checks the
``numeric_claims`` field on that object against real stored numbers. A plain-text
router has neither. So the provider abstraction is at the *structured call* level:
both providers are asked for JSON conforming to the same Pydantic schema, and both
return a parsed model — Anthropic via forced tool-use, Gemini via
``response_schema``. Verified live on both providers before this was written.

Token usage is read from each SDK's real usage payload (``usage.input_tokens`` /
``usage_metadata.prompt_token_count``) — never estimated from word counts. The
audit log is a compliance control (PROJECT_CONSTITUTION §4); a fabricated token
count there would be a fabricated cost figure.

Gemini SDK: the official ``google-genai`` package. NOT ``google-generativeai``,
which is end-of-life and prints "All support for this package has ended" on import.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, TypeVar

import anthropic
from pydantic import BaseModel

from app.core.config import settings
from app.llm.guard import check_price_prediction_guard

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

_MAX_TOKENS = 2048

# Per-1K-token prices, USD. Sources: Claude Sonnet 4.6 is $3/$15 per million
# tokens; Gemini 2.5 Flash is $0.30/$2.50 per million. Stored per-1K to match the
# arithmetic below. These are a snapshot: prices change, which is exactly why the
# computed cost is persisted per row at call time rather than derived at read time
# from whatever today's price happens to be.
COST_PER_1K_INPUT = {"gemini": 0.0003, "claude": 0.003}
COST_PER_1K_OUTPUT = {"gemini": 0.0025, "claude": 0.015}

# Functions whose answers reference real stored data or carry real consequence.
_CLAUDE_REQUEST_TYPES = frozenset(
    {"explain_failure", "critique_strategy", "compliance"}
)


class LLMUnavailableError(Exception):
    """Raised when no configured provider could serve the request.

    Carries the same contract Batch 9 established: route handlers translate this
    into a clean 503 with a readable detail rather than letting a provider SDK's
    raw error surface as an unhandled 500 (which the browser renders as an opaque
    "Failed to fetch"). Defined here rather than in service.py so router.py has no
    import dependency on the service layer; service.py re-exports it for callers.
    """


@dataclass(frozen=True)
class RouterResult:
    """One completed structured call — everything the audit log needs."""

    result: BaseModel
    model_key: str          # "gemini" | "claude"
    model_name: str         # the concrete model id actually called
    input_tokens: int | None
    output_tokens: int | None
    cost_usd: float | None
    raw_response_json: str


def _clean_schema(schema: dict) -> dict:
    """Strip the pydantic-specific 'title' key Anthropic's tool schema doesn't need."""
    schema = dict(schema)
    schema.pop("title", None)
    if "properties" in schema:
        schema["properties"] = {
            k: {kk: vv for kk, vv in v.items() if kk != "title"}
            for k, v in schema["properties"].items()
        }
    return schema


class LLMCostRouter:
    """Deterministic provider routing + a unified structured-call interface."""

    # Read through to settings on every access rather than snapshotting at import:
    # tests (and the deferred-credential pattern) mutate these at runtime.
    @property
    def MODELS(self) -> dict[str, str]:
        return {"gemini": settings.GEMINI_MODEL, "claude": settings.ANTHROPIC_MODEL}

    COST_PER_1K_INPUT = COST_PER_1K_INPUT
    COST_PER_1K_OUTPUT = COST_PER_1K_OUTPUT

    # ---- routing ---------------------------------------------------------

    def route(self, request_type: str, stakes: str = "low") -> str:
        """Return "gemini" or "claude". Pure function — no I/O, no config reads."""
        if request_type in _CLAUDE_REQUEST_TYPES or stakes == "high":
            return "claude"
        return "gemini"

    def is_provider_configured(self, model_key: str) -> bool:
        key = settings.GEMINI_API_KEY if model_key == "gemini" else settings.ANTHROPIC_API_KEY
        return bool(key and key.strip())

    def can_serve(self, request_type: str, stakes: str = "low") -> bool:
        """Batch 25: whether a call of this type could reach a configured provider.

        Mirrors ``call_tool``'s fallback exactly: Gemini-routed work can fall back to
        Claude, but Claude-routed (high-stakes) work never falls back to Gemini — so
        e.g. ``explain_failure`` needs ANTHROPIC_API_KEY specifically.
        """
        model_key = self.route(request_type, stakes)
        if self.is_provider_configured(model_key):
            return True
        return model_key == "gemini" and self.is_provider_configured("claude")

    def cost_usd(
        self, model_key: str, input_tokens: int | None, output_tokens: int | None
    ) -> float | None:
        """Cost of one call from REAL token counts. None if the provider didn't report."""
        if input_tokens is None and output_tokens is None:
            return None
        cost = (input_tokens or 0) / 1000 * self.COST_PER_1K_INPUT[model_key]
        cost += (output_tokens or 0) / 1000 * self.COST_PER_1K_OUTPUT[model_key]
        return round(cost, 6)

    # ---- unified structured call ----------------------------------------

    async def call_tool(
        self,
        *,
        model_key: str,
        function_name: str,
        system_prompt: str,
        user_prompt: str,
        output_model: type[T],
    ) -> RouterResult:
        """Ask ``model_key`` for JSON matching ``output_model``; fall back if needed.

        Safeguard 1 runs FIRST, outside the try — a price-prediction prompt must
        never reach *either* provider's API, and must not be swallowed by the
        fallback path and retried against the other one.
        """
        check_price_prediction_guard(user_prompt)

        try:
            return await self._dispatch(
                model_key=model_key,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                output_model=output_model,
            )
        except LLMUnavailableError:
            # Gemini unreachable/unconfigured -> Claude can still serve it. The
            # reverse has nowhere to fall back to, so it propagates as-is.
            if model_key != "gemini":
                raise
            logger.warning(
                "Gemini unavailable for %s; falling back to Claude", function_name
            )
            return await self._dispatch(
                model_key="claude",
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                output_model=output_model,
            )

    async def _dispatch(
        self,
        *,
        model_key: str,
        system_prompt: str,
        user_prompt: str,
        output_model: type[T],
    ) -> RouterResult:
        if model_key == "gemini":
            return await self._call_gemini(system_prompt, user_prompt, output_model)
        return await self._call_claude(system_prompt, user_prompt, output_model)

    # ---- providers -------------------------------------------------------

    async def _call_claude(
        self, system_prompt: str, user_prompt: str, output_model: type[T]
    ) -> RouterResult:
        """Anthropic forced tool-use — guarantees a tool_use block matching the schema."""
        tool_name = f"emit_{output_model.__name__}"
        try:
            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            response = await client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=_MAX_TOKENS,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
                tools=[
                    {
                        "name": tool_name,
                        "description": f"Emit the structured {output_model.__name__} result.",
                        "input_schema": _clean_schema(output_model.model_json_schema()),
                    }
                ],
                tool_choice={
                    "type": "tool",
                    "name": tool_name,
                    "disable_parallel_tool_use": True,
                },
            )
        except anthropic.APIError as exc:
            raise LLMUnavailableError(f"AI assistant request failed: {exc}") from exc
        except TypeError as exc:
            # The SDK raises a plain TypeError (not an APIError subclass) when it
            # can't resolve any authentication method at all — i.e. no API key.
            raise LLMUnavailableError(f"AI assistant is not configured: {exc}") from exc

        tool_use = next((b for b in response.content if b.type == "tool_use"), None)
        if tool_use is None:
            raise RuntimeError(f"LLM did not return a tool_use block for {tool_name}")

        usage = response.usage
        input_tokens = getattr(usage, "input_tokens", None)
        output_tokens = getattr(usage, "output_tokens", None)
        return RouterResult(
            result=output_model.model_validate(tool_use.input),
            model_key="claude",
            model_name=settings.ANTHROPIC_MODEL,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=self.cost_usd("claude", input_tokens, output_tokens),
            raw_response_json=response.model_dump_json(),
        )

    async def _call_gemini(
        self, system_prompt: str, user_prompt: str, output_model: type[T]
    ) -> RouterResult:
        """Gemini structured output via ``response_schema`` (the same Pydantic model)."""
        if not settings.GEMINI_API_KEY:
            raise LLMUnavailableError("Gemini is not configured: GEMINI_API_KEY unset")

        from google import genai
        from google.genai import errors as genai_errors
        from google.genai import types as genai_types

        try:
            client = genai.Client(api_key=settings.GEMINI_API_KEY)
            # .aio is the SDK's async surface — the sync client would block the
            # event loop for the whole request inside an async route.
            response = await client.aio.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=user_prompt,
                config=genai_types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    response_mime_type="application/json",
                    response_schema=output_model,
                ),
            )
        except genai_errors.APIError as exc:
            raise LLMUnavailableError(f"Gemini request failed: {exc}") from exc

        parsed = response.parsed
        if parsed is None:
            raise LLMUnavailableError("Gemini returned no parseable structured result")

        usage = response.usage_metadata
        input_tokens = getattr(usage, "prompt_token_count", None)
        # candidates_token_count excludes thinking tokens, which are billed as
        # output — total - prompt is what actually gets charged on 2.5 Flash.
        total = getattr(usage, "total_token_count", None)
        if total is not None and input_tokens is not None:
            output_tokens = total - input_tokens
        else:
            output_tokens = getattr(usage, "candidates_token_count", None)

        return RouterResult(
            result=output_model.model_validate(parsed.model_dump()),
            model_key="gemini",
            model_name=settings.GEMINI_MODEL,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=self.cost_usd("gemini", input_tokens, output_tokens),
            raw_response_json=response.model_dump_json(),
        )

    # ---- streaming (chat only) ------------------------------------------

    async def stream_text(
        self, *, model_key: str, system_prompt: str, user_prompt: str
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield {"chunk": str} deltas, then one {"usage": ...} record at the end.

        Streaming is text-only and therefore chat-only: the structured functions
        above must not stream, because their whole contract is a validated object
        with numeric_claims, which does not exist until the response is complete.

        The trailing usage record exists so a streamed call still lands in the
        audit log with REAL token counts — the SDKs report usage on the final
        message, so it is available without estimating.
        """
        check_price_prediction_guard(user_prompt)

        if model_key == "gemini":
            async for item in self._stream_gemini(system_prompt, user_prompt):
                yield item
        else:
            async for item in self._stream_claude(system_prompt, user_prompt):
                yield item

    async def _stream_claude(
        self, system_prompt: str, user_prompt: str
    ) -> AsyncIterator[dict[str, Any]]:
        try:
            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            async with client.messages.stream(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=_MAX_TOKENS,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            ) as stream:
                async for text in stream.text_stream:
                    yield {"chunk": text, "model": settings.ANTHROPIC_MODEL}
                final = await stream.get_final_message()
        except anthropic.APIError as exc:
            raise LLMUnavailableError(f"AI assistant request failed: {exc}") from exc
        except TypeError as exc:
            raise LLMUnavailableError(f"AI assistant is not configured: {exc}") from exc

        input_tokens = getattr(final.usage, "input_tokens", None)
        output_tokens = getattr(final.usage, "output_tokens", None)
        yield {
            "usage": {
                "model_key": "claude",
                "model_name": settings.ANTHROPIC_MODEL,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost_usd": self.cost_usd("claude", input_tokens, output_tokens),
            }
        }

    async def _stream_gemini(
        self, system_prompt: str, user_prompt: str
    ) -> AsyncIterator[dict[str, Any]]:
        if not settings.GEMINI_API_KEY:
            raise LLMUnavailableError("Gemini is not configured: GEMINI_API_KEY unset")

        from google import genai
        from google.genai import errors as genai_errors
        from google.genai import types as genai_types

        usage = None
        try:
            client = genai.Client(api_key=settings.GEMINI_API_KEY)
            stream = await client.aio.models.generate_content_stream(
                model=settings.GEMINI_MODEL,
                contents=user_prompt,
                config=genai_types.GenerateContentConfig(
                    system_instruction=system_prompt,
                ),
            )
            async for chunk in stream:
                if chunk.text:
                    yield {"chunk": chunk.text, "model": settings.GEMINI_MODEL}
                if chunk.usage_metadata is not None:
                    usage = chunk.usage_metadata
        except genai_errors.APIError as exc:
            raise LLMUnavailableError(f"Gemini request failed: {exc}") from exc

        input_tokens = getattr(usage, "prompt_token_count", None) if usage else None
        total = getattr(usage, "total_token_count", None) if usage else None
        output_tokens = (
            total - input_tokens if (total is not None and input_tokens is not None) else None
        )
        yield {
            "usage": {
                "model_key": "gemini",
                "model_name": settings.GEMINI_MODEL,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost_usd": self.cost_usd("gemini", input_tokens, output_tokens),
            }
        }


llm_router = LLMCostRouter()
