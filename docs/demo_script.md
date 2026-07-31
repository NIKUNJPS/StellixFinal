# Stellix Labs — Demo Script

A cold-start walkthrough of the platform as it exists today (post Batch 18–24). Every
step below is a real, working feature — nothing on the screens is mocked. Timings assume
a warm stack.

## Before you start

1. **Bring the stack up** (see `README.md` for full setup): Postgres/TimescaleDB, Neo4j,
   Redis via `infra/docker-compose.yml`; the backend
   (`backend/.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000`); a Celery
   worker (`… -m celery -A app.worker.celery_app.celery_app worker --pool=solo`) if you
   want live regime detection / backtests to complete during the demo; and the frontend
   (`cd frontend && npm run dev`).
2. **Seed the demo org** (idempotent — rebuilds only Meridian, via the real pipeline):
   `backend/.venv/Scripts/python.exe scripts/seed_demo_data.py`
   then re-check it: `… scripts/verify_demo_seed.py` (prints KPIs + runs all 5 graph queries).
3. **Create the superadmin** (for step 9), once:
   `backend/.venv/Scripts/python.exe scripts/create_superadmin.py --email founder@stellixlabs.com --name "Founder"`
   (it prints a generated password once — keep it).
4. **Clean up test artifacts** so the superadmin list is tidy (optional):
   `backend/.venv/Scripts/python.exe scripts/cleanup_e2e_artifacts.py --execute`

**Demo credentials**
- Client (Meridian Capital, admin): `research@meridian.com` / `MeridianDemo2026!`
- Superadmin (founder): `founder@stellixlabs.com` / *(the password from step 3)*

---

## 1. Landing page + request-a-demo (60s)

Open **`/`** (the marketing site). Scroll the hero and the three pillars —
*Regime-Conditioning*, *Failure-as-Asset*, *Compounding Memory*.

- Click **"Request Demo"** in the hero. A **modal** opens (it does not navigate away).
- Fill a couple of fields and submit. **Point out:** the request hits the real public
  endpoint (`POST /contact/demo-request`) and lands in the superadmin sales inbox — which
  you'll approve in step 9. Work-email validation rejects free webmail.

## 2. Log in as Meridian (30s)

Go to **`/login`**, sign in with the Meridian admin creds. **Point out:** login is gated
on org status (a suspended/pending org is refused here, Batch 24). You land on the
**Dashboard** with real seeded activity — strategies, regimes, failures, KPIs.

## 3. Regime monitor + cross-asset divergence (2 min) — the differentiator

Sidebar → **Regime Monitor** (`/admin/regimes`).

- The **Cross-Asset Regimes** panel (Batch 22) shows the latest detected regime for
  **SPY, QQQ, GLD, BTC-USD** with confidence + "detected N ago", colour-coded by regime.
  **Point out:** it reads *stored* detections and only flags a **divergence** when the real
  combination warrants it (Bull vs Bear/Crisis, or an isolated Crisis) — it never invents
  one; if the assets agree it says "synchronized" instead.
- Type a symbol (`SPY`) and **Load timeline** to see the animated single-symbol regime
  timeline (HMM · PELT · GMM · GARCH ensemble). With a worker running, hit **Re-run
  detection** and mention the result is pushed live over WebSocket (Batch 19).

## 4. Strategy → backtest → validation gate (2 min)

Sidebar → **Strategy Explorer** → open a seeded strategy.

- Show its **rule DSL** (indicator / comparator / value or `crosses_above`).
- Trigger a **backtest** and open **Backtest Results** — **point out** the metrics are
  **partitioned by regime**, not a single blended number; a strong overall Sharpe with a
  negative Crisis-regime Sharpe is the tell for a fragile strategy.
- Show the **validation gate**: a strategy only reaches `active` above a **0.70** composite
  robustness score from five methods — enforced in code, not a UI toggle.

## 5. Failure intelligence + knowledge graph (2 min)

Sidebar → **Failure Intelligence** (`/admin/failures`).

- Show recorded failures with **trigger, regime-at-failure, and SHAP attribution** of the
  features most responsible. **Point out:** the failures table is **append-only**
  (UPDATE/DELETE revoked at the DB role level) — a failure can't be quietly rewritten.

Sidebar → **Knowledge Graph** (`/admin/graph`).

- Run a named query (*recurring failure modes*, *robust across regimes*). **Point out:**
  research is stored twice — Postgres (truth) + Neo4j (memory) — and every query is
  tenant-scoped at the query-builder level. *(If Neo4j isn't running it degrades to a
  clean 503 — mention it's a derived store, rebuildable from Postgres.)*

## 6. LLM research assistant — streaming (90s)

Sidebar → **Research Assistant** (`/admin/assistant`).

- Ask for a hypothesis on a symbol; the response **streams** token-by-token (Batch 18
  SSE). **Point out:** a cost-aware router picks the model; a **price-prediction guard**
  refuses "what will the price be" prompts *before* any model is called; and **Safeguard 5**
  cross-checks numeric claims against ground truth. Every call is logged in the **LLM Audit
  Log** (sidebar) with tokens + cost + numeric-validation result.

## 7. Portfolio cross-strategy view (60s)

Sidebar → **Portfolio** (`/admin/portfolio`). Show the aggregated **portfolio Sharpe**,
per-strategy contributions, the combined equity curve, the correlation heatmap, and the
regime-exposure breakdown (Batch 20). **Point out:** this Sharpe is exactly the value the
weekly digest reports — one source of truth.

## 8. Usage meter + weekly digest (60s)

Sidebar → **Settings** (`/settings`).

- **Usage** tab (Batch 21): live per-org rate-limit consumption with coloured bars, read
  straight from the Redis token buckets. **Point out:** Enterprise gets a 5× multiplier;
  an honest note says LLM has no separate dollar budget.
- **Preferences** tab → **Weekly digest** card (Batch 22): click **"Preview this week's
  digest"** — it renders the real digest (new strategies, failures, regime changes,
  evolution runs, portfolio Sharpe). **Point out:** every number is a real DB query; a
  zero week honestly shows zeros, never filler.

## 9. SuperAdmin console — approve the demo request (2 min)

Sign out, then log in as the **founder**. You land on the crimson **Superadmin Console**
(`/superadmin`).

- **Command Center**: platform-wide stats across every org.
- **Demo Requests**: find the request from step 1 → **Approve** → it creates a live org +
  admin user and shows the temp password once. **Point out:** cross-tenant reads/writes
  here are all written to an append-only `superadmin_audit_log` (SOC 2).
- **Companies**: open one → **Suspend** → note its users are now locked out of the *entire*
  client API (org-status gate), sessions revoked, cache invalidated. Reactivate.

## 10. Public API docs (60s)

Open **`/docs`** (public, no login).

- Show the conceptual guides (Quickstart, Authentication, WebSocket events, Rate limits,
  Strategy DSL) and the **live endpoint list** generated from the running service's OpenAPI.
- Click **"complete API reference (Redoc)"** → the full interactive reference at
  `/docs/api`. **Point out (security):** the internal `/superadmin/*` control plane is
  **excluded** from the public schema — verified by an automated test — so nothing internal
  is advertised to anonymous visitors.

---

## What NOT to click during a cold demo

- **Knowledge Graph / Research Assistant** if Neo4j / an LLM key aren't configured — they
  degrade gracefully (503 / a clear error), but it's not the impression you want live.
- **Re-run detection / backtest** without a Celery worker running — the job sits `pending`
  (the UI polls honestly; it won't fake a result).
- The 9 admin "harness" pages (strategies, failures, graph, evolution, assistant,
  data-ingest, research, governance, llm-audit) render **without the left sidebar** (a known
  cosmetic gap — see the Batch 23 report). Navigate back via the browser or the dashboard,
  not an on-page nav. The core demo path (dashboard, regimes, portfolio, settings,
  superadmin, docs) all have full chrome.
