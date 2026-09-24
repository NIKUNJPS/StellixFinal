"""Test 3 (required order): every LLM-generated strategy is created with
status=draft and requires_review=True — non-negotiable, derived server-side.
Attempt to programmatically bypass (submit right after creation, or try to smuggle
a different requires_review value in the request body) and confirm normal Batch 4
lifecycle rules still apply — no special fast-path or extra restriction for
creator=llm_generated."""

from __future__ import annotations

import pytest

from tests.helpers import bearer
from tests.helpers import register_activate_login as register

_VALID_ENTRY = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": "<", "value": 30}]}
_VALID_EXIT = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": ">", "value": 70}]}
_VALID_RISK = {"max_drawdown_pct": 20, "max_position_size_pct": 10, "stop_loss_pct": 5}


@pytest.mark.anyio
async def test_llm_generated_strategy_always_starts_draft_and_requires_review(client, fake_graph_repo):
    reg = await register(client, org_name="Approval Org", email="approval@llm.io", slug="approval-org")
    token = reg.json()["access_token"]

    resp = await client.post(
        "/strategies",
        json={"symbol": "SPY", "name": "LLM Hypothesis Strategy", "creator": "llm_generated", "entry_rules": {}, "exit_rules": {}},
        headers=bearer(token),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "draft"
    assert body["requires_review"] is True


@pytest.mark.anyio
async def test_requires_review_cannot_be_client_set_to_false_for_llm_generated(client, fake_graph_repo):
    """Try to smuggle requires_review=False in the request body for an
    llm_generated strategy — the server must ignore it and force True anyway."""
    reg = await register(client, org_name="Approval Org 2", email="approval2@llm.io", slug="approval-org-2")
    token = reg.json()["access_token"]

    resp = await client.post(
        "/strategies",
        json={
            "name": "Sneaky Strategy",
            "symbol": "SPY",
            "creator": "llm_generated",
            "entry_rules": {},
            "exit_rules": {},
            "requires_review": False,  # extra field the schema doesn't even expose — must be ignored
        },
        headers=bearer(token),
    )
    assert resp.status_code == 201
    assert resp.json()["requires_review"] is True


@pytest.mark.anyio
async def test_requires_review_cannot_be_client_set_to_true_for_human_strategy(client, fake_graph_repo):
    """Conversely: a human-created strategy must never get requires_review=True
    just because the client asked for it."""
    reg = await register(client, org_name="Approval Org 3", email="approval3@llm.io", slug="approval-org-3")
    token = reg.json()["access_token"]

    resp = await client.post(
        "/strategies",
        json={
            "name": "Human Strategy",
            "symbol": "SPY",
            "creator": "human",
            "entry_rules": {},
            "exit_rules": {},
            "requires_review": True,
        },
        headers=bearer(token),
    )
    assert resp.status_code == 201
    assert resp.json()["requires_review"] is False


@pytest.mark.anyio
async def test_bypass_attempt_submit_immediately_after_creation_follows_normal_gate(client, fake_graph_repo):
    """Attempting to submit an llm_generated strategy right after creation, with
    INVALID rules (empty entry/exit rules), must be blocked by the exact same
    assert_submittable gate Batch 4 already enforces for a human-created strategy
    with the same rule content — 422 "Invalid rules", not some LLM-specific bypass
    or a different error path."""
    reg = await register(client, org_name="Approval Org 4", email="approval4@llm.io", slug="approval-org-4")
    token = reg.json()["access_token"]

    create = await client.post(
        "/strategies",
        json={"symbol": "SPY", "name": "Incomplete LLM Strategy", "creator": "llm_generated", "entry_rules": {}, "exit_rules": {}},
        headers=bearer(token),
    )
    strategy_id = create.json()["id"]

    submit = await client.post(f"/strategies/{strategy_id}/submit", headers=bearer(token))
    assert submit.status_code == 422
    assert "Invalid rules" in submit.json()["detail"]

    # Cross-check: a HUMAN-created strategy with the identical (empty) rules gets
    # the identical rejection — proving creator type has zero effect on the gate.
    create_human = await client.post(
        "/strategies",
        json={"symbol": "SPY", "name": "Incomplete Human Strategy", "creator": "human", "entry_rules": {}, "exit_rules": {}},
        headers=bearer(token),
    )
    human_id = create_human.json()["id"]
    submit_human = await client.post(f"/strategies/{human_id}/submit", headers=bearer(token))
    assert submit_human.status_code == submit.status_code == 422
    assert submit_human.json()["detail"] == submit.json()["detail"]


@pytest.mark.anyio
async def test_llm_generated_strategy_with_valid_rules_submits_normally_like_any_other(client, fake_graph_repo):
    """The flip side: a WELL-FORMED llm_generated strategy submits successfully,
    proving requires_review doesn't add an extra blocking gate beyond Batch 4's
    existing rules either — it's a review FLAG for humans, not a workflow lock."""
    reg = await register(client, org_name="Approval Org 5", email="approval5@llm.io", slug="approval-org-5")
    token = reg.json()["access_token"]

    create = await client.post(
        "/strategies",
        json={
            "name": "Complete LLM Strategy",
            "symbol": "SPY",
            "creator": "llm_generated",
            "entry_rules": _VALID_ENTRY,
            "exit_rules": _VALID_EXIT,
            "risk_constraints": _VALID_RISK,
        },
        headers=bearer(token),
    )
    assert create.status_code == 201
    strategy_id = create.json()["id"]
    assert create.json()["requires_review"] is True

    submit = await client.post(f"/strategies/{strategy_id}/submit", headers=bearer(token))
    assert submit.status_code == 200
    assert submit.json()["status"] == "candidate"
    assert submit.json()["requires_review"] is True  # the flag persists through the transition


@pytest.mark.anyio
async def test_llm_generated_candidate_cannot_skip_straight_to_active_without_approval(client, fake_graph_repo):
    """Even with valid rules, reaching 'active' still requires the SAME two things
    Batch 4 always required: robustness_score >= 0.70 AND a real ApprovalRecord —
    requires_review does not grant, and does not need, any additional bypass."""
    reg = await register(client, org_name="Approval Org 6", email="approval6@llm.io", slug="approval-org-6")
    token = reg.json()["access_token"]

    create = await client.post(
        "/strategies",
        json={
            "name": "LLM Strategy No Backtest Yet",
            "symbol": "SPY",
            "creator": "llm_generated",
            "entry_rules": _VALID_ENTRY,
            "exit_rules": _VALID_EXIT,
            "risk_constraints": _VALID_RISK,
        },
        headers=bearer(token),
    )
    strategy_id = create.json()["id"]
    await client.post(f"/strategies/{strategy_id}/submit", headers=bearer(token))

    transition = await client.post(
        f"/strategies/{strategy_id}/transition",
        json={"target_status": "active"},
        headers=bearer(token),
    )
    assert transition.status_code == 409  # no robustness_score yet -> blocked, same as any strategy
