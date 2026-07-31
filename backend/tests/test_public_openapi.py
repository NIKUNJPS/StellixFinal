"""Security-relevant: the PUBLIC OpenAPI schema must never advertise the internal
SuperAdmin control plane (Batch 22).

The public /docs page (frontend) renders straight from this schema, so any
/superadmin/* path leaking in here would expose the founder's cross-tenant surface
to anonymous visitors. The routes still FUNCTION (include_in_schema=False only hides
them from schema/doc generation) — that's covered by test_superadmin.py; this test
guards the schema boundary.
"""

from __future__ import annotations

from app.main import app


def test_public_openapi_excludes_all_superadmin_paths():
    schema = app.openapi()
    paths = list(schema.get("paths", {}).keys())
    leaked = [p for p in paths if "superadmin" in p.lower()]
    assert leaked == [], f"internal superadmin routes leaked into the public schema: {leaked}"


def test_public_openapi_never_mentions_superadmin_anywhere():
    """Belt-and-braces: the word 'superadmin' must not appear ANYWHERE in the
    serialized public schema — not in a path, schema name, tag, OR a prose
    description. This catches internal tooling names leaking through docstrings that
    become OpenAPI descriptions, which a path/tag check alone would miss."""
    import json

    serialized = json.dumps(app.openapi()).lower()
    assert "superadmin" not in serialized, "the word 'superadmin' leaked into the public schema text"


def test_public_openapi_excludes_superadmin_tag():
    schema = app.openapi()
    tag_names = {t["name"] for t in schema.get("tags", [])}
    assert "SuperAdmin (Internal)" not in tag_names
    # No operation anywhere may carry the internal tag either.
    for methods in schema.get("paths", {}).values():
        for op in methods.values():
            if isinstance(op, dict):
                assert "SuperAdmin (Internal)" not in (op.get("tags") or [])


def test_public_openapi_still_exposes_public_routes():
    """Excluding superadmin must NOT have removed the real public surface."""
    schema = app.openapi()
    paths = schema.get("paths", {})
    for expected in ("/auth/login", "/auth/register", "/regimes/detect", "/usage/rate-limits"):
        assert expected in paths, f"public route {expected} missing from schema"
    assert schema["info"]["title"] == "Stellix Labs API"
    tag_names = {t["name"] for t in schema.get("tags", [])}
    assert {"Authentication", "Market Data", "Regime Detection"} <= tag_names


def test_key_schemas_have_examples():
    """The most-used request schemas carry a concrete example (not just a type)."""
    schema = app.openapi()
    components = schema.get("components", {}).get("schemas", {})
    for name in ("RegisterRequest", "LoginRequest", "IngestRequest", "RegimeDetectRequest"):
        assert name in components, f"{name} not in schema components"
        assert "example" in components[name], f"{name} is missing a json_schema_extra example"
