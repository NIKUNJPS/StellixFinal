"""Safeguard 2 — NO EXECUTION AUTHORITY, enforced as an import-graph check.

Statically parses (AST, never actually imports) a module's own source and every
``app.*`` module it transitively imports, looking for a banned dependency. Static
so it can't be fooled by modules some other test happened to import first (a
runtime ``sys.modules`` check would be contaminated by import order); a plain
source-level import is also exactly the thing this safeguard cares about — if
``app.llm.service`` doesn't even import the write-service module, it structurally
cannot call into it.
"""

from __future__ import annotations

import ast
import importlib.util
from pathlib import Path

BANNED_MODULE_PREFIXES: tuple[str, ...] = (
    "app.services.strategy",
    "app.services.failure",
    "app.services.evolution",
)


def _module_file(module_name: str) -> Path | None:
    try:
        spec = importlib.util.find_spec(module_name)
    except (ImportError, ModuleNotFoundError, ValueError):
        return None
    if spec is None or spec.origin is None:
        return None
    return Path(spec.origin)


def _imports_in_file(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                names.add(alias.name)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


def find_banned_imports(
    root_module: str,
    *,
    banned_prefixes: tuple[str, ...] = BANNED_MODULE_PREFIXES,
    _visited: set[str] | None = None,
) -> list[str]:
    """Return every banned module name found anywhere in root_module's transitive
    app.* import closure (empty list = clean)."""
    if _visited is None:
        _visited = set()
    if root_module in _visited:
        return []
    _visited.add(root_module)

    path = _module_file(root_module)
    if path is None or path.suffix != ".py":
        return []

    violations: list[str] = []
    for imp in _imports_in_file(path):
        if any(imp == banned or imp.startswith(banned + ".") for banned in banned_prefixes):
            violations.append(imp)
        if imp.startswith("app.") and imp not in _visited:
            violations.extend(
                find_banned_imports(imp, banned_prefixes=banned_prefixes, _visited=_visited)
            )
    return violations
