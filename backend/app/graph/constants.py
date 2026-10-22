"""Node labels, relationship types, and key-property names for Research Memory
(docs/schemas.md -> Research Memory).

A closed set: the repository rejects any label outside it, and the API validates
``node_type`` against it, so callers can never invent new kinds of records.
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
    # Batch 30 (ADR 0009): one node per multi-agent desk analysis.
    "AgentAnalysis": "analysis_id",
}

NODE_LABELS = frozenset(NODE_KEY_PROP)

# The 8 edge types from SRC report Section 5.4, plus Batch 30's ANALYZED_IN
# (AgentAnalysis -> Regime).
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
        "ANALYZED_IN",
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
    "AgentAnalysis": ("ticker", "rating", "regime_at_analysis"),
}
