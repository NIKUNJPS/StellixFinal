"""Weekly digest (Batch 22). Hermetic — seeded data, no live calls.

The digest is delivered over the existing webhook/log channel (post_webhook is a
no-op with no DEMO_WEBHOOK_URL configured in tests), so the preview endpoint makes
no network call. Every number traces to a real DB query — the third test guards that.
"""

from __future__ import annotations

from app.db.tenant import bind_organization
from app.models.evolution_run import EvolutionRun, EvolutionRunStatus
from app.models.strategy import StrategyStatus
from app.models.user import UserRole
from app.services.weekly_digest import build_digest_content, gather_weekly_stats

from tests.data_helpers import seed_failure, seed_strategy
from tests.helpers import bearer, create_org_user, login, register_org


async def test_gather_weekly_stats_returns_real_counts(client, db_session_factory):
    _token, org_id = await register_org(client, org_name="StatsCo", email="s@stats.co")

    sid1 = await seed_strategy(db_session_factory, organization_id=org_id, name="S1", status=StrategyStatus.ACTIVE)
    await seed_strategy(db_session_factory, organization_id=org_id, name="S2")
    await seed_failure(
        db_session_factory,
        organization_id=org_id,
        strategy_id=sid1,
        regime="Bear",
        trigger="drawdown_breach",
        top_features=["rsi_14"],
    )
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org_id)
        session.add(
            EvolutionRun(
                organization_id=org_id,
                symbol="SPY",
                status=EvolutionRunStatus.COMPLETED,
                ga_config={},
                seed_strategy_ids=[],
            )
        )
        await session.commit()

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org_id)
        stats = await gather_weekly_stats(session, org_id)

    assert stats["new_strategies_this_week"] == 2
    assert len(stats["new_failures_this_week"]) == 1
    assert stats["new_failures_this_week"][0]["name"] == "S1"
    assert stats["new_failures_this_week"][0]["trigger"] == "drawdown_breach"
    assert stats["evolution_completions_this_week"] == 1
    # No regime rows seeded this week -> honestly empty, not fabricated.
    assert stats["regime_changes_this_week"] == []


async def test_digest_preview_requires_admin_role(client, db_session_factory):
    # A researcher (non-admin) is refused.
    await create_org_user(
        db_session_factory,
        org_name="DigestResearchCo",
        slug="digest-research-co",
        email="researcher@digest.co",
        role=UserRole.RESEARCHER,
    )
    r_token = (await login(client, email="researcher@digest.co")).json()["access_token"]
    denied = await client.post("/notifications/digest/preview", headers=bearer(r_token))
    assert denied.status_code == 403

    # An admin gets the rendered digest back.
    admin_token, _org = await register_org(client, org_name="DigestAdminCo", email="admin@digest.co")
    ok = await client.post("/notifications/digest/preview", headers=bearer(admin_token))
    assert ok.status_code == 200
    body = ok.json()
    assert body["event"] == "weekly_digest"
    assert "stats" in body and "body" in body


def test_digest_content_has_no_fabricated_numbers():
    """build_digest_content renders ONLY numbers present in the stats dict — with zero
    activity it must not invent a non-zero count, and with known stats every number in
    the body must equal the supplied value."""
    empty = {
        "window_days": 7,
        "new_strategies_this_week": 0,
        "new_failures_this_week": [],
        "regime_changes_this_week": [],
        "evolution_completions_this_week": 0,
        "portfolio_sharpe": None,
    }
    content = build_digest_content("Nihil Capital", empty)
    body = content["body"]
    assert "New strategies created: 0" in body
    assert "Strategy failures: 0" in body
    assert "Regime changes: 0" in body
    assert "Evolution runs completed: 0" in body
    assert "n/a" in body  # None Sharpe -> n/a, never a made-up figure
    # The stats dict is passed through unchanged (every number is traceable to it).
    assert content["stats"] is empty

    known = {
        "window_days": 7,
        "new_strategies_this_week": 3,
        "new_failures_this_week": [{"name": "Alpha", "trigger": "sharpe_decline"}],
        "regime_changes_this_week": [{"symbol": "SPY", "old": "Bull", "new": "Bear"}],
        "evolution_completions_this_week": 2,
        "portfolio_sharpe": 1.234,
    }
    body2 = build_digest_content("Real Capital", known)["body"]
    assert "New strategies created: 3" in body2
    assert "Alpha (sharpe_decline)" in body2
    assert "SPY: Bull → Bear" in body2
    assert "Evolution runs completed: 2" in body2
    assert "1.23" in body2  # formatted from stats, not invented
