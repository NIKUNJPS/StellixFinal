"""SuperAdmin control-plane service (Batch 24) — the founder's cross-tenant surface.

Every function here operates ACROSS organizations by design and must run on an
UNSCOPED session (get_system_db / mark_session_unscoped) — the ORM tenant filter
(ADR-0002) would otherwise hide other tenants' data. Because these reads and writes
cross the tenant boundary, each one records a row in superadmin_audit_log (SOC 2:
privileged cross-org access is independently logged). ``log_action`` is that record.

Revenue note: no real payment data is fabricated. ``monthly_revenue_usd`` is set to
the plan's LIST price (PLAN_MONTHLY_USD) at approval and can be overridden by the
founder; with Stripe unkeyed in this deployment it is list-price MRR, not billed
MRR. The distinction is surfaced, not hidden.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_impersonation_token, hash_password
from app.models.demo_request import DemoRequest, DemoRequestStatus
from app.models.llm_audit_log import LLMAuditLog
from app.models.organization import (
    TIER_MAX_STRATEGIES,
    Organization,
    OrganizationStatus,
    OrganizationTier,
)
from app.models.refresh_token import RefreshToken
from app.models.strategy import Strategy
from app.models.superadmin_audit_log import SuperAdminAuditLog
from app.models.trade_record import TradeRecord
from app.models.user import User, UserRole
from app.services import notifications
from app.services.email import send_notification
from app.services.org_status import invalidate_org_status
from app.services.password_reset import request_password_reset
from app.services.webhook import post_webhook

# List price per plan (USD/month). No payment integration is live, so this is the
# revenue basis for approvals — flagged as list-price, overridable per org.
PLAN_MONTHLY_USD: dict[OrganizationTier, Decimal] = {
    OrganizationTier.STARTER: Decimal("500"),
    OrganizationTier.PRO: Decimal("2500"),
    OrganizationTier.ENTERPRISE: Decimal("10000"),
}


class SuperAdminError(Exception):
    """Raised for control-plane preconditions (not-found, illegal transition)."""


def _now() -> datetime:
    return datetime.now(UTC)


async def _org_admin_email(session: AsyncSession, org_id: uuid.UUID) -> str | None:
    """Best target for a client-facing notification: the org's oldest admin (its
    creator), else any user. Returns None for an org with no users."""
    from app.rbac.catalog import P
    from app.services.rbac import users_with_permission

    managers = await users_with_permission(session, organization_id=org_id, key=P.ORGANIZATION_MANAGE, active_only=False)
    if managers:
        return managers[0].email
    return await session.scalar(
        select(User.email).where(User.organization_id == org_id).order_by(User.created_at.asc()).limit(1)
    )


async def _notify(payload: dict, *, email_client: bool = True) -> None:
    """Deliver a lifecycle notification best-effort over BOTH channels.

    The founder's webhook always gets a copy (operator visibility). Batch 25 adds
    the second leg: a payload marked ``audience: "client"`` is also emailed to the
    address it carries, so the customer actually hears about approval/suspension/
    termination instead of relying on the founder to relay it by hand.

    Both legs are best-effort and swallow their own failures — the DB change is
    already committed by the time this runs, so a dead webhook or mail server must
    never surface as a failed control-plane mutation.

    ``email_client=False`` opts a payload out of the email leg (used where the
    webhook wording is founder-only — see approve_demo_request).
    """
    await post_webhook(settings.DEMO_WEBHOOK_URL, payload)
    if email_client and payload.get("audience") == "client" and payload.get("email"):
        await send_notification(payload, to=payload["email"])


# --------------------------------------------------------------------------- #
# Audit
# --------------------------------------------------------------------------- #
async def log_action(
    session: AsyncSession,
    *,
    super_admin_id: uuid.UUID,
    action: str,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    before: dict | None = None,
    after: dict | None = None,
    reason: str | None = None,
    ip_address: str | None = None,
) -> None:
    """Append one immutable row to superadmin_audit_log. Never updates/deletes
    (append-only at the DB role level, migration 0016)."""
    session.add(
        SuperAdminAuditLog(
            super_admin_id=super_admin_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            before_value=before,
            after_value=after,
            reason=reason,
            ip_address=ip_address,
        )
    )


# --------------------------------------------------------------------------- #
# Per-org stats (real counts, no fabrication)
# --------------------------------------------------------------------------- #
async def _org_stats(session: AsyncSession, org_id: uuid.UUID) -> dict:
    user_count = await session.scalar(
        select(func.count()).select_from(User).where(User.organization_id == org_id)
    )
    strategy_count = await session.scalar(
        select(func.count()).select_from(Strategy).where(Strategy.organization_id == org_id)
    )
    backtest_count = await session.scalar(
        select(func.count(func.distinct(TradeRecord.strategy_id))).where(
            TradeRecord.organization_id == org_id
        )
    )
    month_start = _now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    llm_cost = await session.scalar(
        select(func.coalesce(func.sum(LLMAuditLog.estimated_cost_usd), 0)).where(
            LLMAuditLog.organization_id == org_id,
            LLMAuditLog.created_at >= month_start,
        )
    )
    last_active = await session.scalar(
        select(func.max(User.last_login_at)).where(User.organization_id == org_id)
    )
    return {
        "user_count": int(user_count or 0),
        "strategy_count": int(strategy_count or 0),
        "backtest_count": int(backtest_count or 0),
        "llm_cost_this_month": float(llm_cost or 0),
        "last_active_at": last_active.isoformat() if last_active else None,
    }


def _org_summary(org: Organization, stats: dict) -> dict:
    return {
        "id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "status": org.status.value,
        "plan": org.tier.value,
        "monthly_revenue_usd": float(org.monthly_revenue_usd or 0),
        "created_at": org.created_at.isoformat() if org.created_at else None,
        **stats,
    }


# --------------------------------------------------------------------------- #
# Org management
# --------------------------------------------------------------------------- #
async def list_all_orgs(
    session: AsyncSession,
    *,
    super_admin_id: uuid.UUID,
    status_filter: str | None = None,
    plan_filter: str | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    stmt = select(Organization)
    if status_filter:
        stmt = stmt.where(Organization.status == OrganizationStatus(status_filter))
    if plan_filter:
        stmt = stmt.where(Organization.tier == OrganizationTier(plan_filter))
    if search:
        stmt = stmt.where(Organization.name.ilike(f"%{search}%"))

    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (
        await session.execute(
            stmt.order_by(Organization.created_at.desc()).limit(limit).offset(offset)
        )
    ).scalars().all()

    items = [_org_summary(org, await _org_stats(session, org.id)) for org in rows]
    await log_action(
        session,
        super_admin_id=super_admin_id,
        action="list_all_orgs",
        target_type="organization",
        after={"count": len(items), "filters": {"status": status_filter, "plan": plan_filter}},
    )
    await session.commit()
    return {"total": int(total or 0), "count": len(items), "items": items}


async def get_org_detail(
    session: AsyncSession, *, super_admin_id: uuid.UUID, org_id: uuid.UUID
) -> dict:
    org = await session.get(Organization, org_id)
    if org is None:
        raise SuperAdminError("Organization not found")
    users = (
        await session.execute(
            select(User).where(User.organization_id == org_id).order_by(User.created_at.asc())
        )
    ).scalars().all()
    detail = {
        **_org_summary(org, await _org_stats(session, org.id)),
        "onboarding_completed": org.onboarding_completed,
        "company_size": org.company_size,
        "aum_usd_millions": org.aum_usd_millions,
        "primary_asset_class": org.primary_asset_class,
        "internal_notes": org.internal_notes,
        "suspended_reason": org.suspended_reason,
        "users": [
            {
                "id": str(u.id),
                "email": u.email,
                "full_name": u.full_name,
                "role": u.role.value,
                "is_active": u.is_active,
                "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            }
            for u in users
        ],
    }
    await log_action(
        session,
        super_admin_id=super_admin_id,
        action="view_org_detail",
        target_type="organization",
        target_id=org_id,
    )
    await session.commit()
    return detail


def _sync_active_flag(org: Organization) -> None:
    """Keep the legacy is_active boolean consistent with status."""
    org.is_active = org.status == OrganizationStatus.ACTIVE


async def approve_org(
    session: AsyncSession,
    *,
    super_admin_id: uuid.UUID,
    org_id: uuid.UUID,
    plan: str | None = None,
    max_strategies: int | None = None,
    ip_address: str | None = None,
) -> Organization:
    org = await session.get(Organization, org_id)
    if org is None:
        raise SuperAdminError("Organization not found")
    before = {"status": org.status.value, "plan": org.tier.value}

    if plan:
        org.tier = OrganizationTier(plan)
        org.max_strategies = (
            max_strategies if max_strategies is not None else TIER_MAX_STRATEGIES[org.tier]
        )
    org.monthly_revenue_usd = PLAN_MONTHLY_USD.get(org.tier, Decimal("0"))
    org.status = OrganizationStatus.ACTIVE
    org.approved_by = super_admin_id
    org.approved_at = _now()
    org.onboarding_completed = True
    _sync_active_flag(org)

    await log_action(
        session,
        super_admin_id=super_admin_id,
        action="approve_org",
        target_type="organization",
        target_id=org_id,
        before=before,
        after={"status": org.status.value, "plan": org.tier.value},
        ip_address=ip_address,
    )
    await session.commit()
    await invalidate_org_status(org_id)
    admin_email = await _org_admin_email(session, org_id)
    if admin_email:
        await _notify(notifications.org_approved(company=org.name, admin_email=admin_email))
    return org


async def suspend_org(
    session: AsyncSession,
    *,
    super_admin_id: uuid.UUID,
    org_id: uuid.UUID,
    reason: str,
    ip_address: str | None = None,
) -> Organization:
    if not reason or not reason.strip():
        raise SuperAdminError("A reason is required to suspend an organization")
    org = await session.get(Organization, org_id)
    if org is None:
        raise SuperAdminError("Organization not found")
    before = {"status": org.status.value}

    org.status = OrganizationStatus.SUSPENDED
    org.suspended_by = super_admin_id
    org.suspended_at = _now()
    org.suspended_reason = reason.strip()
    _sync_active_flag(org)

    # Revoke every live refresh token in the org so no new access token can be
    # minted. Existing 15-min access tokens are stateless, but the org-status gate
    # (Redis, invalidated below) blocks them on their next request.
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.organization_id == org_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )

    await log_action(
        session,
        super_admin_id=super_admin_id,
        action="suspend_org",
        target_type="organization",
        target_id=org_id,
        before=before,
        after={"status": org.status.value},
        reason=reason,
        ip_address=ip_address,
    )
    await session.commit()
    await invalidate_org_status(org_id)
    admin_email = await _org_admin_email(session, org_id)
    if admin_email:
        await _notify(notifications.org_suspended(company=org.name, admin_email=admin_email, reason=reason.strip()))
    return org


async def reactivate_org(
    session: AsyncSession,
    *,
    super_admin_id: uuid.UUID,
    org_id: uuid.UUID,
    ip_address: str | None = None,
) -> Organization:
    org = await session.get(Organization, org_id)
    if org is None:
        raise SuperAdminError("Organization not found")
    before = {"status": org.status.value}
    org.status = OrganizationStatus.ACTIVE
    org.suspended_by = None
    org.suspended_at = None
    org.suspended_reason = None
    _sync_active_flag(org)
    await log_action(
        session,
        super_admin_id=super_admin_id,
        action="reactivate_org",
        target_type="organization",
        target_id=org_id,
        before=before,
        after={"status": org.status.value},
        ip_address=ip_address,
    )
    await session.commit()
    await invalidate_org_status(org_id)
    return org


async def terminate_org(
    session: AsyncSession,
    *,
    super_admin_id: uuid.UUID,
    org_id: uuid.UUID,
    reason: str,
    ip_address: str | None = None,
) -> Organization:
    if not reason or not reason.strip():
        raise SuperAdminError("A reason is required to terminate an organization")
    org = await session.get(Organization, org_id)
    if org is None:
        raise SuperAdminError("Organization not found")
    before = {"status": org.status.value}
    org.status = OrganizationStatus.TERMINATED
    org.terminated_at = _now()
    org.monthly_revenue_usd = Decimal("0")
    _sync_active_flag(org)
    # Revoke sessions too — a terminated org must be fully locked out.
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.organization_id == org_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )
    await log_action(
        session,
        super_admin_id=super_admin_id,
        action="terminate_org",
        target_type="organization",
        target_id=org_id,
        before=before,
        after={"status": org.status.value},
        reason=reason,
        ip_address=ip_address,
    )
    await session.commit()
    await invalidate_org_status(org_id)
    admin_email = await _org_admin_email(session, org_id)
    if admin_email:
        await _notify(notifications.org_terminated(company=org.name, admin_email=admin_email, reason=reason.strip()))
    # Stripe cancellation would go here when billing is keyed — no-op today (deferred
    # credential, same pattern as the rest of the billing surface).
    return org


async def update_org_limits(
    session: AsyncSession,
    *,
    super_admin_id: uuid.UUID,
    org_id: uuid.UUID,
    max_strategies: int | None = None,
    monthly_revenue_usd: float | None = None,
    ip_address: str | None = None,
) -> Organization:
    org = await session.get(Organization, org_id)
    if org is None:
        raise SuperAdminError("Organization not found")
    before = {
        "max_strategies": org.max_strategies,
        "monthly_revenue_usd": float(org.monthly_revenue_usd or 0),
    }
    if max_strategies is not None:
        org.max_strategies = max_strategies
    if monthly_revenue_usd is not None:
        org.monthly_revenue_usd = Decimal(str(monthly_revenue_usd))
    await log_action(
        session,
        super_admin_id=super_admin_id,
        action="update_org_limits",
        target_type="organization",
        target_id=org_id,
        before=before,
        after={
            "max_strategies": org.max_strategies,
            "monthly_revenue_usd": float(org.monthly_revenue_usd or 0),
        },
        ip_address=ip_address,
    )
    await session.commit()
    return org


async def add_internal_note(
    session: AsyncSession,
    *,
    super_admin_id: uuid.UUID,
    org_id: uuid.UUID,
    note: str,
) -> Organization:
    org = await session.get(Organization, org_id)
    if org is None:
        raise SuperAdminError("Organization not found")
    stamp = _now().strftime("%Y-%m-%d %H:%M UTC")
    line = f"[{stamp}] {note.strip()}"
    org.internal_notes = f"{org.internal_notes}\n{line}" if org.internal_notes else line
    await log_action(
        session,
        super_admin_id=super_admin_id,
        action="add_internal_note",
        target_type="organization",
        target_id=org_id,
    )
    await session.commit()
    return org


# --------------------------------------------------------------------------- #
# User management
# --------------------------------------------------------------------------- #
async def list_all_users(
    session: AsyncSession,
    *,
    super_admin_id: uuid.UUID,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    stmt = select(User, Organization).join(Organization, User.organization_id == Organization.id)
    if search:
        stmt = stmt.where(User.email.ilike(f"%{search}%"))
    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (
        await session.execute(stmt.order_by(User.created_at.desc()).limit(limit).offset(offset))
    ).all()
    items = [
        {
            "id": str(u.id),
            "email": u.email,
            "full_name": u.full_name,
            "company": org.name,
            "organization_id": str(org.id),
            "role": u.role.value,
            "is_active": u.is_active,
            "is_super_admin": u.is_super_admin,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
        }
        for (u, org) in rows
    ]
    await log_action(
        session, super_admin_id=super_admin_id, action="list_all_users", after={"count": len(items)}
    )
    await session.commit()
    return {"total": int(total or 0), "count": len(items), "items": items}


async def impersonate_user(
    session: AsyncSession,
    *,
    super_admin_id: uuid.UUID,
    target_user_id: uuid.UUID,
    reason: str,
    ip_address: str | None = None,
) -> dict:
    """Mint a 15-minute READ-ONLY impersonation token for a target user. Reason is
    REQUIRED; the action is logged. A superadmin cannot be impersonated."""
    if not reason or not reason.strip():
        raise SuperAdminError("A reason is required to impersonate a user")
    target = await session.get(User, target_user_id)
    if target is None:
        raise SuperAdminError("Target user not found")
    if target.is_super_admin:
        raise SuperAdminError("Cannot impersonate another superadmin")

    token = create_impersonation_token(
        target_user_id=target.id,
        organization_id=target.organization_id,
        role=target.role.value,
        impersonator_id=super_admin_id,
    )
    await log_action(
        session,
        super_admin_id=super_admin_id,
        action="impersonate_user",
        target_type="user",
        target_id=target_user_id,
        reason=reason,
        after={"organization_id": str(target.organization_id)},
        ip_address=ip_address,
    )
    await session.commit()
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in_minutes": 15,
        "read_only": True,
        "impersonating": {
            "user_id": str(target.id),
            "email": target.email,
            "organization_id": str(target.organization_id),
        },
    }


async def suspend_user(
    session: AsyncSession,
    *,
    super_admin_id: uuid.UUID,
    user_id: uuid.UUID,
    reason: str,
    ip_address: str | None = None,
) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise SuperAdminError("User not found")
    if user.is_super_admin:
        raise SuperAdminError("Cannot suspend a superadmin")
    before = {"is_active": user.is_active}
    user.is_active = False
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )
    await log_action(
        session,
        super_admin_id=super_admin_id,
        action="suspend_user",
        target_type="user",
        target_id=user_id,
        before=before,
        after={"is_active": False},
        reason=reason,
        ip_address=ip_address,
    )
    await session.commit()
    return user


async def force_password_reset(
    session: AsyncSession,
    *,
    super_admin_id: uuid.UUID,
    user_id: uuid.UUID,
    ip_address: str | None = None,
) -> None:
    """Invalidate the user's sessions, forcing re-auth. No email is sent — this
    deployment has no transactional email; the founder relays the reset link (or the
    user uses /auth/forgot-password)."""
    user = await session.get(User, user_id)
    if user is None:
        raise SuperAdminError("User not found")
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )
    await log_action(
        session,
        super_admin_id=super_admin_id,
        action="force_password_reset",
        target_type="user",
        target_id=user_id,
        ip_address=ip_address,
    )
    await session.commit()


# --------------------------------------------------------------------------- #
# Demo requests (review workflow)
# --------------------------------------------------------------------------- #
def _demo_summary(d: DemoRequest) -> dict:
    return {
        "id": str(d.id),
        "company": d.company,
        "contact_name": f"{d.first_name} {d.last_name}",
        "work_email": d.work_email,
        "job_title": d.job_title,
        "firm_type": d.firm_type.value,
        "team_size": d.team_size.value,
        "use_case": d.use_case_description,
        "status": d.status.value,
        "rejection_reason": d.rejection_reason,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


async def list_demo_requests(session: AsyncSession, *, super_admin_id: uuid.UUID) -> dict:
    rows = (
        await session.execute(select(DemoRequest).order_by(DemoRequest.created_at.desc()))
    ).scalars().all()
    pending = [_demo_summary(d) for d in rows if d.status == DemoRequestStatus.PENDING]
    reviewed = [_demo_summary(d) for d in rows if d.status != DemoRequestStatus.PENDING]
    await log_action(session, super_admin_id=super_admin_id, action="list_demo_requests")
    await session.commit()
    return {"pending": pending, "reviewed": reviewed}


async def approve_demo_request(
    session: AsyncSession,
    *,
    super_admin_id: uuid.UUID,
    request_id: uuid.UUID,
    plan: str = "starter",
    temp_password: str,
    ip_address: str | None = None,
) -> dict:
    """Convert a demo request into a live, ACTIVE org + admin user. Returns the
    created ids; the founder relays the temp password (no email infra)."""
    from app.services.auth import slugify

    demo = await session.get(DemoRequest, request_id)
    if demo is None:
        raise SuperAdminError("Demo request not found")
    if demo.status == DemoRequestStatus.CONVERTED:
        raise SuperAdminError("Demo request already converted")

    tier = OrganizationTier(plan)
    base_slug = slugify(demo.company)
    slug = base_slug
    suffix = 2
    while await session.scalar(select(Organization.id).where(Organization.slug == slug)):
        slug = f"{base_slug}-{suffix}"
        suffix += 1

    org = Organization(
        name=demo.company.strip(),
        slug=slug,
        tier=tier,
        max_strategies=TIER_MAX_STRATEGIES[tier],
        is_active=True,
        status=OrganizationStatus.ACTIVE,
        approved_by=super_admin_id,
        approved_at=_now(),
        onboarding_completed=True,
        monthly_revenue_usd=PLAN_MONTHLY_USD.get(tier, Decimal("0")),
    )
    session.add(org)
    await session.flush()

    admin = User(
        organization_id=org.id,
        email=demo.work_email.strip().lower(),
        hashed_password=hash_password(temp_password),
        full_name=f"{demo.first_name} {demo.last_name}",
        role=UserRole.ADMIN,
        is_active=True,
        # Batch 25: founder-provisioned, not self-registered — the mailbox is already
        # proven (the demo request came from it and the temp password is sent there),
        # so requiring a second verification would lock them out of an account we
        # just created for them. Same rule as an accepted invitation.
        email_verified=True,
    )
    session.add(admin)

    demo.status = DemoRequestStatus.CONVERTED
    demo.reviewed_by = super_admin_id
    demo.reviewed_at = _now()

    await log_action(
        session,
        super_admin_id=super_admin_id,
        action="approve_demo_request",
        target_type="demo_request",
        target_id=request_id,
        after={"organization_id": str(org.id), "plan": plan},
        ip_address=ip_address,
    )
    await session.commit()
    # Founder-channel only: this payload's body refers to "the temporary password
    # provided", which the founder relays out-of-band — emailing that text to the
    # client would point at a credential they never received. Instead the client
    # gets a real, actionable set-your-password link below, so the temp password
    # never has to travel by email at all.
    await _notify(
        notifications.org_provisioned(
            company=org.name, admin_email=admin.email, temp_password=temp_password
        ),
        email_client=False,
    )
    await request_password_reset(
        session, email=admin.email, organization_slug=org.slug
    )
    return {
        "organization_id": str(org.id),
        "organization_slug": org.slug,
        "admin_user_id": str(admin.id),
        "admin_email": admin.email,
    }


async def reject_demo_request(
    session: AsyncSession,
    *,
    super_admin_id: uuid.UUID,
    request_id: uuid.UUID,
    reason: str,
    ip_address: str | None = None,
) -> DemoRequest:
    demo = await session.get(DemoRequest, request_id)
    if demo is None:
        raise SuperAdminError("Demo request not found")
    demo.status = DemoRequestStatus.REJECTED
    demo.reviewed_by = super_admin_id
    demo.reviewed_at = _now()
    demo.rejection_reason = reason.strip() if reason else None
    await log_action(
        session,
        super_admin_id=super_admin_id,
        action="reject_demo_request",
        target_type="demo_request",
        target_id=request_id,
        reason=reason,
        ip_address=ip_address,
    )
    await session.commit()
    return demo


# --------------------------------------------------------------------------- #
# Platform analytics
# --------------------------------------------------------------------------- #
async def get_platform_stats(session: AsyncSession, *, super_admin_id: uuid.UUID) -> dict:
    status_rows = (
        await session.execute(
            select(Organization.status, func.count()).group_by(Organization.status)
        )
    ).all()
    orgs_by_status = {
        (s.value if hasattr(s, "value") else str(s)): int(n) for s, n in status_rows
    }
    total_users = await session.scalar(select(func.count()).select_from(User))
    total_strategies = await session.scalar(select(func.count()).select_from(Strategy))
    total_backtests = await session.scalar(
        select(func.count(func.distinct(TradeRecord.strategy_id)))
    )
    total_llm_calls = await session.scalar(select(func.count()).select_from(LLMAuditLog))
    total_llm_cost = await session.scalar(
        select(func.coalesce(func.sum(LLMAuditLog.estimated_cost_usd), 0))
    )
    mrr = await session.scalar(
        select(func.coalesce(func.sum(Organization.monthly_revenue_usd), 0)).where(
            Organization.status == OrganizationStatus.ACTIVE
        )
    )
    today = _now().replace(hour=0, minute=0, second=0, microsecond=0)
    thirty_days_ago = today.fromordinal(today.toordinal() - 30)
    new_orgs_30d = await session.scalar(
        select(func.count()).select_from(Organization).where(
            Organization.created_at >= thirty_days_ago
        )
    )
    await log_action(session, super_admin_id=super_admin_id, action="get_platform_stats")
    await session.commit()
    return {
        "orgs_by_status": orgs_by_status,
        "total_orgs": sum(orgs_by_status.values()),
        "total_users": int(total_users or 0),
        "total_strategies": int(total_strategies or 0),
        "total_backtests": int(total_backtests or 0),
        "total_llm_calls": int(total_llm_calls or 0),
        "total_llm_cost_usd": float(total_llm_cost or 0),
        "mrr_usd": float(mrr or 0),
        "mrr_is_list_price": True,
        "new_orgs_30d": int(new_orgs_30d or 0),
    }


async def get_usage_by_org(session: AsyncSession, *, super_admin_id: uuid.UUID) -> dict:
    """Per-org LLM usage/cost, highest first — the margin check."""
    month_start = _now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    rows = (
        await session.execute(
            select(
                Organization.id,
                Organization.name,
                Organization.tier,
                Organization.monthly_revenue_usd,
                func.coalesce(func.sum(LLMAuditLog.estimated_cost_usd), 0).label("llm_cost"),
            )
            .outerjoin(
                LLMAuditLog,
                (LLMAuditLog.organization_id == Organization.id)
                & (LLMAuditLog.created_at >= month_start),
            )
            .group_by(
                Organization.id,
                Organization.name,
                Organization.tier,
                Organization.monthly_revenue_usd,
            )
            .order_by(func.coalesce(func.sum(LLMAuditLog.estimated_cost_usd), 0).desc())
        )
    ).all()
    items = [
        {
            "organization_id": str(oid),
            "name": name,
            "plan": tier.value if hasattr(tier, "value") else str(tier),
            "monthly_revenue_usd": float(rev or 0),
            "llm_cost_this_month": float(cost or 0),
        }
        for (oid, name, tier, rev, cost) in rows
    ]
    await log_action(session, super_admin_id=super_admin_id, action="get_usage_by_org")
    await session.commit()
    return {"items": items}


async def get_revenue_breakdown(session: AsyncSession, *, super_admin_id: uuid.UUID) -> dict:
    """List-price MRR per plan from ACTIVE orgs (not billed revenue)."""
    rows = (
        await session.execute(
            select(
                Organization.tier,
                func.count(),
                func.coalesce(func.sum(Organization.monthly_revenue_usd), 0),
            )
            .where(Organization.status == OrganizationStatus.ACTIVE)
            .group_by(Organization.tier)
        )
    ).all()
    by_plan = [
        {
            "plan": tier.value if hasattr(tier, "value") else str(tier),
            "org_count": int(n),
            "mrr_usd": float(mrr or 0),
        }
        for (tier, n, mrr) in rows
    ]
    await log_action(session, super_admin_id=super_admin_id, action="get_revenue_breakdown")
    await session.commit()
    return {"by_plan": by_plan, "mrr_is_list_price": True}
