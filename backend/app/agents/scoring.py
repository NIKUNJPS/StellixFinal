"""Score desk calls on realised alpha, grouped by regime x rating (Pillar 1).

TradingAgents' own backtest reports one table per rating. Stellix splits it by the
regime the call was made in: a desk that is right in Bull and wrong in Crisis should be
seen as exactly that, not as one blended hit rate.

``hit_rate`` counts only directional calls: bullish (Buy/Overweight) is right when alpha
> 0, bearish (Underweight/Sell) when alpha < 0. Hold and REVIEW count toward ``n`` and
``mean_alpha`` only; a group with no directional calls has ``hit_rate = None``.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass

BULLISH = frozenset({"Buy", "Overweight"})
BEARISH = frozenset({"Underweight", "Sell"})
RATING_ORDER = ("Buy", "Overweight", "Hold", "Underweight", "Sell", "REVIEW")
NO_REGIME = "Unlabelled"


@dataclass(frozen=True)
class ScoredCall:
    regime: str | None
    rating: str | None
    alpha: float | None


def _group(calls: list[ScoredCall]) -> dict:
    alphas = [c.alpha for c in calls if c.alpha is not None]
    directional = [c for c in calls if c.alpha is not None and (c.rating in BULLISH or c.rating in BEARISH)]
    hits = sum(
        1 for c in directional if (c.rating in BULLISH and c.alpha > 0) or (c.rating in BEARISH and c.alpha < 0)
    )
    return {
        "n": len(alphas),
        "mean_alpha": sum(alphas) / len(alphas) if alphas else None,
        "hit_rate": hits / len(directional) if directional else None,
    }


def _rating_key(rating: str | None) -> int:
    return RATING_ORDER.index(rating) if rating in RATING_ORDER else len(RATING_ORDER)


def summarize(calls: Iterable[ScoredCall]) -> dict:
    calls = list(calls)
    scored = [c for c in calls if c.alpha is not None and c.rating is not None]
    by_rr: dict[tuple[str, str], list[ScoredCall]] = defaultdict(list)
    by_rating: dict[str, list[ScoredCall]] = defaultdict(list)
    by_regime: dict[str, list[ScoredCall]] = defaultdict(list)
    for c in scored:
        regime = c.regime or NO_REGIME
        by_rr[(regime, c.rating)].append(c)
        by_rating[c.rating].append(c)
        by_regime[regime].append(c)
    return {
        "by_regime_rating": [
            {"regime": regime, "rating": rating, **_group(group)}
            for (regime, rating), group in sorted(by_rr.items(), key=lambda kv: (kv[0][0], _rating_key(kv[0][1])))
        ],
        "by_rating": [
            {"rating": rating, **_group(group)}
            for rating, group in sorted(by_rating.items(), key=lambda kv: _rating_key(kv[0]))
        ],
        "by_regime": [{"regime": regime, **_group(group)} for regime, group in sorted(by_regime.items())],
        "overall": _group(scored),
        "scored_cells": len(scored),
        "unscored_cells": len(calls) - len(scored),
    }
