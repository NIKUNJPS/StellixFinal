"""TOTP MFA (Batch 12): enrollment + verification with a known seed, and
known-good/known-bad codes, per the batch's own DoD wording."""

from __future__ import annotations

import pyotp

from tests.helpers import bearer, register_org

_KNOWN_SEED = "JBSWY3DPEHPK3PXP"  # a fixed, known base32 secret — not server-generated


async def test_mfa_service_verifies_known_good_and_bad_codes():
    """Unit-level: app.services.mfa against a known seed, no HTTP involved."""
    from app.services import mfa as mfa_service

    good_code = pyotp.TOTP(_KNOWN_SEED).now()
    assert mfa_service.verify_totp_code(secret=_KNOWN_SEED, code=good_code) is True
    assert mfa_service.verify_totp_code(secret=_KNOWN_SEED, code="000000") is False


async def test_enroll_then_verify_with_real_code_enables_mfa(client):
    token, _org = await register_org(client, org_name="MfaEnrollCo", email="e@mfaenrollco.com")

    enroll = await client.post("/auth/mfa/enroll", headers=bearer(token))
    assert enroll.status_code == 200
    secret = enroll.json()["secret"]
    assert enroll.json()["provisioning_uri"].startswith("otpauth://totp/")

    # Not yet enabled — only enroll() ran, not verify().
    me_before = await client.get("/auth/me", headers=bearer(token))
    assert me_before.json()["user"]["mfa_enabled"] is False

    code = pyotp.TOTP(secret).now()
    verify = await client.post("/auth/mfa/verify", json={"code": code}, headers=bearer(token))
    assert verify.status_code == 200
    assert verify.json()["user"]["mfa_enabled"] is True


async def test_verify_rejects_a_known_bad_code(client):
    token, _org = await register_org(client, org_name="MfaBadCodeCo", email="b@mfabadcodeco.com")
    await client.post("/auth/mfa/enroll", headers=bearer(token))

    resp = await client.post("/auth/mfa/verify", json={"code": "000000"}, headers=bearer(token))
    assert resp.status_code == 400


async def test_verify_without_enrollment_rejected(client):
    token, _org = await register_org(client, org_name="MfaNoEnrollCo", email="n@mfanoenrollco.com")
    resp = await client.post("/auth/mfa/verify", json={"code": "123456"}, headers=bearer(token))
    assert resp.status_code == 400


async def test_login_challenges_when_mfa_enabled_then_completes_with_real_code(client):
    email = "l@mfaloginco.com"
    token, _org = await register_org(client, org_name="MfaLoginCo", email=email, password="goodpass123")
    enroll = await client.post("/auth/mfa/enroll", headers=bearer(token))
    secret = enroll.json()["secret"]
    await client.post(
        "/auth/mfa/verify", json={"code": pyotp.TOTP(secret).now()}, headers=bearer(token)
    )

    login = await client.post("/auth/login", json={"email": email, "password": "goodpass123"})
    assert login.status_code == 200
    body = login.json()
    assert body["mfa_required"] is True
    assert "challenge_token" in body
    assert "access_token" not in body

    bad = await client.post(
        "/auth/mfa/login", json={"challenge_token": body["challenge_token"], "code": "000000"}
    )
    assert bad.status_code == 401

    good = await client.post(
        "/auth/mfa/login",
        json={"challenge_token": body["challenge_token"], "code": pyotp.TOTP(secret).now()},
    )
    assert good.status_code == 200
    assert "access_token" in good.json()


async def test_login_without_mfa_enabled_returns_tokens_directly(client):
    email = "no-mfa@loginco.com"
    await register_org(client, org_name="NoMfaLoginCo", email=email, password="goodpass123")
    resp = await client.post("/auth/login", json={"email": email, "password": "goodpass123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()
    assert "mfa_required" not in resp.json()


async def test_disable_mfa_requires_a_valid_code(client):
    token, _org = await register_org(client, org_name="MfaDisableCo", email="d@mfadisableco.com")
    enroll = await client.post("/auth/mfa/enroll", headers=bearer(token))
    secret = enroll.json()["secret"]
    await client.post("/auth/mfa/verify", json={"code": pyotp.TOTP(secret).now()}, headers=bearer(token))

    bad = await client.post("/auth/mfa/disable", json={"code": "000000"}, headers=bearer(token))
    assert bad.status_code == 400

    good = await client.post(
        "/auth/mfa/disable", json={"code": pyotp.TOTP(secret).now()}, headers=bearer(token)
    )
    assert good.status_code == 200
    assert good.json()["user"]["mfa_enabled"] is False
