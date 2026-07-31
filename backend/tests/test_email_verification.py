"""Email transport + verification-flow tests (Batch 25).

NO TEST HERE MAKES A LIVE SMTP CALL. Two mechanisms guarantee it:

1. Settings carry no SMTP_HOST/USER/PASSWORD under test, so ``settings.email_enabled``
   is False and ``send_email`` short-circuits to a logged no-op before importing or
   touching aiosmtplib at all. ``test_send_email_disabled_makes_no_network_call``
   asserts that short-circuit explicitly.
2. The one test that exercises the *configured* path monkeypatches
   ``aiosmtplib.send`` with a recorder, so the wire is never touched.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from app.core.config import settings
from app.db.tenant import mark_session_unscoped
from app.models.email_verification_token import EmailVerificationToken
from app.models.user import User
from app.services import email as email_service
from app.services import email_verification as verification_service
from sqlalchemy import select

from tests.helpers import (
    DEFAULT_PASSWORD,
    activate_org_by_email,
    login,
    register,
    register_activate_login,
    verify_email_from_register,
)


def _token_from(link: str) -> str:
    return link.split("token=", 1)[1]


# --------------------------------------------------------------------------- #
# Transport
# --------------------------------------------------------------------------- #
async def test_send_email_disabled_makes_no_network_call(monkeypatch):
    """With SMTP unconfigured, send_email must return False without dialling out.

    A booby-trapped aiosmtplib.send proves the code path never reaches it.
    """
    assert settings.email_enabled is False, "test env must have no SMTP configured"

    import aiosmtplib

    async def _explode(*args, **kwargs):  # pragma: no cover - must never run
        raise AssertionError("aiosmtplib.send was called while SMTP is unconfigured")

    monkeypatch.setattr(aiosmtplib, "send", _explode)

    assert await email_service.send_email(to="a@b.com", subject="s", text="t") is False


async def test_send_email_configured_builds_correct_message(monkeypatch):
    """The configured path hands a well-formed multipart message to aiosmtplib —
    verified against a recorder, never a real server."""
    import aiosmtplib
    from pydantic import SecretStr

    captured: dict = {}

    async def _record(message, **kwargs):
        captured["message"] = message
        captured["kwargs"] = kwargs

    monkeypatch.setattr(aiosmtplib, "send", _record)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_USER", "user@example.com")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", SecretStr("app-password"))

    assert settings.email_enabled is True
    ok = await email_service.send_email(
        to="recipient@example.com", subject="Hello", text="Body text", html="<b>Body</b>"
    )
    assert ok is True

    message = captured["message"]
    assert message["To"] == "recipient@example.com"
    assert message["Subject"] == "Hello"
    assert message["From"] == settings.SMTP_FROM
    assert message.is_multipart(), "html alternative should make it multipart"

    kwargs = captured["kwargs"]
    assert kwargs["hostname"] == "smtp.example.com"
    assert kwargs["port"] == settings.SMTP_PORT
    assert kwargs["username"] == "user@example.com"
    # The SecretStr must be unwrapped for the wire, never passed as the wrapper.
    assert kwargs["password"] == "app-password"
    assert kwargs["start_tls"] is settings.SMTP_STARTTLS


async def test_send_email_swallows_transport_failure(monkeypatch):
    """A dead mail server returns False — it must never raise into the caller,
    or approving an org would roll back because its notification bounced."""
    import aiosmtplib
    from pydantic import SecretStr

    async def _fail(*args, **kwargs):
        raise ConnectionRefusedError("mail server down")

    monkeypatch.setattr(aiosmtplib, "send", _fail)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_USER", "user@example.com")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", SecretStr("pw"))

    assert await email_service.send_email(to="a@b.com", subject="s", text="t") is False


# --------------------------------------------------------------------------- #
# Registration issues a token
# --------------------------------------------------------------------------- #
async def test_register_creates_unverified_user_and_token(client, db_session_factory):
    resp = await register(client, org_name="Verify Co", email="admin@verify.com")
    assert resp.status_code == 202
    body = resp.json()
    # Dev fallback is present precisely because SMTP is unconfigured here.
    assert body["dev_verification_link"].startswith(settings.FRONTEND_URL)

    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        user = (
            await session.execute(select(User).where(User.email == "admin@verify.com"))
        ).scalar_one()
        assert user.email_verified is False
        tokens = (
            await session.execute(
                select(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id)
            )
        ).scalars().all()
        assert len(tokens) == 1
        # Raw token is never stored — only its SHA-256 hash (64 hex chars).
        assert len(tokens[0].token_hash) == 64
        assert _token_from(body["dev_verification_link"]) not in tokens[0].token_hash


async def test_dev_link_hidden_when_smtp_configured(client, monkeypatch):
    """Once a real mail server exists the link must stop appearing in the API
    response — it goes to the mailbox instead."""
    import aiosmtplib
    from pydantic import SecretStr

    async def _noop(*args, **kwargs):
        return None

    monkeypatch.setattr(aiosmtplib, "send", _noop)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_USER", "u@example.com")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", SecretStr("pw"))

    resp = await register(client, org_name="Mailed Co", email="admin@mailed.com")
    assert resp.status_code == 202
    assert "dev_verification_link" not in resp.json()


# --------------------------------------------------------------------------- #
# Login gate
# --------------------------------------------------------------------------- #
async def test_login_blocked_until_verified(client):
    reg = await register(client, org_name="Gate Co", email="admin@gate.com")
    await activate_org_by_email("admin@gate.com")

    denied = await login(client, email="admin@gate.com")
    assert denied.status_code == 403
    detail = denied.json()["detail"]
    assert detail["code"] == "EMAIL_NOT_VERIFIED"
    assert detail["email"] == "admin@gate.com"

    await verify_email_from_register(client, reg)
    assert (await login(client, email="admin@gate.com")).status_code == 200


async def test_pending_org_message_wins_over_verification(client):
    """Ordering check: an unapproved org is told about approval, not verification —
    redeeming the link needs no session, so approval is the more useful message."""
    await register(client, org_name="Pending Co", email="admin@pending.com")
    denied = await login(client, email="admin@pending.com")
    assert denied.status_code == 403
    assert denied.json()["detail"] == "Your organization is pending approval."


# --------------------------------------------------------------------------- #
# Redemption
# --------------------------------------------------------------------------- #
async def test_verify_email_marks_user_and_consumes_token(client, db_session_factory):
    reg = await register(client, org_name="Redeem Co", email="admin@redeem.com")
    token = _token_from(reg.json()["dev_verification_link"])

    ok = await client.post("/auth/verify-email", json={"token": token})
    assert ok.status_code == 200
    assert ok.json()["email_verified"] is True

    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        user = (
            await session.execute(select(User).where(User.email == "admin@redeem.com"))
        ).scalar_one()
        assert user.email_verified is True
        record = (
            await session.execute(
                select(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id)
            )
        ).scalar_one()
        assert record.used_at is not None, "token must be consumed, not deleted"


async def test_verify_email_rejects_reuse(client):
    reg = await register(client, org_name="Reuse Co", email="admin@reuse.com")
    token = _token_from(reg.json()["dev_verification_link"])

    assert (await client.post("/auth/verify-email", json={"token": token})).status_code == 200
    again = await client.post("/auth/verify-email", json={"token": token})
    assert again.status_code == 400


async def test_verify_email_rejects_unknown_token(client):
    resp = await client.post("/auth/verify-email", json={"token": "not-a-real-token"})
    assert resp.status_code == 400


async def test_verify_email_rejects_expired_token(client, db_session_factory):
    reg = await register(client, org_name="Expired Co", email="admin@expired.com")
    token = _token_from(reg.json()["dev_verification_link"])

    async with db_session_factory() as session:
        mark_session_unscoped(session.sync_session)
        record = (await session.execute(select(EmailVerificationToken))).scalars().one()
        record.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        await session.commit()

    assert (await client.post("/auth/verify-email", json={"token": token})).status_code == 400


# --------------------------------------------------------------------------- #
# Resend — must not leak account existence or verification state
# --------------------------------------------------------------------------- #
async def test_resend_issues_new_link_for_unverified(client):
    await register(client, org_name="Resend Co", email="admin@resend.com")
    resp = await client.post("/auth/resend-verification", json={"email": "admin@resend.com"})
    assert resp.status_code == 200
    link = resp.json()["dev_verification_link"]
    assert link

    # The freshly-issued token works.
    assert (
        await client.post("/auth/verify-email", json={"token": _token_from(link)})
    ).status_code == 200


@pytest.mark.parametrize(
    "email",
    ["nobody@nowhere.com", "admin@already.com"],
    ids=["unknown-account", "already-verified"],
)
async def test_resend_is_always_200_and_leaks_nothing(client, email):
    """Both an unknown address and an already-verified one get the identical
    response — so neither account existence nor state is observable."""
    await register_activate_login(client, org_name="Already Co", email="admin@already.com")

    resp = await client.post("/auth/resend-verification", json={"email": email})
    assert resp.status_code == 200
    assert resp.json()["dev_verification_link"] is None
    assert resp.json()["message"] == (
        "If that account exists and needs confirming, a new link has been sent."
    )


# --------------------------------------------------------------------------- #
# Password reset now goes through the same transport
# --------------------------------------------------------------------------- #
async def test_forgot_password_hides_dev_link_when_smtp_configured(client, monkeypatch):
    await register_activate_login(client, org_name="Reset Co", email="admin@reset.com")

    # Unconfigured SMTP → dev fallback present.
    unconfigured = await client.post("/auth/forgot-password", json={"email": "admin@reset.com"})
    assert unconfigured.json()["dev_reset_link"] is not None

    import aiosmtplib
    from pydantic import SecretStr

    sent: list = []

    async def _record(message, **kwargs):
        sent.append(message)

    monkeypatch.setattr(aiosmtplib, "send", _record)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_USER", "u@example.com")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", SecretStr("pw"))

    configured = await client.post("/auth/forgot-password", json={"email": "admin@reset.com"})
    assert configured.json()["dev_reset_link"] is None
    assert len(sent) == 1
    assert sent[0]["To"] == "admin@reset.com"


async def test_reset_link_still_works_end_to_end(client):
    """Adding email delivery must not change what the token does."""
    await register_activate_login(client, org_name="E2E Reset", email="admin@e2ereset.com")
    forgot = await client.post("/auth/forgot-password", json={"email": "admin@e2ereset.com"})
    token = _token_from(forgot.json()["dev_reset_link"])

    new_password = "Str0ng-New-Passw0rd!"
    done = await client.post(
        "/auth/reset-password", json={"token": token, "new_password": new_password}
    )
    assert done.status_code == 204

    assert (
        await login(client, email="admin@e2ereset.com", password=DEFAULT_PASSWORD)
    ).status_code == 401
    assert (
        await login(client, email="admin@e2ereset.com", password=new_password)
    ).status_code == 200


async def test_verification_link_points_at_frontend():
    link = verification_service.build_verification_link("abc123")
    assert link == f"{settings.FRONTEND_URL}/verify-email?token=abc123"


# --------------------------------------------------------------------------- #
# Batch 25: lifecycle notifications now also reach the CLIENT by email, not just
# the founder's webhook. Still no live SMTP — aiosmtplib.send is a recorder.
# --------------------------------------------------------------------------- #
def _configure_smtp(monkeypatch) -> list:
    """Point settings at a fake SMTP server and return the list that records sends."""
    import aiosmtplib
    from pydantic import SecretStr

    sent: list = []

    async def _record(message, **kwargs):
        sent.append(message)

    monkeypatch.setattr(aiosmtplib, "send", _record)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_USER", "u@example.com")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", SecretStr("pw"))
    return sent


async def test_client_audience_notification_is_emailed(monkeypatch):
    from app.services import notifications
    from app.services.superadmin import _notify

    sent = _configure_smtp(monkeypatch)
    await _notify(notifications.org_suspended(
        company="Acme", admin_email="admin@acme.com", reason="non-payment"
    ))

    assert len(sent) == 1
    assert sent[0]["To"] == "admin@acme.com"
    assert "Acme" in sent[0]["Subject"]


async def test_founder_audience_notification_is_not_emailed_to_clients(monkeypatch):
    """registration_received is addressed to the FOUNDER — it must stay on the
    webhook channel and never be mailed to the person who registered."""
    from app.services import notifications
    from app.services.superadmin import _notify

    sent = _configure_smtp(monkeypatch)
    await _notify(notifications.registration_received(company="Acme", email="admin@acme.com"))

    assert sent == []


async def test_notify_survives_a_dead_mail_server(monkeypatch):
    """A control-plane mutation is already committed when _notify runs, so a mail
    failure must never propagate."""
    import aiosmtplib
    from app.services import notifications
    from app.services.superadmin import _notify
    from pydantic import SecretStr

    async def _fail(*args, **kwargs):
        raise ConnectionRefusedError("down")

    monkeypatch.setattr(aiosmtplib, "send", _fail)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_USER", "u@example.com")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", SecretStr("pw"))

    # Must not raise.
    await _notify(notifications.org_approved(company="Acme", admin_email="a@acme.com"))
