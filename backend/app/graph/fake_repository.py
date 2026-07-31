"""In-memory ``GraphRepository`` test double.

Used because Neo4j is not runtime-available on this dev machine (see docs/schemas.md).
This is NOT a rubber-stamp mock: it's a hand-verified, from-scratch implementation of
the same MERGE-idempotency and traversal semantics the real Cypher in
``neo4j_repository.py`` implements, so tests against it exercise real query *logic*
(tenant filtering, idempotent upsert, multi-hop traversal, aggregation thresholds).

Caveat (documented in docs/schemas.md): this does NOT execute the literal Cypher
strings, so a syntax bug in ``neo4j_repository.py`` itself would not be caught here —
that requires a live Neo4j pass, not yet possible on this machine.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.graph.constants import NODE_KEY_PROP, NODE_LABELS, SEARCHABLE_PROPS

_EdgeIdentity = tuple[str, str, str, str, str, str, tuple[tuple[str, Any], ...]]


class FakeGraphRepository:
    def __init__(self) -> None:
        # (organization_id, label, key_value) -> properties
        self._nodes: dict[tuple[str, str, str], dict[str, Any]] = {}
        # identity (includes edge_key so repeated edges, e.g. FAILED_IN, can coexist) -> properties
        self._edges: dict[_EdgeIdentity, dict[str, Any]] = {}

    def reset(self) -> None:
        self._nodes.clear()
        self._edges.clear()

    # --- generic MERGE-based (idempotent) node/edge sync -------------------- #
    async def merge_node(
        self, organization_id: str, *, label: str, key_value: str, properties: dict[str, Any]
    ) -> None:
        if label not in NODE_LABELS:
            raise ValueError(f"Unknown node label: {label!r}")
        key = (organization_id, label, key_value)
        existing = self._nodes.get(key, {})
        # Mirrors real Cypher: `MERGE (n:Label {key_prop: $key_value, ...})` always
        # sets the key property as a real, readable property — not just match criteria.
        self._nodes[key] = {
            **existing,
            **properties,
            NODE_KEY_PROP[label]: key_value,
            "organization_id": organization_id,
        }

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
        # Mirrors real Cypher's `MATCH (a) MATCH (b) MERGE (a)-[e]->(b)`: if either
        # endpoint doesn't exist yet, the MATCH matches zero rows and nothing happens.
        if (organization_id, from_label, from_key) not in self._nodes:
            return
        if (organization_id, to_label, to_key) not in self._nodes:
            return

        edge_key = edge_key or {}
        properties = properties or {}
        identity: _EdgeIdentity = (
            organization_id,
            edge_type,
            from_label,
            from_key,
            to_label,
            to_key,
            tuple(sorted(edge_key.items())),
        )
        existing = self._edges.get(identity, {})
        self._edges[identity] = {
            **existing,
            **edge_key,
            **properties,
            "organization_id": organization_id,
        }

    def _edges_of_type(self, organization_id: str, edge_type: str):
        for identity, props in self._edges.items():
            org, etype, from_label, from_key, to_label, to_key, _ = identity
            if org == organization_id and etype == edge_type:
                yield from_label, from_key, to_label, to_key, props

    # --- the 5 named research queries ---------------------------------------- #
    async def failed_strategies_by_regime(
        self, organization_id: str, *, regime: str, since: datetime
    ) -> list[dict[str, Any]]:
        since_str = since.isoformat()
        rows: list[dict[str, Any]] = []
        for _, from_key, _, to_key, props in self._edges_of_type(organization_id, "FAILED_IN"):
            regime_node = self._nodes.get((organization_id, "Regime", to_key))
            if regime_node is None or regime_node.get("regime_label") != regime:
                continue
            ts = props.get("failure_timestamp", "")
            if ts < since_str:
                continue
            s = self._nodes.get((organization_id, "Strategy", from_key)) or {}
            rows.append(
                {
                    "strategy_id": from_key,
                    "name": s.get("name"),
                    "status": s.get("status"),
                    "failure_id": props.get("failure_id"),
                    "trigger_condition": props.get("trigger_condition"),
                    "llm_explanation": props.get("llm_explanation"),
                    "failure_timestamp": ts,
                }
            )
        rows.sort(key=lambda r: r["failure_timestamp"], reverse=True)
        return rows

    async def lineage(self, organization_id: str, *, strategy_id: str) -> dict[str, Any]:
        target = self._nodes.get((organization_id, "Strategy", strategy_id))
        if target is None:
            return {"target": None, "ancestors": [], "descendants": [], "edges": []}

        # child -> [parent, ...] (edge direction is child -[MUTATED_FROM|ADAPTED_FROM]-> parent)
        forward: dict[str, list[str]] = {}
        for _, from_key, _, to_key, _ in self._edges_of_type(organization_id, "MUTATED_FROM"):
            forward.setdefault(from_key, []).append(to_key)
        for _, from_key, _, to_key, _ in self._edges_of_type(organization_id, "ADAPTED_FROM"):
            forward.setdefault(from_key, []).append(to_key)
        backward: dict[str, list[str]] = {}
        for child, parents in forward.items():
            for p in parents:
                backward.setdefault(p, []).append(child)

        def _bfs(start: str, adjacency: dict[str, list[str]]) -> set[str]:
            seen: set[str] = set()
            frontier = [start]
            depth = 0
            while frontier and depth < 20:
                nxt = []
                for node_id in frontier:
                    for neighbor in adjacency.get(node_id, []):
                        if neighbor not in seen and neighbor != start:
                            seen.add(neighbor)
                            nxt.append(neighbor)
                frontier = nxt
                depth += 1
            return seen

        ancestor_ids = _bfs(strategy_id, forward)
        descendant_ids = _bfs(strategy_id, backward)
        node_ids = {strategy_id} | ancestor_ids | descendant_ids

        edges: list[dict[str, Any]] = []
        for edge_type in ("MUTATED_FROM", "ADAPTED_FROM"):
            for _, from_key, _, to_key, _ in self._edges_of_type(organization_id, edge_type):
                if from_key in node_ids and to_key in node_ids:
                    edges.append({"from_id": from_key, "edge_type": edge_type, "to_id": to_key})

        return {
            "target": target,
            "ancestors": [self._nodes[(organization_id, "Strategy", a)] for a in ancestor_ids],
            "descendants": [self._nodes[(organization_id, "Strategy", d)] for d in descendant_ids],
            "edges": edges,
        }

    async def robust_across_regimes(
        self, organization_id: str, *, min_regimes: int
    ) -> list[dict[str, Any]]:
        labels_by_strategy: dict[str, set[str]] = {}
        for _, from_key, _, to_key, _ in self._edges_of_type(organization_id, "VALID_IN"):
            regime_node = self._nodes.get((organization_id, "Regime", to_key))
            if regime_node is None:
                continue
            labels_by_strategy.setdefault(from_key, set()).add(regime_node.get("regime_label"))

        rows: list[dict[str, Any]] = []
        for strategy_id, labels in labels_by_strategy.items():
            if len(labels) >= min_regimes:
                s = self._nodes.get((organization_id, "Strategy", strategy_id)) or {}
                rows.append(
                    {
                        "strategy_id": strategy_id,
                        "name": s.get("name"),
                        "robustness_score": s.get("robustness_score"),
                        "regime_count": len(labels),
                    }
                )
        rows.sort(key=lambda r: (r["robustness_score"] if r["robustness_score"] is not None else -1.0), reverse=True)
        return rows

    async def recurring_failure_modes(
        self, organization_id: str, *, min_occurrences: int
    ) -> list[dict[str, Any]]:
        groups: dict[tuple[str | None, str | None], dict[str, Any]] = {}
        for _, from_key, _, to_key, props in self._edges_of_type(organization_id, "FAILED_IN"):
            regime_node = self._nodes.get((organization_id, "Regime", to_key))
            if regime_node is None:
                continue
            key = (regime_node.get("regime_label"), props.get("trigger_condition"))
            g = groups.setdefault(key, {"count": 0, "strategy_ids": set()})
            g["count"] += 1
            g["strategy_ids"].add(from_key)

        rows: list[dict[str, Any]] = []
        for (regime_label, trigger_condition), g in groups.items():
            if g["count"] >= min_occurrences:
                rows.append(
                    {
                        "regime_label": regime_label,
                        "trigger_condition": trigger_condition,
                        "occurrence_count": g["count"],
                        "strategy_count": len(g["strategy_ids"]),
                        "strategy_ids": sorted(g["strategy_ids"]),
                    }
                )
        rows.sort(key=lambda r: r["occurrence_count"], reverse=True)
        return rows

    async def hypotheses_leading_to_active(self, organization_id: str) -> list[dict[str, Any]]:
        groups: dict[str, dict[str, Any]] = {}
        for _, from_key, _, to_key, _ in self._edges_of_type(organization_id, "INSPIRED_BY"):
            strategy_node = self._nodes.get((organization_id, "Strategy", from_key))
            if strategy_node is None or strategy_node.get("status") != "active":
                continue
            note_node = self._nodes.get((organization_id, "ResearchNote", to_key))
            if note_node is None:
                continue
            g = groups.setdefault(
                to_key,
                {
                    "note_id": to_key,
                    "hypothesis": note_node.get("hypothesis"),
                    "content": note_node.get("content"),
                    "active_strategies": [],
                },
            )
            g["active_strategies"].append({"strategy_id": from_key, "name": strategy_node.get("name")})
        return list(groups.values())

    # --- generic node detail / search ---------------------------------------- #
    async def get_node(
        self, organization_id: str, *, node_type: str, node_id: str
    ) -> dict[str, Any] | None:
        node = self._nodes.get((organization_id, node_type, node_id))
        if node is None:
            return None
        outgoing: list[dict[str, Any]] = []
        incoming: list[dict[str, Any]] = []
        for identity, props in self._edges.items():
            org, etype, from_label, from_key, to_label, to_key, _ = identity
            if org != organization_id:
                continue
            if from_label == node_type and from_key == node_id:
                other = self._nodes.get((organization_id, to_label, to_key)) or {}
                outgoing.append(
                    {"edge_type": etype, "other_labels": [to_label], "other": other, "edge_properties": props}
                )
            if to_label == node_type and to_key == node_id:
                other = self._nodes.get((organization_id, from_label, from_key)) or {}
                incoming.append(
                    {"edge_type": etype, "other_labels": [from_label], "other": other, "edge_properties": props}
                )
        return {"node_type": node_type, "node": node, "outgoing": outgoing, "incoming": incoming}

    async def search_nodes(
        self, organization_id: str, *, q: str, node_type: str | None
    ) -> list[dict[str, Any]]:
        labels = {node_type} if node_type else set(NODE_LABELS)
        q_lower = q.lower()
        results: list[dict[str, Any]] = []
        for (org, label, _key_value), props in self._nodes.items():
            if org != organization_id or label not in labels:
                continue
            for prop_name in SEARCHABLE_PROPS.get(label, ()):
                value = props.get(prop_name)
                if value and q_lower in str(value).lower():
                    results.append({"node_type": label, **props})
                    break
        return results

    # --- consistency checks (Batch 7 nightly sweep) -------------------------- #
    async def all_node_ids(self, organization_id: str, *, node_type: str) -> list[str]:
        return [
            key_value
            for (org, label, key_value) in self._nodes
            if org == organization_id and label == node_type
        ]

    async def count_nodes(self, organization_id: str, *, node_type: str) -> int:
        return len(await self.all_node_ids(organization_id, node_type=node_type))
