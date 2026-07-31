"""Governance audit logging (Batch 10) — org-wide, append-only, distinct from
Batch 9's LLM-specific audit log. Every state-changing endpoint hooked in this
batch calls ``write_audit_log`` as part of its own transaction.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditEventType, AuditLog


async def write_audit_log(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    actor_user_id: uuid.UUID | None,
    event_type: AuditEventType,
    entity_type: str,
    entity_id: uuid.UUID,
    before_state: dict | None = None,
    after_state: dict | None = None,
    justification: str | None = None,
    ip_address: str | None = None,
) -> AuditLog:
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
    )
    session.add(entry)
    await session.flush()
    return entry
