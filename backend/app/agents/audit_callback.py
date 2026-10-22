"""Capture every TradingAgents LLM call for ``llm_audit_log`` (Safeguard 4).

TradingAgents calls its models through LangChain from inside LangGraph nodes. A
callback handler passed in the *graph* run config is inherited by every nested model
call (LangChain propagates run config through contextvars), and LangGraph tags each
call's metadata with the node it came from (``langgraph_node``) — so one handler sees
every call from every agent, attributed to that agent, with no change to TradingAgents.

Records are buffered in memory (the graph runs in a worker thread; the DB session
lives on the event loop) and written by the service before the analysis is marked
complete — log-then-return, as everywhere else in the LLM layer. The response is
stored verbatim, including any price level the model wrote: the audit log is the
compliance record of what the model actually said, and is readable only with
``llm_audit.view``. Research output shown to users is redacted separately
(``redaction.py``).

Token counts come only from the provider's reported usage; when none is reported the
count is NULL — never estimated (router.py's rule: a fabricated token count is a
fabricated cost figure).
"""

from __future__ import annotations

import json
import threading
import uuid
from dataclasses import dataclass
from typing import Any

from langchain_core.callbacks import BaseCallbackHandler


@dataclass
class CapturedCall:
    node: str
    model: str
    prompt: str
    response: str = ""
    input_tokens: int | None = None
    output_tokens: int | None = None
    error: str | None = None
    finished: bool = False


def _render_messages(messages: list[list[Any]]) -> str:
    parts: list[str] = []
    for batch in messages:
        for message in batch:
            role = getattr(message, "type", "message").upper()
            content = getattr(message, "content", message)
            if not isinstance(content, str):
                content = json.dumps(content, default=str, ensure_ascii=False)
            parts.append(f"{role}:\n{content}")
    return "\n\n".join(parts)


def _model_name(serialized: dict | None, metadata: dict | None, kwargs: dict) -> str:
    meta = metadata or {}
    for key in ("ls_model_name",):
        if meta.get(key):
            return str(meta[key])
    invocation = kwargs.get("invocation_params") or {}
    for key in ("model", "model_name"):
        if invocation.get(key):
            return str(invocation[key])
    ser_kwargs = (serialized or {}).get("kwargs") or {}
    return str(ser_kwargs.get("model") or ser_kwargs.get("model_name") or "unknown")


def _response_text(response: Any) -> tuple[str, int | None, int | None]:
    texts: list[str] = []
    in_tok = out_tok = None
    for generation_list in getattr(response, "generations", []) or []:
        for generation in generation_list:
            message = getattr(generation, "message", None)
            if message is not None:
                content = message.content
                texts.append(content if isinstance(content, str) else json.dumps(content, default=str, ensure_ascii=False))
                tool_calls = getattr(message, "tool_calls", None)
                if tool_calls:
                    texts.append("TOOL_CALLS: " + json.dumps(tool_calls, default=str, ensure_ascii=False))
                usage = getattr(message, "usage_metadata", None) or {}
                if usage:
                    in_tok = (in_tok or 0) + int(usage.get("input_tokens") or 0)
                    out_tok = (out_tok or 0) + int(usage.get("output_tokens") or 0)
            else:
                texts.append(getattr(generation, "text", "") or "")
    if in_tok is None:
        token_usage = (getattr(response, "llm_output", None) or {}).get("token_usage") or {}
        if token_usage:
            in_tok = token_usage.get("prompt_tokens") or token_usage.get("input_tokens")
            out_tok = token_usage.get("completion_tokens") or token_usage.get("output_tokens")
    return "\n".join(t for t in texts if t), in_tok, out_tok


class AgentAuditCallback(BaseCallbackHandler):
    """Thread-safe buffer of every chat-model call made during one desk run."""

    raise_error = False  # auditing must never break the run it observes

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._calls: dict[uuid.UUID, CapturedCall] = {}
        self._order: list[uuid.UUID] = []

    def on_chat_model_start(self, serialized, messages, *, run_id, metadata=None, **kwargs) -> None:
        call = CapturedCall(
            node=str((metadata or {}).get("langgraph_node") or "unknown"),
            model=_model_name(serialized, metadata, kwargs),
            prompt=_render_messages(messages),
        )
        with self._lock:
            self._calls[run_id] = call
            self._order.append(run_id)

    def on_llm_end(self, response, *, run_id, **kwargs) -> None:
        text, in_tok, out_tok = _response_text(response)
        with self._lock:
            call = self._calls.get(run_id)
            if call is None:
                return
            call.response, call.input_tokens, call.output_tokens = text, in_tok, out_tok
            call.finished = True

    def on_llm_error(self, error, *, run_id, **kwargs) -> None:
        with self._lock:
            call = self._calls.get(run_id)
            if call is None:
                return
            call.error = f"{type(error).__name__}: {error}"
            call.response = f"ERROR: {call.error}"
            call.finished = True

    @property
    def calls(self) -> list[CapturedCall]:
        with self._lock:
            return [self._calls[r] for r in self._order]
