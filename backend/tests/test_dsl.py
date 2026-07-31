"""Rule DSL tests. The crosses_above FALSE-POSITIVE test is the mandatory one:
it proves the 2-row window is genuinely necessary (a single-row implementation fails).
"""

from __future__ import annotations

import pandas as pd
import pytest
from app.strategy.dsl import DSLError, evaluate, generate_signals, validate_rule

CROSS_ABOVE = {"indicator": "a", "comparator": "crosses_above", "value_ref": "b"}
CROSS_BELOW = {"indicator": "a", "comparator": "crosses_below", "value_ref": "b"}


def test_crosses_above_true_on_genuine_cross():
    # a goes from below b (9<=10) to above b (11>10) → a real cross → True.
    prev = {"a": 9.0, "b": 10.0}
    curr = {"a": 11.0, "b": 10.0}
    assert evaluate(CROSS_ABOVE, prev, curr) is True


def test_crosses_above_false_positive_requires_2row_window():
    # THE MANDATORY TEST. curr.a (13) > curr.b (10), so a single-row implementation
    # (`curr.a > curr.b`) would WRONGLY return True. But prev.a (12) was ALREADY above
    # prev.b (10) — there is NO cross on this bar. The 2-row window returns False.
    prev = {"a": 12.0, "b": 10.0}  # a already above b on the previous bar
    curr = {"a": 13.0, "b": 10.0}  # still above; no crossing happened here
    assert evaluate(CROSS_ABOVE, prev, curr) is False


def test_crosses_below_true_and_false_positive():
    assert evaluate(CROSS_BELOW, {"a": 11.0, "b": 10.0}, {"a": 9.0, "b": 10.0}) is True
    # Already below on prev → not a fresh cross.
    assert evaluate(CROSS_BELOW, {"a": 8.0, "b": 10.0}, {"a": 7.0, "b": 10.0}) is False


def test_crosses_against_constant_value():
    cond = {"indicator": "rsi_14", "comparator": "crosses_above", "value": 30}
    assert evaluate(cond, {"rsi_14": 28}, {"rsi_14": 32}) is True
    assert evaluate(cond, {"rsi_14": 31}, {"rsi_14": 33}) is False  # already above 30


def test_single_row_comparators():
    lt = {"indicator": "rsi_14", "comparator": "<", "value": 30}
    assert evaluate(lt, {}, {"rsi_14": 25}) is True
    assert evaluate(lt, {}, {"rsi_14": 35}) is False


def test_and_or_nesting():
    rule = {
        "operator": "AND",
        "conditions": [
            {"indicator": "rsi_14", "comparator": "<", "value": 30},
            CROSS_ABOVE,
        ],
    }
    prev = {"rsi_14": 20, "a": 9, "b": 10}
    assert evaluate(rule, prev, {"rsi_14": 25, "a": 11, "b": 10}) is True
    assert evaluate(rule, prev, {"rsi_14": 40, "a": 11, "b": 10}) is False  # rsi gate fails


def test_nan_operands_yield_false():
    assert evaluate({"indicator": "a", "comparator": ">", "value": 1}, {}, {"a": float("nan")}) is False


def test_generate_signals_fires_only_on_the_crossing_bar():
    # a rises through b (=10) once; the signal must be True on exactly the crossing bar.
    df = pd.DataFrame({"a": [8, 9, 11, 12], "b": [10, 10, 10, 10]})
    signals = generate_signals(CROSS_ABOVE, df)
    assert list(signals) == [False, False, True, False]


def test_validate_rule():
    validate_rule({"operator": "AND", "conditions": [{"indicator": "a", "comparator": ">", "value": 1}]})
    with pytest.raises(DSLError):
        validate_rule({})
    with pytest.raises(DSLError):
        validate_rule({"indicator": "a", "comparator": "??", "value": 1})
    with pytest.raises(DSLError):
        validate_rule({"indicator": "a", "comparator": ">"})  # neither value nor value_ref
