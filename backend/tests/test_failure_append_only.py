"""Append-only enforcement at the Postgres permission level (Batch 6).

The dev app connects as the `postgres` superuser (which bypasses grants), so this test
connects as a NON-superuser role — exactly like the least-privilege application role a
production deployment (Batch 10) uses — and proves that a role with SELECT+INSERT on
`failures` cannot UPDATE or DELETE. Opt-in: RUN_INTEGRATION=1 (needs live Postgres).
"""

from __future__ import annotations

import psycopg
import pytest
from app.core.config import settings

pytestmark = pytest.mark.integration

_ROLE = "stellix_append_only_test"


def _dsn() -> str:
    return settings.DATABASE_URL_SYNC.replace("postgresql+psycopg://", "postgresql://")


def test_failures_are_append_only_at_permission_level():
    conn = psycopg.connect(_dsn(), autocommit=True)
    try:
        cur = conn.cursor()
        cur.execute(f"DROP ROLE IF EXISTS {_ROLE}")
        cur.execute(f"CREATE ROLE {_ROLE} NOSUPERUSER LOGIN PASSWORD 'x'")
        cur.execute(f"GRANT USAGE ON SCHEMA public TO {_ROLE}")
        # The privileges an append-only app role legitimately needs.
        cur.execute(f"GRANT SELECT, INSERT ON failures TO {_ROLE}")

        cur.execute(f"SET ROLE {_ROLE}")

        update_denied = False
        try:
            cur.execute("UPDATE failures SET regime_at_failure = 'x'")
        except psycopg.errors.InsufficientPrivilege:
            update_denied = True

        delete_denied = False
        try:
            cur.execute("DELETE FROM failures")
        except psycopg.errors.InsufficientPrivilege:
            delete_denied = True

        cur.execute("RESET ROLE")
        assert update_denied, "UPDATE on failures should be denied for a non-superuser app role"
        assert delete_denied, "DELETE on failures should be denied for a non-superuser app role"
    finally:
        cur = conn.cursor()
        cur.execute("RESET ROLE")
        cur.execute(f"REVOKE ALL ON failures FROM {_ROLE}")
        cur.execute(f"REVOKE USAGE ON SCHEMA public FROM {_ROLE}")
        cur.execute(f"DROP ROLE IF EXISTS {_ROLE}")
        conn.close()
