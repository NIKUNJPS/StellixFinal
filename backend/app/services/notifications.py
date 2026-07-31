"""Notification content templates for account-lifecycle events (Batch 24).

There is no transactional-email service in this deployment (no SMTP/SendGrid key —
the same deferred-credential posture as Stripe). Rather than invent one, these are
pure content builders: each returns a ``{event, subject, body, ...}`` dict that is
delivered best-effort over the existing webhook channel (app/services/webhook.py,
DEMO_WEBHOOK_URL) and logged. When an email provider is keyed later, the SAME
templates render into the email body — the wiring point changes, the copy does not.

Keeping these as side-effect-free functions (no I/O) means they are trivially unit-
testable and can't make a network call themselves; the caller decides delivery.
"""

from __future__ import annotations


def registration_received(*, company: str, email: str) -> dict:
    """Founder-facing: a new self-registration is waiting for approval."""
    return {
        "event": "registration_received",
        "audience": "founder",
        "subject": f"New workspace pending approval — {company}",
        "body": (
            f"{company} just registered ({email}) and is waiting in the superadmin "
            f"console for approval. Review it under Companies → Pending."
        ),
        "company": company,
        "email": email,
    }


def demo_request_received(*, company: str, contact_name: str, email: str, use_case: str) -> dict:
    """Founder-facing: a public demo request came in from the landing page."""
    return {
        "event": "demo_request_received",
        "audience": "founder",
        "subject": f"New demo request — {company}",
        "body": (
            f"{contact_name} at {company} ({email}) requested a demo.\n\n{use_case}"
        ),
        "company": company,
        "email": email,
    }


def org_approved(*, company: str, admin_email: str, login_url: str = "/login") -> dict:
    """Client-facing: the workspace was approved and can now sign in."""
    return {
        "event": "org_approved",
        "audience": "client",
        "subject": f"Your Stellix Labs workspace is ready — {company}",
        "body": (
            f"Good news — {company} has been approved. You can sign in now at "
            f"{login_url} with {admin_email}."
        ),
        "company": company,
        "email": admin_email,
    }


def org_provisioned(*, company: str, admin_email: str, temp_password: str, login_url: str = "/login") -> dict:
    """Client-facing: a demo request was converted into a live workspace. Carries the
    one-time temp password so the founder can relay credentials (no email infra)."""
    return {
        "event": "org_provisioned",
        "audience": "client",
        "subject": f"Welcome to Stellix Labs — {company}",
        "body": (
            f"Your {company} workspace is live. Sign in at {login_url} with "
            f"{admin_email} and the temporary password provided, then change it."
        ),
        "company": company,
        "email": admin_email,
        # NOT logged to the founder channel in plaintext beyond the one-time relay —
        # the caller returns it once in the API response, not the notification body.
        "temp_password_set": bool(temp_password),
    }


def org_suspended(*, company: str, admin_email: str, reason: str) -> dict:
    """Client-facing: access has been suspended."""
    return {
        "event": "org_suspended",
        "audience": "client",
        "subject": f"Stellix Labs access suspended — {company}",
        "body": (
            f"Access for {company} has been suspended. Reason: {reason}. "
            f"Contact support@stellixlabs.com to resolve this."
        ),
        "company": company,
        "email": admin_email,
        "reason": reason,
    }


def org_terminated(*, company: str, admin_email: str, reason: str) -> dict:
    """Client-facing: the account has been terminated."""
    return {
        "event": "org_terminated",
        "audience": "client",
        "subject": f"Stellix Labs account closed — {company}",
        "body": (
            f"The {company} account has been terminated. Reason: {reason}. "
            f"Contact support@stellixlabs.com with any questions."
        ),
        "company": company,
        "email": admin_email,
        "reason": reason,
    }


# --------------------------------------------------------------------------- #
# Batch 25 — templates for the credentialed flows. These carry a one-time link,
# so the *caller* builds the absolute URL (it needs settings.FRONTEND_URL) and
# passes it in; these functions stay pure and hold no secrets of their own.
# --------------------------------------------------------------------------- #
def verify_email(*, full_name: str | None, link: str, expires_hours: int) -> dict:
    """Client-facing: confirm you control this mailbox."""
    greeting = f"Hi {full_name}," if full_name else "Hi,"
    return {
        "event": "verify_email",
        "audience": "client",
        "subject": "Confirm your email — Stellix Labs",
        "body": (
            f"{greeting}\n\n"
            f"Confirm this email address to activate your Stellix Labs account:\n\n"
            f"{link}\n\n"
            f"The link expires in {expires_hours} hours. If you didn't create an "
            f"account, you can ignore this message."
        ),
        "link": link,
    }


def password_reset(*, full_name: str | None, link: str, expires_minutes: int) -> dict:
    """Client-facing: the one-time password-reset link."""
    greeting = f"Hi {full_name}," if full_name else "Hi,"
    return {
        "event": "password_reset",
        "audience": "client",
        "subject": "Reset your Stellix Labs password",
        "body": (
            f"{greeting}\n\n"
            f"Use this link to choose a new password:\n\n"
            f"{link}\n\n"
            f"The link expires in {expires_minutes} minutes and can only be used once. "
            f"If you didn't request this, ignore this message — your password is unchanged."
        ),
        "link": link,
    }


def team_invitation(
    *, company: str, inviter: str | None, role: str, link: str, expires_days: int
) -> dict:
    """Client-facing: an org admin invited this person into their workspace."""
    who = f"{inviter} has invited you" if inviter else "You have been invited"
    return {
        "event": "team_invitation",
        "audience": "client",
        "subject": f"You've been invited to {company} on Stellix Labs",
        "body": (
            f"{who} to join the {company} workspace on Stellix Labs as a "
            f"{role.replace('_', ' ')}.\n\n"
            f"Accept the invitation and set your password here:\n\n"
            f"{link}\n\n"
            f"The invitation expires in {expires_days} days."
        ),
        "company": company,
        "role": role,
        "link": link,
    }
