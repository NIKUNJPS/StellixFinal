# Stellix Labs — End-to-End Testing Guide

A complete, self-serve procedure to verify **every feature** from a cold machine to a
finished demo. Written for someone who understands the concepts but wants exact
commands and exact click paths.

**How to use:** work top to bottom. Each test states what to do, what a **PASS** looks
like, and what **FAIL** looks like. Tick the checklist in §16 as you go.

---

## 0. Environment startup

Start services **in this order**. Each must be healthy before the next.

| # | Service | Command | Port | Success signal |
|---|---|---|---|---|
| 1 | Postgres + TimescaleDB | `cd infra && docker compose --env-file .env up -d postgres` | **5433** | `docker compose ps` → healthy |
| 2 | Redis | (same compose file) `... up -d redis` | 6379 | healthy |
| 3 | Neo4j | `... up -d neo4j` | 7687 / 7474 | healthy |
| 4 | Backend | `cd backend`<br>`.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000` | 8000 | `Application startup complete` + `WS bridge started` |
| 5 | Celery worker | `cd backend`<br>`.venv/Scripts/python.exe -m celery -A app.worker.celery_app.celery_app worker --loglevel=info --pool=solo` | — | `celery@<host> ready.` + 14 tasks listed |
| 6 | Frontend | `cd frontend && npm run dev` | 3000 | `✓ Ready in Ns` |

> **Windows:** `--pool=solo` on the Celery worker is **mandatory**. Without it the
> worker starts but silently never executes tasks.
>
> **Postgres is on 5433**, not the default 5432 (see `backend/.env`).

### 0.1 Health check
```bash
curl http://localhost:8000/health
```
**PASS:** HTTP 200 with `postgres: ok`, `redis: ok`, `neo4j: ok`.
**Note:** if Neo4j isn't installed, `neo4j: error` and overall `status: error` is the
*correct, honest* response — see §7.

### 0.2 Test suite
```bash
cd backend
$env:RUN_INTEGRATION=1                       # PowerShell
.venv/Scripts/python.exe -m pytest tests/ -q --tb=short
```
**PASS:** `430 passed`, 0 failures.

### 0.3 Lint (what CI runs)
```bash
cd backend && .venv/Scripts/python.exe -m ruff check .
```
**PASS:** `All checks passed!`

### 0.4 Seed the demo tenant
```bash
cd backend && .venv/Scripts/python.exe ../scripts/seed_demo_data.py
.venv/Scripts/python.exe ../scripts/verify_demo_seed.py
```
**PASS:** Meridian Capital Partners exists, `status=active`, ~64 strategies.

### Demo credentials
| Role | Email | Password |
|---|---|---|
| admin | `research@meridian.com` | `MeridianDemo2026!` |
| researcher | `dpark@meridian.com` | `MeridianDemo2026!` |
| risk_manager | `s.okonkwo@meridian.com` | `MeridianDemo2026!` |
| cio | `j.whitfield@meridian.com` | `MeridianDemo2026!` |
| compliance_officer | `a.reyes@meridian.com` | `MeridianDemo2026!` |

---

## 1. Authentication & account lifecycle

### 1.1 Landing page — `http://localhost:3000`
**PASS:** hero headline animates word-by-word; 3 stat counters tick up; "live research
terminal" card on the right; nav (Product/Features/Architecture/Use Cases/Pricing/Docs)
+ blue **Request Demo**.
**FAIL:** blank page (frontend compile error) · unstyled text (Tailwind not loaded).

### 1.2 Demo request (public, no login)
Click **Request Demo** in the hero → modal opens.

| Field | Value |
|---|---|
| Name | `Viva` / `Tester` |
| Work email | `viva@vivatestcapital.com` |
| Company | `Viva Test Capital` |
| Job title | `Portfolio Manager` |
| Firm type / Team | `Hedge Fund` / `6–20` |
| Use case | ≥ 20 characters |
| Primary interest | tick ≥ 1 |
| Consent | ✅ required |

**PASS:** green panel *"Request received. Check your inbox."*
**FAIL:** *"Please use your work email"* → free webmail (gmail/outlook) is **deliberately
rejected**; use a company domain. Use case < 20 chars also blocks.

**Verify it persisted:**
```bash
cd backend && .venv/Scripts/python.exe -c "
import asyncio
from sqlalchemy import select
from app.db.session import get_system_session
from app.db.tenant import mark_session_unscoped
from app.models.demo_request import DemoRequest
async def m():
    async with get_system_session() as s:
        mark_session_unscoped(s.sync_session)
        for r in (await s.execute(select(DemoRequest).order_by(DemoRequest.created_at.desc()).limit(3))).scalars():
            print(r.company, '|', r.work_email, '|', r.status.value)
asyncio.run(m())"
```
**PASS:** your company appears with `status = pending`.

### 1.3 Self-registration → pending approval
`/register` — org `Viva Selfserve Ltd`, email `selfserve@vivatestcapital.com`,
password `VivaTest12345` (≥10 chars, must contain a digit).

**PASS:** you are **NOT** logged in. Card reads *"Request received — Your workspace is
pending approval."* API returned **202**, no token.
**FAIL:** you land on a dashboard → the approval gate is bypassed (**critical**).

**Why:** this is B2B infrastructure. New orgs are created `pending_approval` with **no
JWT issued**; an operator must approve them (see §11.3).

### 1.4 Login before approval → must fail cleanly
`/login` with the 1.3 credentials.
**PASS:** red banner **"Your organization is pending approval."**
**FAIL:** you get in (**critical**) · generic "something went wrong" (poor UX).

> The password is *correct* — rejection comes from a **separate org-status gate**. This
> demonstrates authentication vs authorisation separation.

### 1.5 Login as the seed org
`research@meridian.com` / `MeridianDemo2026!`, leave org-slug blank.
**PASS:** redirect to `/dashboard`, real non-zero KPIs, left sidebar with ~15 links.

### 1.6 MFA (TOTP)
**Check first, don't enrol blindly.** All seed users ship `mfa_enabled=False`, so MFA
does not block login. The implementation is real (`pyotp`, 4 endpoints:
`/auth/mfa/enroll|verify|login|disable`).

⚠️ **Do NOT enrol MFA on your demo account before a viva** — you'd need an authenticator
app for every future login and could lock yourself out.

**PASS:** Settings → Security shows an MFA section; login works without a code.

### 1.7 Logout
User menu (top-right avatar) → **Sign out**.
**PASS:** redirected to `/login`; navigating back to `/dashboard` bounces you to login.

---

## 2. Dashboard & navigation

### 2.1 Dashboard data
**PASS:** Current Market Regime (e.g. *High-Volatility · SPY · 25% confidence*), Active
Strategies, Avg robustness, Failure Alerts, Research Activity, Evolution Updates — all
non-zero; equity curve, lifecycle donut, regime timeline, failure heatmap all render.

### 2.2 Sidebar navigation
Click every link. All 15 should load without a blank screen:
Dashboard · Strategy Explorer · Portfolio · Failure Intelligence · Evolution Engine ·
Regime Monitor · Governance & Compliance · Knowledge Graph · Research Assistant ·
LLM Audit Log · Research Notebook · Data Ingest · System Monitoring · Billing · Settings.

> **Known cosmetic issue:** 9 of these pages render **without the left sidebar**
> (strategies, failures, graph, evolution, assistant, data-ingest, research, governance,
> llm-audit). Content is correct; navigate back via the browser. Documented, not a bug.

### 2.3 Mobile responsive (375 px)
Chrome → **F12** → click the **device toolbar** icon (📱, or Ctrl+Shift+M) → choose
**iPhone SE (375×667)**.
**PASS:** sidebar replaced by a **hamburger** (top-left) that opens a slide-over drawer
with all links; **no horizontal scrolling**.

### 2.4 WebSocket status
**PASS:** green **"● Live"** indicator in the top bar.
**FAIL:** red/grey or missing → WS bridge didn't connect (check backend log for
`WS bridge started`).

---

## 3. Market data & regime detection

### 3.1 Regime Monitor — `/admin/regimes`
**PASS:** a real regime (one of Bull / Bear / High-Volatility / Low-Volatility /
Sideways / Crisis) with a confidence gauge, plus the animated regime timeline.

### 3.2 Cross-asset divergence
Same page, **Cross-Asset Regimes** panel.
**PASS:** 4 asset cards — **SPY, QQQ, GLD, BTC-USD** — each with regime, confidence,
"detected N ago", colour-coded.
- If a **divergence** appears (one asset Bull while another is Bear/Crisis, or exactly
  one in Crisis) it's listed as an alert.
- If all agree → *"markets are synchronized"* note.
- If < 2 symbols have data → *"Not enough stored regime data"*.

> Divergences only fire on **real** detected combinations — the absence of an alert is
> correct behaviour, not a broken feature.

### 3.3 Trigger a live detection (needs Celery)
Enter `SPY` → **Re-run detection**.
**PASS:** 202 accepted; within ~10–30 s a **toast notification** appears (top-right)
without refreshing — that's the WebSocket `regime_update` event.
**FAIL:** nothing after 60 s → check the Celery worker is running with `--pool=solo`.

### 3.4 CSV upload — `/admin/data-ingest`
**Required columns:** `date, open, high, low, close, volume` (case-insensitive; common
variants like `Date`/`timestamp`/`vol` auto-detect).

**Test A — valid file.** Create `good.csv`:
```csv
date,open,high,low,close,volume
2024-03-01,100,101.5,99,101,1000000
2024-03-02,101,102.5,100,102,1010000
2024-03-03,102,103.5,101,103,1020000
2024-03-04,103,104.5,102,104,1030000
2024-03-05,104,105.5,103,105,1040000
```
Drag it in → symbol `TESTAA` → interval `1d` → **Validate** → **Import**.
**PASS:** validation report shows *5 valid rows*, a 5-row preview, date range; after
import: *"5 bars imported for TESTAA (1d)"*.

**Test B — deliberately broken file.** Create `bad.csv` (row 2 has **high < low**):
```csv
date,open,high,low,close,volume
2024-03-01,100,101.5,99,101,1000000
2024-03-02,101,90,110,102,1010000
```
**PASS:** **422** with a red error table naming **row 2, column `high`, "high is less
than low"** — and **nothing is written to the database**.
**FAIL:** the bad row imports → validation bypassed (**critical**).

---

## 4. Strategy lifecycle

### 4.1 Strategy list — `/admin/strategies`
**PASS:** seeded strategies with status badges (active / candidate / failed / retired).

### 4.2 Create a strategy — `/admin/strategies/new`
Build a simple rule, e.g. entry `sma_20 crosses_above sma_50`, exit `sma_20
crosses_below sma_50`, risk: max drawdown 15%, position 10%, stop 5%.
**PASS:** strategy created in `draft`.

### 4.3 Backtest (needs Celery)
Open the strategy → **Run backtest** → symbol `SPY`.
**PASS:** results show equity curve, Sharpe, max drawdown, trade log — **and metrics
split by regime**.

### 4.4 Lifecycle state machine
Legal: draft → candidate → active → failed → retired.
**Try an illegal jump** (draft → active directly).
**PASS:** rejected with **409 Conflict**.
**FAIL:** silently allowed → the state machine isn't enforced.

### 4.5 Approval gate
**PASS:** promotion to `active` requires robustness **≥ 0.70** *and* explicit approval;
an under-robust strategy cannot be promoted from the UI.

---

## 5. Validation, failures & explainability

### 5.1 Validation results
Open a strategy's validation page.
**PASS:** all five methods reported — walk-forward, regime cross-validation, Monte-Carlo,
persistence, stress — combined into one composite robustness score.

### 5.2 Failure Intelligence — `/admin/failures`
**PASS:** failures listed with trigger type (drawdown breach / Sharpe decline / regime
mismatch / manual) and a **SHAP attribution** chart of contributing features.

### 5.3 LLM failure explanation
Click into a failure.
**PASS (with `ANTHROPIC_API_KEY` set):** a written explanation, **and no warning badge**
saying numbers couldn't be verified.
**PASS (no key):** a graceful "unavailable" state — *not* a crash.
🚩 **Regression flag:** if a "numbers could not be verified" badge appears, that's an
ADR-0005 (Safeguard 5) regression — report it.

### 5.4 Failure clustering
**PASS:** related failures are linked to each other (Jaccard similarity).

---

## 6. Knowledge graph — `/admin/graph`

**If Neo4j is NOT running:** the page shows a clean error/empty state within a few
seconds. **This is expected and correct** — skip to §6.3.

### 6.1 Named query
Run *robust across regimes* or *recurring failure modes*.
**PASS:** real results render (not an empty canvas).

### 6.2 Lineage
Find an evolved strategy → trace parent → child edges.
**PASS:** `MUTATED_FROM` lineage visible.

### 6.3 What this proves without Neo4j running
The integration is real, not mocked: 6 node types, 8 edge types, 5 named queries, all
tenant-scoped at the query-builder level, plus a nightly Postgres↔Neo4j drift check. The
**graph is a derived projection** of Postgres — it can be rebuilt, which is why its
disaster-recovery RPO is "rebuild time", not backup age.

---

## 7. Evolution & LLM assistant

### 7.1 Evolution — `/admin/evolution`
**PASS:** a completed run shows a fitness-over-generations chart. Triggering a new run
(needs Celery) streams **live progress** over WebSocket.

### 7.2 Research Assistant — `/admin/assistant`
**Without API keys:** feature requires `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`. Expect a
clear error, not a crash. Don't force it.
**With keys:**
- Simple question (*"summarize the current regime for SPY"*) → routed to **Gemini**.
- Complex question (*"critique this strategy's risk of overfitting"*) → routed to **Claude**.
**PASS:** response **streams token-by-token**; a model badge shows which provider handled
it; the call appears in **LLM Audit Log** with tokens + cost.

**Also test the guard:** ask *"what will SPY be worth tomorrow?"*
**PASS:** refused with **400** *before* any model call (price-prediction guard).

---

## 8. Portfolio — `/admin/portfolio`

**8.1 PASS:** portfolio Sharpe, max drawdown, active strategy count, risk alerts.
**8.2 PASS:** correlation heatmap with real values; high-correlation pairs flagged (a
concentration alert means your "diversified" strategies are really one bet).
**8.3 PASS:** regime-exposure donut showing strategy specialisation.

---

## 9. Governance & compliance — `/admin/governance`

**9.1 Audit log PASS:** real entries (logins, strategy status changes) — append-only.
**9.2 Kill switch PASS:** action available; requires a **mandatory reason**; instantly
retires a strategy bypassing the state machine. *(Explain it; only execute if you want
to actually retire something.)*
**9.3 Compliance export PASS:** a real file downloads containing real audit data.

---

## 10. Billing & usage

**10.1 Usage meter — Settings → Usage.**
**PASS:** real bucket state, e.g. *Global requests 2/100 per 1m*, plus Data ingestion
10/hr, Backtests 30/hr, Validations 20/hr, Evolution 5/hr, LLM 50/hr. Bars colour by
utilisation. An honest note says there is **no separate monthly LLM dollar budget**.

**10.2 Billing.** **PASS:** plan/tier renders. Without Stripe keys checkout won't
complete — expected.

**10.3 Weekly digest — Settings → Preferences → "Preview this week's digest".**
**PASS:** a real digest renders (new strategies, failures, regime changes, evolution
runs, portfolio Sharpe). **Zeros are correct** if the seed data is older than 7 days —
that's honesty, not a bug. The Sharpe should be a real number.

---

## 11. SuperAdmin control plane

**Create an account first (once):**
```bash
cd backend
.venv/Scripts/python.exe ../scripts/create_superadmin.py --email founder@stellixlabs.com --name "Founder"
```
It prints a generated password **once** — save it.

**11.1 Login PASS:** you're redirected to **`/superadmin`**, not `/dashboard`, and the
console is unmistakably **crimson** with a "SUPERADMIN CONSOLE" badge. *(Visual
separation matters: the founder must never confuse cross-tenant with single-tenant.)*

**11.2 Command Center PASS:** cross-org KPIs — total companies, by status, MRR.

**11.3 Approve the demo request** → **Demo Requests** → find *Viva Test Capital* →
**Approve**, choose a plan.
**PASS:** a new organisation + admin user is created and a **temporary password shown
once**.

**11.4 Verify the new account works.** Log in (incognito) with that email + temp password.
**PASS:** login succeeds → proves the full pipeline **public request → approval → working
account**.

**11.5 Suspend & verify instant lockout.** Companies → pick the org from 11.3 →
**Suspend** with a reason. In the other tab, refresh/act as that user.
**PASS:** **403** with a clear *"organization has been suspended"* message (not a crash),
effective immediately (Redis cache invalidated on change). Sessions revoked.
Then **Reactivate** → access returns.

**11.6 Companies list/detail PASS:** browse, open a company, view users + stats.

**11.7 Audit trail PASS:** every action above (approve/suspend/reactivate) is recorded in
**`superadmin_audit_log`** — separate from the tenant audit log. Verify:
```bash
cd backend && .venv/Scripts/python.exe -c "
import asyncio
from sqlalchemy import select, func
from app.db.session import get_system_session
from app.db.tenant import mark_session_unscoped
from app.models.superadmin_audit_log import SuperAdminAuditLog
async def m():
    async with get_system_session() as s:
        mark_session_unscoped(s.sync_session)
        for a,c in (await s.execute(select(SuperAdminAuditLog.action, func.count()).group_by(SuperAdminAuditLog.action))).all():
            print(f'{a:26} {c}')
asyncio.run(m())"
```

---

## 12. Onboarding wizard (needs a genuinely fresh org)

Use the org created in 11.3 (0 strategies, `onboarding_completed=false`).

**12.1 PASS:** on first login the wizard appears automatically as a modal.
**12.2 Walk the 5 steps:**
1. Welcome + 3 pillars.
2. Symbol search — type `AAPL` → **"Apple Inc."** appears (bundled ticker list, **no live
   API call**). Pick a period (1y/2y/5y).
3. Data fetch → **real regime detection** runs (needs Celery + a live yfinance call;
   10–30 s is normal). Shows the **real** detected regime + confidence.
4. Pre-filled SMA 20/50 crossover → **Save & run backtest**.
5. Completion + confetti + quick links.

**12.3 PASS:** log out and back in — the wizard does **not** reappear
(`onboarding_completed = true`).

---

## 13. API documentation & security

**13.1 Public docs — `http://localhost:3000/docs`.**
**PASS:** guides present — Quickstart, Authentication, WebSocket events, Rate limits,
Strategy Rule DSL — plus a live endpoint list generated from the running service.

**13.2 Redoc — `/docs/api`.**
**PASS:** full interactive reference with tagged groups (Authentication, Market Data,
Regime Detection, Strategy Lifecycle, …) and example request bodies.

**13.3 🔒 CRITICAL security check.** On `/docs` and `/docs/api`, press **Ctrl+F** and
search for **`superadmin`**.
**PASS:** **zero results.**
**FAIL:** any result is a **serious security regression** — the internal control plane
must never be advertised publicly.

Automated equivalent:
```bash
curl -s http://localhost:8000/openapi.json | grep -ci superadmin      # must print 0
```

---

## 14. Known environment limitations (explain, don't "fix")

| Symptom | Cause | Correct explanation |
|---|---|---|
| Knowledge Graph shows an error | Neo4j not running | Derived store; rebuildable from Postgres. Integration is real + tested. |
| Research Assistant errors | No `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | Deferred-credential pattern; inert without keys by design. |
| Jobs stay `pending` | Celery worker not running (or missing `--pool=solo`) | Async-by-design; the UI polls honestly rather than faking a result. |
| Billing checkout doesn't complete | No Stripe keys | UI + plan structure still render. |
| Digest shows zeros | Seed data older than 7 days | Real query over a real 7-day window — honest, not filler. |
| 9 admin pages have no sidebar | Known layout inconsistency | Cosmetic; documented in `MOBILE_AUDIT.md`. |

---

## 15. Shutdown

```powershell
Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -match 'uvicorn|next dev|next-server|celery|locust'
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# Verify the ports are free
foreach ($p in 8000,3000) {
  if (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) {
    "port $p STILL LISTENING" } else { "port $p free" }
}
```
> Killing `next dev` may leave an orphaned `node` child holding port 3000 — the port
> check above catches it; kill that PID directly if so.

Optional cleanup of test orgs (dry-run first, preserves Meridian):
```bash
backend/.venv/Scripts/python.exe scripts/cleanup_e2e_artifacts.py
backend/.venv/Scripts/python.exe scripts/cleanup_e2e_artifacts.py --execute
```

---

## 16. Checklist

| § | Feature | Status |
|---|---|---|
| 0 | Environment startup + health | ☐ |
| 0.2 | 430 tests pass | ☐ |
| 0.3 | Lint clean | ☐ |
| 1.1 | Landing page | ☐ |
| 1.2 | Demo request → persisted `pending` | ☐ |
| 1.3 | Registration → 202, no token | ☐ |
| 1.4 | Login before approval → 403 | ☐ |
| 1.5 | Seed-org login | ☐ |
| 1.6 | MFA present (opt-in) | ☐ |
| 1.7 | Logout | ☐ |
| 2.1–2.2 | Dashboard + all nav links | ☐ |
| 2.3 | Mobile drawer @375px | ☐ |
| 2.4 | WebSocket "Live" | ☐ |
| 3.1–3.2 | Regime + cross-asset | ☐ |
| 3.3 | Live detection + toast | ☐ |
| 3.4 | CSV valid **and** rejected-invalid | ☐ |
| 4.1–4.3 | Strategy create + backtest | ☐ |
| 4.4 | Illegal transition → 409 | ☐ |
| 4.5 | Approval gate | ☐ |
| 5.1–5.4 | Validation, failures, SHAP, clustering | ☐ |
| 6 | Knowledge graph *(or documented N/A)* | ☐ |
| 7.1 | Evolution | ☐ |
| 7.2 | LLM streaming + routing + guard | ☐ |
| 8 | Portfolio + correlation | ☐ |
| 9 | Audit log, kill switch, export | ☐ |
| 10 | Usage meter, billing, digest | ☐ |
| 11 | SuperAdmin: approve, suspend, audit | ☐ |
| 12 | Onboarding wizard | ☐ |
| 13 | Docs + **no superadmin leak** | ☐ |
