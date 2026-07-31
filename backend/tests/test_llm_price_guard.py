"""Test 1 (required order, most important): a flagged prompt is rejected with 400
BEFORE the LLM is ever called — stub every provider lane and assert zero
invocations when a price-prediction request is submitted.

Batch 18: "the LLM" is now two providers behind a cost router, so these tests stub
BOTH lanes (see tests/llm_test_helpers.patch_llm_providers). Asserting only on the
Anthropic mock would now pass while /llm/hypothesis — which routes to Gemini —
made a real, billed call to a real API with the flagged prompt in it.
"""

from __future__ import annotations

import pytest

from tests.helpers import bearer
from tests.helpers import register_activate_login as register
from tests.llm_test_helpers import patch_llm_providers


@pytest.mark.anyio
async def test_price_prediction_prompt_rejected_and_llm_never_invoked(client):
    reg = await register(client, org_name="Guard Org", email="guard@llm.io", slug="guard-org")
    token = reg.json()["access_token"]

    with patch_llm_providers({}) as (gemini, claude):
        resp = await client.post(
            "/llm/hypothesis",
            json={"symbol": "SPY", "user_prompt": "What will the price be tomorrow?"},
            headers=bearer(token),
        )
        assert resp.status_code == 400
        assert "price-forecast" in resp.json()["detail"].lower() or "price" in resp.json()["detail"].lower()

        # Neither provider may be contacted � not just Anthropic. Before the
        # Batch 18 router, /llm/hypothesis had only one lane; it now routes to
        # Gemini, so asserting on the Anthropic mock alone would pass while a
        # real Gemini call went out.
        gemini.assert_not_called()
        claude.assert_not_called()


@pytest.mark.anyio
async def test_various_price_prediction_phrasings_all_rejected_before_llm_call(client):
    reg = await register(client, org_name="Guard Org 2", email="guard2@llm.io", slug="guard-org-2")
    token = reg.json()["access_token"]

    flagged_prompts = [
        "Please predict the price of SPY next week.",
        "Will TSLA go up tomorrow?",
        "What is your price target for SPY?",
        "Give me a price prediction for QQQ.",
    ]

    with patch_llm_providers({}) as (gemini, claude):
        for prompt in flagged_prompts:
            resp = await client.post(
                "/llm/hypothesis",
                json={"symbol": "SPY", "user_prompt": prompt},
                headers=bearer(token),
            )
            assert resp.status_code == 400, f"expected 400 for {prompt!r}, got {resp.status_code}"
        gemini.assert_not_called()
        claude.assert_not_called()


@pytest.mark.anyio
async def test_legitimate_prompt_is_not_blocked_by_the_guard(client):
    """Sanity check the guard isn't so aggressive it blocks normal research framing —
    this call WILL reach the (mocked) LLM client, proving the guard only stops
    genuinely flagged text, not everything."""
    reg = await register(client, org_name="Guard Org 3", email="guard3@llm.io", slug="guard-org-3")
    token = reg.json()["access_token"]

    payload = {
        "hypothesis_text": "Mean reversion in high volatility",
        "rationale": "RSI extremes tend to revert in high-vol regimes",
        "suggested_parameters": [],
        "suggested_regime_focus": ["High-Volatility"],
    }

    with patch_llm_providers(payload) as (gemini, claude):
        resp = await client.post(
            "/llm/hypothesis",
            json={"symbol": "SPY", "user_prompt": "Focus the hypothesis on high-volatility regimes."},
            headers=bearer(token),
        )
        assert resp.status_code == 201
        # Reached a provider — and specifically the Gemini lane, which is where
        # generate_hypothesis is routed (creative, high volume). Claude stays untouched.
        gemini.assert_called_once()
        claude.assert_not_called()
