# Stellix Labs — Disaster Recovery (v1)

Backup, restore, and failure-handling procedures for the two stateful stores
(PostgreSQL/TimescaleDB, Redis) and the Celery job system. In production
these are managed cloud services (see `docs/adr/0004-managed-data-services.md`),
so the *authoritative* backups are the provider's automated snapshots + PITR; the
commands below are the self-managed equivalents and the restore drills you run.

## Source-of-truth hierarchy (read this first)

- **PostgreSQL is the single source of truth.** Every strategy, failure, regime
  label, research note, performance record, and audit entry lives here.
- **Research Memory is derived, in-process data.** The API builds it from Postgres at
  startup and rebuilds it every `RESEARCH_MEMORY_REFRESH_SECONDS` (ADR 0012). It has no
  storage of its own, so there is nothing to back up: restoring Postgres restores it.
- **Redis is ephemeral.** It holds the cache, rate-limiter token buckets, and the
  Celery broker/result queues. None of it is a system of record; a total Redis loss
  drops in-flight/queued jobs (see §4) but no durable data.

## RTO / RPO targets (v1)

| Store | RPO (max data loss) | RTO (time to restore) | Basis |
| --- | --- | --- | --- |
| PostgreSQL | **≤ 5 min** | **≤ 1 hr** | managed continuous WAL archiving / PITR |
| Research Memory | **0** (derived) | minutes after API start | re-derived from Postgres automatically |
| Redis | n/a (ephemeral) | minutes | recreate; re-enqueue lost jobs |
| App tier (stateless) | n/a | minutes | redeploy from image (`v1.0.0`) |

Whole-region RTO for v1 is **≤ 4 hours** (provision managed stores in the standby
region, restore Postgres via PITR, redeploy the stateless tier, rebuild the graph).

---

## 1. PostgreSQL / TimescaleDB backup & restore

### Backup (logical dump — custom format, compressed, parallel-restorable)
```bash
pg_dump \
  --host="$PGHOST" --port=5432 --username="$PGUSER" --dbname=stellix \
  --format=custom \          # -Fc: compressed, selective/parallel restore
  --no-owner --no-privileges \  # portable across role names between clusters
  --verbose \
  --file="stellix_$(date -u +%Y%m%dT%H%M%SZ).dump"
```
Nightly + before every migration. For minimal RPO, rely on the managed provider's
continuous WAL archiving / point-in-time-recovery rather than these logical dumps
(dumps are the portable/version-migration + off-provider copy).

### Restore (into a fresh, empty database)
```bash
createdb --host="$PGHOST" --username="$PGUSER" stellix_restore
pg_restore \
  --host="$PGHOST" --port=5432 --username="$PGUSER" --dbname=stellix_restore \
  --no-owner --no-privileges \
  --jobs=4 \                 # parallel restore
  --exit-on-error \
  stellix_YYYYMMDDTHHMMSSZ.dump
```
TimescaleDB note: the schema restores as plain tables if the target lacks the
`timescaledb` extension (migration `0002` guards hypertable creation on
`pg_available_extensions`). On a Timescale-enabled target, restore normally; if you
hit hypertable ordering issues, use `SELECT timescaledb_pre_restore();` … restore …
`SELECT timescaledb_post_restore();` per Timescale's documented dump/restore flow.

The exact db/user/host/port come from `DATABASE_URL` in `app/core/config.py`
(default `stellix`/`stellix` on `5432`; a dev machine without Docker may override to
e.g. `stellix_labs_dev` on `5433` — dump/restore against whatever that URL points at).

> **Append-only grants are NOT in a `--no-privileges` dump.** The audit tables'
> immutability comes from `REVOKE UPDATE, DELETE … FROM PUBLIC` statements that live in
> the Alembic migrations, and `pg_dump --no-privileges` deliberately omits GRANT/REVOKE.
> A restore-from-dump therefore brings back all the append-only **rows** but not the
> REVOKE **protection**. Re-apply it after a logical restore by running the migrations
> against the restored DB (`alembic upgrade head` is a no-op for schema but re-runs the
> REVOKEs is NOT guaranteed — safest is to re-execute the REVOKE statements, or restore
> WITH privileges from a role-compatible dump). PITR/physical restores preserve grants.

### Verify a restore
```bash
psql --dbname=stellix_restore -c "SELECT count(*) FROM organizations;"
psql --dbname=stellix_restore -c "SELECT max(created_at) FROM audit_log;"
```

---

## 2. Research Memory

Research Memory (lineage, recurring failure modes, the five research queries) has no
storage of its own: the API derives it from Postgres at startup and on every refresh
(ADR 0012). Recovery is therefore automatic — restore Postgres (§1), start the API, and
the index is rebuilt within seconds. The System Monitoring page shows when it was last
rebuilt and how many records it holds.

---

## 3. Redis

Redis is cache + rate-limit buckets + Celery broker/result backend — all
reconstructible. Enable AOF (`--appendonly yes`, as in `infra/docker-compose.yml`)
so a restart replays recent writes, but treat total loss as tolerable:
- **Cache**: repopulates on demand.
- **Rate-limit buckets**: reset to full capacity (users briefly get a fresh allowance).
- **Celery queues**: see §4 — queued-but-unstarted jobs are lost and must be re-enqueued.

No dump/restore drill is required; the recovery action is "recreate the instance."

---

## 4. In-flight Celery tasks when a worker dies

**Current config (`app/worker/celery_app.py`): `task_acks_late` is NOT set, so
Celery's default applies — a task is acknowledged when the worker *receives* it,
before it runs.** Consequences:

- **Hard crash / SIGKILL / node loss:** the in-flight task's message was already
  acked, so it is **NOT redelivered** — the work is **lost, not duplicated**. The
  tracking row (e.g. `ingestion_jobs.status`, `evolution_runs.status`) is left in
  `running`, which is the signal to re-trigger it.
- **Graceful rollout / SIGTERM** (K8s rolling update, `terminationGracePeriodSeconds:
  120` on the worker Deployment): Celery does a **warm shutdown** — stops accepting
  new tasks and finishes in-flight ones before exiting, so no loss in the normal
  deploy path.

Idempotency of each task, i.e. whether re-running a lost/partial task is safe:

| Task | Idempotent? | Why |
| --- | --- | --- |
| `ingest_market_data` | ✅ yes | market_data + feature_matrix writes are UPSERTs (on-conflict keep-latest); re-run overwrites the same rows |
| `run_regime_detection` | ✅ yes | regime labels are UPSERTed by (org, symbol, timestamp) |
| `run_strategy_backtest` | ✅ yes | performance snapshots are replaced on each run |
| `run_strategy_validation` | ✅ yes | overwrites `robustness_score` / `regime_compatibility` on the strategy |
| `run_failure_clustering` | ✅ yes | recomputes `related_failure_ids` from scratch |
| `run_failure_explanation` | ✅ yes | overwrites `llm_generated_explanation` |
| `run_graph_consistency_sweep` | ✅ yes | pure reconciliation; never mutates Postgres |
| `run_compliance_export` | ✅ yes | renders to a path keyed by `job_id` (overwrite) |
| `system_heartbeat` | ✅ yes | writes a single freshness timestamp |
| `run_manual_failure` / `run_failure_monitor_symbol` / `run_failure_monitor_sweep` | ⚠️ **no** | the `failures` table is **append-only** (Pillar 2) — a retry after a partial run can insert a **duplicate** failure record |
| `run_evolution` | ⚠️ **partial** | a crash mid-run can leave orphaned GA-candidate strategies; a naive re-run creates a second cohort |

**Operational guidance:** the idempotent tasks are safe to re-enqueue freely after a
worker loss. For the two append-only/creating tasks, before re-triggering, check
whether the tracking row already advanced (a `failures` row for that strategy+timestamp,
or `evolution_runs.status = completed`) to avoid duplicates. If stronger delivery
guarantees are needed in a future version, enable `task_acks_late=True` +
`task_reject_on_worker_lost=True` **and** add idempotency keys to the two creating
tasks first (otherwise late-ack redelivery would duplicate failures/candidates).

---

## 5. Recovery runbook (region-level outage, summary)

1. **Provision** managed Postgres and Redis in the standby region.
2. **Restore Postgres** via the provider's PITR to the latest consistent point
   (≤ 5 min RPO), or `pg_restore` the newest dump.
3. **Deploy** the app tier: `kubectl apply` the `v1.0.0` manifests
   (`infra/k8s/`), run the migration Job, point the ConfigMap/Secret at the new
   endpoints.
4. **Research Memory** rebuilds itself from Postgres when the API starts — nothing to do.
5. **Redis**: fresh instance; re-enqueue any jobs that were `running`/`pending` at
   the outage (query the tracking tables for non-terminal statuses).
6. **Verify**: `GET /health/ready` returns 200 on all backend pods (it 503s while
   Postgres/Redis are unreachable), `backend/.venv/Scripts/python.exe
   scripts/verify_demo_seed.py` returns the expected Meridian counts, and the five
   named graph queries return data.

---

## 6. Backup verification procedure (test the restore, don't trust it)

A backup you've never restored is a hope, not a backup. Run this drill on a schedule
(at least monthly) and after any change to the schema or the dump/restore commands:

1. **Restore the newest dump into a throwaway database** (never the live one):
   ```bash
   createdb --host="$PGHOST" --username="$PGUSER" stellix_verify
   pg_restore --host="$PGHOST" --username="$PGUSER" --dbname=stellix_verify \
     --no-owner --no-privileges --jobs=4 --exit-on-error stellix_<latest>.dump
   ```
2. **Sanity-check row counts** against the source (they should match within the RPO
   window):
   ```bash
   psql --dbname=stellix_verify -c "SELECT
     (SELECT count(*) FROM organizations)   AS orgs,
     (SELECT count(*) FROM strategies)      AS strategies,
     (SELECT count(*) FROM regime_labels)   AS regimes,
     (SELECT count(*) FROM failures)        AS failures,
     (SELECT count(*) FROM audit_log)       AS audit_rows;"
   ```
3. **Run the integration test suite against the restored DB.** The hermetic suite uses
   SQLite, but the `integration`-marked tests exercise the real Postgres/Redis
   stack and are the strongest automated proof the restore is coherent:
   ```bash
   DATABASE_URL=postgresql+asyncpg://$PGUSER@$PGHOST/stellix_verify \
   RUN_INTEGRATION=1 backend/.venv/Scripts/python.exe -m pytest -m integration -q
   ```
   A green run means the restored schema + data satisfy the same invariants the live
   system enforces (tenant isolation, append-only behaviour, feature/regime coherence).
4. **Drop the throwaway DB** (`dropdb stellix_verify`) so it can't be mistaken for live.

Record each drill's date + result; an untested backup does not count toward the RTO/RPO
targets above.

---

## 7. Known limitations (honest, same standard as docs/SOC2_READINESS.md)

- **No automated backup schedule is configured in this repo.** The Celery beat
  schedule (`app/worker/celery_app.py`) runs the failure sweep, graph-consistency
  sweep, heartbeat, and weekly digest — but **no `pg_dump`/snapshot job**. In
  production the authoritative backups are the managed provider's automated
  snapshots + PITR (ADR-0004); in a self-managed deployment the nightly dump above
  must be wired into cron/systemd-timer/K8s CronJob — that automation is **not yet
  written**. This is a real production-readiness gap.
- **Append-only immutability is not enforced against a superuser, and is not carried
  by a logical dump.** Two caveats compound: (a) as documented in
  `docs/superadmin_isolation.md` (§8.1), the `REVOKE` does not bind the Postgres
  **superuser** the dev connection currently uses; (b) `--no-privileges` dumps omit the
  REVOKE entirely (see §1). Production must run the app as a dedicated non-superuser
  role **and** re-apply the REVOKEs after any logical restore.
- **In-flight CSV-upload stashes are not durable (Batch 21).** A validated-but-not-yet-
  confirmed CSV upload lives only in Redis under a **10-minute TTL**
  (`app/services/csv_upload.py`). A Redis loss during that window discards the stash and
  the user must re-upload — acceptable given the short window and that no committed data
  is affected, but stated here for completeness.
- **Queued-but-unstarted Celery jobs are lost on a hard broker/worker loss** (§4);
  they are re-enqueued from the non-terminal tracking rows, not automatically.
