"""Safeguard 1 — NO PRICE PREDICTION.

A real code-level gate, not a prompt instruction: user free-text is checked against
these patterns BEFORE any LLM call is made. A flagged prompt never reaches the
Anthropic API at all — see app/api/routes/llm.py, which calls this first and
returns 400 on a match without ever touching LLMService.
"""

from __future__ import annotations

import re

_PRICE_PREDICTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"what\s+will\s+.{0,40}\bprice\b.{0,20}\bbe\b", re.IGNORECASE),
    re.compile(r"\bpredict\s+.{0,20}\bprice\s+of\b", re.IGNORECASE),
    re.compile(r"\bpredict\s+.{0,20}\bprice\b", re.IGNORECASE),
    re.compile(r"\bwill\s+\S+\s+go\s+(up|down)\b", re.IGNORECASE),
    re.compile(r"\bprice\s+target\b", re.IGNORECASE),
    re.compile(r"\bforecast\s+.{0,20}\bprice\b", re.IGNORECASE),
    re.compile(r"\bprice\s+prediction\b", re.IGNORECASE),
]


class PricePredictionRejected(ValueError):
    """Raised when free text matches a direct price-forecast pattern."""

    def __init__(self, matched_text: str) -> None:
        self.matched_text = matched_text
        super().__init__(f"Request contains a direct price-forecast pattern: {matched_text!r}")


def check_price_prediction_guard(text: str | None) -> None:
    """Raise PricePredictionRejected if ``text`` requests a direct price forecast.

    Called BEFORE any LLM invocation. Intentionally pattern-based (not an LLM
    self-check) so it cannot be argued around by clever phrasing the model might
    otherwise comply with — this must hold even if the model itself is willing.
    """
    if not text:
        return
    for pattern in _PRICE_PREDICTION_PATTERNS:
        match = pattern.search(text)
        if match:
            raise PricePredictionRejected(match.group(0))
