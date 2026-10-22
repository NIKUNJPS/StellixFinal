"""Research Memory index lifecycle: in-process, rebuilt from Postgres, status for System page."""
import asyncio
import uuid

import pytest
from app.graph import memory_index, sync_service
from app.graph.memory_repository import InMemoryGraphRepository
from app.services import system_health


@pytest.fixture
def fresh_index(monkeypatch):
    monkeypatch.setattr(sync_service, "_process_memory_repository", None)
    monkeypatch.setattr(sync_service, "_repository_override", None)
    monkeypatch.setattr(memory_index, "_last_status", None)
    yield
    sync_service.set_repository_override(None)


def test_default_repository_is_one_in_process_index(fresh_index):
    repo = sync_service._default_repository()
    assert isinstance(repo, InMemoryGraphRepository)
    # a second call reuses the same index (workers write somewhere consistent)
    assert sync_service._default_repository() is repo


def test_start_installs_an_empty_index_immediately_and_stop_removes_it(fresh_index, monkeypatch):
    async def never_finishes():
        await asyncio.sleep(3600)

    monkeypatch.setattr(memory_index, "_loop", never_finishes)

    async def scenario():
        memory_index.start()
        assert isinstance(sync_service._repository_override, InMemoryGraphRepository)
        await memory_index.stop()
        assert sync_service._repository_override is None

    asyncio.run(scenario())


def test_rebuild_records_status_and_swaps_in_a_fresh_index(fresh_index, monkeypatch):
    async def no_orgs():
        return []

    monkeypatch.setattr(memory_index, "_orgs_largest_first", no_orgs)
    assert memory_index.last_status() is None

    totals = asyncio.run(memory_index.rebuild())

    assert totals["orgs"] == 0
    status = memory_index.last_status()
    assert status is not None and status["refresh_seconds"] >= 30 and status["rebuilt_at"]
    assert isinstance(sync_service._repository_override, InMemoryGraphRepository)


def test_system_status_counts_only_the_callers_organization(fresh_index, monkeypatch):
    mine, theirs = uuid.uuid4(), uuid.uuid4()
    repo = InMemoryGraphRepository()

    async def seed():
        await repo.merge_node(str(mine), label="Strategy", key_value="s1", properties={"name": "a"})
        await repo.merge_node(str(mine), label="Failure", key_value="f1", properties={})
        await repo.merge_node(str(theirs), label="Strategy", key_value="s2", properties={"name": "b"})
        await repo.merge_node(str(theirs), label="Strategy", key_value="s3", properties={"name": "c"})

    asyncio.run(seed())
    sync_service.set_repository_override(repo)
    monkeypatch.setattr(memory_index, "_last_status", {"rebuilt_at": "2026-10-22T09:30:00+00:00", "refresh_seconds": 300})

    status = asyncio.run(system_health.get_memory_index_status(mine))

    assert status == {
        "rebuilt_at": "2026-10-22T09:30:00+00:00",
        "refresh_seconds": 300,
        "strategies": 1,
        "failures": 1,
        "research_notes": 0,
    }


def test_system_status_is_none_before_the_first_rebuild(fresh_index):
    assert asyncio.run(system_health.get_memory_index_status(uuid.uuid4())) is None
