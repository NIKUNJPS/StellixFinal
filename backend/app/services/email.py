"""Transactional email transport (Batch 25).

The counterpart to ``app/services/notifications.py``: that module builds the *content*
(subject/body), this one *delivers* it. Kept separate so content stays pure and unit-
testable while transport is the only thing that touches the network.

Design notes:

* **SMTP, deliberately.** One implementation works with Gmail app-passwords, Outlook,
  Zoho, or the SMTP endpoints of SendGrid/Mailgun/Resend — the provider can change with
  a ``.env`` edit and no code change.
* **Async.** ``aiosmtplib`` is used rather than stdlib ``smtplib`` so a slow mail server
  never blocks the event loop (the same reason the rest of the stack is async).
* **Deferred credentials.** With SMTP unconfigured every send is a *logged no-op* that
  returns False — it never raises. Development and the test suite therefore run with no
  mail server at all, exactly like ``post_webhook`` and the Stripe/LLM integrations.
* **Never fatal.** Callers treat a False return as "not delivered", never as a failure
  of the underlying action: an organisation is still approved even if the mail bounces.
"""

from __future__ import annotations

import logging
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def _build_message(*, to: str, subject: str, text: str, html: str | None) -> EmailMessage:
    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype="html")
    return message


async def send_email(
    *, to: str, subject: str, text: str, html: str | None = None
) -> bool:
    """Deliver one email. Returns True only on a successful SMTP handoff.

    Returns False (never raises) when SMTP is unconfigured or the send fails, so a
    delivery problem can never roll back the business action that triggered it.
    """
    if not settings.email_enabled:
        logger.info(
            "SMTP not configured; skipping email. to=%s subject=%r "
            "(set SMTP_HOST/SMTP_USER/SMTP_PASSWORD to enable)",
            to,
            subject,
        )
        return False

    message = _build_message(to=to, subject=subject, text=text, html=html)
    try:
        import aiosmtplib

        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD.get_secret_value() if settings.SMTP_PASSWORD else None,
            start_tls=settings.SMTP_STARTTLS,
            timeout=settings.SMTP_TIMEOUT_SECONDS,
        )
    except Exception as exc:  # noqa: BLE001 - delivery must never break the caller
        logger.warning("Email delivery failed. to=%s subject=%r error=%s", to, subject, exc)
        return False

    logger.info("Email sent. to=%s subject=%r", to, subject)
    return True


async def send_notification(notification: dict, *, to: str) -> bool:
    """Deliver a notification dict produced by ``app/services/notifications.py``
    (or ``weekly_digest.build_digest_content``) as an email.

    Those builders already return ``{subject, body, ...}``, so this is the single
    adapter between the content layer and the transport layer.
    """
    return await send_email(
        to=to,
        subject=notification.get("subject", "Stellix Labs"),
        text=notification.get("body", ""),
        html=_as_simple_html(notification.get("body", "")),
    )


def _as_simple_html(text: str) -> str:
    """Wrap a plain-text body in minimal, client-safe HTML.

    Deliberately simple: inline styles only, no external CSS or images (many mail
    clients strip both), and the plain-text part is always sent alongside.
    """
    escaped = (
        text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )
    body = escaped.replace("\n", "<br>")
    return (
        '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;'
        'font-size:15px;line-height:1.6;color:#0A0F1E;max-width:560px;">'
        f"{body}"
        '<hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;">'
        '<p style="font-size:12px;color:#64748B;">Stellix Labs — the institutional '
        "memory layer for quantitative research.</p>"
        "</div>"
    )
