"""Graph repository interface — implemented by both a real Neo4j backend
(``neo4j_repository.py``) and an in-memory test double (``fake_repository.py``).

Kept deliberately "dumb": this layer only knows about nodes/edges/labels/properties.
Postgres lookups (e.g. resolving which Regime segment a label maps to, or a
Researcher's name/role from the Users table) are the caller's (``GraphSyncService``'s)
job, so this interface stays testable without a database at all.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol


class GraphRepository(Protocol):
    # --- generic MERGE-based (idempotent) node/edge sync -------------------- #
    async def merge_node(
        self, organization_id: str, *, label: str, key_value: str, properties: dict[str, Any]
    ) -> None:
        """MERGE a node by (label, organization_id, key_value); upsert properties."""
        ...

    async def merge_edge(
        self,
        organization_id: str,
        *,
        edge_type: str,
        from_label: str,
        from_key: str,
        to_label: str,
        to_key: str,
        edge_key: dict[str, Any] | None = None,
        properties: dict[str, Any] | None = None,
    ) -> None:
        """MERGE an edge. ``edge_key`` extra properties (e.g. failure_id) let more than
        one edge instance exist between the same two nodes (e.g. repeated FAILED_IN)."""
        ...

    # --- the 5 named research queries ---------------------------------------- #
    async def failed_strategies_by_regime(
        self, organization_id: str, *, regime: str, since: datetime
    ) -> list[dict[str, Any]]: ...

    async def lineage(self, organization_id: str, *, strategy_id: str) -> dict[str, Any]: ...

    async def robust_across_regimes(
        self, organization_id: str, *, min_regimes: int
    ) -> list[dict[str, Any]]: ...

    async def recurring_failure_modes(
        self, organization_id: str, *, min_occurrences: int
    ) -> list[dict[str, Any]]: ...

    async def hypotheses_leading_to_active(self, organization_id: str) -> list[dict[str, Any]]: ...

    # --- generic node detail / search ---------------------------------------- #
    async def get_node(
        self, organization_id: str, *, node_type: str, node_id: str
    ) -> dict[str, Any] | None: ...

    async def search_nodes(
        self, organization_id: str, *, q: str, node_type: str | None
    ) -> list[dict[str, Any]]: ...

    # --- consistency checks (Batch 7 nightly sweep) -------------------------- #
    async def all_node_ids(self, organization_id: str, *, node_type: str) -> list[str]: ...

    async def count_nodes(self, organization_id: str, *, node_type: str) -> int: ...
