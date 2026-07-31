"""Lifecycle notification templates (Batch 24, Task 7).

Pure content builders — no I/O — so these are plain unit tests. They lock the
contract the webhook/email delivery relies on: every template carries an event key,
an audience, and a non-empty subject/body with the company folded in. The temp
password must NEVER appear in a notification body (it is relayed once via the API
response only). Distinct from tests/test_notifications.py, which covers the in-app
Notification rows (Batch 12)."""

from __future__ import annotations

from app.services import notifications


def test_registration_received_targets_founder():
    msg = notifications.registration_received(company="Acme Capital", email="a@acme.com")
    assert msg["event"] == "registration_received"
    assert msg["audience"] == "founder"
    assert "Acme Capital" in msg["subject"]
    assert "a@acme.com" in msg["body"]


def test_org_approved_targets_client_and_points_to_login():
    msg = notifications.org_approved(company="Acme", admin_email="admin@acme.com")
    assert msg["audience"] == "client"
    assert "admin@acme.com" in msg["body"]
    assert "/login" in msg["body"]


def test_org_provisioned_never_leaks_temp_password_in_body():
    secret = "S3cretTemp!xyz"
    msg = notifications.org_provisioned(
        company="Acme", admin_email="admin@acme.com", temp_password=secret
    )
    assert secret not in msg["subject"]
    assert secret not in msg["body"]
    # It only records THAT a password was set, never the value.
    assert msg["temp_password_set"] is True


def test_suspend_and_terminate_carry_reason_and_support_contact():
    s = notifications.org_suspended(company="Acme", admin_email="a@acme.com", reason="non-payment")
    t = notifications.org_terminated(company="Acme", admin_email="a@acme.com", reason="closed")
    for msg, reason in ((s, "non-payment"), (t, "closed")):
        assert msg["audience"] == "client"
        assert reason in msg["body"]
        assert "support@stellixlabs.com" in msg["body"]
