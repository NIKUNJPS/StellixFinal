# ADR 0004: Managed cloud data services in production (no in-cluster StatefulSets)

- **Status:** Accepted
- **Date:** 2026-07-12
- **Batch:** 17

## Context

Batch 17 introduces the production Kubernetes manifests (`infra/k8s/`). The platform
depends on three stateful stores — PostgreSQL (+ TimescaleDB extension), Neo4j 5, and
Redis 7. We must decide whether to run these **inside the cluster** (StatefulSets +
PersistentVolumeClaims) or point at **managed cloud services**.

Local development already runs all three in containers (`infra/docker-compose.yml`);
that is not in question. This decision is about the *production* deployment target.

## Decision

**Run the stateful tier as managed cloud services; keep only the stateless app tier
(API, Celery worker, frontend) in Kubernetes.** The K8s manifests therefore contain
**no StatefulSets** for Postgres/Neo4j/Redis — they are reached via connection strings
in the ConfigMap (hosts) and Secret (credentials):

- **PostgreSQL + TimescaleDB** → a managed Postgres with the TimescaleDB extension
  available (e.g. Timescale Cloud, or a cloud Postgres that permits the extension).
- **Neo4j 5** → managed Neo4j AuraDB.
- **Redis 7** → a managed Redis (cloud provider or Redis Cloud).

## Rationale

1. **Operational burden.** Running databases well in Kubernetes (backups, failover,
   version upgrades, storage expansion, PITR, connection pooling) is a specialist,
   full-time responsibility. For a small team shipping v1, a managed service buys
   automated backups, point-in-time recovery, HA failover, and patching for far less
   risk than hand-rolled StatefulSets.
2. **Data safety.** The #1 way self-managed K8s databases lose data is a botched
   volume/StatefulSet operation. Managed services with automated snapshots + PITR
   give us the `≤ 5 min` Postgres RPO in `docs/disaster_recovery.md` out of the box.
3. **Stateless app tier is where K8s shines.** The API/worker/frontend are horizontally
   scalable, disposable, and probe-driven — exactly what Deployments + HPAs are for.
   Mixing durable state into that same substrate is where most of the operational pain
   comes from.
4. **Clean separation already exists.** The app reaches every store purely through
   connection strings in config (`app/core/config.py`), so swapping local containers
   for managed endpoints is a pure configuration change — no code change.

## Consequences

- **Positive:** dramatically lower ops risk for v1; automated backups/PITR/HA; the
  cluster is fully reproducible and stateless (a lost cluster loses nothing durable).
- **Negative / trade-offs:**
  - Vendor cost and some lock-in per store (mitigated: all three speak standard
    protocols — Postgres wire, Bolt, RESP — so migration is possible).
  - Neo4j **Community** Edition (the locked stack, `PROJECT_CONSTITUTION §2`) has no
    managed HA/online-backup story the way AuraDB Enterprise does; the graph is a
    derived projection of Postgres and is rebuildable (see DR doc), which makes this
    acceptable for v1.
  - Cross-boundary latency (cluster ↔ managed store) must be kept low by co-locating
    them in the same region/VPC.
- **If self-hosting is later required** (cost, data-residency, air-gapped install),
  add StatefulSets + operators (e.g. CloudNativePG, the Redis operator, Neo4j Helm
  chart) — the app tier does not change, only the connection strings.
