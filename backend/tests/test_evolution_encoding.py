"""Test 1 (run first, per the batch's required order): encode/decode round-trip —
strategy parameters survive encode -> Individual -> decode unchanged."""

from __future__ import annotations

from app.evolution.encoding import decode, derive_parameter_space, encode

_STRATEGY = {
    "entry_rules": {
        "operator": "AND",
        "conditions": [
            {"indicator": "rsi_14", "comparator": "<", "value": 30},
            {"indicator": "close", "comparator": "crosses_above", "value_ref": "sma_20"},
        ],
    },
    "exit_rules": {"indicator": "rsi_14", "comparator": ">", "value": 70},
    "risk_constraints": {"stop_loss_pct": 5, "max_position_size_pct": 10, "max_drawdown_pct": 20},
}


def test_round_trip_preserves_values_unchanged():
    individual = encode(_STRATEGY)
    result = decode(individual, _STRATEGY)

    assert result["entry_rules"]["conditions"][0]["value"] == 30.0
    assert result["entry_rules"]["conditions"][1]["value_ref"] == "sma_20"  # untouched
    assert result["exit_rules"]["value"] == 70.0
    assert result["risk_constraints"]["stop_loss_pct"] == 5.0
    assert result["risk_constraints"]["max_position_size_pct"] == 10.0
    assert result["risk_constraints"]["max_drawdown_pct"] == 20.0


def test_round_trip_gene_count_matches_parameter_space():
    specs = derive_parameter_space(_STRATEGY)
    individual = encode(_STRATEGY)
    assert len(individual) == len(specs) == 5  # 1 RSI entry + 1 RSI exit + 3 risk_constraints


def test_round_trip_ignores_value_ref_leaves():
    # The crosses_above leaf has no literal 'value' — it must not become a gene.
    specs = derive_parameter_space(_STRATEGY)
    names = [s.name for s in specs]
    assert not any("close" in n for n in names)


def test_encode_decode_is_order_stable_across_repeated_calls():
    ind1 = encode(_STRATEGY)
    ind2 = encode(_STRATEGY)
    assert ind1 == ind2

    decoded1 = decode(ind1, _STRATEGY)
    decoded2 = decode(ind2, _STRATEGY)
    assert decoded1 == decoded2


def test_parameters_dict_is_self_documenting():
    individual = encode(_STRATEGY)
    result = decode(individual, _STRATEGY)
    assert "risk_constraints.stop_loss_pct" in result["parameters"]
    entry = result["parameters"]["risk_constraints.stop_loss_pct"]
    assert entry == {"value": 5.0, "min": 1.0, "max": 50.0, "type": "int"}
