"""Strategy lifecycle state machine.

Legal transitions (everything else → 409 Conflict):
    draft      -> candidate        (rules + risk_constraints present & valid)
    candidate  -> active           (robustness_score >= 0.70 AND an approve record)
    active     -> failed           (AUTOMATIC hook only — Batch 6; blocked via the API)
    failed     -> retired          (parent set OR admin override + reason)
    any        -> retired          (risk_manager/cio/admin + reason)
    candidate/active/failed -> draft  (revert when rules/params are edited)

Guard failures carry an HTTP status so routes map them uniformly.
"""

from __future__ import annotations

from app.models.strategy import Strategy, StrategyStatus
from app.strategy.dsl import DSLError, validate_rule

ROBUSTNESS_THRESHOLD = 0.70
# Batch 26: who may approve / retire / override is decided by permissions
# (strategy.approve, strategy.retire, strategy.retire_override — app/rbac/catalog.py),
# resolved by the caller and passed in. This module stays free of any RBAC lookup.
_REQUIRED_RISK_KEYS = ["max_drawdown_pct", "max_position_size_pct", "stop_loss_pct"]

# (from, to) pairs that are legal at all.
LEGAL_TRANSITIONS: set[tuple[str, str]] = {
    ("draft", "candidate"),
    ("candidate", "active"),
    ("candidate", "draft"),
    ("active", "draft"),
    ("active", "failed"),
    ("failed", "draft"),
    ("draft", "retired"),
    ("candidate", "retired"),
    ("active", "retired"),
    ("failed", "retired"),
}
# Targets that may ONLY be reached by an internal/automatic hook, never a manual API call.
AUTOMATIC_ONLY_TARGETS = {StrategyStatus.FAILED}


class LifecycleError(Exception):
    http_status = 409


class IllegalTransition(LifecycleError):
    http_status = 409

    def __init__(self, current: StrategyStatus, target: StrategyStatus) -> None:
        super().__init__(
            f"Illegal transition {current.value} -> {target.value}"
        )


class RulesInvalid(LifecycleError):
    http_status = 422


class ActivationGateNotMet(LifecycleError):
    http_status = 409


class PermissionDenied(LifecycleError):
    http_status = 403


class ReasonRequired(LifecycleError):
    http_status = 422


def assert_transition_legal(
    current: StrategyStatus, target: StrategyStatus, *, manual: bool = True
) -> None:
    if (current.value, target.value) not in LEGAL_TRANSITIONS:
        raise IllegalTransition(current, target)
    if manual and target in AUTOMATIC_ONLY_TARGETS:
        # e.g. active->failed is legal, but only the automatic hook may perform it.
        raise IllegalTransition(current, target)


def assert_submittable(strategy: Strategy) -> None:
    """draft -> candidate guard: entry+exit rules valid, risk_constraints complete."""
    try:
        validate_rule(strategy.entry_rules)
        validate_rule(strategy.exit_rules)
    except DSLError as exc:
        raise RulesInvalid(f"Invalid rules: {exc}") from exc
    risk = strategy.risk_constraints or {}
    missing = [k for k in _REQUIRED_RISK_KEYS if risk.get(k) is None]
    if missing:
        raise RulesInvalid(f"risk_constraints missing: {', '.join(missing)}")


def assert_activatable(
    strategy: Strategy, *, has_approval: bool, validated_version: str | None
) -> None:
    """candidate -> active guard: a validation record for THIS version, robustness
    >= 0.70, and an approve record.

    ``validated_version`` is the strategy version recorded on the strategy's latest
    ValidationResult, or None when it has never been validated. Requiring it closes
    ADR 0008: ``robustness_score`` alone could be a single backtest's number, or a
    validated score left over from a version whose rules have since changed — neither
    is evidence that the 5-method suite passed the rules being activated.
    """
    if validated_version is None:
        raise ActivationGateNotMet(
            "no validation result: the 5-method validation suite must pass before activation"
        )
    if validated_version != strategy.version:
        raise ActivationGateNotMet(
            f"the validation result is for version {validated_version}, but this strategy "
            f"is {strategy.version}; re-validate the current rules"
        )
    if strategy.robustness_score is None or strategy.robustness_score < ROBUSTNESS_THRESHOLD:
        raise ActivationGateNotMet(
            f"robustness_score must be >= {ROBUSTNESS_THRESHOLD} "
            f"(is {strategy.robustness_score})"
        )
    if not has_approval:
        raise ActivationGateNotMet("an approve ApprovalRecord is required")


def assert_retire_permitted(
    strategy: Strategy, *, can_retire: bool, can_override: bool, reason: str | None
) -> None:
    """any -> retired guard: retire permission + reason; a parentless failed strategy
    additionally needs the override permission."""
    if not can_retire:
        raise PermissionDenied("You do not have permission to retire a strategy")
    if not reason or not reason.strip():
        raise ReasonRequired("A reason is required to retire a strategy")
    if strategy.status == StrategyStatus.FAILED and strategy.parent_strategy_id is None and not can_override:
        raise PermissionDenied(
            "Retiring a failed strategy with no parent requires an admin override"
        )
