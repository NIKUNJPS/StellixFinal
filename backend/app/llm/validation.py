"""Safeguard 5 — hallucination mitigation via numeric cross-validation.

After ``explain_failure``/``critique_strategy`` return, every ``NumericClaim`` the
model made is checked against the REAL stored data it was given (not re-fetched —
the caller already has it). A claim referencing a metric with no known real value,
or one outside tolerance of the real value, fails validation for the whole
response: ``numeric_validation_passed`` goes to the audit log and can gate a UI
warning badge.
"""

from __future__ import annotations

from app.llm.schemas import NumericClaim

# Common phrasings the model might use instead of the canonical metric name
# requested in the tool schema — normalized defensively, though the schema's field
# description asks for the canonical form directly.
_ALIASES = {
    "sharpe": "sharpe_ratio",
    "sharpe ratio": "sharpe_ratio",
    "drawdown": "max_drawdown",
    "max drawdown": "max_drawdown",
    "win rate": "win_rate",
    "winrate": "win_rate",
    "robustness": "robustness_score",
}

_REL_TOLERANCE = 0.05  # 5% relative
_ABS_TOLERANCE = 0.02  # or 0.02 absolute, whichever is more forgiving


def _normalize(metric_name: str) -> str:
    key = metric_name.strip().lower().replace("-", "_").replace(" ", "_")
    return _ALIASES.get(metric_name.strip().lower(), key)


def _within_tolerance(claimed: float, real: float) -> bool:
    diff = abs(claimed - real)
    if diff <= _ABS_TOLERANCE:
        return True
    if real != 0 and (diff / abs(real)) <= _REL_TOLERANCE:
        return True
    return False


def validate_numeric_claims(claims: list[NumericClaim], real_data: dict[str, float | None]) -> bool:
    """True if every claim matches real_data within tolerance (or there are no
    claims at all — nothing to contradict); False if any claim references an
    unknown metric or is outside tolerance of the real value."""
    if not claims:
        return True

    normalized_real = {_normalize(k): v for k, v in real_data.items()}
    for claim in claims:
        real_value = normalized_real.get(_normalize(claim.metric_name))
        if real_value is None:
            return False
        if not _within_tolerance(claim.claimed_value, real_value):
            return False
    return True
