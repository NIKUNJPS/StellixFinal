# Stellix Labs — Demo Script

Rewritten in the Batch 29 consolidation session (2026-09-24). Every step below was
personally verified working in this session, in a real browser, against real data —
nothing here is carried over from an earlier report unverified. Honest fallbacks are
called out explicitly wherever a credential isn't configured in a given environment.

## Before you start

1. **Bring the stack up**: Postgres, Redis (Neo4j optional — the whole platform degrades
   gracefully without it, see below); the backend
   (`backend/.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000`); a Celery
   **worker** and a Celery **beat**, as **two separate processes**
   (`… -m celery -A app.worker.celery_app.celery_app worker --pool=solo` and
   `… -m celery -A app.worker.celery_app.celery_app beat` — Windows does not support the
   combined `--beat` flag); and the frontend (`cd frontend && npm run dev`).
2. **Seed the demo org**: `backend/.venv/Scripts/python.exe scripts/seed_demo_data.py`,
   then `… scripts/verify_demo_seed.py`.
3. **Clean up test artifacts**: `backend/.venv/Scripts/python.exe
   scripts/cleanup_e2e_artifacts.py` (dry-run; add `--execute` once you've read the
   printed list — it hard-preserves Meridian and the superadmin account either way).

**Demo credentials** (Meridian Capital, `meridian-capital`, all `MeridianDemo2026!`)

| Role | Email |
|---|---|
| Admin | `research@meridian.com` |
| Researcher | `dpark@meridian.com` |
| Risk Manager | `s.okonkwo@meridian.com` |
| CIO | `j.whitfield@meridian.com` |
| Compliance Officer | `a.reyes@meridian.com` |
| Quant Engineer | `m.chen@meridian.com` |

Platform SuperAdmin: `admin@stellixlabs.com` / `Finalyear123$`.

---

## 5-Minute Version

### 1. Landing page + login (30s)

Open **`/`**, then **`/login`**. Sign in as Meridian Admin
(`research@meridian.com`). Land on the **Dashboard**: real seeded activity — current
regime, active-strategy count, avg strategy performance, failure-alert count, and
**global market indices** with an honest "Delayed · refreshed every 2 min" label
(free-tier yfinance data, never presented as real-time).

### 2. Regime detection + cross-asset view (60s)

Navigate to **`/admin/regimes`** (Regime Monitor). Show the **Cross-asset regimes**
panel — SPY, QQQ, GLD, BTC-USD, each with its detected regime, confidence, and "N ago".
Enter a symbol and **Load timeline** for the single-symbol ensemble view (HMM · PELT ·
GMM · GARCH). **Point out:** this reads real stored detections; it only flags a
divergence when the actual combination warrants one.

### 3. The real Active strategy + its real current signal (60s)

Navigate to **Signals** (`/signals`). Show the live card for the genuinely Active
strategy — its name, symbol, current signal (BUY/SELL/HOLD), the regime it was
evaluated in, and its real validated robustness score. **Point out:** this is generated
deterministically from the strategy's own rules replayed against real bars — not an
LLM guess, and the signal service has zero import path to the LLM layer by construction
(a static import-graph check enforces it, the same mechanism that backs Safeguard 2).

### 4. A real failure, with real SHAP attribution (90s)

Navigate to **Failure Intelligence** (role-specific path, e.g. `/researcher/failures`
or `/admin/failures`). Open a failure row. Show the **trigger** (drawdown breach /
Sharpe decline / regime mismatch), the **regime at failure**, and the **SHAP feature
attribution** chart. **Point out:** the failures table is append-only at the Postgres
grant level (UPDATE/DELETE revoked for the app role) — a failure can't be quietly
edited or deleted, only ever added to.

**Honest fallback if `ANTHROPIC_API_KEY` isn't configured**: the failure's AI
explanation panel will read "AI explanation unavailable — no API key configured," with
a note that the failure data, trigger, and SHAP attribution above it are unaffected.
Some older failures may already show a real generated explanation from a session where
the key was configured — point out both states exist honestly side by side.

### 5. Knowledge graph (30s)

Navigate to **Knowledge Graph** (role-specific path, e.g. `/researcher/graph`). Run one
of the 5 named queries.

**Honest fallback if Neo4j isn't reachable**: the query returns a real `503`, and the
page explains the graph is a derived, rebuildable-from-Postgres projection — not a
crash, not a fabricated empty result presented as real.

### 6. SuperAdmin command center (30s)

Sign out, sign in as SuperAdmin. Show the **Command Center**: real platform-wide
counts (organizations, users, strategies, backtests) pulled live from the database, not
a static number.

---

## 15-Minute Technical Version

Everything above, plus:

### 7. The ADR-0008 governance story — present as a strength

Walk through `docs/adr/0008-robustness-score-single-source-of-truth.md`. The real
finding: `robustness_score` had three separate writers racing to set the one field the
activation gate reads, so a strategy could show a passing score that was actually a
single backtest's number, or a validated score left over from rules that had since
changed. A real database audit at the time found 64 strategies whose gate score
disagreed with their own validation record, 10 with no validation evidence at all, and
1 Active strategy that had never been genuinely validated.

**Point out it's still holding, not just documented**: re-running the same class of
check live in this session found **0** mismatches and **0** Active strategies without
matching current-version evidence. And — a genuine, unplanned demonstration from this
very session — the platform's own failure-monitoring sweep, run for the first time
against fully caught-up historical data, correctly detected a real `regime_mismatch` on
the strategy that had been Active, and moved it to Failed. That's the governance system
doing its job on real data, not a scripted moment.

### 8. Dynamic RBAC, live

Go to SuperAdmin → **Roles & Permissions** (`/superadmin/roles`). Show the 6 system
roles with their real permission counts. Reassign a test user's role, then — in a
second tab already logged in as that user, **no re-login** — show their nav and access
change on their very next request. This is the same mechanism that makes **Quant
Engineer** real: 2 permissions (`signals.view`, `strategy.version`), zero governance
permissions, its own scoped nav (Dashboard, Strategy Explorer, Signals, Market
Research, Research Notebook, Knowledge Graph — no Governance, no Kill Switch).

### 9. Market Research widgets, with honest source attribution

Navigate to **Market Research** (`/market-research`), all 4 tabs:

- **Macro** — sourced from FRED's official API when `FRED_API_KEY` is configured; this
  environment shows "FRED not configured" honestly rather than a broken or fabricated
  chart.
- **Screener** — real yfinance data across a **bounded 56-symbol universe**, labeled
  "not the full market."
- **Sector Heatmap** — tile size by real dollar volume traded, not market cap; color by
  dollar-volume-weighted % change.
- **Chart** — real candlesticks + indicators via the same `compute_features()` the
  strategy engine itself evaluates against, not a separate approximation.

**Point out what was deliberately not shipped**: an Options Chain. Real yfinance
options data was inspected during Batch 28 and found bid/ask/open-interest at 0 for the
vast majority of contracts on the free tier — shipping it would have looked live while
misleading users. See `docs/THIRD_PARTY_NOTICES.md`.

### 10. The real test suite, live on screen

```
cd backend && .venv/Scripts/python.exe -m pytest -q --junit-xml=result.xml
```

625 collected, 0 failures. Optionally re-run with `RUN_INTEGRATION=1` to include the 9
opt-in integration tests (needs live Postgres + live network) — all 625 pass with 0
skipped.

---

## What NOT to click during a cold demo

- **Knowledge Graph / Research Assistant**, if Neo4j / an LLM key aren't configured in
  the environment you're demoing from — they degrade honestly (a real `503` / a plain
  "not configured" message), but it's not the impression you want live if you haven't
  set up the fallback narration above.
- **Macro tab**, if `FRED_API_KEY` isn't set — same honest-degradation note.
- Role-specific "harness" pages (strategy detail, failures, graph, evolution,
  assistant, data-ingest, research) render without the left sidebar — a known,
  documented cosmetic gap, not a bug. Navigate back via the sidebar link you came from,
  not browser history through a chain of these pages.
