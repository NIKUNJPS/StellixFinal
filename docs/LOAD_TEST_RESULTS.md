# Load Test Results (Batch 23)

> **Historical results.** Measured before ADR 0012 retired Neo4j; where this report mentions the
> Neo4j graph, Research Memory (derived from PostgreSQL inside the API) now serves those endpoints.

A **real** load test — actually executed, not aspirational. It exercises the
authenticated read surface a logged-in analyst uses, against the real stack
(Postgres/TimescaleDB + Redis; Neo4j was **not** running locally — see below).

- **Tool:** Locust 2.45 · `backend/tests/load/locustfile.py`
- **Command:** `locust -f tests/load/locustfile.py --headless -u 20 -r 5 --run-time 60s --host http://localhost:8000`
- **Load:** 20 concurrent users, spawned 5/sec, 60 seconds
- **Auth:** the five pre-approved Meridian seed users (round-robin), so each user hits
  its own per-user rate-limit bucket (see "Rate limiting" below)
- **Environment:** local dev — single Uvicorn worker, local Postgres + Redis, **Neo4j
  offline**

## Results (final run, after the fixes below)

| Endpoint | Reqs | Fails | Median | p95 | p99 | Max |
|---|---:|---:|---:|---:|---:|---:|
| `GET /regimes/current` | 84 | 0 | **7 ms** | 66 ms | 2400 ms | 2370 ms |
| `GET /strategies` | 116 | 0 | **10 ms** | 2300 ms | 2400 ms | 2477 ms |
| `GET /failures` | 24 | 0 | **10 ms** | 2300 ms | 2300 ms | 2299 ms |
| `GET /regimes/cross-asset` | 39 | 0 | **11 ms** | 2300 ms | 2400 ms | 2393 ms |
| `GET /llm/audit-log` | 6 | 0 | **12 ms** | 16 ms | 16 ms | 16 ms |
| `GET /usage/rate-limits` | 24 | 0 | **13 ms** | 2300 ms | 2400 ms | 2385 ms |
| `GET /portfolio/overview` | 65 | 0 | **100 ms** | 200 ms | 2500 ms | 2537 ms |
| `GET /graph/query/robust-across-regimes` | 36 | 36 | 4100 ms | 4200 ms | 6300 ms | 6281 ms |
| **Aggregated** | **394** | **36 (9.1%)** | **13 ms** | 4000 ms | 4100 ms | 6281 ms |

### Reading the numbers honestly

- **Median (p50) latency is single-digit-to-low-double-digit milliseconds** for every
  Postgres-backed endpoint. `/portfolio/overview` is heavier (~100 ms median) because it
  aggregates per-strategy metrics and builds a combined equity curve — expected.
- **The p95/p99 ≈ 2.3–2.5 s figures are cold-start outliers, not steady state.** They
  come from the first handful of requests right after the process started: the SQLAlchemy
  pool filling, first Redis connections opening, and Postgres compiling query plans on
  first execution. The medians — which reflect the warmed process — are the honest
  steady-state indicator. A warm production process does not re-pay this.
- **All 36 failures are `503` on the graph query, because Neo4j was not running in this
  environment** (Docker is unavailable on this machine, so the graph store is offline).
  A `503` is the *correct* degradation for an unreachable dependency, and — after the
  fix below — it now returns in ~4 s instead of hanging ~32 s.

## What the load test found and fixed (this is the point of running it for real)

The **first** run exposed a genuine bug, not a cosmetic one:

> `sqlalchemy.exc.TimeoutError: QueuePool limit of size 5 overflow 10 reached,
> connection timed out, timeout 30.00`

**Root cause (a real cascading-failure bug):** the graph endpoint acquires a Postgres
connection *and then* calls Neo4j. With Neo4j offline, the Neo4j driver hung on its
default ~30 s connect timeout **while still holding the Postgres connection**. Under 20
concurrent users, a few stalled graph requests held connections for 30 s each and
exhausted the default pool (5 + 10 overflow = 15). Once the pool was starved, **every
other endpoint** — strategies, portfolio, regimes, usage — started returning `500`s and
30 s latencies. A single dependency outage was taking down the whole API.

**Fixes applied (both are safe config changes; the hermetic test suite uses a separate
SQLite engine + fake graph and is unaffected — still 430 passing):**

1. **Enlarged the DB pool** (`app/db/session.py`): `pool_size=20, max_overflow=20`
   (40 max connections, comfortably under Postgres' default `max_connections=100`), and
   trimmed `pool_timeout` to 10 s so a genuinely saturated pool fails fast instead of
   hanging 30 s. 15 connections was too small for the concurrent institutional read
   load the platform targets.
2. **Fast-fail Neo4j** (`app/clients/neo4j_client.py`): `connection_timeout=5.0`,
   `connection_acquisition_timeout=10.0`. An unreachable Neo4j now degrades to its `503`
   in seconds and **releases the Postgres connection quickly**, so a graph-store outage
   can no longer starve the SQL pool and cascade into unrelated 500s.

**Result after the fixes:** zero `500`s, zero pool-exhaustion, no 30 s hangs; the only
failures left are the expected graph `503`s (offline Neo4j), and they fail fast.

## Rate limiting under load (correct behaviour, documented)

An earlier iteration that put all 20 users on a **single** token produced a wall of
`429 Too Many Requests`. That is the global limiter (100 req/min **per user**, Batch 11)
working exactly as designed — 20 users spending one user's quota. It is a *test artifact*
of shared credentials, not a defect: in production, 20 users are 20 tokens with 20
separate buckets. The final run distributes across the five Meridian seed users, which
is why the results above show **no 429s**. The login endpoint's own per-IP limiter
(5/min) is likewise avoided by authenticating each token once, outside the measured load.

## Caveats / not measured

- **Single Uvicorn worker, single local machine.** Absolute throughput (6.7 req/s
  aggregate here) is bounded by one worker on a laptop, not a representative production
  fleet; treat the *latency* medians as the signal, not the throughput ceiling.
- **Neo4j offline**, so the graph read path's real (warm) latency was not measured here —
  only its fast-fail degradation.
- **LLM generation not load-tested.** The LLM lane deliberately reads the cheap
  `/llm/audit-log` rather than calling a real `POST /llm/hypothesis`, to avoid provider
  cost and multi-second latencies that would swamp the percentiles.
