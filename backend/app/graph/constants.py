"""Node labels, edge types, and key-property names (docs/schemas.md -> Knowledge Graph).

Centralized here because both graph repository implementations (real Cypher and the
in-memory fake) and the Cypher-injection allow-list check in ``neo4j_repository.py``
must agree on the exact same closed set of labels/edges.
"""

from __future__ import annotations

# Node labels -> their unique key property name.
NODE_KEY_PROP: dict[str, str] = {
    "Strategy": "strategy_id",
    "Regime": "regime_id",
    "Performance": "performance_id",
    "Failure": "failure_id",
    "ResearchNote": "note_id",
    "Researcher": "user_id",
}

NODE_LABELS = frozenset(NODE_KEY_PROP)

# Exact 8 edge types from SRC report Section 5.4.
EDGE_TYPES = frozenset(
    {
        "VALID_IN",
        "FAILED_IN",
        "MUTATED_FROM",
        "INSPIRED_BY",
        "ADAPTED_FROM",
        "EVALUATED_BY",
        "CAUSED_BY",
        "AUTHORED_BY",
    }
)

# Text properties searched by GET /graph/search, per label.
SEARCHABLE_PROPS: dict[str, tuple[str, ...]] = {
    "Strategy": ("name",),
    "Regime": ("regime_label", "symbol"),
    "Performance": ("performance_id",),
    "Failure": ("trigger_condition", "llm_explanation"),
    "ResearchNote": ("content", "hypothesis"),
    "Researcher": ("name", "role"),
}
