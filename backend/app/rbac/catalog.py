"""Permission catalog + the five system roles' day-one permission sets (Batch 26).

This module is the single source of truth for permission KEYS used in code. The rows in
the ``permissions`` / ``roles`` / ``role_permissions`` tables are seeded from it (by
migration 0020, which holds a frozen copy, and by ``services.rbac.seed_rbac_catalog``
for fresh databases such as the test suite). After seeding, the database is
authoritative: a SuperAdmin may change what a system role grants.

The day-one grants below were reverse-engineered from every ``require_role`` call site
and every service-level role check in the Batch 25 codebase — they reproduce today's
access exactly. ``tests/test_rbac_access_matrix.py`` (written and passing against the
pre-refactor code) proves it.

Deliberately NOT permission-gated (every authenticated user, unchanged): creating,
submitting, backtesting and validating strategies; evolution runs; ingestion; regime
detection; research notes; the knowledge graph; the LLM research assistant; portfolio,
failures and market data views.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass


class P:
    """Permission keys. Use these constants, never string literals, in authorization code."""

    # Organization administration
    ORGANIZATION_MANAGE = "organization.manage"
    BILLING_MANAGE = "billing.manage"
    MEMBERS_VIEW = "members.view"
    MEMBERS_INVITE = "members.invite"
    ROLES_MANAGE = "roles.manage"
    SYSTEM_MONITOR = "system.monitor"
    DIGEST_SEND = "digest.send"
    # Governance
    GOVERNANCE_VIEW = "governance.view"
    STRATEGY_APPROVE = "strategy.approve"
    STRATEGY_RETIRE = "strategy.retire"
    STRATEGY_RETIRE_OVERRIDE = "strategy.retire_override"
    STRATEGY_FAIL_MANUAL = "strategy.fail_manual"
    KILLSWITCH_TRIGGER = "killswitch.trigger"
    KILLSWITCH_REVIEW = "killswitch.review"
    KILLSWITCH_HISTORY_ALL = "killswitch.history.view_all"
    # Compliance & audit
    AUDIT_VIEW_ALL = "audit.view.all"
    AUDIT_VIEW_ORG_RISK = "audit.view.org_risk"
    AUDIT_VIEW_OWN_RISK = "audit.view.own_risk"
    COMPLIANCE_EXPORT = "compliance.export"
    LLM_AUDIT_VIEW = "llm_audit.view"
    # Research
    STRATEGY_VERSION = "strategy.version"
    STRATEGY_DELETE_ANY_DRAFT = "strategy.delete_any_draft"
    # Notification routing (who is told about what — behaviour, not endpoint access)
    NOTIFY_APPROVAL_REQUESTS = "notifications.approval_requests"
    NOTIFY_FAILURE_ALERTS = "notifications.failure_alerts"
    NOTIFY_BILLING_ALERTS = "notifications.billing_alerts"
    NOTIFY_WEEKLY_DIGEST = "notifications.weekly_digest"


@dataclass(frozen=True)
class PermissionSpec:
    key: str
    category: str
    description: str


PERMISSION_CATALOG: tuple[PermissionSpec, ...] = (
    PermissionSpec(P.ORGANIZATION_MANAGE, "Organization", "Edit organization settings (benchmark, weekly digest); primary organization contact"),
    PermissionSpec(P.BILLING_MANAGE, "Organization", "View plan and invoices, start checkout and the billing portal"),
    PermissionSpec(P.MEMBERS_VIEW, "Organization", "View the organization member directory"),
    PermissionSpec(P.MEMBERS_INVITE, "Organization", "Invite, list and revoke invitations; look up a user by id"),
    PermissionSpec(P.ROLES_MANAGE, "Organization", "Create organization custom roles and assign roles to members"),
    PermissionSpec(P.SYSTEM_MONITOR, "Organization", "View detailed system health and run observability checks"),
    PermissionSpec(P.DIGEST_SEND, "Organization", "Build and deliver the weekly digest on demand"),
    PermissionSpec(P.GOVERNANCE_VIEW, "Governance", "View active strategies, the approval queue, strategy controls and kill switch reviews"),
    PermissionSpec(P.STRATEGY_APPROVE, "Governance", "Approve or reject candidate strategies and activate approved ones"),
    PermissionSpec(P.STRATEGY_RETIRE, "Governance", "Retire strategies"),
    PermissionSpec(P.STRATEGY_RETIRE_OVERRIDE, "Governance", "Retire a failed strategy that has no parent (override)"),
    PermissionSpec(P.STRATEGY_FAIL_MANUAL, "Governance", "Manually flag an active strategy as failed"),
    PermissionSpec(P.KILLSWITCH_TRIGGER, "Governance", "Activate the kill switch on any strategy"),
    PermissionSpec(P.KILLSWITCH_REVIEW, "Governance", "Review kill switch activations; kills by holders are self-reviewed"),
    PermissionSpec(P.KILLSWITCH_HISTORY_ALL, "Governance", "See every kill switch activation in the organization (otherwise only your own)"),
    PermissionSpec(P.AUDIT_VIEW_ALL, "Compliance", "View every event in the governance audit trail"),
    PermissionSpec(P.AUDIT_VIEW_ORG_RISK, "Compliance", "View risk and approval events across the organization"),
    PermissionSpec(P.AUDIT_VIEW_OWN_RISK, "Compliance", "View your own risk and approval events"),
    PermissionSpec(P.COMPLIANCE_EXPORT, "Compliance", "Generate, list and download compliance exports"),
    PermissionSpec(P.LLM_AUDIT_VIEW, "Compliance", "View the LLM audit log"),
    PermissionSpec(P.STRATEGY_VERSION, "Research", "Save rule and parameter changes as a new strategy version"),
    PermissionSpec(P.STRATEGY_DELETE_ANY_DRAFT, "Research", "Delete unsubmitted drafts created by other members"),
    PermissionSpec(P.NOTIFY_APPROVAL_REQUESTS, "Notifications", "Receive approval-request notifications"),
    PermissionSpec(P.NOTIFY_FAILURE_ALERTS, "Notifications", "Receive strategy failure alerts"),
    PermissionSpec(P.NOTIFY_BILLING_ALERTS, "Notifications", "Receive failed-payment alerts"),
    PermissionSpec(P.NOTIFY_WEEKLY_DIGEST, "Notifications", "Receive the weekly digest"),
)
PERMISSION_KEYS: frozenset[str] = frozenset(p.key for p in PERMISSION_CATALOG)


@dataclass(frozen=True)
class SystemRoleSpec:
    key: str  # the legacy users.role value this role replaces
    name: str
    description: str
    permissions: frozenset[str]


_GOVERNANCE_BASE = frozenset(
    {
        P.GOVERNANCE_VIEW,
        P.STRATEGY_APPROVE,
        P.STRATEGY_RETIRE,
        P.STRATEGY_FAIL_MANUAL,
        P.KILLSWITCH_TRIGGER,
        P.NOTIFY_APPROVAL_REQUESTS,
        P.NOTIFY_FAILURE_ALERTS,
    }
)

SYSTEM_ROLES: tuple[SystemRoleSpec, ...] = (
    SystemRoleSpec(
        "researcher",
        "Researcher",
        "Builds, versions and tests strategies and research notes.",
        frozenset({P.STRATEGY_VERSION}),
    ),
    SystemRoleSpec(
        "risk_manager",
        "Risk Manager",
        "Oversees live risk: approvals, retirement, manual failure flags and the kill switch.",
        _GOVERNANCE_BASE | {P.AUDIT_VIEW_OWN_RISK},
    ),
    SystemRoleSpec(
        "cio",
        "CIO",
        "Final governance authority: everything a risk manager can do, plus kill switch review.",
        _GOVERNANCE_BASE
        | {P.KILLSWITCH_REVIEW, P.KILLSWITCH_HISTORY_ALL, P.AUDIT_VIEW_ORG_RISK, P.NOTIFY_BILLING_ALERTS},
    ),
    SystemRoleSpec(
        "compliance_officer",
        "Compliance Officer",
        "Oversight: audit trails, compliance exports, member directory and approvals.",
        frozenset(
            {
                P.GOVERNANCE_VIEW,
                P.STRATEGY_APPROVE,
                P.KILLSWITCH_HISTORY_ALL,
                P.AUDIT_VIEW_ALL,
                P.COMPLIANCE_EXPORT,
                P.LLM_AUDIT_VIEW,
                P.MEMBERS_VIEW,
                P.NOTIFY_APPROVAL_REQUESTS,
            }
        ),
    ),
    SystemRoleSpec(
        "admin",
        "Admin",
        "Organization administrator with every organization and governance capability except kill switch review.",
        PERMISSION_KEYS - {P.KILLSWITCH_REVIEW, P.AUDIT_VIEW_ORG_RISK, P.AUDIT_VIEW_OWN_RISK},
    ),
)
SYSTEM_ROLES_BY_KEY: dict[str, SystemRoleSpec] = {r.key: r for r in SYSTEM_ROLES}

# Deterministic ids so code, migration and tests all refer to the same system role rows.
_NAMESPACE = uuid.UUID("5b0d6c0e-2f0a-4c7e-9a52-6b1f3c8e9d21")


def system_role_id(key: str) -> uuid.UUID:
    return uuid.uuid5(_NAMESPACE, f"stellix.system_role.{key}")


def permission_id(key: str) -> uuid.UUID:
    return uuid.uuid5(_NAMESPACE, f"stellix.permission.{key}")
