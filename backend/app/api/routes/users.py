"""User endpoints.

Batch 1: a single admin-only, tenant-scoped lookup by id (the RBAC/tenant-
isolation test target). Batch 12 adds the current user's OWN settings
(profile, password, sessions, preferences, avatar) under /users/me/* —
these MUST be registered before /{user_id} below, or FastAPI would try to
parse "me" as a UUID path param and 422 instead of matching the intended route.
"""

from __future__ import annotations

import uuid
from datetime import UTC
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_tenant_db, require_role
from app.core.config import settings
from app.models.organization import Organization
from app.models.refresh_token import RefreshToken
from app.models.user import User, UserRole
from app.schemas.invitation import (
    InvitationCreate,
    InvitationListResponse,
    InvitationRead,
)
from app.schemas.user import UserRead
from app.schemas.user_settings import (
    ChangePasswordRequest,
    PreferencesUpdateRequest,
    SessionListResponse,
    SessionRead,
    UpdateProfileRequest,
)
from app.services import auth as auth_service
from app.services import invitation as invitation_service

router = APIRouter(prefix="/users", tags=["Users"])

_AVATAR_MAX_BYTES = 2 * 1024 * 1024  # 2MB
_AVATAR_ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}


@router.get("/me", response_model=UserRead, summary="Current user's own profile")
async def get_my_profile(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.patch("/me", response_model=UserRead, summary="Update the current user's profile")
async def update_my_profile(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> User:
    if payload.full_name is not None:
        current_user.full_name = payload.full_name
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post(
    "/me/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change the current user's password (requires the current password)",
)
async def change_my_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> None:
    try:
        await auth_service.change_password(
            db,
            user=current_user,
            current_password=payload.current_password,
            new_password=payload.new_password,
        )
    except auth_service.InvalidCredentialsError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect"
        ) from exc


@router.get(
    "/me/sessions",
    response_model=SessionListResponse,
    summary="List the current user's active/past refresh-token sessions",
)
async def list_my_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> SessionListResponse:
    rows = (
        await db.execute(
            select(RefreshToken)
            .where(RefreshToken.user_id == current_user.id)
            .order_by(RefreshToken.created_at.desc())
        )
    ).scalars().all()
    return SessionListResponse(total=len(rows), items=[SessionRead.model_validate(r) for r in rows])


@router.post(
    "/me/sessions/{session_id}/revoke",
    response_model=SessionRead,
    summary="Revoke one of the current user's sessions",
)
async def revoke_my_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> RefreshToken:
    record = (
        await db.execute(
            select(RefreshToken)
            .where(RefreshToken.id == session_id)
            .where(RefreshToken.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if record.revoked_at is None:
        from datetime import datetime

        record.revoked_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(record)
    return record


@router.patch(
    "/me/preferences",
    response_model=UserRead,
    summary="Update default filters/date-range and notification toggles",
)
async def update_my_preferences(
    payload: PreferencesUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> User:
    prefs = dict(current_user.preferences or {})
    if payload.default_regime_filter is not None:
        prefs["default_regime_filter"] = payload.default_regime_filter
    if payload.default_date_range_days is not None:
        prefs["default_date_range_days"] = payload.default_date_range_days
    if payload.notifications is not None:
        prefs["notifications"] = {**prefs.get("notifications", {}), **payload.notifications}
    current_user.preferences = prefs
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post(
    "/me/avatar",
    response_model=UserRead,
    summary="Upload a profile avatar (local disk in dev — swap for S3/MinIO in production)",
)
async def upload_my_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> User:
    if file.content_type not in _AVATAR_ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported image type {file.content_type!r}; expected one of {sorted(_AVATAR_ALLOWED_CONTENT_TYPES)}",
        )
    body = await file.read(_AVATAR_MAX_BYTES + 1)
    if len(body) > _AVATAR_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Avatar exceeds the {_AVATAR_MAX_BYTES // (1024 * 1024)}MB limit",
        )

    ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}[file.content_type]
    avatar_dir = Path(settings.AVATAR_UPLOAD_DIR)
    avatar_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{current_user.id}.{ext}"
    (avatar_dir / filename).write_bytes(body)

    current_user.avatar_url = f"/users/me/avatar/{filename}"
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.get("/me/avatar/{filename}", summary="Serve an uploaded avatar (dev-local-disk)")
async def get_avatar(filename: str):
    from fastapi.responses import FileResponse

    # Guard against path traversal — the filename we generate is always
    # "<uuid>.<ext>", so reject anything that isn't that exact shape.
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filename")
    path = Path(settings.AVATAR_UPLOAD_DIR) / safe_name
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found")
    return FileResponse(path)


# --------------------------------------------------------------------------- #
# Team invitations (Batch 25). Admin-only, tenant-scoped. Registered BEFORE the
# /{user_id} route below for the same reason /me/* is: otherwise FastAPI matches
# "invitations" as a user_id path param and 422s.
# --------------------------------------------------------------------------- #
@router.post(
    "/invitations",
    response_model=InvitationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Invite a colleague into your organization (admin only)",
)
async def create_invitation(
    payload: InvitationCreate,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_tenant_db),
) -> InvitationRead:
    try:
        invitation, raw_token = await invitation_service.create_invitation(
            db,
            organization_id=admin.organization_id,
            email=payload.email,
            role=payload.role,
            invited_by=admin,
        )
    except invitation_service.AlreadyMemberError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email already belongs to a member of this organization",
        ) from exc

    organization = await db.get(Organization, admin.organization_id)
    await invitation_service.send_invitation_email(
        invitation,
        raw_token,
        company=organization.name if organization else "your organization",
        inviter=admin,
    )
    return InvitationRead.model_validate(invitation).model_copy(
        update={"dev_invite_link": invitation_service.expose_dev_link(raw_token)}
    )


@router.get(
    "/invitations",
    response_model=InvitationListResponse,
    summary="List this organization's invitations (admin only)",
)
async def list_invitations(
    _admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_tenant_db),
) -> InvitationListResponse:
    invitations = await invitation_service.list_invitations(db)
    return InvitationListResponse(
        items=[InvitationRead.model_validate(i) for i in invitations]
    )


@router.delete(
    "/invitations/{invitation_id}",
    response_model=InvitationRead,
    summary="Revoke a pending invitation (admin only)",
)
async def revoke_invitation(
    invitation_id: uuid.UUID,
    _admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_tenant_db),
) -> InvitationRead:
    try:
        invitation = await invitation_service.revoke_invitation(
            db, invitation_id=invitation_id
        )
    except invitation_service.InvalidInvitationError as exc:
        # A different org's invitation is simply not visible through the scoped
        # session, so it collapses to the same 404 as a nonexistent one.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found"
        ) from exc
    return InvitationRead.model_validate(invitation)


@router.get(
    "/{user_id}",
    response_model=UserRead,
    summary="Fetch a user by id (admin only, tenant-scoped)",
)
async def get_user(
    user_id: uuid.UUID,
    _admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_tenant_db),
) -> User:
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        # Either no such user, or the user belongs to a different organization.
        # Both collapse to 404 so existence in other tenants is not observable.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user
