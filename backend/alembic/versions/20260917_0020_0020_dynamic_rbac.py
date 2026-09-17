"""Batch 26 Part A: dynamic RBAC — permissions, roles, role_permissions.

Purely additive. After this migration every existing user has exactly the access they
had before:

  * ``permissions`` is seeded with the catalog reverse-engineered from every
    ``require_role`` call site and service-level role check in the Batch 25 code.
  * ``roles`` is seeded with the five original roles as system defaults
    (``organization_id`` NULL, ``is_system_default`` true), each granted exactly the
    permissions it effectively had. Proven by tests/test_rbac_access_matrix.py.
  * ``users.role_id`` is backfilled from ``users.role``.

DEPRECATION PLAN (see docs/adr/0006-dynamic-rbac.md): ``users.role`` and
``invitations.role`` are no longer used for authorization but are intentionally NOT
dropped. They stay populated for system roles so this migration can be rolled back
without data loss during the rollback window; a later migration drops them once
dynamic RBAC has run in production.

The seed data below is a FROZEN copy of app/rbac/catalog.py as of this migration —
migrations must not import application code, which will keep evolving.
tests/test_rbac_catalog_seed.py fails if the two diverge unintentionally.

Revision ID: 0020_dynamic_rbac
Revises: 0019_governance_audit_actor
Create Date: 2026-09-17
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020_dynamic_rbac"
down_revision: str | None = "0019_governance_audit_actor"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UUID = postgresql.UUID(as_uuid=True)
_NAMESPACE = uuid.UUID("5b0d6c0e-2f0a-4c7e-9a52-6b1f3c8e9d21")

PERMISSIONS = [
    ("organization.manage", "Organization", "Edit organization settings (benchmark, weekly digest); primary organization contact"),
    ("billing.manage", "Organization", "View plan and invoices, start checkout and the billing portal"),
    ("members.view", "Organization", "View the organization member directory"),
    ("members.invite", "Organization", "Invite, list and revoke invitations; look up a user by id"),
    ("roles.manage", "Organization", "Create organization custom roles and assign roles to members"),
    ("system.monitor", "Organization", "View detailed system health and run observability checks"),
    ("digest.send", "Organization", "Build and deliver the weekly digest on demand"),
    ("governance.view", "Governance", "View active strategies, the approval queue, strategy controls and kill switch reviews"),
    ("strategy.approve", "Governance", "Approve or reject candidate strategies and activate approved ones"),
    ("strategy.retire", "Governance", "Retire strategies"),
    ("strategy.retire_override", "Governance", "Retire a failed strategy that has no parent (override)"),
    ("strategy.fail_manual", "Governance", "Manually flag an active strategy as failed"),
    ("killswitch.trigger", "Governance", "Activate the kill switch on any strategy"),
    ("killswitch.review", "Governance", "Review kill switch activations; kills by holders are self-reviewed"),
    ("killswitch.history.view_all", "Governance", "See every kill switch activation in the organization (otherwise only your own)"),
    ("audit.view.all", "Compliance", "View every event in the governance audit trail"),
    ("audit.view.org_risk", "Compliance", "View risk and approval events across the organization"),
    ("audit.view.own_risk", "Compliance", "View your own risk and approval events"),
    ("compliance.export", "Compliance", "Generate, list and download compliance exports"),
    ("llm_audit.view", "Compliance", "View the LLM audit log"),
    ("strategy.version", "Research", "Save rule and parameter changes as a new strategy version"),
    ("strategy.delete_any_draft", "Research", "Delete unsubmitted drafts created by other members"),
    ("notifications.approval_requests", "Notifications", "Receive approval-request notifications"),
    ("notifications.failure_alerts", "Notifications", "Receive strategy failure alerts"),
    ("notifications.billing_alerts", "Notifications", "Receive failed-payment alerts"),
    ("notifications.weekly_digest", "Notifications", "Receive the weekly digest"),
]

SYSTEM_ROLES = [
    ("researcher", "Researcher", "Builds, versions and tests strategies and research notes.",
     ["strategy.version"]),
    ("risk_manager", "Risk Manager", "Oversees live risk: approvals, retirement, manual failure flags and the kill switch.",
     ["audit.view.own_risk", "governance.view", "killswitch.trigger", "notifications.approval_requests",
      "notifications.failure_alerts", "strategy.approve", "strategy.fail_manual", "strategy.retire"]),
    ("cio", "CIO", "Final governance authority: everything a risk manager can do, plus kill switch review.",
     ["audit.view.org_risk", "governance.view", "killswitch.history.view_all", "killswitch.review",
      "killswitch.trigger", "notifications.approval_requests", "notifications.billing_alerts",
      "notifications.failure_alerts", "strategy.approve", "strategy.fail_manual", "strategy.retire"]),
    ("compliance_officer", "Compliance Officer", "Oversight: audit trails, compliance exports, member directory and approvals.",
     ["audit.view.all", "compliance.export", "governance.view", "killswitch.history.view_all", "llm_audit.view",
      "members.view", "notifications.approval_requests", "strategy.approve"]),
    ("admin", "Admin", "Organization administrator with every organization and governance capability except kill switch review.",
     ["audit.view.all", "billing.manage", "compliance.export", "digest.send", "governance.view",
      "killswitch.history.view_all", "killswitch.trigger", "llm_audit.view", "members.invite", "members.view",
      "notifications.approval_requests", "notifications.billing_alerts", "notifications.failure_alerts",
      "notifications.weekly_digest", "organization.manage", "roles.manage", "strategy.approve",
      "strategy.delete_any_draft", "strategy.fail_manual", "strategy.retire", "strategy.retire_override",
      "strategy.version", "system.monitor"]),
]

_NEW_AUDIT_EVENT_TYPES = ("role_created", "role_updated", "role_deleted", "role_permissions_changed")


def _permission_id(key: str) -> uuid.UUID:
    return uuid.uuid5(_NAMESPACE, f"stellix.permission.{key}")


def _system_role_id(key: str) -> uuid.UUID:
    return uuid.uuid5(_NAMESPACE, f"stellix.system_role.{key}")


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for label in _NEW_AUDIT_EVENT_TYPES:
            op.execute(f"ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS '{label}'")

    permissions = op.create_table(
        "permissions",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_permissions_key", "permissions", ["key"], unique=True)

    roles = op.create_table(
        "roles",
        sa.Column("id", _UUID, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", _UUID, nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_system_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("system_key", sa.String(length=32), nullable=True),
        sa.Column("created_by_user_id", _UUID, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "name", name="uq_roles_org_name"),
        sa.UniqueConstraint("system_key", name="uq_roles_system_key"),
    )
    op.create_index("ix_roles_organization_id", "roles", ["organization_id"])
    op.create_index(
        "uq_roles_system_name", "roles", ["name"], unique=True, postgresql_where=sa.text("organization_id IS NULL")
    )

    role_permissions = op.create_table(
        "role_permissions",
        sa.Column("role_id", _UUID, nullable=False),
        sa.Column("permission_id", _UUID, nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["permission_id"], ["permissions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("role_id", "permission_id"),
    )

    op.bulk_insert(
        permissions,
        [{"id": _permission_id(key), "key": key, "category": cat, "description": desc} for key, cat, desc in PERMISSIONS],
    )
    op.bulk_insert(
        roles,
        [
            {"id": _system_role_id(key), "organization_id": None, "name": name, "description": desc,
             "is_system_default": True, "system_key": key}
            for key, name, desc, _ in SYSTEM_ROLES
        ],
    )
    op.bulk_insert(
        role_permissions,
        [
            {"role_id": _system_role_id(key), "permission_id": _permission_id(perm)}
            for key, _, _, perms in SYSTEM_ROLES
            for perm in perms
        ],
    )

    # --- users.role_id + backfill ------------------------------------------------
    op.add_column("users", sa.Column("role_id", _UUID, nullable=True))
    op.create_foreign_key("fk_users_role_id", "users", "roles", ["role_id"], ["id"], ondelete="RESTRICT")
    op.create_index("ix_users_role_id", "users", ["role_id"])
    op.add_column("invitations", sa.Column("role_id", _UUID, nullable=True))
    op.create_foreign_key("fk_invitations_role_id", "invitations", "roles", ["role_id"], ["id"], ondelete="SET NULL")
    for key, *_ in SYSTEM_ROLES:
        op.execute(
            sa.text("UPDATE users SET role_id = :rid WHERE role = CAST(:role AS user_role)").bindparams(
                rid=_system_role_id(key), role=key
            )
        )
        op.execute(
            sa.text("UPDATE invitations SET role_id = :rid WHERE role = CAST(:role AS user_role)").bindparams(
                rid=_system_role_id(key), role=key
            )
        )

    # Custom role names are longer than the five system keys.
    op.alter_column("audit_log", "actor_role", type_=sa.String(length=100), existing_nullable=True)


def downgrade() -> None:
    op.alter_column("audit_log", "actor_role", type_=sa.String(length=32), existing_nullable=True,
                    postgresql_using="left(actor_role, 32)")
    op.drop_constraint("fk_invitations_role_id", "invitations", type_="foreignkey")
    op.drop_column("invitations", "role_id")
    op.drop_index("ix_users_role_id", table_name="users")
    op.drop_constraint("fk_users_role_id", "users", type_="foreignkey")
    op.drop_column("users", "role_id")
    op.drop_table("role_permissions")
    op.drop_index("uq_roles_system_name", table_name="roles")
    op.drop_index("ix_roles_organization_id", table_name="roles")
    op.drop_table("roles")
    op.drop_index("ix_permissions_key", table_name="permissions")
    op.drop_table("permissions")
    # users.role was never removed, so every user keeps the role they had. The added
    # audit_event_type labels stay (Postgres cannot drop enum labels; nothing uses them).
