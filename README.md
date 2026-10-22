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
researcher leaves. Stellix Labs keeps PostgreSQL as the single source of truth and links
its rows into **Research Memory** — a tenant-scoped index of strategies, failures, regimes,
notes and researchers that preserves *why* a decision was made, not just what the result
was — so that reasoning survives staff turnover. No second database is needed.

---

## What it does

| Area | Capability |
|---|---|
| **Regime detection** | A 4-model ensemble (HMM, GMM, PELT changepoints, GARCH) classifies every trading day into one of 6 market regimes via weighted consensus voting. |
| **Strategy research** | Rule-based strategy definitions (JSON DSL, no free-form code) authored by researchers, drafted by an LLM, or evolved by a genetic algorithm — all sharing one representation. |
| **Regime-partitioned backtesting** | Every backtest reports performance **per regime**, not one blended number that hides a strategy's Crisis-regime fragility. |
| **Multi-method validation gate** | Promotion to `active` requires a composite robustness score (walk-forward, regime cross-validation, Monte Carlo, persistence, stress test) — enforced in code, not by convention. |
| **Failure-as-asset** | Strategy failures are permanent, append-only records (trigger, regime, SHAP feature attribution) — never deleted, never quietly edited. |
| **Research Memory** | Links researchers, strategies, regimes, research notes, performance, and failures (6 record types, 8 relationships) into an index derived from PostgreSQL — answers lineage and recurring-failure questions in one lookup. Rebuilt from the database on a schedule, so it never drifts. See ADR 0012. |
| **Structural multi-tenancy** | Every tenant-scoped table is isolated by a fail-closed ORM listener, not developer discipline — proven by a dedicated tenant-isolation attack test. |
| **Dynamic RBAC** | 6 database-backed system roles (Admin, CIO, Compliance Officer, Risk Manager, Researcher, Quant Engineer) with real per-role permission sets; role changes apply on a user's next request, no re-login required. |
| **Governance & audit** | Human-approval workflow with written justification, immutable audit log, compliance export. A real governance bug (ADR-0008: an Active strategy could carry a stale or mismatched validation score) was found and fixed — see `docs/adr/0008-*`. |
| **Market research** | Macro dashboard (FRED), a bounded 56-symbol screener, a dollar-volume sector heatmap, and candlestick charting — every widget labeled with its real source and refresh cadence, never presented as real-time. |
| **Multi-agent desk** | [TradingAgents](https://github.com/TauricResearch/TradingAgents) v0.5.1 (analysts → bull/bear debate → trader → risk committee → portfolio manager) run in Celery and **conditioned on Stellix**: every run is told the point-in-time regime, the org's strategy evidence and failures in that regime, and the desk's own settled lessons. Calls are stored as tenant-scoped research records (every LLM call audited, ResearchNote + Research Memory record), settled on realised alpha, and backtested over ticker × date grids scored **per regime × rating**. Portfolio-aware runs, any report language, SEC EDGAR as-filed fundamentals, optional Jev post screening, 18 LLM providers (incl. local Ollama / vLLM), resume-from-last-agent retries, and a terminal CLI (`scripts/agent_desk_cli.py`). Numeric price levels are withheld under Safeguard 1 — see ADR 0009. |
| **Market Terminal** | Every [OpenTerminal](https://github.com/ErTasselli/OpenTerminal) feature, on official or published sources: a drag-and-drop widget workspace saved per user, ⌘K symbol search, intraday-to-MAX charting (candles/bars/line/area, SMA/EMA/BB/VWAP/RSI/MACD, hover legend), quote panel, de-duplicated RSS news, options chain with Black-Scholes Greeks, crypto board/candles/order book, macro (rates, FX, commodities, ECB), holdings tracker with average-cost P&L that feeds the Agent Desk, FRED economic and earnings calendars, SEC Form 4 insiders, FINRA short volume, market recap, a regime-aware AI assistant, official live TV, and price alerts. Every widget names its source and delay — see ADR 0010. |

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
│  failures · memory · evolution · llm · governance ·     │
│  portfolio · billing · usage · superadmin               │
└──┬──────────┬───────────┬────────────┬─────────────┬────┘
   │          │           │            │             │
┌──▼─────────────────┐  ┌───▼───┐   ┌────▼────┐   ┌────▼────┐
│ Postgres (truth)    │  │ Redis │   │ Celery  │   │Providers│
│  └ Research Memory  │  │cache/ │   │ worker  │   │yfinance │
│    index (derived,  │  │queue/ │   │ + beat  │   │ LLM x2  │
│    in the API)      │  │ WS bus│   │         │   │ Stripe  │
└─────────────────────┘  └───────┘   └─────────┘   └─────────┘
```

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic 2 |
| Databases | PostgreSQL 15+ (+ TimescaleDB), Redis 5+ |
| Workers | Celery (+ beat scheduler) |
| Quant / ML | pandas, numpy, scikit-learn, hmmlearn, arch (GARCH), ruptures (PELT), vectorbt, SHAP |
| LLM | Anthropic + Gemini (dual-provider cost router) |
| Frontend | Next.js 15 (App Router), React 18, TypeScript 5, Tailwind CSS 3, Zustand, Recharts, Cytoscape.js |
| Security | bcrypt, JWT (access + rotated refresh), TOTP MFA, token-bucket rate limiting |
| Observability | structlog, Prometheus, Sentry |

---

## Quick start — one command (Windows)

**You need installed first:**

| Tool | Version | Notes |
|---|---|---|
| Python | **3.11.9** (not 3.12+) | [python.org](https://www.python.org/downloads/release/python-3119/) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| PostgreSQL | 15+ | listening on port **5433**, with an empty database `stellix_labs_dev` |
| Redis | 5+ | listening on port **6379** (Memurai works on Windows) |

There is no other database: Research Memory is built from PostgreSQL inside the API.

**1. Clone the repo:**

```powershell
git clone https://github.com/NIKUNJPS/StellixFinal.git
cd StellixFinal
```

**2. Run everything with one command:**

```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1
```

On the first run, `run.ps1` creates the Python environment, installs all backend and
frontend dependencies, and creates `backend\.env` with a freshly generated secret key. It
then stops once and asks you to put your PostgreSQL password into `DATABASE_URL` and
`DATABASE_URL_SYNC` in `backend\.env`. Run the same command again and it applies the
database migrations and opens one window per service (API, workers, scheduler, frontend).

| What | Command |
|---|---|
| Start (sets up anything missing) | `powershell -ExecutionPolicy Bypass -File .\run.ps1` |
| Start **and load the demo data** | `powershell -ExecutionPolicy Bypass -File .\run.ps1 -Seed` |
| Stop everything | `powershell -ExecutionPolicy Bypass -File .\run.ps1 -Stop` |
| Use another web port | `powershell -ExecutionPolicy Bypass -File .\run.ps1 -FrontendPort 3001` |

Then open **http://localhost:3000**. The API is at http://localhost:8000 (interactive docs
at `/docs`). Demo logins are listed in [Log in](#7-log-in) below. Optional keys such as
`ANTHROPIC_API_KEY` (research assistant) and `FRED_API_KEY` (macro data) go in
`backend\.env`; the app runs without them and says so where they're needed.

---

## Manual setup (step by step)

Use this if you're not on Windows or want to run each piece yourself.

**Prerequisites:** Python 3.11.9 specifically (not 3.12+ — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for why), Node.js 20+, PostgreSQL 15+, Redis. That's the whole data tier — Research Memory is built from PostgreSQL inside the API.

### 1. Clone

```bash
git clone https://github.com/NIKUNJPS/StellixFinal.git
cd StellixFinal
```

### 2. Start the data tier

**Option A — Docker (easiest):**

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis
```

**Option B — native install** (Postgres and Redis installed directly on your
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

Background work runs in three Celery processes, each in its own terminal. The
default worker handles backtests/evolution/ingestion jobs and the nightly sweeps:

```bash
.\.venv\Scripts\python.exe -m celery -A app.worker.celery_app.celery_app worker --loglevel=INFO --pool=solo
```

The realtime worker handles market-data refreshes (index quotes, screener, signals)
on their own queue, so a long sweep can never freeze dashboard prices:

```bash
.\.venv\Scripts\python.exe -m celery -A app.worker.celery_app.celery_app worker -Q realtime -n realtime@%h --loglevel=INFO --pool=solo
```

Beat schedules the periodic jobs (Windows needs it as a separate process — the
combined `--beat` flag isn't supported there):

```bash
.\.venv\Scripts\python.exe -m celery -A app.worker.celery_app.celery_app beat --loglevel=INFO
```

**Real-time US ETF prices (optional).** The dashboard's index quotes are delayed
(free yfinance data, refreshed every 30s). For genuinely real-time prices, the
dashboard also shows SPY / QQQ / DIA / IWM streamed from Alpaca's free IEX feed —
real trades from one exchange, labelled as such. Create a free account at
alpaca.markets, generate an API key pair, add `ALPACA_API_KEY_ID` and
`ALPACA_API_SECRET_KEY` to `backend/.env`, then run exactly one streamer (the free
plan allows one connection):

```bash
.\.venv\Scripts\python.exe -m app.streaming.etf_stream
```

Without keys the streamer idles and the dashboard says "not configured".

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
| Quant Engineer | `quant@meridian.com` | `MeridianDemo2026!` |
| Platform superadmin | `admin@stellixlabs.com` | `Finalyear123$` |

> ⚠️ These are demo/local-only credentials created by `scripts/seed_demo_data.py` for
> this academic project. Do not reuse them, and rotate/remove before any real deployment.

### Health check

```bash
curl http://localhost:8000/health
```

Reports the live status of Postgres and Redis individually.

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

As of the `v1.0-review` checkpoint (2026-09-24): **625 collected, 0 failures** (616
passed / 9 skipped by default; all 625 pass with `RUN_INTEGRATION=1`, which needs live
Postgres + live network). See [`docs/PLATFORM_STATE.md`](docs/PLATFORM_STATE.md) for
exactly how that was obtained and what else was verified alongside it.

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
│   │   ├── graph/          Research Memory index (derived from Postgres)
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
| [`docs/PLATFORM_STATE.md`](docs/PLATFORM_STATE.md) | **Start here for "what's actually true right now"** — verified working features, honest limitations, real numbers, all traced to this session's own checks |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Full setup guide, running instructions, troubleshooting, frontend contributor guide |
| [`docs/schemas.md`](docs/schemas.md) | Database and knowledge-graph schema reference |
| [`docs/TESTING_GUIDE.md`](docs/TESTING_GUIDE.md) | Manual end-to-end test procedures |
| [`docs/demo_script.md`](docs/demo_script.md) | Guided click-through of the demo tenant (5-minute and 15-minute versions) |
| [`docs/disaster_recovery.md`](docs/disaster_recovery.md) | Backup/restore and incident procedures |
| [`docs/SOC2_READINESS.md`](docs/SOC2_READINESS.md) | Security/compliance posture notes |
| [`docs/superadmin_isolation.md`](docs/superadmin_isolation.md) | The append-only audit log's dev-mode superuser caveat, and how it's proven anyway |
| [`docs/THIRD_PARTY_NOTICES.md`](docs/THIRD_PARTY_NOTICES.md) | Market-data sourcing, including what was evaluated and deliberately not adopted (Options Chain) |

### Architecture Decision Records (`docs/adr/`)

Read in order — each one is a real decision or a real finding, not a template exercise:

| ADR | Decision / finding |
|---|---|
| [0001](docs/adr/0001-record-architecture-decisions.md) | Why this project records ADRs at all |
| [0002](docs/adr/0002-enforce-multitenancy-structurally.md) | Multi-tenancy enforced structurally in the ORM, not by developer discipline |
| [0003](docs/adr/0003-auth-tenancy-reconciliation.md) | Auth/tenancy naming reconciliation — canonical and final |
| [0004](docs/adr/0004-managed-data-services.md) | Managed cloud data services in production, no in-cluster StatefulSets |
| [0005](docs/adr/0005-safeguard5-ground-truth-covers-every-source-shown.md) | Safeguard 5: LLM ground truth must cover every source the model was shown |
| [0006](docs/adr/0006-dynamic-rbac.md) | Dynamic, database-backed RBAC (replacing hardcoded roles) |
| [0007](docs/adr/0007-evolution-fitness-misaligned-with-approval-gate.md) | Finding: the evolution fitness function is misaligned with the approval gate (fix deferred) |
| [0008](docs/adr/0008-robustness-score-single-source-of-truth.md) | Fix: `robustness_score` had three writers; only the validated composite may gate activation |
| [ADR-FINAL](docs/adr/ADR-FINAL.md) | v1.0.0 release record — deviations from spec, gaps closed, real bugs caught by live verification, honest readiness assessment |

---

## Academic context

Final-year project — Department of Information Technology, K. K. Wagh Institute of
Engineering Education & Research, Nashik.

**Team:** Nikunj Shah · Riddhi Chaskar · Dinah Khan
**Guide:** Prof. Reena Johnson
