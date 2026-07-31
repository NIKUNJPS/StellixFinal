"""Notification triggers (Batch 12): real events (failure detection, evolution
completion, approval-eligibility) genuinely create rows — not a static mock —
plus the list/mark-read endpoints and the per-user preference opt-out."""

from __future__ import annotations

import uuid

import pandas as pd
from app.core.security import hash_password
from app.db.tenant import bind_organization, mark_session_unscoped
from app.failure.detection import FailureAssessment
from app.models.evolution_run import EvolutionRun, EvolutionRunStatus
from app.models.failure import FailureTrigger
from app.models.notification import Notification, NotificationType
from app.models.strategy import Strategy, StrategyStatus
from app.models.user import User, UserRole
from app.services.evolution import run_evolution_in_session
from app.services.failure import persist_failure
from app.services.notification import create_notification
from app.services.strategy import maybe_notify_approval_requested
from app.strategy import lifecycle
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from tests.data_helpers import seed_strategy
from tests.helpers import bearer, create_org_user


async def _add_user(
    maker: async_sessionmaker, *, organization_id, email: str, role: UserRole
) -> uuid.UUID:
    """Insert an additional user into an ALREADY-EXISTING org (create_org_user
    always creates a fresh org, which isn't what a multi-user-per-org test needs)."""
    async with maker() as session:
        mark_session_unscoped(session.sync_session)
        user = User(
            organization_id=organization_id, email=email, hashed_password=hash_password("goodpass123"),
            role=role, is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user.id


async def _notifications_for(maker: async_sessionmaker, *, organization_id, user_id) -> list[Notification]:
    async with maker() as session:
        bind_organization(session.sync_session, organization_id)
        rows = (
            await session.execute(select(Notification).where(Notification.user_id == user_id))
        ).scalars().all()
        return list(rows)


async def test_failure_detected_notifies_creator_and_governance_roles(db_session_factory):
    org, creator = await create_org_user(
        db_session_factory, org_name="NotifyFailCo", slug="notify-fail-co",
        email="creator@notifyfail.co", role=UserRole.RESEARCHER,
    )
    risk_mgr_id = await _add_user(
        db_session_factory, organization_id=org.id, email="risk@notifyfail.co", role=UserRole.RISK_MANAGER
    )
    # A researcher with NO governance role and NOT the creator — must NOT be notified.
    bystander_id = await _add_user(
        db_session_factory, organization_id=org.id, email="bystander@notifyfail.co", role=UserRole.RESEARCHER
    )

    sid = await seed_strategy(
        db_session_factory, organization_id=org.id, status=StrategyStatus.ACTIVE,
        created_by_user_id=creator.id,
    )
    assessment = FailureAssessment(
        trigger=FailureTrigger.DRAWDOWN_BREACH,
        performance_metrics={"max_drawdown": -0.5},
        regime_at_failure="Bear",
        failure_timestamp=pd.Timestamp("2024-01-15", tz="UTC"),
    )

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        strategy = (await session.execute(select(Strategy).where(Strategy.id == sid))).scalar_one()
        await persist_failure(session, strategy=strategy, assessment=assessment)
        await session.commit()

    creator_notifs = await _notifications_for(db_session_factory, organization_id=org.id, user_id=creator.id)
    risk_mgr_notifs = await _notifications_for(db_session_factory, organization_id=org.id, user_id=risk_mgr_id)
    bystander_notifs = await _notifications_for(db_session_factory, organization_id=org.id, user_id=bystander_id)

    assert len(creator_notifs) == 1
    assert creator_notifs[0].type == NotificationType.FAILURE_DETECTED
    assert len(risk_mgr_notifs) == 1
    assert bystander_notifs == []


async def test_approval_requested_fires_only_when_candidate_and_over_threshold(db_session_factory):
    org, _admin = await create_org_user(
        db_session_factory, org_name="NotifyApprovalCo", slug="notify-approval-co",
        email="admin@notifyapproval.co", role=UserRole.ADMIN,
    )
    cio_id = await _add_user(
        db_session_factory, organization_id=org.id, email="cio@notifyapproval.co", role=UserRole.CIO
    )

    below_threshold_id = await seed_strategy(
        db_session_factory, organization_id=org.id, status=StrategyStatus.CANDIDATE,
    )
    above_threshold_id = await seed_strategy(
        db_session_factory, organization_id=org.id, status=StrategyStatus.CANDIDATE,
    )
    draft_id = await seed_strategy(db_session_factory, organization_id=org.id, status=StrategyStatus.DRAFT)

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        below = (await session.execute(select(Strategy).where(Strategy.id == below_threshold_id))).scalar_one()
        below.robustness_score = lifecycle.ROBUSTNESS_THRESHOLD - 0.05
        await maybe_notify_approval_requested(session, below)

        above = (await session.execute(select(Strategy).where(Strategy.id == above_threshold_id))).scalar_one()
        above.robustness_score = lifecycle.ROBUSTNESS_THRESHOLD + 0.05
        await maybe_notify_approval_requested(session, above)

        draft = (await session.execute(select(Strategy).where(Strategy.id == draft_id))).scalar_one()
        draft.robustness_score = 0.99  # high score but NOT a candidate -> must not notify
        await maybe_notify_approval_requested(session, draft)
        await session.commit()

    cio_notifs = await _notifications_for(db_session_factory, organization_id=org.id, user_id=cio_id)
    assert len(cio_notifs) == 1
    assert cio_notifs[0].type == NotificationType.APPROVAL_REQUESTED


async def test_approval_requested_dedupes_unread_notifications(db_session_factory):
    org, _admin = await create_org_user(
        db_session_factory, org_name="DedupeCo", slug="dedupe-co", email="admin@dedupeco.com", role=UserRole.ADMIN,
    )
    sid = await seed_strategy(db_session_factory, organization_id=org.id, status=StrategyStatus.CANDIDATE)

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        strategy = (await session.execute(select(Strategy).where(Strategy.id == sid))).scalar_one()
        strategy.robustness_score = lifecycle.ROBUSTNESS_THRESHOLD + 0.1
        # Simulate BOTH a backtest and a validation touching the same strategy.
        await maybe_notify_approval_requested(session, strategy)
        await maybe_notify_approval_requested(session, strategy)
        await session.commit()

    notifs = await _notifications_for(db_session_factory, organization_id=org.id, user_id=_admin.id)
    assert len(notifs) == 1  # not 2 — the second call found an existing unread notification


async def test_evolution_run_failure_notifies_the_user_who_started_it(db_session_factory):
    org, user = await create_org_user(
        db_session_factory, org_name="EvoNotifyCo", slug="evo-notify-co", email="evo@evonotifyco.com",
    )
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        run = EvolutionRun(
            organization_id=org.id, symbol="AAPL", status=EvolutionRunStatus.RUNNING,
            ga_config={}, seed_strategy_ids=[],
        )
        session.add(run)
        await session.commit()
        await session.refresh(run)
        run_id = run.id

    # No Active/Candidate strategies exist -> run_evolution_in_session's own
    # ValueError guard fires, taking the `except` (failed) branch deterministically,
    # without needing a real GA population/backtest. Session-injected (like
    # persist_failure above), NOT run_evolution() — that opens its own
    # get_tenant_session against the real app DB, not this test's SQLite one.
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        result = await run_evolution_in_session(
            session, organization_id=org.id, run_id=run_id, user_id=user.id
        )
    assert result["status"] == "failed"

    notifs = await _notifications_for(db_session_factory, organization_id=org.id, user_id=user.id)
    assert len(notifs) == 1
    assert notifs[0].type == NotificationType.EVOLUTION_COMPLETED
    assert "failed" in notifs[0].message.lower()


async def test_notification_preference_opt_out_suppresses_creation(db_session_factory):
    org, user = await create_org_user(
        db_session_factory, org_name="OptOutCo", slug="opt-out-co", email="user@optoutco.com",
    )
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org.id)
        u = (await session.execute(select(User).where(User.id == user.id))).scalar_one()
        u.preferences = {"notifications": {"failure_detected": False}}
        await session.commit()

        created = await create_notification(
            session, organization_id=org.id, user=u, type=NotificationType.FAILURE_DETECTED,
            message="should not be created",
        )
        assert created is None

    notifs = await _notifications_for(db_session_factory, organization_id=org.id, user_id=user.id)
    assert notifs == []


async def test_list_and_mark_read_endpoints(client, db_session_factory):
    from tests.helpers import register_org

    token, org = await register_org(client, org_name="NotifListCo", email="list@notiflistco.com")
    me = (await client.get("/auth/me", headers=bearer(token))).json()
    user_id = uuid.UUID(me["user"]["id"])

    async with db_session_factory() as session:
        bind_organization(session.sync_session, org)
        u = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
        await create_notification(
            session, organization_id=org, user=u, type=NotificationType.EVOLUTION_COMPLETED,
            message="Run finished", link="/admin/evolution",
        )
        await session.commit()

    listing = await client.get("/notifications", headers=bearer(token))
    assert listing.status_code == 200
    body = listing.json()
    assert body["total"] == 1
    assert body["unread_count"] == 1
    notif_id = body["items"][0]["id"]

    marked = await client.patch(f"/notifications/{notif_id}/read", headers=bearer(token))
    assert marked.status_code == 200
    assert marked.json()["read_at"] is not None

    listing_after = await client.get("/notifications?unread_only=true", headers=bearer(token))
    assert listing_after.json()["count"] == 0
