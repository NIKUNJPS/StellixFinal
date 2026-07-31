"""CROSS-ORG LEAKAGE TEST (Batch 6, run FIRST).

Two organizations with IDENTICAL failure patterns must never be linked across the
tenant boundary. The clustering session is bound to one organization, so its SELECT
auto-scopes — it is structurally impossible to load or link another tenant's failures.
"""

from __future__ import annotations

from app.db.tenant import bind_organization
from app.models.strategy import StrategyStatus
from app.services.failure import cluster_failures

from tests.data_helpers import seed_failure, seed_strategy
from tests.helpers import create_org_user

_PATTERN = dict(regime="Crisis", trigger="drawdown_breach", top_features=["sma_50", "macd", "rsi_14"])


async def _cluster(maker, org_id, failure_id):
    async with maker() as session:
        bind_organization(session.sync_session, org_id)
        return await cluster_failures(session, organization_id=org_id, target_failure_id=failure_id)


async def test_clustering_never_links_across_organizations(db_session_factory):
    org_a, _ua = await create_org_user(db_session_factory, org_name="Org A", slug="org-a", email="a@fi.io")
    org_b, _ub = await create_org_user(db_session_factory, org_name="Org B", slug="org-b", email="b@fi.io")
    strat_a = await seed_strategy(db_session_factory, organization_id=org_a.id, status=StrategyStatus.ACTIVE)
    strat_b = await seed_strategy(db_session_factory, organization_id=org_b.id, status=StrategyStatus.ACTIVE)

    # IDENTICAL patterns in BOTH orgs — if clustering leaked, A would link to B.
    fa1 = await seed_failure(db_session_factory, organization_id=org_a.id, strategy_id=strat_a, day=1, **_PATTERN)
    fa2 = await seed_failure(db_session_factory, organization_id=org_a.id, strategy_id=strat_a, day=2, **_PATTERN)
    fb1 = await seed_failure(db_session_factory, organization_id=org_b.id, strategy_id=strat_b, day=1, **_PATTERN)
    fb2 = await seed_failure(db_session_factory, organization_id=org_b.id, strategy_id=strat_b, day=2, **_PATTERN)

    rel_a1 = await _cluster(db_session_factory, org_a.id, fa1)
    await _cluster(db_session_factory, org_a.id, fa2)
    rel_b1 = await _cluster(db_session_factory, org_b.id, fb1)
    await _cluster(db_session_factory, org_b.id, fb2)

    # Within-org linking works (identical → similarity 1.0 >= 0.6).
    assert rel_a1 == [str(fa2)]
    assert rel_b1 == [str(fb2)]

    # NO cross-org contamination — B's ids never appear in A's links and vice versa.
    b_ids = {str(fb1), str(fb2)}
    a_ids = {str(fa1), str(fa2)}
    assert not (set(rel_a1) & b_ids)
    assert not (set(rel_b1) & a_ids)

    # Re-read every failure and confirm related_failure_ids stay strictly within-org.
    from app.models.failure import Failure
    from sqlalchemy import select

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org_a.id)
        a_failures = (await session.execute(select(Failure))).scalars().all()
        for f in a_failures:
            assert not (set(f.related_failure_ids) & b_ids), "org A failure linked to org B!"
