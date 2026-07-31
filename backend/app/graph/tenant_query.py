"""The "structurally hard to forget" tenant-scoping helper for Cypher (constitution
§3): Neo4j has no row-level security, so every query must filter by organization_id
manually. Mirrors the ``TenantScopedModel`` philosophy: ``organization_id`` is a
mandatory keyword argument (no default), and the query text is checked to actually
reference ``$organization_id`` — a query that forgot the filter raises immediately
instead of silently leaking, fail-closed.
"""

from __future__ import annotations

from typing import Any


class GraphTenantError(RuntimeError):
    """Raised when a Cypher query is executed without a mandatory tenant filter."""


async def run_scoped(
    session: Any, query: str, *, organization_id: str, **params: Any
) -> list[dict[str, Any]]:
    """Run a Cypher query on ``session``, enforcing an ``organization_id`` filter.

    ``session`` is any object exposing an async ``run(query, **params)`` that returns
    an async-iterable of records with a ``.data()`` method — the real
    ``neo4j.AsyncSession`` satisfies this, as does the in-memory fake's session shim.
    """
    if "$organization_id" not in query:
        raise GraphTenantError(
            "Refusing to run a Cypher query with no $organization_id reference — "
            "every graph query must be tenant-scoped (PROJECT_CONSTITUTION §3)."
        )
    result = await session.run(query, organization_id=organization_id, **params)
    return [record.data() async for record in result]
