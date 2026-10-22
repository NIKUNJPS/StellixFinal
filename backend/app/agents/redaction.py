"""Safeguard 1 for the multi-agent desk (ADR 0009 §2).

TradingAgents' Portfolio Manager and Trader render structured price levels as labelled
markdown lines (``render_pm_decision`` / ``render_trader_proposal``):

    **Price Target**: 212.5
    **Entry Price**: 189.5
    **Stop Loss**: 172.0

Stellix's Safeguard 1 (no price prediction) is unchanged, so those values never reach
storage: the labelled line is kept (a reader can see a level was proposed and removed)
and the value is replaced. Deterministic, pattern-based — the same philosophy as
``app/llm/guard.py``: it must hold whatever the model wrote. Levels an analyst writes
freely in prose (e.g. support/resistance in the technical report) are analysis of past
price action and are not structurally detectable; they are left as written.
"""

from __future__ import annotations

import re
from typing import Any

REDACTED = "[redacted — Safeguard 1]"

# "**Price Target**: 212.5", "Price Target: $212", "**Stop Loss** — 172" ... one line each.
_LEVEL_LINE = re.compile(
    r"^(?P<label>[ \t>*_-]*(?:price\s+target|target\s+price|entry\s+price|stop[\s-]*loss)[*_ \t]*"
    r"[:\-‐-―][ \t*_]*)(?P<value>.+)$",
    re.IGNORECASE | re.MULTILINE,
)
_NOT_PROVIDED = re.compile(r"^\s*\**\s*(not provided|none|n/?a)\s*\**\s*$", re.IGNORECASE)


def redact_price_levels(text: str | None) -> str | None:
    """Replace the value on every labelled price-level line; leave everything else."""
    if not text:
        return text

    def _sub(match: re.Match[str]) -> str:
        if _NOT_PROVIDED.match(match.group("value")):
            return match.group(0)
        return f"{match.group('label')}{REDACTED}"

    return _LEVEL_LINE.sub(_sub, text)


def redact_reports(value: Any) -> Any:
    """Apply ``redact_price_levels`` to every string in a (nested) reports structure."""
    if isinstance(value, str):
        return redact_price_levels(value)
    if isinstance(value, dict):
        return {k: redact_reports(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_reports(v) for v in value]
    return value
