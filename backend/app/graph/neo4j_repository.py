"""Real Neo4j implementation of ``GraphRepository`` — the official ``neo4j`` async
driver (NOT py2neo), real parameterized Cypher, every query tenant-scoped via
``run_scoped``.

Label/edge-type names are always validated against the closed allow-lists in
``constants.py`` *before* being interpolated into Cypher text (Cypher cannot
parameterize labels/relationship-types/property-keys, only values) — since only the
6 known labels and 8 known edge types can ever reach the query string, this is not a
Cypher-injection vector. All variable *values* (ids, search terms, thresholds, dates)
always go through ``$parameters``.

Not yet runtime-verified against a live Neo4j instance on this dev machine (no
Docker/native Neo4j here yet — see docs/schemas.md). Activates automatically once
``NEO4J_URI`` points at a reachable instance.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from neo4j import AsyncDriver

from app.graph.constants import EDGE_TYPES, NODE_KEY_PROP, NODE_LABELS, SEARCHABLE_PROPS
from app.graph.tenant_query import run_scoped

_MAX_LINEAGE_DEPTH = 20  # sane bound for a variable-length evolutionary-lineage traversal


def _check_label(label: str) -> None:
    if label not in NODE_LABELS:
        raise ValueError(f"Unknown node label: {label!r} (expected one of {sorted(NODE_LABELS)})")


def _check_edge(edge_type: str) -> None:
    if edge_type not in EDGE_TYPES:
        raise ValueError(f"Unknown edge type: {edge_type!r} (expected one of {sorted(EDGE_TYPES)})")


class Neo4jGraphRepository:
    def __init__(self, driver: AsyncDriver) -> None:
        self._driver = driver

    # --- generic MERGE-based (idempotent) node/edge sync -------------------- #
    async def merge_node(
        self, organization_id: str, *, label: str, key_value: str, properties: dict[str, Any]
    ) -> None:
        _check_label(label)
        key_prop = NODE_KEY_PROP[label]
        query = (
            f"MERGE (n:{label} {{organization_id: $organization_id, {key_prop}: $key_value}}) "
            "SET n += $properties"
        )
        async with self._driver.session() as session:
            await run_scoped(
                session, query, organization_id=organization_id, key_value=key_value, properties=properties
            )

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
        _check_edge(edge_type)
        _check_label(from_label)
        _check_label(to_label)
        from_key_prop = NODE_KEY_PROP[from_label]
        to_key_prop = NODE_KEY_PROP[to_label]
        edge_key = edge_key or {}
        properties = properties or {}

        edge_key_clause = "".join(f", {k}: $edge_key_{k}" for k in edge_key)
        query = (
            f"MATCH (a:{from_label} {{organization_id: $organization_id, {from_key_prop}: $from_key}}) "
            f"MATCH (b:{to_label} {{organization_id: $organization_id, {to_key_prop}: $to_key}}) "
            f"MERGE (a)-[e:{edge_type} {{organization_id: $organization_id{edge_key_clause}}}]->(b) "
            "SET e += $properties"
        )
        params: dict[str, Any] = {
            "organization_id": organization_id,
            "from_key": from_key,
            "to_key": to_key,
            "properties": properties,
        }
        for k, v in edge_key.items():
            params[f"edge_key_{k}"] = v
        async with self._driver.session() as session:
            await run_scoped(session, query, **params)

    async def delete_node(self, organization_id: str, *, label: str, key_value: str) -> None:
        _check_label(label)
        key_prop = NODE_KEY_PROP[label]
        query = (
            f"MATCH (n:{label} {{organization_id: $organization_id, {key_prop}: $key_value}}) "
            "DETACH DELETE n"
        )
        async with self._driver.session() as session:
            await run_scoped(session, query, organization_id=organization_id, key_value=key_value)

    # --- the 5 named research queries ---------------------------------------- #
    async def failed_strategies_by_regime(
        self, organization_id: str, *, regime: str, since: datetime
    ) -> list[dict[str, Any]]:
        query = (
            "MATCH (s:Strategy {organization_id: $organization_id})"
            "-[e:FAILED_IN {organization_id: $organization_id}]->"
            "(r:Regime {organization_id: $organization_id, regime_label: $regime}) "
            "WHERE e.failure_timestamp >= $since "
            "RETURN s.strategy_id AS strategy_id, s.name AS name, s.status AS status, "
            "e.failure_id AS failure_id, e.trigger_condition AS trigger_condition, "
            "e.llm_explanation AS llm_explanation, e.failure_timestamp AS failure_timestamp "
            "ORDER BY e.failure_timestamp DESC"
        )
        async with self._driver.session() as session:
            return await run_scoped(
                session, query, organization_id=organization_id, regime=regime, since=since.isoformat()
            )

    async def lineage(self, organization_id: str, *, strategy_id: str) -> dict[str, Any]:
        target_q = (
            "MATCH (s:Strategy {organization_id: $organization_id, strategy_id: $strategy_id}) RETURN s"
        )
        ancestors_q = (
            "MATCH (s:Strategy {organization_id: $organization_id, strategy_id: $strategy_id})"
            f"-[:MUTATED_FROM|ADAPTED_FROM*1..{_MAX_LINEAGE_DEPTH}]->"
            "(a:Strategy {organization_id: $organization_id}) "
            "RETURN DISTINCT a"
        )
        descendants_q = (
            "MATCH (d:Strategy {organization_id: $organization_id})"
            f"-[:MUTATED_FROM|ADAPTED_FROM*1..{_MAX_LINEAGE_DEPTH}]->"
            "(s:Strategy {organization_id: $organization_id, strategy_id: $strategy_id}) "
            "RETURN DISTINCT d"
        )
        edges_q = (
            "MATCH (a:Strategy {organization_id: $organization_id})"
            "-[e:MUTATED_FROM|ADAPTED_FROM {organization_id: $organization_id}]->"
            "(b:Strategy {organization_id: $organization_id}) "
            "RETURN a.strategy_id AS from_id, type(e) AS edge_type, b.strategy_id AS to_id"
        )
        async with self._driver.session() as session:
            target_rows = await run_scoped(
                session, target_q, organization_id=organization_id, strategy_id=strategy_id
            )
            if not target_rows:
                return {"target": None, "ancestors": [], "descendants": [], "edges": []}
            ancestor_rows = await run_scoped(
                session, ancestors_q, organization_id=organization_id, strategy_id=strategy_id
            )
            descendant_rows = await run_scoped(
                session, descendants_q, organization_id=organization_id, strategy_id=strategy_id
            )
            edge_rows = await run_scoped(session, edges_q, organization_id=organization_id)

        node_ids = {strategy_id}
        node_ids.update(r["a"]["strategy_id"] for r in ancestor_rows)
        node_ids.update(r["d"]["strategy_id"] for r in descendant_rows)
        edges = [e for e in edge_rows if e["from_id"] in node_ids and e["to_id"] in node_ids]
        return {
            "target": target_rows[0]["s"],
            "ancestors": [r["a"] for r in ancestor_rows],
            "descendants": [r["d"] for r in descendant_rows],
            "edges": edges,
        }

    async def robust_across_regimes(
        self, organization_id: str, *, min_regimes: int
    ) -> list[dict[str, Any]]:
        query = (
            "MATCH (s:Strategy {organization_id: $organization_id})"
            "-[:VALID_IN {organization_id: $organization_id}]->"
            "(r:Regime {organization_id: $organization_id}) "
            "WITH s, count(DISTINCT r.regime_label) AS regime_count "
            "WHERE regime_count >= $min_regimes "
            "RETURN s.strategy_id AS strategy_id, s.name AS name, "
            "s.robustness_score AS robustness_score, regime_count "
            "ORDER BY s.robustness_score DESC"
        )
        async with self._driver.session() as session:
            return await run_scoped(
                session, query, organization_id=organization_id, min_regimes=min_regimes
            )

    async def recurring_failure_modes(
        self, organization_id: str, *, min_occurrences: int
    ) -> list[dict[str, Any]]:
        query = (
            "MATCH (s:Strategy {organization_id: $organization_id})"
            "-[e:FAILED_IN {organization_id: $organization_id}]->"
            "(r:Regime {organization_id: $organization_id}) "
            "WITH r.regime_label AS regime_label, e.trigger_condition AS trigger_condition, "
            "count(e) AS occurrence_count, collect(DISTINCT s.strategy_id) AS strategy_ids "
            "WHERE occurrence_count >= $min_occurrences "
            "RETURN regime_label, trigger_condition, occurrence_count, "
            "size(strategy_ids) AS strategy_count, strategy_ids "
            "ORDER BY occurrence_count DESC"
        )
        async with self._driver.session() as session:
            return await run_scoped(
                session, query, organization_id=organization_id, min_occurrences=min_occurrences
            )

    async def hypotheses_leading_to_active(self, organization_id: str) -> list[dict[str, Any]]:
        query = (
            "MATCH (s:Strategy {organization_id: $organization_id, status: 'active'})"
            "-[:INSPIRED_BY {organization_id: $organization_id}]->"
            "(n:ResearchNote {organization_id: $organization_id}) "
            "RETURN n.note_id AS note_id, n.hypothesis AS hypothesis, n.content AS content, "
            "collect({strategy_id: s.strategy_id, name: s.name}) AS active_strategies"
        )
        async with self._driver.session() as session:
            return await run_scoped(session, query, organization_id=organization_id)

    # --- generic node detail / search ---------------------------------------- #
    async def get_node(
        self, organization_id: str, *, node_type: str, node_id: str
    ) -> dict[str, Any] | None:
        _check_label(node_type)
        key_prop = NODE_KEY_PROP[node_type]
        node_q = f"MATCH (n:{node_type} {{organization_id: $organization_id, {key_prop}: $node_id}}) RETURN n"
        out_q = (
            f"MATCH (n:{node_type} {{organization_id: $organization_id, {key_prop}: $node_id}})-[e]->(m) "
            "RETURN type(e) AS edge_type, labels(m) AS other_labels, properties(m) AS other, "
            "properties(e) AS edge_properties"
        )
        in_q = (
            f"MATCH (n:{node_type} {{organization_id: $organization_id, {key_prop}: $node_id}})<-[e]-(m) "
            "RETURN type(e) AS edge_type, labels(m) AS other_labels, properties(m) AS other, "
            "properties(e) AS edge_properties"
        )
        async with self._driver.session() as session:
            node_rows = await run_scoped(session, node_q, organization_id=organization_id, node_id=node_id)
            if not node_rows:
                return None
            out_rows = await run_scoped(session, out_q, organization_id=organization_id, node_id=node_id)
            in_rows = await run_scoped(session, in_q, organization_id=organization_id, node_id=node_id)
        return {
            "node_type": node_type,
            "node": node_rows[0]["n"],
            "outgoing": out_rows,
            "incoming": in_rows,
        }

    async def search_nodes(
        self, organization_id: str, *, q: str, node_type: str | None
    ) -> list[dict[str, Any]]:
        labels = [node_type] if node_type else sorted(NODE_LABELS)
        for label in labels:
            _check_label(label)
        results: list[dict[str, Any]] = []
        async with self._driver.session() as session:
            for label in labels:
                props = SEARCHABLE_PROPS.get(label, ())
                if not props:
                    continue
                where_clause = " OR ".join(f"toLower(n.{p}) CONTAINS toLower($q)" for p in props)
                query = (
                    f"MATCH (n:{label} {{organization_id: $organization_id}}) "
                    f"WHERE {where_clause} RETURN n LIMIT 25"
                )
                rows = await run_scoped(session, query, organization_id=organization_id, q=q)
                for r in rows:
                    results.append({"node_type": label, **r["n"]})
        return results

    # --- consistency checks (Batch 7 nightly sweep) -------------------------- #
    async def all_node_ids(self, organization_id: str, *, node_type: str) -> list[str]:
        _check_label(node_type)
        key_prop = NODE_KEY_PROP[node_type]
        query = f"MATCH (n:{node_type} {{organization_id: $organization_id}}) RETURN n.{key_prop} AS id"
        async with self._driver.session() as session:
            rows = await run_scoped(session, query, organization_id=organization_id)
        return [r["id"] for r in rows]

    async def count_nodes(self, organization_id: str, *, node_type: str) -> int:
        _check_label(node_type)
        query = f"MATCH (n:{node_type} {{organization_id: $organization_id}}) RETURN count(n) AS c"
        async with self._driver.session() as session:
            rows = await run_scoped(session, query, organization_id=organization_id)
        return rows[0]["c"] if rows else 0
