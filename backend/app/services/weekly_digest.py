"""Weekly digest (Batch 22).

Gathers a week's activity for one organization and renders it into the SAME
notification payload shape the account-lifecycle notifications use
(app/services/notifications.py) — a ``{event, audience, subject, body, ...}`` dict
delivered best-effort over the webhook/log channel (app/services/webhook.py). There
is no SMTP in this deployment; when a real email provider is keyed later, the same
``build_digest_content`` output renders straight into an email body.

Honesty contract: every number in the digest comes from a real DB query in
``gather_weekly_stats``. ``build_digest_content`` only reads that stats dict — it
never hardcodes a count — so the digest can't show a fabricated number. This is
enforced by tests/test_weekly_digest.py::test_digest_content_has_no_fabricated_numbers.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.evolution_run import EvolutionRun, EvolutionRunStatus
from app.models.failure import Failure
from app.models.regime_label import RegimeLabelRecord
from app.models.strategy import Strategy

_WINDOW_DAYS = 7


def _week_start(now: datetime | None = None) -> datetime:
    return (now or datetime.now(UTC)) - timedelta(days=_WINDOW_DAYS)


async def gather_weekly_stats(
    session: AsyncSession, organization_id: uuid.UUID, *, now: datetime | None = None
) -> dict:
    """Collect this org's last-7-days activity. ``session`` MUST already be bound to
    ``organization_id`` (get_tenant_session) — the models are TenantScopedModel, so
    every query below auto-scopes to that org.

    NOTE on regime_changes: this filters the regime_labels table to the last 7 days.
    Historical/seed data (e.g. 2024-dated) legitimately yields an EMPTY list rather
    than fabricated changes — the window is real, not the numbers.
    """
    since = _week_start(now)

    new_strategies = await session.scalar(
        select(func.count()).select_from(Strategy).where(Strategy.created_at >= since)
    )

    failure_rows = (
        await session.execute(
            select(Strategy.name, Failure.trigger_condition)
            .join(Strategy, Strategy.id == Failure.strategy_id)
            .where(Failure.created_at >= since)
            .order_by(Failure.created_at.desc())
        )
    ).all()
    new_failures = [
        {"name": name, "trigger": trig.value if hasattr(trig, "value") else str(trig)}
        for name, trig in failure_rows
    ]

    evolution_completions = await session.scalar(
        select(func.count())
        .select_from(EvolutionRun)
        .where(EvolutionRun.status == EvolutionRunStatus.COMPLETED, EvolutionRun.updated_at >= since)
    )

    regime_changes = await _regime_changes_this_week(session, since)

    portfolio_sharpe = await _portfolio_sharpe(session, organization_id)

    return {
        "window_days": _WINDOW_DAYS,
        "new_strategies_this_week": int(new_strategies or 0),
        "new_failures_this_week": new_failures,
        "regime_changes_this_week": regime_changes,
        "evolution_completions_this_week": int(evolution_completions or 0),
        "portfolio_sharpe": portfolio_sharpe,
    }


async def _regime_changes_this_week(session: AsyncSession, since: datetime) -> list[dict]:
    """Real regime transitions in the window. For each symbol with rows in the last
    7 days, walk the ordered labels and record every change; the baseline is the last
    label strictly before the window (so a change right at the boundary is caught)."""
    rows = (
        await session.execute(
            select(RegimeLabelRecord.symbol, RegimeLabelRecord.timestamp, RegimeLabelRecord.regime_label)
            .where(RegimeLabelRecord.timestamp >= since)
            .order_by(RegimeLabelRecord.symbol, RegimeLabelRecord.timestamp)
        )
    ).all()
    if not rows:
        return []

    by_symbol: dict[str, list] = {}
    for symbol, _ts, label in rows:
        by_symbol.setdefault(symbol, []).append(label)

    changes: list[dict] = []
    for symbol, labels in by_symbol.items():
        baseline = await session.scalar(
            select(RegimeLabelRecord.regime_label)
            .where(RegimeLabelRecord.symbol == symbol, RegimeLabelRecord.timestamp < since)
            .order_by(RegimeLabelRecord.timestamp.desc())
            .limit(1)
        )
        prev = baseline
        for label in labels:
            if prev is not None and label != prev:
                changes.append(
                    {
                        "symbol": symbol,
                        "old": prev.value if hasattr(prev, "value") else str(prev),
                        "new": label.value if hasattr(label, "value") else str(label),
                    }
                )
            prev = label
    return changes


async def _portfolio_sharpe(session: AsyncSession, organization_id: uuid.UUID) -> float | None:
    """Current portfolio Sharpe from the Batch 20 Portfolio service — not recomputed
    differently here. Returns None when there are no active strategies with metrics."""
    from app.services.portfolio import compute_overview

    overview = await compute_overview(session, organization_id)
    return overview.portfolio_sharpe


def build_digest_content(org_name: str, stats: dict) -> dict:
    """Render the stats into the notification payload. Reads ONLY from ``stats`` — no
    number is invented here."""
    lines: list[str] = [f"Here's what happened at {org_name} in the last {stats['window_days']} days:"]

    lines.append(f"• New strategies created: {stats['new_strategies_this_week']}")

    failures = stats["new_failures_this_week"]
    if failures:
        lines.append(f"• Strategy failures ({len(failures)}):")
        for f in failures:
            lines.append(f"    – {f['name']} ({f['trigger']})")
    else:
        lines.append("• Strategy failures: 0")

    changes = stats["regime_changes_this_week"]
    if changes:
        lines.append(f"• Regime changes ({len(changes)}):")
        for c in changes:
            lines.append(f"    – {c['symbol']}: {c['old']} → {c['new']}")
    else:
        lines.append("• Regime changes: 0")

    lines.append(f"• Evolution runs completed: {stats['evolution_completions_this_week']}")

    sharpe = stats["portfolio_sharpe"]
    lines.append(
        f"• Portfolio Sharpe: {sharpe:.2f}" if sharpe is not None else "• Portfolio Sharpe: n/a (no active strategies)"
    )

    return {
        "event": "weekly_digest",
        "audience": "client",
        "subject": f"Your Stellix Labs weekly digest — {org_name}",
        "body": "\n".join(lines),
        "stats": stats,
    }


async def digest_recipient_emails(session, organization_id) -> list[str]:
    """Verified, active members whose role grants notifications.weekly_digest (Batch 26;
    day one: exactly the org's admins, as before)."""
    from app.rbac.catalog import P
    from app.services.rbac import users_with_permission

    users = await users_with_permission(session, organization_id=organization_id, key=P.NOTIFY_WEEKLY_DIGEST)
    return [u.email for u in users if u.email_verified]


async def send_all_active_digests() -> int:
    """Deliver the weekly digest to every ACTIVE org that has it enabled.

    Returns the number of ORGS processed (not the number of emails), matching the
    original contract used by the Celery beat sweep (send_weekly_digests).

    Batch 25: alongside the founder webhook, the digest is now emailed to each org's
    admins. Delivery is best-effort — ``send_notification`` returns False rather than
    raising when SMTP is unconfigured or a send fails, so one bad mailbox can never
    abort the sweep for the remaining orgs.
    """
    from app.core.config import settings
    from app.db.session import get_system_session, get_tenant_session
    from app.db.tenant import mark_session_unscoped
    from app.models.organization import Organization, OrganizationStatus
    from app.services.email import send_notification
    from app.services.webhook import post_webhook

    async with get_system_session() as sys_session:
        mark_session_unscoped(sys_session.sync_session)
        targets = (
            await sys_session.execute(
                select(Organization.id, Organization.name).where(
                    Organization.status == OrganizationStatus.ACTIVE,
                    Organization.weekly_digest_enabled.is_(True),
                )
            )
        ).all()

    sent = 0
    for org_id, org_name in targets:
        async with get_tenant_session(org_id) as tenant_session:
            stats = await gather_weekly_stats(tenant_session, org_id)
            recipients = await digest_recipient_emails(tenant_session, org_id)

        content = build_digest_content(org_name, stats)
        await post_webhook(settings.DEMO_WEBHOOK_URL, content)
        for address in recipients:
            await send_notification(content, to=address)
        sent += 1
    return sent
