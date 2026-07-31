"""Test 2 (required order): parameter bound clamping — deliberately force an
out-of-range mutation and assert it gets clamped, never reaching the backtester."""

from __future__ import annotations

from app.evolution.encoding import decode, derive_parameter_space, encode

_STRATEGY = {
    "entry_rules": {"indicator": "rsi_14", "comparator": "<", "value": 30},
    "exit_rules": {"indicator": "rsi_14", "comparator": ">", "value": 70},
    "risk_constraints": {"stop_loss_pct": 5, "max_position_size_pct": 10, "max_drawdown_pct": 20},
}


def test_below_minimum_rsi_clamps_to_zero():
    individual = encode(_STRATEGY)
    individual[0] = -40.0  # forced out-of-range mutation (RSI threshold of -40)
    result = decode(individual, _STRATEGY)
    assert result["entry_rules"]["value"] == 0.0  # clamped to the RSI floor, never -40
    assert result["entry_rules"]["value"] >= 0.0


def test_above_maximum_rsi_clamps_to_hundred():
    individual = encode(_STRATEGY)
    individual[1] = 500.0  # forced out-of-range mutation (RSI threshold of 500)
    result = decode(individual, _STRATEGY)
    assert result["exit_rules"]["value"] == 100.0  # clamped to the RSI ceiling


def test_risk_constraint_out_of_range_clamps_to_declared_bounds():
    specs = derive_parameter_space(_STRATEGY)
    stop_loss_idx = next(i for i, s in enumerate(specs) if s.name == "risk_constraints.stop_loss_pct")
    individual = encode(_STRATEGY)
    individual[stop_loss_idx] = 999.0  # way beyond the [1, 50] declared range
    result = decode(individual, _STRATEGY)
    assert result["risk_constraints"]["stop_loss_pct"] == 50.0  # clamped to the max

    individual[stop_loss_idx] = -25.0  # below the declared minimum
    result = decode(individual, _STRATEGY)
    assert result["risk_constraints"]["stop_loss_pct"] == 1.0  # clamped to the min


def test_clamped_parameters_dict_never_reports_out_of_range_values():
    """Every value written into the self-documenting `parameters` dict — the thing a
    downstream backtest call would actually read — must already be in-bounds."""
    individual = encode(_STRATEGY)
    individual[0] = -999.0
    individual[1] = 99999.0
    result = decode(individual, _STRATEGY)
    for name, spec in result["parameters"].items():
        assert spec["min"] <= spec["value"] <= spec["max"], f"{name} out of range: {spec}"
