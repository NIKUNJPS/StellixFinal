# 04 - Measured results

> Covers checklist item **"Actual experimental results"**. Every value comes from the live database or from
> a script in `scripts/evaluation/`, generated at the time recorded in `evidence/manifest.json`. No number is an
> illustrative placeholder. For each result: *what produced it*, *what it measures*, and *what it does not show*.
> Metric definitions are in [03-experimental-protocol.md](03-experimental-protocol.md) sections 3-6.
> Held-out experiments (regime gating, evolution, baselines) are in [05](05-baselines-and-ablations.md).

**How to read this document.** Sections 2-3 describe the *system's behaviour on the history it was built on*
(in-sample, no holdout). They show the pipeline works end to end and what it outputs; they are **not** evidence
of predictive or economic value. The only held-out evidence is in document 05.

## 1. Provenance of the records behind these numbers

The measured organization (`meridian-capital`) is a **demo tenant**. Its strategy book is a mixture of:

| Population | Count | How it was produced |
|---|---|---|
| Human-authored strategies, de-duplicated by rules | 32 unique (37 rows) | Authored in `scripts/seed_demo_data.py` (22 specs, written to span trend / mean-reversion / breakout families) and `scripts/fill_demo_backtests.py` (10 well-known rule families, written before backtesting) |
| GA-evolved variants | 84 rows (75 distinct parameter sets, **26 distinct validation scores**) | Produced by the platform's evolution engine from the strategies above |
| Lifecycle states (active / failed / retired) | 1 / 13 / 5 | **Partly staged.** The seed lowers the activation bar to 0.39 for its own process and **forces** failure triggers on chosen strategies (`force_trigger=`). Strategies were then approved, killed or retired through the real API for demo purposes |

Consequently, counts of "failed" or "retired" strategies and the mix of failure triggers are **not estimates of
real-world failure rates**.

## 2. Regime detection (research symbols)

Produced by: `app/regime` on the full stored history; measured by `export_evidence.py`.

**Persistence and confidence** (`evidence/regime_distribution.csv`):

| symbol | bars labelled | label changes | mean run length (bars) | median run length | mean ensemble confidence |
|---|---|---|---|---|---|
| BTC-USD | 2,829 | 388 | 7.3 | 2 | 0.63 |
| ETH-USD | 799 | 84 | 9.4 | 2 | 0.64 |
| GLD | 1,941 | 454 | 4.3 | 2 | 0.57 |
| QQQ | 1,941 | 240 | 8.1 | 2 | 0.58 |
| SPY | 2,695 | 419 | 6.4 | 2 | 0.60 |

Across all 523 symbols the median of the per-symbol mean run length is 7.4 bars and the median confidence is 0.61.

**Agreement of each detector with the ensemble's final label** (`evidence/regime_model_agreement.csv`):

| symbol | GARCH | GMM | HMM | PELT |
|---|---|---|---|---|
| BTC-USD | 0.86 | 0.64 | 0.42 | 0.61 |
| ETH-USD | 0.47 | 0.48 | 0.81 | 0.80 |
| GLD | 0.68 | 0.70 | 0.57 | 0.32 |
| QQQ | 0.91 | 0.61 | 0.36 | 0.44 |
| SPY | 0.84 | 0.71 | 0.54 | 0.31 |

Mean pairwise agreement between detectors (research symbols): GMM-GARCH 0.50, GMM-HMM 0.49, PELT-GARCH 0.38,
HMM-PELT 0.37, HMM-GARCH 0.35, GMM-PELT 0.27.

**What this shows.** The four detectors **disagree substantially** (pairwise agreement 27-50%), the ensemble is
dominated by GARCH on SPY, QQQ and BTC-USD (it also carries the Crisis override), and the median regime lasts
2 bars, so labels flip often. **What it does not show:** there is no ground-truth regime history, so agreement
measures internal consistency, not accuracy. The label shares (document 02, section 4) are heavily skewed to
Low-Volatility, partly by construction of the state-to-label mapping.

## 3. Strategy backtests and 5-method validation

Produced by: `app/strategy/backtest.py`, `app/validation/`; stored in `performance_snapshots`, `validation_results`
(`evidence/strategies.csv`). Backtests use the full stored history, with 0.1% fees and no slippage.

**Classification of all 120 validated strategies:** 63 `auto_fail` (composite < 0.50), 51 `candidate`
(0.50-0.70), 6 `eligible_active` (> 0.70). **Of the 36 validated base strategies (excluding GA variants):**
28 `auto_fail`, 7 `candidate`, 1 `eligible_active`.

The 10 highest-composite base strategies (full table in `evidence/tables.md`):

| Strategy | Symbol | Status | Trades | Sharpe/trade | WF | Regime CV | MC | Persist. | Stress | **Composite** | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SPY Dip-in-Uptrend RSI 45/60 | SPY | active | 16 | 0.63 | 0.50 | 0.75 | 0.78 | 1.00 | 1.00 | **0.731** | eligible_active |
| QQQ MACD Trend | QQQ | failed | 22 | 0.41 | 0.50 | 0.50 | 0.78 | 0.00 | 1.00 | 0.555 | candidate |
| QQQ Strength Filter | QQQ | failed | 14 | 0.55 | 0.50 | 0.50 | 0.76 | 0.00 | 1.00 | 0.553 | candidate |
| SPY Oversold Bounce | SPY | failed | 49 | 0.18 | 0.50 | 0.50 | 0.35 | 0.90 | 0.85 | 0.545 | candidate |
| QQQ Trend Rider | QQQ | failed | 24 | 0.42 | 0.50 | 0.50 | 0.70 | 0.00 | 0.99 | 0.539 | candidate |
| SPY Dual-MA Momentum | SPY | failed | 22 | 0.34 | 0.50 | 0.50 | 0.63 | 0.00 | 0.98 | 0.523 | candidate |
| QQQ Breakout Hold | QQQ | failed | 54 | 0.22 | 0.50 | 0.50 | 0.54 | 0.00 | 0.96 | 0.505 | candidate |
| QQQ Golden Cross | QQQ | failed | 16 | 0.52 | 0.50 | 0.50 | 0.49 | 0.00 | 0.96 | 0.495 | auto_fail |
| SPY Golden Cross | SPY | failed | 22 | 0.43 | 0.50 | 0.50 | 0.49 | 0.00 | 0.95 | 0.493 | auto_fail |
| SPY Trend Filter Plus | SPY | failed | 35 | 0.29 | 0.50 | 0.25 | 0.71 | 0.00 | 1.00 | 0.467 | auto_fail |

(WF = walk-forward, MC = Monte Carlo. "failed" in the status column is a lifecycle state set by the demo seed, not a
statement about these strategies' held-out performance.)

**Important disclosures about the one `active` strategy.**

- *SPY Dip-in-Uptrend RSI 45/60* was **authored during demo preparation, after exploring this same history**, and
  approved through the real approval endpoint with a written justification. Its 0.731 composite is therefore an
  **in-sample result with a selection effect**, not an independent finding.
- Its held-out behaviour (Experiment A test window 2022-06 to 2026-10): total return **+0.6%** ungated, against a
  SPY buy-and-hold price return of +103%; position size 20%.
- Several composites are identical across strategies because the strategies share signals (for example QQQ Trend Rider
  and QQQ Momentum Core). The 36 base strategies contain fewer than 36 independent ideas.
- Three of the 10 newest strategies have 0 or 1 trades (for example *QQQ RSI Pullback in Uptrend*, 0 trades,
  composite 0.10): a rule set that never fires is scored, not discarded, which is correct but unglamorous.

**What this shows.** The validation pipeline runs end to end, is deterministic given the seed, and rejects most
candidates (the base set is 78% `auto_fail`). **What it does not show:** that passing the gate predicts anything
about new data (see document 05, Experiment A and the buy-and-hold comparison).

## 4. Failure intelligence

Produced by: `app/failure` and the seed / monitor sweeps; exported to `evidence/failures.csv`.

| Measure | Value |
|---|---|
| Recorded failures | 13 |
| By provenance | **6 forced by the seed script** (all dated 2024-12-30, the last bar of the seeded window); **7 raised by the monitor sweep on live data** (2026-07-22 and 2026-07-29) |
| By trigger (all 13) | regime mismatch 6, drawdown breach 5, manual 1, Sharpe decline 1 |
| By trigger (7 monitor-sweep records only) | regime mismatch 5, drawdown breach 2 |
| With SHAP feature attribution | 8 of 13 (requires at least 10 trades) |
| With an AI explanation | 13 of 13, **13 of 13 passed the numeric-consistency check** (every number in the text matched the record) |
| Records with an instrument recorded | 2 of 13, and **both are wrong** (see below) |

Reading these numbers:

- The seed script assigned its six triggers by design. Among the seven organic records, five are "regime
  mismatch", but that trigger is defined as "the last bar's regime is outside the strategy's validated regimes", so
  it fires structurally and does not independently show that regime changes cause failures.
- **Two organic records are wrong:** they attribute *SPY Contrarian RSI (evolved ...)* failures to the instruments
  `CRM` and `ACGL`. This is the monitor scoping bug (the sweep judged a strategy against whichever symbol was being
  ingested); it was fixed afterwards (`app/services/failure.py`, with a regression test) but failure rows are
  append-only, so the two records remain as written.
- The numeric-validation check confirms that quoted numbers match the stored record. It does not verify that the
  causal story in the explanation is right.

## 5. Evolution

Produced by: `app/evolution`, `app/services/evolution.py`; stored in `evolution_runs` (`evidence/evolution_runs.csv`,
`evidence/evolution_lineage.csv`).

- 11 recorded runs (10 completed, 1 failed), symbols SPY, QQQ, BTC-USD, populations 10-24, best in-sample fitness
  from -0.33 to 5.86.
- 84 GA-created strategies. Compared with their parents, the **validation composite changed by +0.050 on average**
  (57 improved, 24 worse, 3 equal). Only 26 distinct composites exist among the 84, and 5 variants score above
  0.70 but they are **2 distinct scores** (3 are `candidate`, 2 `failed`; none was activated).
- **These are in-sample.** Production evolution scores fitness on the full history, and validation then re-scores on
  the same history, so the gain is not out-of-sample evidence. The held-out check (Experiment B) found no reliable
  generalization benefit.

Original diagnostic from ADR 0007 (three GA runs in September 2026, each validated by the full suite):

| Run | Best fitness | Best validated composite | Trades in the best candidate |
|---|---|---|---|
| SPY Contrarian RSI | 5.8557 | 0.4500 | 4 |
| QQQ Strength Filter | 0.7793 | 0.4193 | not recorded |
| BTC Volatility Breakout | 0.9733 | 0.5719 | 15 (best p = 0.071) |

Highest fitness, lowest validated score: the optimizer pushed exit thresholds so that a handful of lucky trades
dominated. The fix (a sample-size-aware fitness term) is proposed but not implemented.

## 6. Multi-agent desk (nine stored analyses)

Produced by: `app/agents`, `app/services/agent_desk.py`; `evidence/agent_analyses.csv`.

| Status | Count |
|---|---|
| Completed | 6 (SPY x5 incl. four backtest cells, NVDA x1) |
| Failed | 1 (an end-to-end test run on an alternative provider that stalled; marked failed) |
| Left "running" by a worker that was shut down | 2 (backtest cells awaiting resume) |

Of the completed analyses, five have been settled against a 5-trading-day horizon, but **four of them are SPY
analyses scored against an SPY benchmark, so their alpha is identically 0 by construction**. The only informative
settled call is NVDA (2026-10-09: Underweight / Sell; stock -6.6%, alpha vs SPY -4.6%): the direction matched,
with n = 1. **No statistical claim about the desk's accuracy is possible from this data.** Each completed run made
13-17 audited model calls.

## 7. Knowledge graph (integration snapshot, not an experiment)

Counts from a rebuild of the in-memory graph for the Meridian tenant: 121 Strategy, 13 Failure, 6 Regime, 557
Performance and 11 ResearchNote nodes (12 after the lineage note was added). The five named research queries returned:
*robust across regimes* 31 rows, *recurring failure modes* 1 row, *hypotheses leading to active strategies* 0 rows
before the lineage note was linked and 1 afterwards. These confirm the projection and query layer work; no study of
whether the graph improves research outcomes was done.

## 8. Regenerating everything

```bash
backend\.venv\Scripts\python.exe scripts\evaluation\export_evidence.py
backend\.venv\Scripts\python.exe scripts\evaluation\exp_regime_gating.py
backend\.venv\Scripts\python.exe scripts\evaluation\exp_evolution_vs_random.py
backend\.venv\Scripts\python.exe scripts\evaluation\ablate_validation_score.py
backend\.venv\Scripts\python.exe scripts\evaluation\summarize_tests.py
```

All read the live database (Postgres must be running with the Meridian tenant seeded and the stored history
present). Outputs overwrite `docs/evaluation/evidence/`.
