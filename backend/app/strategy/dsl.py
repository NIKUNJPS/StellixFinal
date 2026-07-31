"""Structured JSON rule DSL — machine-evaluable and machine-generatable.

A rule is either a boolean node ``{"operator": "AND"|"OR", "conditions": [...]}`` (which
may nest) or a leaf ``{"indicator", "comparator", "value" | "value_ref"}``.

Comparators ``<, <=, >, >=, ==, !=`` are single-row. The two **crossing** comparators
use a genuine **2-row window** (previous bar + current bar):

    crosses_above:  prev[indicator] <= prev[ref] AND curr[indicator] >  curr[ref]
    crosses_below:  prev[indicator] >= prev[ref] AND curr[indicator] <  curr[ref]

A single-row implementation (e.g. just ``curr[a] > curr[b]``) is a BUG: it fires on
every bar where a is above b, not only on the bar where the cross actually happens.
``ref`` is ``value_ref`` (another series) or the constant ``value``.
"""

from __future__ import annotations

import math
import operator
from collections.abc import Mapping
from typing import Any

import numpy as np
import pandas as pd

SINGLE_ROW_COMPARATORS = {
    "<": operator.lt,
    "<=": operator.le,
    ">": operator.gt,
    ">=": operator.ge,
    "==": operator.eq,
    "!=": operator.ne,
}
CROSS_COMPARATORS = {"crosses_above", "crosses_below"}
COMPARATORS = set(SINGLE_ROW_COMPARATORS) | CROSS_COMPARATORS


class DSLError(ValueError):
    """Raised when a rule is structurally invalid."""


def _is_missing(x: Any) -> bool:
    return x is None or (isinstance(x, float) and math.isnan(x))


def _resolve_right(cond: Mapping, row: Mapping) -> Any:
    """Right-hand operand for a row: another series (value_ref) or a constant (value)."""
    ref = cond.get("value_ref")
    if ref is not None:
        return row.get(ref)
    return cond.get("value")


def _eval_leaf(cond: Mapping, prev: Mapping, curr: Mapping) -> bool:
    comparator = cond["comparator"]
    indicator = cond["indicator"]

    if comparator in CROSS_COMPARATORS:
        left_prev, left_curr = prev.get(indicator), curr.get(indicator)
        right_prev, right_curr = _resolve_right(cond, prev), _resolve_right(cond, curr)
        if any(_is_missing(v) for v in (left_prev, left_curr, right_prev, right_curr)):
            return False
        if comparator == "crosses_above":
            return left_prev <= right_prev and left_curr > right_curr
        return left_prev >= right_prev and left_curr < right_curr

    left_curr = curr.get(indicator)
    right_curr = _resolve_right(cond, curr)
    if _is_missing(left_curr) or _is_missing(right_curr):
        return False
    return bool(SINGLE_ROW_COMPARATORS[comparator](left_curr, right_curr))


def evaluate(rule: Mapping, prev: Mapping, curr: Mapping) -> bool:
    """Evaluate a rule over a 2-row window (``prev``, ``curr``). Empty rule → False."""
    if not rule:
        return False
    if "operator" in rule:
        op = str(rule["operator"]).upper()
        results = [evaluate(cond, prev, curr) for cond in rule["conditions"]]
        if op == "AND":
            return all(results)
        if op == "OR":
            return any(results)
        raise DSLError(f"Unknown operator {rule['operator']!r}")
    return _eval_leaf(rule, prev, curr)


def validate_rule(rule: Any) -> None:
    """Raise ``DSLError`` if the rule is not a well-formed, non-empty DSL tree."""
    if not isinstance(rule, dict) or not rule:
        raise DSLError("Rule must be a non-empty object")
    if "operator" in rule:
        if str(rule["operator"]).upper() not in ("AND", "OR"):
            raise DSLError(f"operator must be AND or OR, got {rule['operator']!r}")
        conditions = rule.get("conditions")
        if not isinstance(conditions, list) or not conditions:
            raise DSLError("A boolean node needs a non-empty 'conditions' list")
        for cond in conditions:
            validate_rule(cond)
        return
    # Leaf
    if "indicator" not in rule or "comparator" not in rule:
        raise DSLError("A leaf condition needs 'indicator' and 'comparator'")
    if rule["comparator"] not in COMPARATORS:
        raise DSLError(f"Unknown comparator {rule['comparator']!r}")
    if rule.get("value") is None and rule.get("value_ref") is None:
        raise DSLError("A leaf condition needs 'value' or 'value_ref'")


def generate_signals(rule: Mapping, df: pd.DataFrame) -> np.ndarray:
    """Boolean signal array for ``rule`` over ``df``, using a 2-row sliding window.

    Row 0 uses itself as ``prev`` (so a cross can never fire on the first bar).
    """
    n = len(df)
    if not rule or n == 0:
        return np.zeros(n, dtype=bool)
    records = df.to_dict("records")
    out = np.empty(n, dtype=bool)
    for i in range(n):
        curr = records[i]
        prev = records[i - 1] if i > 0 else records[i]
        out[i] = evaluate(rule, prev, curr)
    return out
