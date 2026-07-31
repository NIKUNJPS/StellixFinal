"""Strategy lifecycle transition tests. ILLEGAL transitions are asserted FIRST."""

from __future__ import annotations

from app.models.strategy import StrategyStatus

from tests.data_helpers import seed_strategy
from tests.helpers import bearer, register_org


async def test_illegal_transitions_all_return_409(client, db_session_factory, capsys):
    token, org = await register_org(client, org_name="Lifecycle Co", email="lc@x.io")

    draft_id = await seed_strategy(db_session_factory, organization_id=org, status=StrategyStatus.DRAFT)
    candidate_id = await seed_strategy(
        db_session_factory, organization_id=org, status=StrategyStatus.CANDIDATE, valid_rules=True
    )

    cases = [
        ("draft -> active", draft_id, "active"),
        ("draft -> failed", draft_id, "failed"),
        ("candidate -> failed", candidate_id, "failed"),
    ]
    results: dict[str, int] = {}
    for label, sid, target in cases:
        resp = await client.post(
            f"/strategies/{sid}/transition",
            json={"target_status": target},
            headers=bearer(token),
        )
        results[label] = resp.status_code

    # draft -> active via the real /approve endpoint too (admin role passes the RBAC
    # gate, so the 409 is purely the illegal transition).
    approve_resp = await client.post(
        f"/strategies/{draft_id}/approve",
        json={"action": "approve", "justification": "n/a"},
        headers=bearer(token),
    )
    results["draft -> active (via /approve)"] = approve_resp.status_code

    with capsys.disabled():
        print("\n  ILLEGAL TRANSITION -> HTTP STATUS")
        for label, code in results.items():
            print(f"    {label:<34} {code}")

    assert results["draft -> active"] == 409
    assert results["draft -> failed"] == 409
    assert results["candidate -> failed"] == 409
    assert results["draft -> active (via /approve)"] == 409


async def test_valid_draft_to_candidate(client, db_session_factory):
    token, org = await register_org(client, org_name="Valid Co", email="valid@x.io")
    sid = await seed_strategy(
        db_session_factory, organization_id=org, status=StrategyStatus.DRAFT, valid_rules=True
    )
    resp = await client.post(f"/strategies/{sid}/submit", headers=bearer(token))
    assert resp.status_code == 200
    assert resp.json()["status"] == "candidate"


async def test_submit_without_rules_is_422_not_409(client, db_session_factory):
    # Right state (draft) but incomplete content → 422 (validation), not 409 (illegal).
    token, org = await register_org(client, org_name="NoRules Co", email="nr@x.io")
    sid = await seed_strategy(
        db_session_factory, organization_id=org, status=StrategyStatus.DRAFT, valid_rules=False
    )
    resp = await client.post(f"/strategies/{sid}/submit", headers=bearer(token))
    assert resp.status_code == 422


async def test_any_to_retired_requires_reason_and_role(client, db_session_factory):
    token, org = await register_org(client, org_name="Retire Co", email="ret@x.io")  # admin
    sid = await seed_strategy(db_session_factory, organization_id=org, status=StrategyStatus.ACTIVE)

    missing_reason = await client.post(
        f"/strategies/{sid}/retire", json={"reason": ""}, headers=bearer(token)
    )
    assert missing_reason.status_code == 422  # reason required

    ok = await client.post(
        f"/strategies/{sid}/retire", json={"reason": "superseded"}, headers=bearer(token)
    )
    assert ok.status_code == 200
    assert ok.json()["status"] == "retired"

    # retired is terminal → retiring again is an illegal transition (409).
    again = await client.post(
        f"/strategies/{sid}/retire", json={"reason": "again"}, headers=bearer(token)
    )
    assert again.status_code == 409
