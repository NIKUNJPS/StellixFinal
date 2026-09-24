"""Batch 26 Part B: Quant Engineer system role + signals.view permission.

Additive delta on top of migration 0020 (which stays frozen). Reproduces, for
already-migrated databases, exactly what ``app/rbac/catalog.py`` now seeds on a fresh
one via ``seed_rbac_catalog``:

  * permission ``signals.view`` (Research).
  * system role ``Quant Engineer`` (system_key ``quant_engineer``, is_system_default),
    granted ``strategy.version`` + ``signals.view`` — a research/build role with NO
    governance permissions.
  * ``signals.view`` granted to the five original system roles too (Researcher,
    Risk Manager, CIO get it as a research grant; Compliance Officer for audit-read;
    Admin because the Admin system role holds every permission bar three governance
    ones). Deterministic uuid5 ids match ``catalog.permission_id`` / ``system_role_id``.

The seed data here is the FROZEN delta as of this migration, mirroring 0020's frozen
copy of the catalog; ``tests/test_dynamic_rbac.py::test_migration_seed_matches_catalog_exactly``
folds it into 0020 and checks the union equals the live catalog. All inserts are
idempotent (ON CONFLICT DO NOTHING) so this never fights a SuperAdmin's later edits.

Revision ID: 0023_quant_engineer_signals_view
Revises: 0022_strategy_symbol
Create Date: 2026-09-22
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0023_quant_engineer_signals_view"
down_revision: str | None = "0022_strategy_symbol"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Same namespace as migration 0020 / app.rbac.catalog — do not change.
_NAMESPACE = uuid.UUID("5b0d6c0e-2f0a-4c7e-9a52-6b1f3c8e9d21")

# --- frozen delta (kept identical to app/rbac/catalog.py) --------------------------
NEW_PERMISSIONS = [
    ("signals.view", "Research", "View this organization's Buy/Sell/Hold research signals for its active strategies"),
]
NEW_ROLES = [
    (
        "quant_engineer",
        "Quant Engineer",
        "Research/build role: versions strategies and reviews the organization's validated signals.",
        ["signals.view", "strategy.version"],
    ),
]
# Existing system roles that additionally gain signals.view (quant_engineer already
# has it via NEW_ROLES above).
SIGNALS_VIEW_GRANTED_TO = ["researcher", "risk_manager", "cio", "compliance_officer", "admin"]


def _permission_id(key: str) -> uuid.UUID:
    return uuid.uuid5(_NAMESPACE, f"stellix.permission.{key}")


def _system_role_id(key: str) -> uuid.UUID:
    return uuid.uuid5(_NAMESPACE, f"stellix.system_role.{key}")


_INSERT_PERM = sa.text(
    "INSERT INTO permissions (id, key, category, description) "
    "VALUES (:id, :key, :category, :description) ON CONFLICT (key) DO NOTHING"
)
_INSERT_ROLE = sa.text(
    "INSERT INTO roles (id, organization_id, name, description, is_system_default, system_key) "
    "VALUES (:id, NULL, :name, :description, true, :system_key) ON CONFLICT (system_key) DO NOTHING"
)
_INSERT_GRANT = sa.text(
    "INSERT INTO role_permissions (role_id, permission_id) "
    "VALUES (:role_id, :permission_id) ON CONFLICT DO NOTHING"
)


def upgrade() -> None:
    conn = op.get_bind()

    # 1) new permission(s)
    for key, category, description in NEW_PERMISSIONS:
        conn.execute(
            _INSERT_PERM, {"id": _permission_id(key), "key": key, "category": category, "description": description}
        )

    # 2) new system role(s)
    for key, name, description, _perms in NEW_ROLES:
        conn.execute(
            _INSERT_ROLE, {"id": _system_role_id(key), "name": name, "description": description, "system_key": key}
        )

    # 3) grants for the new role(s)
    for key, _name, _description, perms in NEW_ROLES:
        for perm in perms:
            conn.execute(
                _INSERT_GRANT, {"role_id": _system_role_id(key), "permission_id": _permission_id(perm)}
            )

    # 4) signals.view granted to the existing system roles
    signals_view_id = _permission_id("signals.view")
    for role_key in SIGNALS_VIEW_GRANTED_TO:
        conn.execute(
            _INSERT_GRANT, {"role_id": _system_role_id(role_key), "permission_id": signals_view_id}
        )


def downgrade() -> None:
    conn = op.get_bind()
    signals_view_id = _permission_id("signals.view")
    quant_id = _system_role_id("quant_engineer")
    # Remove grants + the quant_engineer role, then the permission.
    conn.execute(sa.text("DELETE FROM role_permissions WHERE permission_id = :p"), {"p": signals_view_id})
    conn.execute(sa.text("DELETE FROM role_permissions WHERE role_id = :r"), {"r": quant_id})
    conn.execute(sa.text("DELETE FROM roles WHERE id = :r"), {"r": quant_id})
    conn.execute(sa.text("DELETE FROM permissions WHERE id = :p"), {"p": signals_view_id})
