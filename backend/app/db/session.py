"""Async SQLAlchemy engine and session factories.

Two ways to obtain a session:

* ``get_tenant_session(organization_id)`` — the DEFAULT for authenticated
  application code. The returned session is bound to an organization; all ORM access
  is auto-scoped (see ``tenant.py``).
* ``get_system_session()`` — an UNSCOPED system session, explicitly marked. Reserved
  for operations that legitimately span tenants or run before a tenant is known
  (migrations, the ``/health`` probe, registration, login). Using it on an
  authenticated path that reads client data is a bug.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings
from app.db.tenant import bind_organization, mark_session_unscoped, register_tenant_guards

# Register the tenant enforcement listeners exactly once, at import time.
register_tenant_guards()

def _create_engine():
    return create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        pool_pre_ping=True,
        future=True,
        # Batch 23 (load-test finding): the SQLAlchemy defaults (pool_size=5,
        # max_overflow=10 = 15 connections) are too small for the concurrent
        # institutional read load this platform targets — a 20-user load test
        # exhausted the pool and cascaded 500s. 20 + 20 overflow = 40 max connections,
        # comfortably under Postgres' default max_connections=100. pool_timeout is
        # trimmed to 10s so a genuinely saturated pool fails fast instead of hanging
        # the request for 30s.
        pool_size=20,
        max_overflow=20,
        pool_timeout=10,
    )


def _create_session_factory(bound_engine):
    return async_sessionmaker(
        bind=bound_engine,
        expire_on_commit=False,
        autoflush=False,
    )


engine = _create_engine()

SessionFactory = _create_session_factory(engine)


@asynccontextmanager
async def get_tenant_session(organization_id: uuid.UUID) -> AsyncIterator[AsyncSession]:
    """Yield an AsyncSession bound to ``organization_id`` (auto-scoped; the default)."""
    async with SessionFactory() as session:
        bind_organization(session.sync_session, organization_id)
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@asynccontextmanager
async def get_system_session() -> AsyncIterator[AsyncSession]:
    """Yield an UNSCOPED system AsyncSession. Must not read authenticated client data."""
    async with SessionFactory() as session:
        mark_session_unscoped(session.sync_session)
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def dispose_engine() -> None:
    """Dispose the current engine's pool AND rebuild a fresh engine + session factory.

    Rebuilding (not merely disposing) is what makes the Celery worker safe. Each task
    runs in its own ``asyncio.run()`` event loop (see app/worker/tasks.py), and an
    async engine's pooled connections are bound to the loop they were opened on.
    Reusing one engine object across those per-task loops hands a later task a
    connection attached to a previous, now-closed loop, which asyncpg rejects on the
    first query — the task then dies before it can even mark its job ``running``,
    leaving it stuck ``pending``. Recreating here means the next task opens its first
    connection inside its own loop.

    The API (uvicorn) calls this only on shutdown, so its long-lived pooled engine is
    unaffected during normal operation; the worker calls it in each task's ``finally``.
    """
    global engine, SessionFactory
    old_engine = engine
    engine = _create_engine()
    SessionFactory = _create_session_factory(engine)
    await old_engine.dispose()
