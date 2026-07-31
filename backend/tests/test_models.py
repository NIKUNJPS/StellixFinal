"""Regression guards for Postgres-specific model behavior that SQLite can't catch.

The native Postgres enum types are created (in the migration) with the lowercase enum
VALUES as labels. SQLAlchemy's ``Enum`` defaults to persisting the member NAMES, which
caused ``invalid input value for enum ... "STARTER"`` against real Postgres while
SQLite (no native enum) passed. These tests pin the persisted labels to the values.
"""

from __future__ import annotations

from app.models.organization import Organization, OrganizationTier
from app.models.user import User, UserRole


def test_user_role_enum_persists_values_not_names():
    labels = User.__table__.c.role.type.enums
    assert labels == [member.value for member in UserRole]
    assert labels == ["researcher", "risk_manager", "cio", "compliance_officer", "admin"]


def test_organization_tier_enum_persists_values_not_names():
    labels = Organization.__table__.c.tier.type.enums
    assert labels == [member.value for member in OrganizationTier]
    assert labels == ["starter", "pro", "enterprise"]
