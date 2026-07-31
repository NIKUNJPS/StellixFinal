"""Test 2 (required order): import-graph check — LLMService (and everything it
imports) has no dependency on any strategy_write, failure_write, or evolution
service module. An import-graph check is sufficient (per the batch spec) — this
never actually calls into those modules, so it structurally cannot mutate through
them."""

from __future__ import annotations

from app.llm.architecture_check import find_banned_imports


def test_llm_service_has_no_mutation_service_imports():
    violations = find_banned_imports("app.llm.service")
    assert violations == [], f"app.llm.service transitively imports banned module(s): {violations}"


def test_llm_guard_module_has_no_mutation_service_imports():
    assert find_banned_imports("app.llm.guard") == []


def test_llm_schemas_module_has_no_mutation_service_imports():
    assert find_banned_imports("app.llm.schemas") == []


def test_llm_validation_module_has_no_mutation_service_imports():
    assert find_banned_imports("app.llm.validation") == []


def test_detector_is_not_vacuous_it_catches_a_real_known_violation():
    """Sanity check the checker itself: app.services.failure DOES import from
    app.services.strategy (_load_backtest_frames) — if the detector can't find
    THIS real, known dependency, it isn't actually checking anything."""
    violations = find_banned_imports(
        "app.services.failure", banned_prefixes=("app.services.strategy",)
    )
    assert "app.services.strategy" in violations


def test_llm_service_module_source_never_imports_the_banned_modules_directly():
    """Belt-and-suspenders: parse the actual source file's import statements
    (not a raw substring search, which would also match the docstring's own prose
    explaining what's banned) and confirm none target the banned modules."""
    import ast
    import inspect

    from app.llm import service as llm_service_module

    tree = ast.parse(inspect.getsource(llm_service_module))
    imported = {
        alias.name
        for node in ast.walk(tree)
        if isinstance(node, ast.Import)
        for alias in node.names
    } | {
        node.module
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom) and node.module
    }
    for banned in ("app.services.strategy", "app.services.failure", "app.services.evolution"):
        assert banned not in imported, f"app/llm/service.py actually imports {banned!r}"
