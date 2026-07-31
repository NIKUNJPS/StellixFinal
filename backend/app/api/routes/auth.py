"""Auth endpoints: register, login, refresh, logout, me.

Refresh tokens are delivered as an httpOnly, path-scoped cookie (never readable by
JS — XSS defense). The access token (15 min) is returned in the response body for
in-memory client storage. A ``refresh_token`` body field is accepted as a fallback
for non-browser clients (curl/Postman). See ADR 0003.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_system_db, get_tenant_db
from app.core.config import settings
from app.core.rate_limit import (
    global_rate_limiter,
    login_account_rate_limiter,
    login_rate_limiter,
    register_rate_limiter,
)
from app.core.security import (
    TokenError,
    create_access_token,
    create_mfa_challenge_token,
    decode_mfa_challenge_token,
)
from app.models.organization import Organization, OrganizationStatus
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    MfaChallengeResponse,
    MfaEnrollResponse,
    MfaLoginRequest,
    MfaVerifyRequest,
    RefreshRequest,
    RegisterRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    TokenResponse,
    VerificationResponse,
    VerifyEmailRequest,
)
from app.schemas.invitation import AcceptInvitationRequest, AcceptInvitationResponse
from app.schemas.user import MeResponse, UserRead
from app.services import auth as auth_service
from app.services import email_verification as verification_service
from app.services import invitation as invitation_service
from app.services import mfa as mfa_service
from app.services import notifications
from app.services import password_reset as password_reset_service
from app.services.webhook import post_webhook

_REMEMBER_ME_DAYS = settings.REFRESH_TOKEN_EXPIRE_DAYS  # checked: current 7-day default
_NOT_REMEMBERED_DAYS = 1  # unchecked: session effectively ends after a day

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _set_refresh_cookie(response: Response, raw_token: str, *, expire_days: int | None = None) -> None:
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=raw_token,
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
        max_age=(expire_days or settings.REFRESH_TOKEN_EXPIRE_DAYS) * 24 * 60 * 60,
        path="/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=settings.REFRESH_COOKIE_NAME, path="/auth")


def _access_token_for(user: User) -> TokenResponse:
    token = create_access_token(
        user_id=user.id, organization_id=user.organization_id, role=user.role.value
    )
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


def _read_refresh_token(request: Request, body: RefreshRequest | None) -> str:
    raw = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not raw and body is not None:
        raw = body.refresh_token
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token"
        )
    return raw


@router.post(
    "/register",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(register_rate_limiter)],
    summary="Register a new organization (pending founder approval)",
)
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_system_db),
) -> dict:
    """Self-registration does not log you straight in: the organization is created in a
    pending-approval state and activated by our team; no JWT/refresh token is issued
    here. Returns 202 Accepted. (This docstring is the public /auth/register description.)"""
    try:
        _user, organization = await auth_service.register_organization_and_admin(
            db,
            organization_name=payload.organization_name,
            organization_slug=payload.organization_slug,
            email=payload.email,
            password=payload.password,
            full_name=payload.full_name,
        )
    except auth_service.EmailAlreadyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists in this organization",
        ) from exc
    except auth_service.SlugAlreadyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An organization with this name/slug already exists",
        ) from exc

    # Notify the founder a new registration is waiting (best-effort, same webhook
    # channel the public demo form uses).
    await post_webhook(
        settings.DEMO_WEBHOOK_URL,
        notifications.registration_received(company=organization.name, email=payload.email),
    )

    # Batch 25: prove the registrant controls this mailbox. Best-effort — a mail
    # failure must not undo a registration that already committed, so the token is
    # always minted and /auth/resend-verification can send it again.
    raw_verification = await verification_service.issue_and_send(db, user=_user)
    body: dict = {
        "status": "pending_approval",
        "message": (
            "Registration received. Check your email to confirm your address — "
            "your account will be approved within 24 hours."
        ),
    }
    if not settings.is_production and not settings.email_enabled:
        # No mail server in dev: hand back the link so the flow is still walkable.
        body["dev_verification_link"] = verification_service.build_verification_link(
            raw_verification
        )
    return body


@router.post(
    "/login",
    response_model=TokenResponse | MfaChallengeResponse,
    dependencies=[Depends(login_rate_limiter), Depends(login_account_rate_limiter)],
    summary="Authenticate and receive access + refresh tokens (or an MFA challenge)",
)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_system_db),
) -> TokenResponse | MfaChallengeResponse:
    try:
        user = await auth_service.authenticate(
            db,
            email=payload.email,
            password=payload.password,
            organization_slug=payload.organization_slug,
            ip_address=request.client.host if request.client else None,
        )
    except auth_service.AccountLockedError as exc:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account temporarily locked due to repeated failed logins",
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc
    except auth_service.OrganizationSlugRequiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email belongs to multiple organizations; organization_slug is required",
        ) from exc
    except auth_service.InactiveAccountError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled"
        ) from exc
    except auth_service.InvalidCredentialsError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        ) from exc

    # Batch 24: valid credentials are not enough — the org must be ACTIVE. A
    # superadmin (internal Stellix account) is exempt so the founder can always log
    # in. This mirrors the per-request org-status gate (app/api/deps.py) at the
    # login boundary, so a pending/suspended/terminated org can't even get a token.
    if not user.is_super_admin:
        org_status = await auth_service.get_org_status_for_login(db, user.organization_id)
        if org_status == OrganizationStatus.PENDING_APPROVAL:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your organization is pending approval.",
            )
        if org_status == OrganizationStatus.SUSPENDED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your organization's access has been suspended.",
            )
        if org_status == OrganizationStatus.TERMINATED:
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="Your organization's account has been terminated.",
            )

        # Batch 25: the mailbox must be confirmed. Checked *after* the org gate on
        # purpose — redeeming a verification link needs no session, so a pending or
        # terminated org's more relevant message wins. Superadmins are exempt for
        # the same reason as above: the founder must always be able to log in.
        if not user.email_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "EMAIL_NOT_VERIFIED",
                    "message": (
                        "Confirm your email address to sign in. "
                        "Check your inbox for the verification link."
                    ),
                    "email": user.email,
                },
            )

    # Batch 12: the password check succeeding is not enough to issue real
    # tokens for an mfa_enabled account — a short-lived challenge token stands
    # in until POST /auth/mfa/login supplies a valid TOTP code.
    if user.mfa_enabled:
        return MfaChallengeResponse(challenge_token=create_mfa_challenge_token(user_id=user.id))

    expire_days = _REMEMBER_ME_DAYS if payload.remember_me else _NOT_REMEMBERED_DAYS
    raw_refresh = await auth_service.issue_refresh_token(
        db, user=user, device_info=request.headers.get("user-agent"), expire_days=expire_days
    )
    _set_refresh_cookie(response, raw_refresh, expire_days=expire_days)
    return _access_token_for(user)


@router.post("/refresh", response_model=TokenResponse, summary="Rotate refresh token")
async def refresh(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
    db: AsyncSession = Depends(get_system_db),
) -> TokenResponse:
    raw = _read_refresh_token(request, body)
    try:
        user, new_raw = await auth_service.rotate_refresh_token(
            db, raw_token=raw, device_info=request.headers.get("user-agent")
        )
    except auth_service.InvalidTokenError as exc:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        ) from exc

    _set_refresh_cookie(response, new_raw)
    return _access_token_for(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Revoke refresh token")
async def logout(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
    db: AsyncSession = Depends(get_system_db),
) -> Response:
    raw = request.cookies.get(settings.REFRESH_COOKIE_NAME) or (
        body.refresh_token if body else None
    )
    if raw:
        await auth_service.revoke_refresh_token(db, raw_token=raw)
    _clear_refresh_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=MeResponse, summary="Current user and organization")
async def me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> MeResponse:
    organization = (
        await db.execute(
            select(Organization).where(Organization.id == current_user.organization_id)
        )
    ).scalar_one()
    return MeResponse(
        user=UserRead.model_validate(current_user),
        organization=organization,
    )


# --------------------------------------------------------------------------- #
# MFA (Batch 12) — enrollment is authenticated (JWT); the login-time challenge
# below is necessarily pre-auth. auth.router is excluded from the global
# per-user limiter (it's pre-auth login/register), but enroll/verify/disable
# ARE normal authenticated actions, so they opt back in explicitly.
# --------------------------------------------------------------------------- #
@router.post(
    "/mfa/enroll",
    response_model=MfaEnrollResponse,
    dependencies=[Depends(global_rate_limiter)],
    summary="Begin TOTP MFA enrollment (does not enable MFA until /mfa/verify)",
)
async def mfa_enroll(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> MfaEnrollResponse:
    secret = mfa_service.generate_totp_secret()
    current_user.totp_secret = secret
    await db.commit()
    return MfaEnrollResponse(
        secret=secret,
        provisioning_uri=mfa_service.get_provisioning_uri(
            secret=secret, account_email=current_user.email
        ),
    )


@router.post(
    "/mfa/verify",
    response_model=MeResponse,
    dependencies=[Depends(global_rate_limiter)],
    summary="Complete TOTP MFA enrollment with a code from the authenticator app",
)
async def mfa_verify(
    payload: MfaVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> MeResponse:
    if not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No MFA enrollment in progress — call POST /auth/mfa/enroll first",
        )
    if not mfa_service.verify_totp_code(secret=current_user.totp_secret, code=payload.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid code")

    current_user.mfa_enabled = True
    await db.commit()
    await db.refresh(current_user)
    organization = (
        await db.execute(
            select(Organization).where(Organization.id == current_user.organization_id)
        )
    ).scalar_one()
    return MeResponse(user=UserRead.model_validate(current_user), organization=organization)


@router.post(
    "/mfa/disable",
    response_model=MeResponse,
    dependencies=[Depends(global_rate_limiter)],
    summary="Disable MFA (requires a currently-valid code, not just a password)",
)
async def mfa_disable(
    payload: MfaVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> MeResponse:
    if not current_user.mfa_enabled or not current_user.totp_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA is not enabled")
    if not mfa_service.verify_totp_code(secret=current_user.totp_secret, code=payload.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid code")

    current_user.mfa_enabled = False
    current_user.totp_secret = None
    await db.commit()
    await db.refresh(current_user)
    organization = (
        await db.execute(
            select(Organization).where(Organization.id == current_user.organization_id)
        )
    ).scalar_one()
    return MeResponse(user=UserRead.model_validate(current_user), organization=organization)


@router.post(
    "/mfa/login",
    response_model=TokenResponse,
    dependencies=[Depends(login_rate_limiter)],
    summary="Exchange an MFA challenge token + TOTP code for real access/refresh tokens",
)
async def mfa_login(
    payload: MfaLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_system_db),
) -> TokenResponse:
    try:
        user_id = decode_mfa_challenge_token(payload.challenge_token)
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired MFA challenge"
        ) from exc

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None or not user.is_active or not user.mfa_enabled or not user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired MFA challenge"
        )
    if not mfa_service.verify_totp_code(secret=user.totp_secret, code=payload.code):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid code")

    raw_refresh = await auth_service.issue_refresh_token(
        db, user=user, device_info=request.headers.get("user-agent")
    )
    _set_refresh_cookie(response, raw_refresh)
    return _access_token_for(user)


# --------------------------------------------------------------------------- #
# Forgot / reset password (Batch 12, Page 09) — no transactional email
# provider is wired up; see ForgotPasswordResponse and docs/schemas.md
# "PasswordResetToken" for the deliberate dev-only deferral.
# --------------------------------------------------------------------------- #
@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    dependencies=[Depends(register_rate_limiter)],
    summary="Request a password reset link (always 200 — never reveals whether the email exists)",
)
async def forgot_password(
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_system_db),
) -> ForgotPasswordResponse:
    raw_token = await password_reset_service.request_password_reset(
        db, email=payload.email, organization_slug=payload.organization_slug
    )
    dev_link = None
    # Batch 25: the link is emailed now, so only fall back to returning it when
    # there is no mail server to email it with (and never in production).
    if raw_token is not None and not settings.is_production and not settings.email_enabled:
        dev_link = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={raw_token}"
    return ForgotPasswordResponse(dev_reset_link=dev_link)


@router.post(
    "/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Complete a password reset with the token from the reset link",
)
async def reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_system_db),
) -> None:
    try:
        await password_reset_service.reset_password(
            db, raw_token=payload.token, new_password=payload.new_password
        )
    except password_reset_service.InvalidResetTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token"
        ) from exc


# --------------------------------------------------------------------------- #
# Email verification (Batch 25). Both endpoints are public and unauthenticated —
# the token in the link IS the credential, and a user who cannot log in until
# they verify obviously cannot present a JWT to do it.
# --------------------------------------------------------------------------- #
@router.post(
    "/verify-email",
    response_model=VerificationResponse,
    dependencies=[Depends(register_rate_limiter)],
    summary="Confirm an email address with the token from the verification link",
)
async def verify_email(
    payload: VerifyEmailRequest,
    db: AsyncSession = Depends(get_system_db),
) -> VerificationResponse:
    try:
        await verification_service.verify_email(db, raw_token=payload.token)
    except verification_service.InvalidVerificationTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification link. Request a new one.",
        ) from exc
    return VerificationResponse(
        message="Email confirmed. You can now sign in.", email_verified=True
    )


@router.post(
    "/resend-verification",
    response_model=VerificationResponse,
    dependencies=[Depends(register_rate_limiter)],
    summary="Request a fresh verification link (always 200 — never reveals whether the email exists)",
)
async def resend_verification(
    payload: ResendVerificationRequest,
    db: AsyncSession = Depends(get_system_db),
) -> VerificationResponse:
    raw_token = await verification_service.resend_verification(
        db, email=payload.email, organization_slug=payload.organization_slug
    )
    dev_link = None
    if raw_token is not None and not settings.is_production and not settings.email_enabled:
        dev_link = verification_service.build_verification_link(raw_token)
    return VerificationResponse(
        message="If that account exists and needs confirming, a new link has been sent.",
        dev_verification_link=dev_link,
    )


@router.post(
    "/accept-invitation",
    response_model=AcceptInvitationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(register_rate_limiter)],
    summary="Join an organization using a team-invitation link",
)
async def accept_invitation(
    payload: AcceptInvitationRequest,
    db: AsyncSession = Depends(get_system_db),
) -> AcceptInvitationResponse:
    """Public and unauthenticated — the invite token IS the credential. The target
    organization and role come from the stored invitation, never from this request,
    so an invitee cannot choose which tenant to join or what role to receive."""
    try:
        user, organization = await invitation_service.accept_invitation(
            db,
            raw_token=payload.token,
            password=payload.password,
            full_name=payload.full_name,
        )
    except invitation_service.AlreadyMemberError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already a member of this organization — sign in instead.",
        ) from exc
    except invitation_service.InvalidInvitationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation is invalid, expired, or has already been used.",
        ) from exc

    return AcceptInvitationResponse(email=user.email, organization_slug=organization.slug)
