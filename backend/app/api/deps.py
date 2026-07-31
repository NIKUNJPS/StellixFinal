"""FastAPI dependencies: DB sessions, JWT auth, and RBAC.

- ``get_system_db``  — unscoped session for pre-auth flows (register/login/refresh).
- ``get_tenant_db``  — session auto-bound to the caller's organization (from the JWT).
- ``get_current_user`` — the authenticated ``User`` (loaded tenant-scoped).
- ``require_role(*roles)`` — dependency factory gating a route by RBAC role.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import structlog
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import API_KEY_PREFIX, TokenError, decode_access_token
from app.db.session import SessionFactory
from app.db.tenant import bind_organization, mark_session_unscoped
from app.models.user import User, UserRole
from app.services.auth import get_user_in_organization

# tokenUrl is documentation metadata for the docs "Authorize" button; login itself
# accepts JSON (see ADR 0003). auto_error=False so we can raise a consistent 401.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)

_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


# --------------------------------------------------------------------------- #
# DB sessions
# --------------------------------------------------------------------------- #
async def get_system_db() -> AsyncIterator[AsyncSession]:
    """Unscoped session for pre-auth flows. Services manage their own commits."""
    async with SessionFactory() as session:
        mark_session_unscoped(session.sync_session)
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
async def get_token_payload(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    """Accepts either a JWT (existing behavior) or, if the bearer value starts
    with the API-key prefix (Batch 12), an API key — translated into the
    exact same {"sub", "org"} payload shape a JWT produces, so every
    downstream dependency (get_tenant_db, get_current_user, require_role) is
    completely unaware of which auth method was used. `scopes`/`auth_method`
    are extra keys only an API-key-authenticated payload carries; see
    require_scope() below."""
    if not token:
        raise _UNAUTHENTICATED

    if token.startswith(API_KEY_PREFIX):
        from app.services.api_key import ApiKeyInvalid, authenticate_api_key

        try:
            user_id, organization_id, scopes = await authenticate_api_key(db, raw_key=token)
        except ApiKeyInvalid as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid, expired, or revoked API key",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc
        return {
            "sub": str(user_id),
            "org": str(organization_id),
            "auth_method": "api_key",
            "scopes": scopes,
        }

    try:
        payload = decode_access_token(token)
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    if "sub" not in payload or "org" not in payload:
        raise _UNAUTHENTICATED
    payload.setdefault("auth_method", "jwt")
    return payload


async def get_tenant_db(
    payload: dict = Depends(get_token_payload),
) -> AsyncIterator[AsyncSession]:
    """Session bound to the caller's organization — every ORM query auto-scopes."""
    organization_id = uuid.UUID(payload["org"])
    # Batch 13: earliest point organization_id is known for this request — bind
    # it so every subsequent log line (this request, and any Celery task it
    # enqueues) is attributable to a tenant without threading it through every
    # function signature.
    structlog.contextvars.bind_contextvars(organization_id=str(organization_id))
    async with SessionFactory() as session:
        bind_organization(session.sync_session, organization_id)
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


_SUPPORT_CONTACT = "support@stellixlabs.com"


async def _enforce_org_status(db: AsyncSession, user: User) -> None:
    """Batch 24: the client-side org-status gate.

    Runs for every authenticated client request (get_current_user is used by
    virtually every client route), so a suspension/termination locks the whole
    tenant out of the API, not route-by-route. Superadmins are exempt — the
    founder's internal access must never depend on org lifecycle. Status is
    Redis-cached (60s); see app/services/org_status.py.
    """
    if user.is_super_admin:
        return

    from app.models.organization import OrganizationStatus
    from app.services.org_status import get_org_status

    status_value = await get_org_status(db, user.organization_id)
    if status_value == OrganizationStatus.ACTIVE or status_value is None:
        # None => org row unreadable; fall through rather than hard-fail on a
        # transient. The user was already loaded from a valid org, so this is an
        # edge case, not a bypass.
        return
    if status_value == OrganizationStatus.SUSPENDED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "ORG_SUSPENDED",
                "message": "Your organization's access has been suspended.",
                "contact": _SUPPORT_CONTACT,
            },
        )
    if status_value == OrganizationStatus.TERMINATED:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "ORG_TERMINATED",
                "message": "Your organization's account has been terminated.",
                "contact": _SUPPORT_CONTACT,
            },
        )
    # PENDING_APPROVAL (or any unknown non-active state) — not yet approved.
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "ORG_PENDING",
            "message": "Your organization is pending approval.",
            "contact": _SUPPORT_CONTACT,
        },
    )


_WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


async def get_current_user(
    request: Request,
    payload: dict = Depends(get_token_payload),
    db: AsyncSession = Depends(get_tenant_db),
) -> User:
    user_id = uuid.UUID(payload["sub"])
    user = await get_user_in_organization(db, user_id=user_id)
    if user is None or not user.is_active:
        raise _UNAUTHENTICATED
    structlog.contextvars.bind_contextvars(user_id=str(user.id))

    # Impersonation is READ-ONLY (Batch 24): the founder can debug a client's view
    # but never mutate their state. Enforced globally here (every authenticated
    # client route flows through get_current_user) by rejecting write methods under
    # an impersonation token, rather than annotating dozens of mutation endpoints.
    if payload.get("impersonation") and request.method in _WRITE_METHODS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Impersonation sessions are read-only; state changes are not permitted.",
        )

    await _enforce_org_status(db, user)
    return user


def require_role(*roles: UserRole | str):
    """Dependency factory: allow only the given RBAC roles, else 403."""
    allowed = {r.value if isinstance(r, UserRole) else r for r in roles}

    async def _checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.value not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return current_user

    return _checker


async def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    """Gate for /superadmin/* — the founder's cross-tenant control plane (Batch 24).

    Deliberately NOT part of the RBAC role system: is_super_admin is a platform-wide
    capability, orthogonal to a user's within-tenant role. get_current_user exempts
    superadmins from the org-status gate, so the founder's console keeps working
    regardless of any org's lifecycle state.

    This guard only gates. Meaningful actions and cross-org data reads are logged to
    superadmin_audit_log at the SERVICE layer (app/services/superadmin.py) — logging
    a row on every authenticated GET (including list refreshes) would be a write per
    request and drown the real signal; SOC 2's requirement is that cross-org *data
    access* be recorded, which the service does.
    """
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="SuperAdmin access required",
        )
    return current_user


def require_scope(scope: str):
    """Dependency factory (Batch 12): for API-key-authenticated requests, the
    key must carry ``scope``. JWT-authenticated (human) requests pass through
    unconditionally — a human's RBAC role already governs what they can do;
    scopes exist to bound what a PROGRAMMATIC credential can do, not to layer
    a second permission system on top of interactive users."""

    async def _checker(payload: dict = Depends(get_token_payload)) -> None:
        if payload.get("auth_method") != "api_key":
            return
        if scope not in (payload.get("scopes") or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This API key does not have the '{scope}' scope",
            )

    return _checker
