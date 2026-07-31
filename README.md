# Stellix Labs

> **Regime-Adaptive Intelligence for Quantitative Intelligence Research
Systems**

A regime-adaptive, multi-tenant research platform for systematic trading teams. Built
on three pillars — **regime-conditioning**, **failure-as-asset**, and **compounding
memory** — see [`PROJECT_CONSTITUTION.md`](PROJECT_CONSTITUTION.md) for the full
rationale.

Quant research teams lose knowledge continuously: a Sharpe ratio means nothing without
the market regime it was earned in, a strategy's failure reason dies with whoever found
it, and two years of *"we tried that, it breaks in high-vol"* walks out the door when a
researcher leaves. Stellix Labs stores research **twice** — once in PostgreSQL as the
transactional source of truth, and once in a Neo4j knowledge graph that preserves *why*
a decision was made, not just what the result was — so that reasoning survives staff
turnover.

---

## What it does

| Area | Capability |
|---|---|
| **Regime detection** | A 4-model ensemble (HMM, GMM, PELT changepoints, GARCH) classifies every trading day into one of 6 market regimes via weighted consensus voting. |
| **Strategy research** | Rule-based strategy definitions (JSON DSL, no free-form code) authored by researchers, drafted by an LLM, or evolved by a genetic algorithm — all sharing one representation. |
| **Regime-partitioned backtesting** | Every backtest reports performance **per regime**, not one blended number that hides a strategy's Crisis-regime fragility. |
| **Multi-method validation gate** | Promotion to `active` requires a composite robustness score (walk-forward, regime cross-validation, Monte Carlo, persistence, stress test) — enforced in code, not by convention. |
| **Failure-as-asset** | Strategy failures are permanent, append-only records (trigger, regime, SHAP feature attribution) — never deleted, never quietly edited. |
| **Knowledge graph** | Neo4j graph linking researchers, strategies, regimes, research notes, performance, and failures — answers lineage questions SQL can't express cleanly. |
| **Structural multi-tenancy** | Every tenant-scoped table is isolated by a fail-closed ORM listener, not developer discipline — proven by a dedicated tenant-isolation attack test. |
| **Governance & audit** | 5 RBAC roles, human-approval workflow with written justification, immutable audit log, compliance export. |

---

## Architecture

```
┌─────────────── Next.js 15 (App Router) ───────────────┐
│  Marketing site · Client dashboard · SuperAdmin console│
└────────────┬──────────────────────────┬────────────────┘
             │ REST + JWT               │ WebSocket
┌────────────▼──────────────────────────▼────────────────┐
│                     FastAPI backend                     │
│  auth · data · regimes · strategies · validation ·      │
│  failures · graph · evolution · llm · governance ·      │
│  portfolio · billing · usage · superadmin               │
└──┬──────────┬───────────┬────────────┬─────────────┬────┘
   │          │           │            │             │
┌──▼───┐  ┌───▼────┐  ┌───▼───┐   ┌────▼────┐   ┌────▼────┐
│Postgres│ │ Neo4j  │  │ Redis │   │ Celery  │   │Providers│
│(truth) │ │(memory)│  │cache/ │   │ worker  │   │yfinance │
│        │ │ graph  │  │queue/ │   │ + beat  │   │ LLM x2  │
│        │ │        │  │ WS bus│   │         │   │ Stripe  │
└────────┘ └────────┘  └───────┘   └─────────┘   └─────────┘
```

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic 2 |
| Databases | PostgreSQL 15+, Neo4j 5 Community, Redis 5+ |
| Workers | Celery (+ beat scheduler) |
| Quant / ML | pandas, numpy, scikit-learn, hmmlearn, arch (GARCH), ruptures (PELT), vectorbt, SHAP |
| LLM | Anthropic + Gemini (dual-provider cost router) |
| Frontend | Next.js 15 (App Router), React 18, TypeScript 5, Tailwind CSS 3, Zustand, Recharts, Cytoscape.js |
| Security | bcrypt, JWT (access + rotated refresh), TOTP MFA, token-bucket rate limiting |
| Observability | structlog, Prometheus, Sentry |

---

## Getting started

**Prerequisites:** Python 3.11.9 specifically (not 3.12+ — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for why), Node.js 20+, PostgreSQL 15+, Redis. Neo4j is optional — the app degrades gracefully without it; only `/admin/graph` is affected.

### 1. Clone

```bash
git clone <your-repo-url>
cd StellixLabs
```

### 2. Start the data tier

**Option A — Docker (easiest):**

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis neo4j
```

**Option B — native install** (Postgres, Redis, Neo4j installed directly on your
machine) — see [`CONTRIBUTING.md`](CONTRIBUTING.md) Part 1 for per-OS notes. Either
way, create an empty database (default name `stellix_labs_dev`) before continuing.

### 3. Backend — install, configure, migrate

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-dev.txt
Copy-Item .env.example .env      # then edit DATABASE_URL, JWT_SECRET_KEY, etc.
.\.venv\Scripts\python.exe -m alembic upgrade head
```

*(macOS/Linux: use `.venv/bin/python` and `cp .env.example .env`)*

### 4. Seed demo data

Runs the **real** pipeline end-to-end — yfinance market data, regime detection,
backtests, 5-method validation, failure detection, and genetic-algorithm evolution —
for a demo org ("Meridian Capital Partners"), and also creates a platform superadmin
account. Needs internet access; takes a few minutes:

```bash
.\.venv\Scripts\python.exe ..\scripts\seed_demo_data.py
```

Idempotent — safe to re-run any time; it only wipes and rebuilds the demo org, never
touching anything else. Set `SEED_FAST=1` for a quicker, smaller plumbing-check run
(fewer symbols/strategies).

### 5. Run the backend

```bash
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

A Celery worker is only needed for backtests/evolution/ingestion jobs kicked off
*after* the seed (not for browsing already-seeded data or logging in):

```bash
.\.venv\Scripts\python.exe -m celery -A app.worker.celery_app.celery_app worker --loglevel=INFO --pool=solo
```

### 6. Frontend (separate terminal)

```bash
cd frontend
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

Backend → `http://localhost:8000` (docs at `/docs`) · Frontend → `http://localhost:3000`

### 7. Log in

`http://localhost:3000/login`

| Role | Email | Password |
|---|---|---|
| Tenant admin (demo org) | `research@meridian.com` | `MeridianDemo2026!` |
| Researcher | `dpark@meridian.com` | `MeridianDemo2026!` |
| Risk manager | `s.okonkwo@meridian.com` | `MeridianDemo2026!` |
| CIO | `j.whitfield@meridian.com` | `MeridianDemo2026!` |
| Compliance officer | `a.reyes@meridian.com` | `MeridianDemo2026!` |
| Platform superadmin | `admin@stellixlabs.com` | `Finalyear123$` |

> ⚠️ These are demo/local-only credentials created by `scripts/seed_demo_data.py` for
> this academic project. Do not reuse them, and rotate/remove before any real deployment.

### Health check

```bash
curl http://localhost:8000/health
```

Reports the live status of Postgres, Redis and Neo4j individually. `"neo4j": "error"`
with everything else `ok` is fine if you skipped Neo4j.

---

This is the condensed path. **For the full walkthrough** — per-OS native database
setup, troubleshooting, and a frontend contributor guide — see
**[`CONTRIBUTING.md`](CONTRIBUTING.md)**. Don't duplicate steps between the two docs;
if something here goes stale, fix it there first.

---

## Testing

```bash
cd backend && .\.venv\Scripts\python.exe -m pytest -q && .\.venv\Scripts\python.exe -m ruff check .
cd frontend && npm run typecheck && npm run lint && npm run build
```

All six must pass before opening a PR. See [`CONTRIBUTING.md`](CONTRIBUTING.md) Part 4 for details.

---

## Project structure

```
StellixLabs/
├── backend/
│   ├── app/
│   │   ├── api/routes/     REST endpoints
│   │   ├── services/       business logic
│   │   ├── models/         SQLAlchemy tables
│   │   ├── regime/         4-model regime ensemble
│   │   ├── validation/     5-method robustness scoring
│   │   ├── graph/          Neo4j knowledge graph
│   │   └── worker/         Celery tasks + beat schedule
│   ├── alembic/versions/   database migrations
│   ├── scripts/            operational scripts
│   └── tests/              pytest suite
├── frontend/
│   ├── app/                Next.js App Router pages
│   ├── components/         React components
│   └── lib/                API clients + types
├── infra/                  docker-compose.yml, k8s manifests, monitoring config
└── docs/                   schema reference, testing guide, ADRs, operational docs
```

## Documentation map

| Document | What it covers |
|---|---|
| [`PROJECT_CONSTITUTION.md`](PROJECT_CONSTITUTION.md) | The non-negotiable design principles — read this first |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Full setup guide, running instructions, troubleshooting, frontend contributor guide |
| [`docs/schemas.md`](docs/schemas.md) | Database and knowledge-graph schema reference |
| [`docs/TESTING_GUIDE.md`](docs/TESTING_GUIDE.md) | Manual end-to-end test procedures |
| [`docs/demo_script.md`](docs/demo_script.md) | Guided click-through of the demo tenant |
| [`docs/disaster_recovery.md`](docs/disaster_recovery.md) | Backup/restore and incident procedures |
| [`docs/SOC2_READINESS.md`](docs/SOC2_READINESS.md) | Security/compliance posture notes |
| `docs/adr/` | Architecture decision records |

---

## Academic context

Final-year project — Department of Information Technology, K. K. Wagh Institute of
Engineering Education & Research, Nashik.

**Team:** Nikunj Shah · Riddhi Chaskar · Dinah Khan
**Guide:** Prof. Reena Johnson
