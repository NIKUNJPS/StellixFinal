"""Failure clustering: weighted-Jaccard similarity + linking (tenant-scoped).

similarity(a, b) =
    0.4 · [regime_at_failure equal]
  + 0.3 · [trigger_condition equal]
  + 0.3 · Jaccard(top-3 feature-name sets)

Failures are linked as related when similarity >= 0.6. The caller is responsible for
only ever passing failures from ONE organization (the tenant-bound session enforces
this structurally); this module never sees or crosses tenant boundaries.
"""

from __future__ import annotations

SIMILARITY_THRESHOLD = 0.6
_W_REGIME = 0.4
_W_TRIGGER = 0.3
_W_FEATURES = 0.3


def top_feature_names(feature_attribution: list | None, k: int = 3) -> set[str]:
    """Top-k feature names from a feature_attribution list (already |SHAP|-ranked)."""
    if not feature_attribution:
        return set()
    return {f["feature_name"] for f in feature_attribution[:k] if "feature_name" in f}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 0.0
    union = a | b
    if not union:
        return 0.0
    return len(a & b) / len(union)


def similarity(a: dict, b: dict) -> float:
    """Weighted similarity between two failure summaries.

    Each dict has: ``regime_at_failure``, ``trigger_condition``, ``feature_attribution``.
    """
    regime = 1.0 if a["regime_at_failure"] == b["regime_at_failure"] else 0.0
    trigger = 1.0 if a["trigger_condition"] == b["trigger_condition"] else 0.0
    features = _jaccard(
        top_feature_names(a.get("feature_attribution")),
        top_feature_names(b.get("feature_attribution")),
    )
    return round(_W_REGIME * regime + _W_TRIGGER * trigger + _W_FEATURES * features, 4)


def find_related(target: dict, others: list[dict], *, threshold: float = SIMILARITY_THRESHOLD) -> list[str]:
    """Return the ids of ``others`` whose similarity to ``target`` is >= ``threshold``."""
    related: list[str] = []
    for other in others:
        if other["id"] == target["id"]:
            continue
        if similarity(target, other) >= threshold:
            related.append(other["id"])
    return related
