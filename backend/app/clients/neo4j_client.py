"""Neo4j async driver lifecycle (official ``neo4j`` driver — NOT py2neo).

A single ``AsyncDriver`` is created lazily and reused for the process lifetime, per
the driver's own guidance (the driver manages its own connection pool).
"""

from __future__ import annotations

from neo4j import AsyncDriver, AsyncGraphDatabase

from app.core.config import settings

_driver: AsyncDriver | None = None


def get_driver() -> AsyncDriver:
    """Return the process-wide Neo4j async driver, creating it on first use."""
    global _driver
    if _driver is None:
        _driver = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
            # Batch 23 (load-test finding): with the driver defaults, an UNREACHABLE
            # Neo4j makes a graph query hang ~30s while still holding its Postgres
            # connection — under load that starves the SQL pool and 500s unrelated
            # endpoints. Fail fast instead: a down Neo4j returns in a few seconds so
            # the graph route degrades to its 503 quickly and releases the connection.
            connection_timeout=5.0,
            connection_acquisition_timeout=10.0,
            max_connection_pool_size=40,
        )
    return _driver


async def verify_connectivity() -> None:
    """Raise if Neo4j is unreachable. Used by the health probe."""
    driver = get_driver()
    await driver.verify_connectivity()


async def close_driver() -> None:
    """Close the driver on application shutdown."""
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None
