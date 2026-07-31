"""Encode/decode a strategy's tunable parameters to/from a DEAP Individual.

See docs/schemas.md -> "Parameter space (encode/decode design)" for why the gene set
is auto-derived from entry_rules/exit_rules literal values + risk_constraints,
rather than requiring a pre-populated ``Strategy.parameters`` dict: most real
strategies here use ``value_ref`` crossovers (e.g. price vs. an SMA series) with no
literal constant to tune, so a literal "flatten Strategy.parameters" reading would
leave nothing to evolve for exactly the strategies this batch needs to evolve.

Every mutation/crossover result is clamped to its declared ``[min, max]`` range
inside ``decode()`` — BEFORE the result can reach the backtester — so an
out-of-range gene (e.g. an RSI threshold of -40) is structurally impossible to pass
downstream.
"""

from __future__ import annotations

import copy
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

# Indicators whose literal threshold is mathematically bounded regardless of the
# strategy's current value.
_BOUNDED_INDICATOR_RANGES: dict[str, tuple[float, float]] = {
    "rsi": (0.0, 100.0),
}

# Known risk_constraints keys with sensible, fixed percentage-point bounds.
_RISK_CONSTRAINT_RANGES: dict[str, tuple[float, float]] = {
    "stop_loss_pct": (1.0, 50.0),
    "max_position_size_pct": (1.0, 100.0),
    "max_drawdown_pct": (1.0, 50.0),
}

Path = tuple[Any, ...]


@dataclass(frozen=True)
class ParameterSpec:
    name: str
    value: float
    min: float
    max: float
    param_type: str  # "float" | "int"
    path: Path  # navigates {"entry_rules":..., "exit_rules":..., "risk_constraints":...}


def _is_number(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _range_for_rule_leaf(leaf: dict) -> tuple[float, float]:
    indicator = str(leaf.get("indicator", "")).lower()
    for key, bounds in _BOUNDED_INDICATOR_RANGES.items():
        if key in indicator:
            return bounds
    value = float(leaf["value"])
    half_width = max(abs(value) * 0.5, 1.0)
    return (value - half_width, value + half_width)


def _range_for_risk_key(key: str, value: float) -> tuple[float, float]:
    if key in _RISK_CONSTRAINT_RANGES:
        return _RISK_CONSTRAINT_RANGES[key]
    half_width = max(abs(value) * 0.5, 1.0)
    return (value - half_width, value + half_width)


def _walk_rule_leaves(rule: Any, prefix: Path) -> Iterator[tuple[Path, dict]]:
    """Yield (path_to_value, leaf_dict) for every leaf with a numeric literal ``value``
    (NOT ``value_ref``, which points at another series, not a tunable constant)."""
    if not isinstance(rule, dict) or not rule:
        return
    if "operator" in rule:
        for i, cond in enumerate(rule.get("conditions") or []):
            yield from _walk_rule_leaves(cond, prefix + ("conditions", i))
        return
    if "value" in rule and _is_number(rule["value"]):
        yield (prefix + ("value",), rule)


def derive_parameter_space(strategy_dict: dict) -> list[ParameterSpec]:
    """Derive the tunable gene set, in a fixed order: entry_rules leaves, then
    exit_rules leaves, then risk_constraints numeric fields."""
    specs: list[ParameterSpec] = []

    for root_name in ("entry_rules", "exit_rules"):
        rule = strategy_dict.get(root_name) or {}
        for path, leaf in _walk_rule_leaves(rule, (root_name,)):
            value = leaf["value"]
            lo, hi = _range_for_rule_leaf(leaf)
            name = f"{root_name}.{leaf.get('indicator', 'value')}.{len(specs)}"
            specs.append(
                ParameterSpec(
                    name=name,
                    value=float(value),
                    min=lo,
                    max=hi,
                    param_type="int" if isinstance(value, int) else "float",
                    path=path,
                )
            )

    risk_constraints = strategy_dict.get("risk_constraints") or {}
    for key, value in risk_constraints.items():
        if not _is_number(value):
            continue
        lo, hi = _range_for_risk_key(key, float(value))
        specs.append(
            ParameterSpec(
                name=f"risk_constraints.{key}",
                value=float(value),
                min=lo,
                max=hi,
                param_type="int" if isinstance(value, int) else "float",
                path=("risk_constraints", key),
            )
        )
    return specs


def encode(strategy_dict: dict) -> list[float]:
    """Flatten a strategy's tunable parameters into a DEAP Individual (list of floats)."""
    return [float(spec.value) for spec in derive_parameter_space(strategy_dict)]


def _set_path(roots: dict, path: Path, value: Any) -> None:
    node = roots[path[0]]
    for key in path[1:-1]:
        node = node[key]
    node[path[-1]] = value


def decode(individual: list[float], template_strategy_dict: dict) -> dict:
    """Reconstruct {parameters, entry_rules, exit_rules, risk_constraints} from a
    (possibly mutated/crossed-over) Individual, clamping every gene to its declared
    range first. ``template_strategy_dict`` supplies the rule structure and gene
    order (via ``derive_parameter_space``) that ``individual``'s genes correspond to.
    """
    specs = derive_parameter_space(template_strategy_dict)
    if len(individual) != len(specs):
        raise ValueError(
            f"Individual has {len(individual)} genes but the template has {len(specs)} "
            "parameter specs — encode/decode must use the same template."
        )

    roots = {
        "entry_rules": copy.deepcopy(template_strategy_dict.get("entry_rules") or {}),
        "exit_rules": copy.deepcopy(template_strategy_dict.get("exit_rules") or {}),
        "risk_constraints": copy.deepcopy(template_strategy_dict.get("risk_constraints") or {}),
    }

    parameters: dict[str, dict] = {}
    for spec, gene in zip(specs, individual, strict=False):
        clamped = min(max(float(gene), spec.min), spec.max)
        if spec.param_type == "int":
            clamped = float(round(clamped))
        _set_path(roots, spec.path, clamped)
        parameters[spec.name] = {
            "value": clamped,
            "min": spec.min,
            "max": spec.max,
            "type": spec.param_type,
        }

    return {
        "parameters": parameters,
        "entry_rules": roots["entry_rules"],
        "exit_rules": roots["exit_rules"],
        "risk_constraints": roots["risk_constraints"],
    }
