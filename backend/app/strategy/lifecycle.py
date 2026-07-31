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
from app.models.user import UserRole
from app.strategy.dsl import DSLError, validate_rule

ROBUSTNESS_THRESHOLD = 0.70
GOVERNANCE_ROLES = {UserRole.RISK_MANAGER, UserRole.CIO, UserRole.ADMIN}
# Batch 10 RBAC audit fix: approve/reject must ALSO admit compliance_officer (the
# Governance & Compliance Panel's approval queue is explicitly restricted to
# ComplianceOfficer/Admin and reuses this exact approve() path) — retire and the
# kill switch stay on the narrower GOVERNANCE_ROLES, unchanged.
APPROVAL_ROLES = GOVERNANCE_ROLES | {UserRole.COMPLIANCE_OFFICER}
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


def assert_activatable(strategy: Strategy, *, has_approval: bool) -> None:
    """candidate -> active guard: BOTH robustness >= 0.70 AND an approve record."""
    if strategy.robustness_score is None or strategy.robustness_score < ROBUSTNESS_THRESHOLD:
        raise ActivationGateNotMet(
            f"robustness_score must be >= {ROBUSTNESS_THRESHOLD} "
            f"(is {strategy.robustness_score})"
        )
    if not has_approval:
        raise ActivationGateNotMet("an approve ApprovalRecord is required")


def assert_retire_permitted(
    strategy: Strategy, *, role: UserRole, reason: str | None, is_admin: bool
) -> None:
    """any -> retired guard: governance role + reason; failed needs parent OR admin."""
    if role not in GOVERNANCE_ROLES:
        raise PermissionDenied("Only risk_manager, cio, or admin may retire a strategy")
    if not reason or not reason.strip():
        raise ReasonRequired("A reason is required to retire a strategy")
    if strategy.status == StrategyStatus.FAILED and strategy.parent_strategy_id is None and not is_admin:
        raise PermissionDenied(
            "Retiring a failed strategy with no parent requires an admin override"
        )
