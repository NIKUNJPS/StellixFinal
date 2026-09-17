"""Governance audit logging (Batch 10) — org-wide, append-only, distinct from
Batch 9's LLM-specific audit log. Every state-changing endpoint hooked in this
batch calls ``write_audit_log`` as part of its own transaction.

Batch 25: every row snapshots the acting user's email, display name and role *at the
time of the action*, plus the target's name and a plain-English description. Pass the
``actor`` (a loaded ``User``) whenever one is at hand; when only ``actor_user_id`` is
known (e.g. inside a Celery task) the user is loaded here, so no caller can end up
writing an anonymous row for an action a real person took.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditEventType, AuditLog
from app.models.user import User

# Plain-English verb phrase per event type — used when the caller supplies no
# description of its own, so the audit trail always reads as a sentence.
_EVENT_PHRASES: dict[AuditEventType, str] = {
    AuditEventType.LOGIN: "signed in",
    AuditEventType.LOGOUT: "signed out",
    AuditEventType.FAILED_LOGIN: "failed a sign-in attempt",
    AuditEventType.STRATEGY_CREATED: "created strategy",
    AuditEventType.STRATEGY_VERSION_SAVED: "saved a new version of strategy",
    AuditEventType.STRATEGY_DELETED: "deleted draft strategy",
    AuditEventType.STRATEGY_STATUS_CHANGE: "changed the status of strategy",
    AuditEventType.STRATEGY_APPROVED: "approved strategy",
    AuditEventType.STRATEGY_REJECTED: "rejected strategy",
    AuditEventType.EVOLUTION_CANDIDATE_APPROVED: "approved evolved candidate",
    AuditEventType.KILL_SWITCH_ACTIVATED: "activated the kill switch on strategy",
    AuditEventType.KILL_SWITCH_REVIEWED: "reviewed the kill switch on strategy",
    AuditEventType.DATA_EXPORT: "requested a compliance export",
    AuditEventType.USER_ROLE_CHANGED: "changed the role of",
    AuditEventType.LLM_EXPLANATION_GENERATED: "generated an AI failure explanation for",
    AuditEventType.ROLE_CREATED: "created role",
    AuditEventType.ROLE_UPDATED: "updated role",
    AuditEventType.ROLE_DELETED: "deleted role",
    AuditEventType.ROLE_PERMISSIONS_CHANGED: "changed the permissions of role",
}


def describe_event(
    event_type: AuditEventType,
    *,
    actor_label: str | None,
    entity_name: str | None,
    before_state: dict | None = None,
    after_state: dict | None = None,
) -> str:
    """Build a readable one-line description, e.g.
    ``"s.okonkwo@meridian.com activated the kill switch on strategy 'SPY Momentum' (active → retired)"``."""
    subject = actor_label or "System"
    phrase = _EVENT_PHRASES.get(event_type, event_type.value.replace("_", " "))
    text = f"{subject} {phrase}"
    if entity_name:
        text += f" '{entity_name}'"
    before_status = (before_state or {}).get("status")
    after_status = (after_state or {}).get("status")
    if before_status and after_status and before_status != after_status:
        text += f" ({before_status} → {after_status})"
    return text


async def write_audit_log(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    actor_user_id: uuid.UUID | None = None,
    event_type: AuditEventType,
    entity_type: str,
    entity_id: uuid.UUID,
    before_state: dict | None = None,
    after_state: dict | None = None,
    justification: str | None = None,
    ip_address: str | None = None,
    actor: User | None = None,
    entity_name: str | None = None,
    description: str | None = None,
) -> AuditLog:
    if actor is None and actor_user_id is not None:
        actor = await session.get(User, actor_user_id)
    if actor is not None:
        actor_user_id = actor.id

    actor_email = actor.email if actor is not None else None
    actor_name = actor.full_name if actor is not None else None
    actor_role = None
    if actor is not None:
        # Batch 26: the role that actually granted the action — a custom role's name,
        # or the system role key (unchanged values for the five original roles).
        from app.services.rbac import get_effective_role

        role = await get_effective_role(session, actor)
        actor_role = (role.system_key or role.name)[:100] if role is not None else actor.role.value

    entry = AuditLog(
        organization_id=organization_id,
        actor_user_id=actor_user_id,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        before_state=before_state,
        after_state=after_state,
        justification=justification,
        ip_address=ip_address,
        actor_email=actor_email,
        actor_name=actor_name,
        actor_role=actor_role,
        entity_name=entity_name,
        description=description
        or describe_event(
            event_type,
            actor_label=actor_name or actor_email,
            entity_name=entity_name,
            before_state=before_state,
            after_state=after_state,
        ),
    )
    session.add(entry)
    await session.flush()
    return entry
