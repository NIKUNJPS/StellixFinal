# Contributing / Setup Guide

Everything a new collaborator needs to get Stellix Labs running locally, plus
frontend-specific guidance for anyone working on UI.

If you only care about making the UI look better, read **Part 1**, **Part 2**, and
then jump to **Part 6 — Frontend contributor guide**.

---

## Part 1 — Prerequisites

Install these before anything else. Versions on the left are the minimum; versions in
brackets are what the project is actually developed and verified against.

| Software | Required | Verified running on | Why |
|---|---|---|---|
| **Python** | **3.11.9** | 3.11.9 | Backend. See the version note directly below — this one matters. |
| **Node.js** | 20+ | 20.20.2 | Frontend |
| **npm** | 10+ | 10.8.2 | Ships with Node 20 |
| **PostgreSQL** | 15+ | **18.3** | Primary database |
| **Redis** | 5+ | **5.0.14.1** (Memurai on Windows) | Cache, rate limiting, Celery broker, WebSocket pub/sub |
| **Git** | any recent | — | — |

### ⚠️ Python version — install 3.11.9 specifically

Download it directly: **https://www.python.org/downloads/release/python-3119/**
(scroll to the bottom → *Windows installer (64-bit)*, and tick **"Add python.exe to PATH"**).

Do **not** grab whatever the python.org homepage offers — it serves the newest release,
which this project cannot install. The constraints, read from the installed packages:

| Python | Works? | Reason |
|---|---|---|
| ≤ 3.10 | ❌ | `numpy 2.4.6` and `scikit-learn 1.9.0` both require `>=3.11` |
| **3.11.9** | ✅ **verified** | Full suite green (471 tests) |
| 3.12 / 3.13 | ⚠️ untested | Satisfies every declared constraint, but the suite has never been run on them |
| **3.14+** | ❌ | **`ruptures` declares `requires-python: <3.14`** — it is the PELT changepoint model in the regime ensemble, so there is no workaround |

Use 3.11.9. The others are either broken or unproven, and a missing binary wheel for
`hmmlearn` / `numba` costs an evening of compiler errors for no benefit.

### Two things you can skip

Verified against the running system:

- **TimescaleDB is NOT required.** Older docs describe `market_data` as a TimescaleDB
  hypertable. The development database has no TimescaleDB extension installed and holds
  270k+ rows in a plain Postgres table with no issues. Install it only if you
  specifically want hypertable compression/partitioning at production scale.
- **There is no graph database to install.** Research Memory (lineage, recurring failure
  modes, the five research questions) is derived from PostgreSQL inside the API and rebuilt
  on a schedule — see `docs/adr/0012-research-memory-on-postgres.md`.

### Getting the datastores

**Option A — Docker (easiest, one command).** If you have Docker Desktop:

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis
```

Note the ports Docker uses (5432 for Postgres) and set them in your `.env` accordingly.

**Option B — Native install (no Docker).** This is how the project is currently
developed on Windows:

- **PostgreSQL + TimescaleDB** — install PostgreSQL 15, then the TimescaleDB extension.
  The project's default `.env` expects port **5433**, not the default 5432. Use whatever
  port your install actually uses and put it in `DATABASE_URL`.
- **Redis** — on Windows use Memurai or Redis via WSL2.

---

## Part 2 — First-time setup

### 1. Clone

```bash
git clone <your-repo-url>
cd StellixLabs
```

### 2. Create the database

Create an empty database — name it whatever you put in `DATABASE_URL` (default
`stellix_labs_dev`). That is all; no extensions are needed.

```sql
CREATE DATABASE stellix_labs_dev;
```

### 3. Backend environment

Create the virtualenv (from the `backend/` folder):

```bash
cd backend
python -m venv .venv
```

Install dependencies. On Windows call the venv's Python directly — this avoids
PowerShell's execution-policy error on `activate`:

```bash
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-dev.txt
```

*(macOS/Linux: `.venv/bin/python -m pip install -r requirements.txt -r requirements-dev.txt`)*

### 4. Configure the backend

```bash
Copy-Item .env.example .env
```

*(macOS/Linux: `cp .env.example .env`)*

Now open `backend/.env` and set at minimum:

- `DATABASE_URL` and `DATABASE_URL_SYNC` — your Postgres user, password, port, db name
- `JWT_SECRET_KEY` — generate your own:

```bash
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(64))"
```

Every other key is optional and documented inline in `.env.example`. Leave them blank —
each unset key simply disables its own feature.

> **`backend/.env` is gitignored. Never commit it.** Only `.env.example` is tracked.

### 5. Create the schema

```bash
.\.venv\Scripts\python.exe -m alembic upgrade head
```

### 6. Load demo data

This pulls **real** market data from yfinance and runs the full pipeline, so it needs
an internet connection and takes a few minutes:

```bash
.\.venv\Scripts\python.exe ..\scripts\seed_demo_data.py
```

Optionally load the wider universe (S&P 500 + ETFs, ~15-25 min) and compute regimes:

```bash
.\.venv\Scripts\python.exe -m scripts.ingest_universe --org-slug meridian-capital --years 2
```

```bash
.\.venv\Scripts\python.exe -m scripts.compute_regimes --org-slug meridian-capital
```

Research Memory builds itself from these rows when the API starts — nothing to run.

### 7. Frontend

```bash
cd ../frontend
npm install
```

```bash
Copy-Item .env.local.example .env.local
```

The default `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` is correct for local dev —
no edit needed unless you run the backend on a different port.

---

## Part 3 — Running it

You need **two terminals minimum** (three if you want background jobs). Each command
keeps running — don't close its terminal.

**Terminal 1 — Backend** → http://localhost:8000

```bash
cd backend
```

```bash
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Frontend** → http://localhost:3000

```bash
cd frontend
```

```bash
npm run dev
```

**Terminal 3 (optional) — Celery worker.** Only needed for backtests, evolution runs,
and ingestion jobs. Not needed for pure UI work. `--pool=solo` is required on Windows.

```bash
cd backend
```

```bash
.\.venv\Scripts\python.exe -m celery -A app.worker.celery_app.celery_app worker --loglevel=INFO --pool=solo
```

> **VS Code shortcut:** `Terminal → Run Task… → ▶ Run All (dev)` starts all three at once.
> The repo ships `.vscode/tasks.json`, `launch.json`, `settings.json` and
> `extensions.json`, so accept the extension recommendations when VS Code offers them.
>
> Those configs use Windows venv paths (`.venv/Scripts/python.exe`). On macOS/Linux the
> path is `.venv/bin/python` — either adjust them locally or just use the terminal
> commands above, which is all the tasks do anyway.

### Log in

http://localhost:3000/login

| Role | Email | Password |
|---|---|---|
| Tenant admin (main demo) | `research@meridian.com` | `MeridianDemo2026!` |
| Researcher | `dpark@meridian.com` | `MeridianDemo2026!` |
| Risk manager | `s.okonkwo@meridian.com` | `MeridianDemo2026!` |
| CIO | `j.whitfield@meridian.com` | `MeridianDemo2026!` |
| Compliance officer | `a.reyes@meridian.com` | `MeridianDemo2026!` |
| Platform superadmin | `admin@stellixlabs.com` | `Finalyear123$` |

The superadmin account is created automatically by `scripts/seed_demo_data.py`
(step 7/7, `ensure_superadmin()`) — no separate command needed. To create a
*different* superadmin with your own credentials instead (recommended for anything
beyond local demo use, since the seeded one above is hardcoded and world-readable
in this repo):

```bash
.\backend\.venv\Scripts\python.exe scripts\create_superadmin.py --email you@example.com --name "Your Name" --reset-password --password "YourStrongPass123!"
```

### Health check

```bash
curl http://localhost:8000/health
```

Reports the live status of Postgres and Redis individually.

---

## Part 4 — Verifying your changes

Before opening a PR:

```bash
cd backend
```

```bash
.\.venv\Scripts\python.exe -m pytest -q
```

```bash
.\.venv\Scripts\python.exe -m ruff check .
```

```bash
cd frontend
```

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run build
```

All six must pass. The suite is currently **471 tests, 0 failures**; a PR should not
reduce that number.

---

## Part 5 — Project layout

```
StellixLabs/
├── backend/
│   ├── app/
│   │   ├── api/routes/     REST endpoints
│   │   ├── services/       business logic
│   │   ├── models/         SQLAlchemy tables
│   │   ├── schemas/        Pydantic request/response
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
│   ├── lib/                API clients + types
│   └── store/              Zustand state
└── docs/                   project report, testing guide, learning guide
```

---

## Part 6 — Frontend contributor guide

Read this if you are here to improve the UI.

### Stack

Next.js 15 (App Router) · React 18 · TypeScript 5 · Tailwind CSS 3 · Zustand (state) ·
Recharts (charts) · Cytoscape.js (knowledge-graph canvas) · Zod (form validation).

### Where things live

| What | Where |
|---|---|
| **Design tokens / theme colours** | `frontend/app/globals.css` + `frontend/tailwind.config.ts` |
| **Reusable UI primitives** | `frontend/components/ui/` — button, card, input, table, tabs, dialog, badge… |
| **App chrome** (sidebar, top nav, breadcrumb) | `frontend/components/layout/` |
| **Pages** | `frontend/app/**/page.tsx` |
| **Marketing / public pages** | `frontend/app/(marketing)/` |
| **Authenticated pages** | `frontend/app/admin/`, `app/dashboard/`, `app/settings/` |
| **API calls + types** | `frontend/lib/` |

### The safest, highest-impact places to work

1. `globals.css` + `tailwind.config.ts` — colours, spacing, typography. Changing tokens
   restyles the whole app at once.
2. `components/ui/*` — restyling a primitive updates every page that uses it.
3. `app/(marketing)/*` — the public site. No auth, no backend data, easiest to iterate on.
4. Individual page layouts under `app/admin/*`.

### Rules that will save you from breaking things

- **Every `/admin/*` page gets its chrome and auth gate from `app/admin/layout.tsx`.**
  Do not add `<DashboardShell>` inside a page — it is already applied by the layout, and
  adding it again renders two sidebars.
- **Do not add a `<main>` element inside an admin page.** The shell already renders one;
  nesting them is invalid HTML.
- **Don't change function signatures in `lib/*.ts`** unless you are also updating the
  backend. Those mirror the API contract.
- **Keep `data-testid` attributes.** Some are used by tests.
- **Check dark mode.** The app is dark-first; verify both themes if you touch colours.
- **Check mobile.** There is a responsive drawer nav — test at 375px width.

### Good to know

- **First page load in dev is slow (1-2s).** Next.js compiles each route on first visit.
  This is normal and disappears in a production build. It is not a bug you need to fix.
- **To see the app fast** (e.g. for a demo), use a production build instead of dev mode:

```bash
npm run build
```

```bash
npm start
```

- **You do not need the Celery worker** for UI work.

---

## Part 7 — Git workflow

Never commit:

- `backend/.env` or `frontend/.env.local` (real secrets)
- `.venv/`, `node_modules/`, `.next/`
- `celerybeat-schedule*` (Celery runtime state)

All of these are already in `.gitignore` — just don't force-add them.

Branch, commit, push, open a PR:

```bash
git checkout -b feature/your-change
```

```bash
git add -A
```

```bash
git commit -m "feat(ui): describe your change"
```

```bash
git push -u origin feature/your-change
```

---

## Part 8 — Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `running scripts is disabled on this system` | PowerShell execution policy. Use `.\.venv\Scripts\python.exe` directly instead of `activate` — every command in this guide already does. |
| `connection refused` on port 5433 | Postgres isn't running, or it's on a different port. Check `DATABASE_URL` in `backend/.env`. |
| `relation "users" does not exist` | Migrations not applied. Run `alembic upgrade head`. |
| Login fails with correct password | Demo data not seeded. Run `scripts/seed_demo_data.py`. |
| Research Memory canvas is blank | Not a bug. The explorer is query-driven — click a research query or search for a strategy. |
| `ModuleNotFoundError` | Dependencies not installed into the venv, or you used system Python instead of `.venv`. |
| Celery worker crashes on Windows | Missing `--pool=solo`. Windows can't use the default prefork pool. |
| Port 3000 or 8000 already in use | Another instance is running. Close it, or run on a different port. |
| Frontend can't reach the API | Backend not running, or `NEXT_PUBLIC_API_BASE_URL` in `frontend/.env.local` is wrong. |

---

## Reference docs

| Document | What it covers |
|---|---|
| `docs/TESTING_GUIDE.md` | Manual end-to-end test procedures |
| `docs/schemas.md` | Database and graph schema reference |
| `docs/demo_script.md` | Guided click-through of the demo tenant |
| `docs/disaster_recovery.md` | Backup/restore and incident procedures |
| `docs/adr/` | Architecture decision records |

> `docs/PROJECT_REPORT.md`, `docs/AUDIT_REPORT.md` and `docs/LEARNING_GUIDE.md` exist
> locally but are gitignored and not pushed to the repo — they contain internal
> academic-prep material, not project documentation other contributors need.
