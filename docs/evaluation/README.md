# Stellix Labs - evaluation evidence pack

Prepared 2026-10-21 from the live codebase and database. This pack answers a checklist of evidence requests
(implementation, measured results, data provenance, protocol, baselines, ablations, testing, references). It is written
to be checked: every number comes from a script in `scripts/evaluation/` or from a stored record, and every limitation
that would change a reader's conclusion is stated next to the result it affects.

## 1. Headline findings (read this first)

**What is solidly established**

- The platform's pipeline (regime detection, backtest, 5-method validation, failure records, evolution engine, knowledge
  graph, multi-agent desk) is implemented and runs end to end. **690 automated tests: 681 passed, 0 failed, 9 skipped**
  (integration tests; the two that back the "failures are permanent" claim were run against live Postgres and passed).
- Validation is selective: 78% of validated base strategies are `auto_fail` and only 1 of 36 is `eligible_active`. Ranking
  strategies by naive Sharpe disagrees with the validation ranking (Spearman 0.35); 5 of the top 10 by Sharpe auto-fail.
- Out of sample (Experiment A, chronological 60/40 holdout), **regime knowledge carries some information**: regimes learned on
  early data beat randomly chosen regimes at about the 72nd percentile on average, including against an
  exposure-matched control. Regime gating also reduced drawdown in 17 of 32 strategies.

**What is *not* supported by this evidence**

- **No out-of-sample return advantage over passive holding.** In the held-out windows (buy-and-hold +90% to +218%), none of the
  32 strategies beat buy-and-hold, even position-size-matched, and 29 of 32 had a lower Sharpe.
- **Regime gating did not raise returns or Sharpe** (mean -1.0 pp return, Sharpe change not distinguishable from 0).
- **Evolution does not generalize reliably**: the genetic algorithm optimizes its in-sample fitness (5.95 at a larger budget) but
  only 0.18 survives out of sample; it is not distinguishable from random search or the untouched seed on held-out fitness.
- **The third pillar ("compounding memory") has no measured effect yet**: nine desk analyses exist, one informative settled outcome.
- **The Meridian tenant's lifecycle states and failure-trigger mix are partly staged** by the seed scripts, so they are not
  estimates of real failure rates.

## 2. Checklist map

| Requested item | Priority | Where | Status |
|---|---|---|---|
| Current source code / repository | Essential | [01](01-implementation-and-testing.md) section 1; source ZIP (section 5 below) | **Provided** as a ZIP with secrets and demo credentials excluded or redacted. The git working tree has uncommitted changes; commit before sharing a link. |
| Actual experimental results | Essential | [04](04-results.md), [05](05-baselines-and-ablations.md), `evidence/*.csv` | **Provided** (measured; metric definitions in [03](03-experimental-protocol.md)) |
| Dataset and data provenance | Essential | [02](02-datasets-and-provenance.md) | **Provided** (Yahoo Finance via yfinance, daily, unadjusted; no raw data included) |
| Experimental protocol and configuration | Essential | [03](03-experimental-protocol.md) | **Provided** (all constants read from code; seeds listed) |
| Baseline and comparison results | Essential for a strong evaluation | [05](05-baselines-and-ablations.md) sections 1, 2, 4, 5 | **Provided** (buy-and-hold, naive-Sharpe ranking, random regime choice, random search, unmodified seed) |
| Component / ablation results | Strongly recommended | [05](05-baselines-and-ablations.md) sections 1-3, 6 | **Partly provided**: regime-conditioning ablation (held-out), validation-component ablation (post-hoc), evolution vs random search. **Failure-memory and graph ablations were not run** (listed as proposed experiments P1, P8) |
| Implementation and testing evidence | Essential | [01](01-implementation-and-testing.md) | **Provided**, with working / mocked / partial status per component |
| Verified academic papers and references | Essential | [06](06-references.md), [references.bib](references.bib) | **Provided**: 23 entries verified against external records (existence and bibliographic details; full texts not read) |

## 3. What each public claim can and cannot rest on

| Claim sometimes made about the platform | Evidence status |
|---|---|
| "Every number carries its market regime" | Supported (regime attached to backtests, failures, signals, desk context). The regime labels themselves are full-history fits, not point-in-time. |
| "A strategy must pass five validation tests and a 0.70 score before it can go live" | Supported in code and tests (plus a recorded human approval). The score is partly in-sample for tuned strategies. |
| "Failures are permanent; the database refuses edits and deletes" | Supported: DB privileges revoked, 2 integration tests passed against live Postgres. Only the explanation columns may be updated. |
| "AI explanations are checked against the record" | Supported for numbers (13 of 13 passed); not for causal claims. |
| "Regime conditioning improves strategies" | **Partly**: reduces drawdown; informed regime choice beats random choice; no return or Sharpe gain. |
| "The evolution engine improves strategies" | **Not supported out of sample.** In-sample improvements are real but do not generalize reliably. |
| "Failures are mostly regime mismatches" (or "most strategies fail because the regime changed") | **Not supported.** Six of the 13 records were assigned by the seed script, and the "regime mismatch" trigger is defined by the regime label itself. Avoid this claim. |
| "The multi-agent desk learns from our past failures" | Implemented (context injection); **effect not measured**. |
| "Research Memory improves research" | Structure and the five queries work and are tested; **no outcome study**. Runs on PostgreSQL alone (ADR 0012). |
| "Strategies beat the market" | **Not true in the held-out windows tested** and not claimed here. |
| "The AI never predicts prices or trades" | Implemented as guards (numeric redaction, no execution path, human approval); tests use mocked model providers. |
| "Tenants are isolated" | Supported by structural design and 137 passing security / isolation tests. |

## 4. Reproducing the numbers

Prerequisites: Postgres running with the Meridian demo tenant and its stored history (see [02](02-datasets-and-provenance.md)).
Run from the repository root.

```bash
backend\.venv\Scripts\python.exe scripts\evaluation\export_evidence.py          # evidence/*.csv, summary.json, manifest.json, tables.md
backend\.venv\Scripts\python.exe scripts\evaluation\exp_regime_gating.py        # Experiment A  (a few minutes; 10 worker processes)
backend\.venv\Scripts\python.exe scripts\evaluation\exp_evolution_vs_random.py  # Experiment B, small budget
backend\.venv\Scripts\python.exe scripts\evaluation\ablate_validation_score.py  # Ablation C (needs export_evidence first)
cd backend && .venv\Scripts\python.exe -m pytest tests -q -p no:warnings --junitxml=..\docs\evaluation\evidence\pytest_junit.xml && cd ..
backend\.venv\Scripts\python.exe scripts\evaluation\summarize_tests.py
```

Experiment B at the larger budget (set in the shell first): `EVAL_POP=24`, `EVAL_GENS=15`, `EVAL_TAG=_large`, `EVAL_PROCS=5`
(PowerShell: `$env:EVAL_POP='24'` and so on), then run the same script. Experiments fix their seeds (42 for the platform and the
bootstrap, 1-3 for Experiment B), but they depend on the stored data, so reruns after new ingestion will differ.

## 5. Source ZIP

```bash
backend\.venv\Scripts\python.exe scripts\evaluation\make_submission_zip.py
```

Writes `StellixLabs_review_<date>.zip` next to the repository plus `_secret_scan.txt`. The ZIP excludes `.git`, every `.env`,
`.venv`, `node_modules`, `.next`, caches, local data (`var/`, which holds cached price data), keys and logs; scans text files for
credential patterns and **refuses to build if an API-key or private-key pattern is found**; and **redacts the demo passwords**
defined in `scripts/seed_demo_data.py` wherever they appear in the copy (the repository itself is unchanged). The 22 remaining
"review" items in the scan are password literals in automated test fixtures. Nothing has been uploaded or shared by this process.
Before any public release, also remove the demo credentials from the repository itself and rotate any key that was ever pasted
into a chat or shared channel.

## 6. Folder contents

| File | Content |
|---|---|
| `01-implementation-and-testing.md` | Components, status, tests, known failures, third-party components |
| `02-datasets-and-provenance.md` | Data source, universes, preprocessing, limitations |
| `03-experimental-protocol.md` | Every method and parameter; what is and is not held out |
| `04-results.md` | Measured results with provenance |
| `05-baselines-and-ablations.md` | Experiments A, B, C, baselines, proposed (not run) experiments |
| `06-references.md`, `references.bib` | Verified bibliography |
| `evidence/` | CSVs, JSON summaries, JUnit XML reports, generated tables |
| `../../scripts/evaluation/` | Every script that produced a number here |
