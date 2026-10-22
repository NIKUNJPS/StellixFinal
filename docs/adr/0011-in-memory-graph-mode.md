# ADR 0011 - Optional in-memory knowledge graph (`GRAPH_BACKEND=memory`)

- Status: superseded by [ADR 0012](0012-research-memory-on-postgres.md) — the in-memory index is now the only implementation
- Date: 2026-10-21

## Context
The Knowledge Graph pages and the five research queries read from Neo4j. On a developer laptop or a
demo machine with no Neo4j installed, those pages are a blank canvas and every graph endpoint returns
503. The graph is *derived* data - every node and edge is produced by `GraphSyncService` from Postgres
rows, and `scripts/backfill_graph.py` already replays Postgres into Neo4j.

## Decision
Add an explicit, opt-in setting `GRAPH_BACKEND` (`neo4j` default, or `memory`). In `memory` mode the
API process replays all organizations from Postgres into an in-process `FakeGraphRepository`
(the same repository the graph test-suite already trusts), at startup and every
`GRAPH_MEMORY_REFRESH_SECONDS` (default 1800). Organizations are replayed largest-first, and the first
build is published while it fills so the active tenant is queryable within seconds; later refreshes are
built off to the side and swapped in atomically. The replay logic moved to `app/graph/backfill.py` so the CLI and this mode share one
implementation.

## Consequences
- Knowledge Graph works without Neo4j; tenant isolation is unchanged (every node carries `organization_id`).
- It is **not** a production replacement: the graph lives in the API process, is rebuilt rather than
  durable, and work done by Celery workers appears after the next refresh. Production keeps `neo4j`.
- Celery workers in this mode write to a throwaway in-process graph instead of timing out on a socket.
- The Neo4j health probe reports OK in this mode (Neo4j is intentionally unused) and the nightly
  graph-consistency sweep stands down (it would otherwise compare Postgres to an empty worker-side graph).
- The default is unchanged, so existing deployments behave exactly as before.
