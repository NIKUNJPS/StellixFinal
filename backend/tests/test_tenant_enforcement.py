"""Tests for structural multi-tenancy enforcement (app/db/tenant.py, ADR 0002/0003).

Runs hermetically on in-memory SQLite. Verifies the four guarantees:
  1. Reads are auto-scoped to the bound organization.
  2. Reading a tenant-scoped model with no organization bound fails closed.
  3. Inserts auto-stamp the bound organization_id.
  4. Cross-tenant writes are blocked.
"""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from app.db.tenant import (
    TenantContextError,
    TenantScopedModel,
    bind_organization,
    mark_session_unscoped,
    register_tenant_guards,
)
from sqlalchemy import String, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.pool import StaticPool

pytestmark = pytest.mark.asyncio

register_tenant_guards()


class Base(DeclarativeBase):
    pass


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100))


class Widget(Base, TenantScopedModel):
    """A throwaway tenant-scoped model exercising the mixin + listeners."""

    __tablename__ = "widgets"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100))


@pytest_asyncio.fixture
async def sessionmaker_fixture():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, expire_on_commit=False)
    yield maker
    await engine.dispose()


# Two fixed organization ids shared across the test body.
ORG_A = uuid.uuid4()
ORG_B = uuid.uuid4()


async def _seed_orgs(maker: async_sessionmaker[AsyncSession]) -> None:
    async with maker() as session:
        mark_session_unscoped(session.sync_session)
        session.add_all(
            [Organization(id=ORG_A, name="Org A"), Organization(id=ORG_B, name="Org B")]
        )
        await session.commit()


async def test_reads_are_auto_scoped(sessionmaker_fixture):
    maker = sessionmaker_fixture
    await _seed_orgs(maker)

    async with maker() as session:
        bind_organization(session.sync_session, ORG_A)
        session.add(Widget(name="a-widget"))
        await session.commit()

    async with maker() as session:
        bind_organization(session.sync_session, ORG_B)
        session.add(Widget(name="b-widget"))
        await session.commit()

    # A session bound to A sees only A's rows — no explicit tenant filter written.
    async with maker() as session:
        bind_organization(session.sync_session, ORG_A)
        rows = (await session.execute(select(Widget))).scalars().all()
    assert [w.name for w in rows] == ["a-widget"]
    assert all(w.organization_id == ORG_A for w in rows)


async def test_read_without_organization_fails_closed(sessionmaker_fixture):
    maker = sessionmaker_fixture
    await _seed_orgs(maker)

    async with maker() as session:
        # No organization bound and not marked unscoped → must raise, not leak.
        with pytest.raises(TenantContextError):
            await session.execute(select(Widget))


async def test_insert_autostamps_organization(sessionmaker_fixture):
    maker = sessionmaker_fixture
    await _seed_orgs(maker)

    async with maker() as session:
        bind_organization(session.sync_session, ORG_A)
        widget = Widget(name="unstamped")  # organization_id deliberately not set
        session.add(widget)
        await session.commit()
        assert widget.organization_id == ORG_A


async def test_cross_tenant_write_is_blocked(sessionmaker_fixture):
    maker = sessionmaker_fixture
    await _seed_orgs(maker)

    async with maker() as session:
        bind_organization(session.sync_session, ORG_A)
        session.add(Widget(name="smuggled", organization_id=ORG_B))
        with pytest.raises(TenantContextError):
            await session.commit()


async def test_aggregate_count_query_is_auto_scoped(sessionmaker_fixture):
    """Regression test (Batch 10): ``select(func.count()).select_from(Model)`` — the
    exact shape every paginated list endpoint's ``total`` field uses — used to leak
    the GLOBAL row count across all tenants. The old guard only applied the tenant
    filter when it detected the statement "touches" a tenant model via
    ``state.all_mappers``, which is empty for a bare aggregate with no selected
    column (only a FROM-clause reference), so the filter was silently skipped.
    Found live in Batch 10 via a real cross-org `/governance/audit-log` call
    (org B's admin saw org A's true count); fixed by applying the tenant filter
    unconditionally rather than gating on that detection.
    """
    maker = sessionmaker_fixture
    await _seed_orgs(maker)

    async with maker() as session:
        bind_organization(session.sync_session, ORG_A)
        session.add_all([Widget(name="a1"), Widget(name="a2"), Widget(name="a3")])
        await session.commit()

    async with maker() as session:
        bind_organization(session.sync_session, ORG_B)
        session.add(Widget(name="b1"))
        await session.commit()

    async with maker() as session:
        bind_organization(session.sync_session, ORG_A)
        count = await session.scalar(select(func.count()).select_from(Widget))
    assert count == 3  # NOT 4 (the global total across both orgs)

    async with maker() as session:
        bind_organization(session.sync_session, ORG_B)
        count = await session.scalar(select(func.count()).select_from(Widget))
    assert count == 1
