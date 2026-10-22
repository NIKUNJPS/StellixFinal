# ADR 0012 - Research Memory on PostgreSQL (retire Neo4j)

- Status: accepted
- Date: 2026-10-22
- Supersedes: [ADR 0011](0011-in-memory-graph-mode.md); amends the locked stack in `PROJECT_CONSTITUTION.md`

## Context
The "Compounding Memory" pillar was implemented as a Neo4j knowledge graph. In practice:

- every node and edge was already *derived* from Postgres rows by `GraphSyncService`, and
  ADR 0011 had proven the same five research queries run correctly on an in-process index
  rebuilt from Postgres (`GRAPH_BACKEND=memory`) — that mode was what the team actually ran;
- Neo4j added a second database to install, secure, back up, health-check and keep in sync
  (driver, health probe, nightly drift sweep, Docker/Kubernetes config, a managed instance in
  production), for data that Postgres already holds;
- the dual-write could drift (writes made while Neo4j was down), which is why the nightly
  consistency sweep existed at all.

## Decision
Retire Neo4j. PostgreSQL is the only database. The capability is renamed **Research Memory**:

- `app/graph/memory_repository.py` (`InMemoryGraphRepository`) is the only repository
  implementation. It keeps typed records keyed by `(organization_id, label, key)` and typed
  relationships, so every read is tenant-scoped by construction.
- `app/graph/memory_index.py` builds the index in the API process at startup (published as it
  fills, largest organization first) and rebuilds it every `RESEARCH_MEMORY_REFRESH_SECONDS`
  (default 300, minimum 30), swapping the fresh index in atomically. Writes made inside the API
  land immediately via `GraphSyncService`; writes made by Celery workers appear after the next
  rebuild.
- The same 6 record types, 8 relationships and 5 research queries (`/graph/query/*`) are kept,
  so the API contract and the explorer pages are unchanged. Dashboard routes moved from
  `/<role>/graph` to `/<role>/memory`; the old URLs redirect permanently.
- Removed: the Neo4j driver dependency, `neo4j_client`, `neo4j_repository`, the Cypher tenant
  guard (`tenant_query`), the Postgres↔Neo4j drift sweep and its Celery beat entry, the backfill
  CLI, the Neo4j health probe, and Neo4j from Docker Compose, Kubernetes and env examples.
- The System Monitoring page reports the index instead of a drift sweep: when it was last
  rebuilt and how many of the organization's strategies, failures and notes it holds.

## Consequences
- One fewer stateful service to run, secure and back up; local setup is Postgres + Redis.
- The index cannot drift from Postgres: it is re-derived from it on every rebuild.
- The index is held in the API process's memory. With several API replicas each holds its own
  copy (all derived from the same database), and memory use grows with the size of the research
  history. If that ever becomes a constraint, the same repository interface can be backed by
  recursive-CTE queries against Postgres directly, without touching callers.
- Worker-side writes are visible after at most one refresh interval rather than instantly.
