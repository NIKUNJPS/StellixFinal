"""Shared pytest fixtures.

These tests are hermetic — they do NOT require the Docker stack. Auth/RBAC/isolation
tests run against an in-memory SQLite database with the real ORM models; the FastAPI
DB-session dependencies are overridden to use that SQLite session, and the in-process
auth rate limiter is disabled (a dedicated test re-enables it). Integration against
the real Postgres/Neo4j/Redis stack is documented in the README.
"""

from __future__ import annotations

import os
import uuid

import app.models  # noqa: F401  (register models on Base.metadata)
import pytest
import pytest_asyncio
from app.api.deps import get_system_db, get_tenant_db, get_token_payload
from app.clients import redis_client
from app.core.rate_limit import (
    backtest_rate_limiter,
    demo_request_rate_limiter,
    evolution_run_rate_limiter,
    global_rate_limiter,
    ingest_rate_limiter,
    llm_rate_limiter,
    login_account_rate_limiter,
    login_rate_limiter,
    register_rate_limiter,
    validate_rate_limiter,
)
from app.core.token_bucket import reset_scope
from app.db.base import Base
from app.db.tenant import bind_organization, mark_session_unscoped
from app.graph import sync_service
from app.graph.fake_repository import FakeGraphRepository
from app.main import app
from fastapi import Depends
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Batch 11: every Redis-backed rate limiter, disabled by default in the `client`
# fixture so ordinary functional tests never trip on the real shared local Redis
# instance (rate-limit state persists across test runs, unlike the hermetic
# per-test SQLite DB). Rate-limit tests re-enable exactly one of these at a time
# — see test_rate_limiting.py.
_ALL_RATE_LIMITERS = (
    login_rate_limiter,
    register_rate_limiter,
    login_account_rate_limiter,
    global_rate_limiter,
    ingest_rate_limiter,
    backtest_rate_limiter,
    validate_rate_limiter,
    evolution_run_rate_limiter,
    llm_rate_limiter,
    demo_request_rate_limiter,
)


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest_asyncio.fixture(autouse=True)
async def _fresh_redis_client_per_test():
    """``redis_client.get_client()`` caches a process-wide singleton bound to
    whichever event loop was running when it was first created. pytest-asyncio
    gives each test function its own event loop by default, so reusing that
    singleton across test functions intermittently raises "Event loop is
    closed" once a connection opened under a previous test's (now-closed) loop
    gets pulled from the pool. Batch 1's rate limiter was in-process (no
    Redis); Batch 11's is the first thing to exercise real Redis across many
    test functions in this suite, which is what surfaced this. Force a fresh
    client — and thus a fresh connection pool, bound to THIS test's loop — at
    the start of every test."""
    await redis_client.close_client()
    yield
    await redis_client.close_client()


@pytest.fixture(autouse=True)
def _default_fake_graph():
    """Default every test to an in-memory knowledge graph, so the suite is hermetic
    w.r.t. Neo4j whether or not one happens to be running.

    The real Neo4j async driver caches one connection pool bound to the event loop
    it was first used on; pytest-asyncio runs each test on its own loop, so once a
    test reached the *real* driver (only possible when a Neo4j is running locally —
    CI has none) later tests reused a now-dead socket and crashed with
    'NoneType object has no attribute send'. Forcing the fake also means the suite
    never writes test data into a real graph. Tests that assert on graph state
    override this with the explicit `fake_graph_repo` fixture, and the degradation
    tests override it with their always-down double; both are requested (non-autouse)
    fixtures that set the override after this one, so they win.
    """
    sync_service.set_repository_override(FakeGraphRepository())
    try:
        yield
    finally:
        sync_service.set_repository_override(None)


def pytest_collection_modifyitems(config, items):
    """Skip `integration` tests unless RUN_INTEGRATION=1 (they need network + live DB)."""
    if os.getenv("RUN_INTEGRATION") == "1":
        return
    skip = pytest.mark.skip(reason="integration test; set RUN_INTEGRATION=1 to run")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip)


@pytest_asyncio.fixture
async def db_session_factory():
    """A fresh in-memory SQLite database + async sessionmaker per test."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)
    # Batch 26: the permission catalog + five system roles, exactly as migration 0020
    # seeds them on Postgres. Without these rows every user would resolve to no
    # permissions (authorization fails closed).
    from app.services.rbac import seed_rbac_catalog

    async with maker() as session:
        mark_session_unscoped(session.sync_session)
        await seed_rbac_catalog(session)
    try:
        yield maker
    finally:
        await engine.dispose()


def _make_db_overrides(maker: async_sessionmaker):
    async def override_system_db():
        async with maker() as session:
            mark_session_unscoped(session.sync_session)
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    async def override_tenant_db(payload: dict = Depends(get_token_payload)):
        organization_id = uuid.UUID(payload["org"])
        async with maker() as session:
            bind_organization(session.sync_session, organization_id)
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    return override_system_db, override_tenant_db


@pytest_asyncio.fixture
async def client(db_session_factory):
    """HTTP client with DB wired to SQLite and every rate limiter disabled."""
    import tests.helpers as _helpers

    sys_db, tenant_db = _make_db_overrides(db_session_factory)
    app.dependency_overrides[get_system_db] = sys_db
    app.dependency_overrides[get_tenant_db] = tenant_db
    for limiter in _ALL_RATE_LIMITERS:
        app.dependency_overrides[limiter] = lambda: None
    # Point the auth helpers (register_org / activate_org_by_email) at THIS test's
    # SQLite maker so their org-activation writes hit the same DB the API just wrote
    # to — not the app's real Postgres SessionFactory (Batch 24).
    _helpers._TEST_SESSION_MAKER = db_session_factory
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    _helpers._TEST_SESSION_MAKER = None
    app.dependency_overrides.clear()


def enable_limiter(limiter) -> None:
    """Re-enable exactly one of the nine limiters the ``client`` fixture disables
    by default — for tests exercising one limiter category in isolation (the
    other eight stay disabled, so only the limiter under test can 429).
    User/org-keyed limiters need no explicit Redis reset between tests: each
    test registers a fresh org via ``register()``/``create_org_user()``, so the
    bucket key (user_id or organization_id) has never been touched before."""
    app.dependency_overrides.pop(limiter, None)


@pytest.fixture
def fake_graph_repo():
    """A shared in-memory graph repository, injected in place of the real Neo4j
    driver for the duration of one test (opt-in: request this fixture explicitly).

    Because ``GraphSyncService()`` call sites deep inside services/ and routes/
    construct fresh instances with no explicit repository, injection has to happen
    via the module-level override rather than FastAPI's dependency-override
    mechanism (which only reaches route-level dependencies).
    """
    repo = FakeGraphRepository()
    sync_service.set_repository_override(repo)
    try:
        yield repo
    finally:
        sync_service.set_repository_override(None)


@pytest_asyncio.fixture
async def rate_limited_client(db_session_factory):
    """Like ``client`` but with the real auth rate limiters (login/register,
    both IP- and account-keyed) ENABLED — every other limiter stays disabled."""
    sys_db, tenant_db = _make_db_overrides(db_session_factory)
    app.dependency_overrides[get_system_db] = sys_db
    app.dependency_overrides[get_tenant_db] = tenant_db
    for limiter in _ALL_RATE_LIMITERS:
        if limiter not in (login_rate_limiter, register_rate_limiter, login_account_rate_limiter):
            app.dependency_overrides[limiter] = lambda: None

    async def _reset() -> None:
        for scope in ("auth:login:ip", "auth:register:ip", "auth:login:account"):
            await reset_scope(scope)

    await _reset()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
    await _reset()
