"""Input validation sample tests (Batch 11): deliberately send oversized and
out-of-bounds payloads to a representative sample of endpoints across
different schema files and confirm each rejects with 422 (a Pydantic
validation error), never a 500. The exhaustive audit that found and fixed the
underlying gaps is documented in docs/schemas.md ("Input validation audit");
this file is the spot-check the batch's DoD calls for, not a re-audit.
"""

from __future__ import annotations

from tests.helpers import bearer, register, register_activate_login


async def _token(client, email: str) -> str:
    resp = await register_activate_login(
        client, org_name="ValidationCo", email=email, password="goodpass123"
    )
    return resp.json()["access_token"]


async def test_oversized_password_rejected_with_422(client):
    resp = await register(
        client, org_name="PwCo", email="pw@co.com", password="x" * 129
    )
    assert resp.status_code == 422


async def test_oversized_strategy_name_rejected_with_422(client):
    token = await _token(client, "name@co.com")
    resp = await client.post(
        "/strategies",
        json={"name": "x" * 256, "parameters": {}, "entry_rules": {}, "exit_rules": {}, "risk_constraints": {}},
        headers=bearer(token),
    )
    assert resp.status_code == 422


async def test_oversized_jsonb_field_rejected_with_422(client):
    token = await _token(client, "jsonb@co.com")
    huge_parameters = {"padding": "x" * 200_000}  # well over the 100KB cap
    resp = await client.post(
        "/strategies",
        json={
            "name": "Huge Params Strategy",
            "parameters": huge_parameters,
            "entry_rules": {},
            "exit_rules": {},
            "risk_constraints": {},
        },
        headers=bearer(token),
    )
    assert resp.status_code == 422


async def test_missing_required_field_rejected_with_422(client):
    token = await _token(client, "missing@co.com")
    resp = await client.post(
        "/strategies",
        json={"parameters": {}, "entry_rules": {}, "exit_rules": {}, "risk_constraints": {}},
        headers=bearer(token),
    )
    assert resp.status_code == 422


async def test_ga_config_population_size_out_of_bounds_rejected_with_422(client):
    token = await _token(client, "ga@co.com")
    resp = await client.post(
        "/evolution/run",
        json={"symbol": "AAPL", "ga_config": {"population_size": 100_000}},
        headers=bearer(token),
    )
    assert resp.status_code == 422


async def test_evolution_seed_strategy_list_over_cap_rejected_with_422(client):
    token = await _token(client, "seeds@co.com")
    too_many_ids = [f"00000000-0000-0000-0000-{i:012d}" for i in range(501)]
    resp = await client.post(
        "/evolution/run",
        json={"symbol": "AAPL", "strategy_ids": too_many_ids},
        headers=bearer(token),
    )
    assert resp.status_code == 422


async def test_research_note_too_many_tags_rejected_with_422(client):
    token = await _token(client, "tags@co.com")
    resp = await client.post(
        "/research-notes",
        json={"content": "Some research content.", "tags": [f"tag{i}" for i in range(21)]},
        headers=bearer(token),
    )
    assert resp.status_code == 422


async def test_research_note_missing_content_rejected_with_422(client):
    token = await _token(client, "nocontent@co.com")
    resp = await client.post("/research-notes", json={"title": "No content here"}, headers=bearer(token))
    assert resp.status_code == 422


async def test_regime_detect_symbol_out_of_bounds_rejected_with_422(client):
    token = await _token(client, "regime@co.com")
    resp = await client.post(
        "/regimes/detect", json={"symbol": "x" * 33}, headers=bearer(token)
    )
    assert resp.status_code == 422
