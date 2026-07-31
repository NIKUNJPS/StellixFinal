"""Org-status enforcement (Batch 24) — the client-side security gate.

Every authenticated client request resolves its org's lifecycle status here. A
suspended/terminated/pending org is locked out of the ENTIRE client API, not
route-by-route: the check lives inside ``get_current_user`` (app/api/deps.py), so
it applies wherever authentication does.

Cached in Redis (60s TTL) so it is not a DB hit per request. The cache is
invalidated the instant the founder changes an org's status (approve/suspend/
reactivate/terminate — see app/services/superadmin.py), so a suspension takes
effect immediately for new requests and within 60s for everything else.

Key is namespaced by org id, consistent with the rest of the Redis usage.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients import redis_client
from app.models.organization import Organization, OrganizationStatus

_KEY_PREFIX = "org:status:"
_TTL_SECONDS = 60


def _key(org_id: uuid.UUID | str) -> str:
    return f"{_KEY_PREFIX}{org_id}"


async def get_org_status(session: AsyncSession, org_id: uuid.UUID) -> OrganizationStatus | None:
    """The org's current lifecycle status, Redis-cached (60s). None if the org does
    not exist. Organization is not a TenantScopedModel, so this read is not
    org-filtered and works on any session.

    Redis is best-effort: if it is unreachable the check falls straight through to
    the DB rather than failing the request (a monitoring outage must not lock every
    tenant out). The authoritative value is always Postgres.
    """
    try:
        cached = await redis_client.get_client().get(_key(org_id))
        if cached is not None:
            return OrganizationStatus(cached)
    except Exception:  # noqa: BLE001 — cache miss/outage falls through to the DB
        cached = None

    status = (
        await session.execute(
            select(Organization.status).where(Organization.id == org_id)
        )
    ).scalar_one_or_none()
    if status is None:
        return None

    value = status.value if isinstance(status, OrganizationStatus) else str(status)
    try:
        await redis_client.get_client().set(_key(org_id), value, ex=_TTL_SECONDS)
    except Exception:  # noqa: BLE001 — failing to warm the cache is non-fatal
        pass
    return OrganizationStatus(value)


async def invalidate_org_status(org_id: uuid.UUID) -> None:
    """Drop the cached status so the next request re-reads Postgres. Called by every
    superadmin status transition. Best-effort — on a Redis outage the 60s TTL is the
    fallback bound."""
    try:
        await redis_client.get_client().delete(_key(org_id))
    except Exception:  # noqa: BLE001
        pass
