# 03 - Experimental protocol and configuration

> Covers checklist item **"Experimental protocol and configuration"**. Everything below is taken from the
> shipped code (file paths given) or from the experiment scripts in `scripts/evaluation/`. Constants were
> read from source, not from memory.

## 1. What is and is not held out

| Question | Answer |
|---|---|
| Is there a single untouched final test set for the platform as a whole? | **No.** Strategies were designed, validated and (for evolved variants) tuned on the same 2016-2026 history. |
| What does the platform's own validation do? | Expanding-window walk-forward folds on that same history (section 4). The rules are fixed during validation, so each test fold measures forward performance of a fixed rule set, but the rule set itself may have been chosen with knowledge of the whole sample. |
| Where is there a genuine chronological holdout? | **Only in Experiments A and B** ([05](05-baselines-and-ablations.md)): first 60% of each symbol's history = train/selection, last 40% = test. For SPY that is train 2016-01-04 to 2022-06-22 (1,629 bars) and test 2022-06-23 to 2026-10-20 (1,086 bars). |
| Are the regime labels point-in-time? | **No** (section 2). This is the most important caveat for any regime-conditioned result. |
| Random seeds | 42 everywhere in the platform (regime models, Monte Carlo, persistence benchmark, SHAP surrogate, population seeding); seeds 1-3 for Experiment B; seed 42 for bootstrap confidence intervals. |

## 2. Regime detection (`app/regime/`)

**Taxonomy** (6 labels): Bull, Bear, High-Volatility, Low-Volatility, Sideways, Crisis.

**Observations** for every detector: `log_return` and `realized_vol_20`, NaN rows dropped, at least
`REGIME_MIN_PERIODS = 60` clean bars required.

| Detector | Library | Configuration | Mapping to labels |
|---|---|---|---|
| HMM | `hmmlearn.GaussianHMM` | 4 states, full covariance, 200 EM iterations, `random_state=42`, on column z-scored observations | Highest-volatility state to High-Volatility, lowest to Low-Volatility, the rest to Bull / Bear / Sideways by mean-return sign relative to `max(1e-4, 0.2 x std(state means))` |
| GMM | `sklearn.GaussianMixture` | 4 components, full covariance, `n_init=3`, `random_state=42`, z-scored | Same state-to-label rule as the HMM |
| PELT | `ruptures.Pelt` | `l2` cost on z-scored volatility, `min_size=10`, penalty `3.0 x ln(n)` | Each segment classified by global volatility percentiles (66th / 33rd) and mean-return sign |
| GARCH | `arch.arch_model` | GARCH(1,1), constant mean, normal errors, on `log_return x 100`; falls back to realized vol if it fails to converge | Conditional volatility at or above its 95th percentile = Crisis, at or above the 60th = High-Volatility, else Low-Volatility |

**Ensemble** (`app/regime/ensemble.py`):

1. *Crisis override*: if GARCH flags Crisis for a bar, the final label is Crisis regardless of the other models.
2. Otherwise a provisional unweighted majority is formed; each model is then weighted by its agreement with
   those provisional labels over the trailing 50 bars ("self-consistency weighting", no ground truth is used);
   the weighted majority wins. Ties break by a fixed priority (Crisis, High-Vol, Bear, Bull, Sideways, Low-Vol).
3. *Confidence* = fraction of the four models whose vote equals the final label (0.25-1.0).

**Look-ahead caveat.** Each detector is fit once on the entire history and then labels every bar (HMM Viterbi
decoding, GMM fit, PELT segmentation, GARCH fit and the percentile thresholds all use the whole sample). The
stored labels are therefore *smoothed, in-sample* labels, not what a live system would have known on each
date. Any backtest that conditions on regimes inherits this. A point-in-time (expanding refit) variant is
listed as a proposed experiment in [05](05-baselines-and-ablations.md).

## 3. Strategies and backtests (`app/strategy/`)

- **Strategy definition**: JSON rule trees (`entry_rules`, `exit_rules`) over the 13 features, with
  comparators `>`, `>=`, `<`, `<=`, `==`, `crosses_above`, `crosses_below`, combined by `AND`/`OR`, plus `risk_constraints`
  (`max_drawdown_pct`, `max_position_size_pct`, `stop_loss_pct`). Rules are validated before a strategy can
  be submitted.
- **Engine**: `vectorbt.Portfolio.from_signals` on daily closes. Long-only (library default), initial cash
  100,000, **fees 0.1% per trade, no separate slippage model**, per-trade stop-loss from `stop_loss_pct`,
  position size = `max_position_size_pct` of equity (15-20% in the seeded strategies). **Entries and exits
  fill at the close of the bar on which the signal is computed** (an optimistic same-bar assumption).
- **Regime attribution**: each trade is assigned the regime at its *entry* timestamp.
- **Metric definitions** (`compute_trade_metrics`, `compute_bar_level_metrics`):

| Metric | Definition |
|---|---|
| Sharpe (per trade) | mean(trade returns) / std(trade returns, ddof=1). **Not annualized**; a different quantity from the annualized daily Sharpe in the experiments. |
| Sortino (per trade) | mean(trade returns) / std(losing trade returns) |
| Max drawdown (trade sequence) | minimum peak-to-trough of cumprod(1 + trade returns) - 1 |
| Win rate | share of trades with return > 0 |
| Profit factor | sum of gains / abs(sum of losses) |
| Calmar | total trade-sequence return / abs(max drawdown) |
| Annualized return / volatility | per-bar portfolio returns, 252 trading days per year |
| Beta | cov(strategy bar returns, benchmark bar returns) / var(benchmark), benchmark = SPY |
| Backtest robustness (display only) | 0.6 x clip(aggregate Sharpe / 2, 0, 1) + 0.4 x share of traded regimes with positive Sharpe |

## 4. Validation (`app/validation/`)

Five methods, each producing a sub-score in [0, 1]; composite = weighted mean.

| Method | Weight | Procedure | Sub-score |
|---|---|---|---|
| Walk-forward | 30% | Expanding windows, 5 folds; fold 0 is the initial block and folds 1-4 are forward test periods (minimum 15 bars); rules are fixed | share of test folds with out-of-sample per-trade Sharpe > 0.5 |
| Regime cross-validation | 30% | Reuses the full-sample regime-partitioned backtest; only Bull, Bear, High-Volatility, Low-Volatility count | (number of those four with a positive Sharpe and at least one trade) / 4 |
| Monte Carlo | 20% | 1,000 bootstrap resamples of trade returns, drawn within each trade's own regime pool, chronology preserved; seed 42 | clip(1 - p95 max drawdown / (2 x tolerance), 0, 1); tolerance = organization drawdown tolerance (default 30%) |
| Persistence | 10% | Per regime (at least 3 trades): Welch t-test of the strategy's trade returns against 500 random-entry trades with the same holding-period distribution, alpha 0.05, seed 42 | clip(1 - min p / (2 alpha), 0, 1) over regimes where the strategy beats random |
| Stress test | 10% | Backtests the known windows 2020-02-15..2020-04-30 and 2022-01-01..2022-10-31 if covered by at least 10 bars; if no window is covered the method is excluded and the other weights renormalized | mean of clip(1 - drawdown / (2 x tolerance), 0, 1) |

Classification: composite < 0.50 = `auto_fail`; 0.50 to 0.70 = `candidate`; above 0.70 = `eligible_active`
(still requires a recorded human approval with a written reason; enforced in `app/strategy/lifecycle.py`).
The 0.70 threshold is a single source of truth (ADR 0008). **The demo seed script lowers the threshold to 0.39
for its own process only** (`DEMO_ACTIVATION_THRESHOLD`) so the demo organization has a populated lifecycle;
the product code and live API enforce 0.70.

Known weakness: the walk-forward test folds are slices of the same sample the strategy was designed on, so the
score is optimistic for any strategy tuned with knowledge of the whole sample (every GA-evolved variant).

## 5. Failure intelligence (`app/failure/`)

- **Triggers**: *drawdown breach* (realized max drawdown beyond the strategy's `max_drawdown_pct`),
  *Sharpe decline* (Sharpe over the most recent 30 bars below 0.5), *regime mismatch* (the last bar's regime is not
  among the regimes in which the strategy had a positive validated Sharpe; not fired for strategies with no
  validated regimes), *manual* (a person flags it with a reason).
  Note that "regime mismatch" is defined by the same regime labels used elsewhere, so it fires structurally
  whenever the current label is outside the validated set; its frequency is not an independent finding.
- **Record**: strategy version, timestamp, regime, trigger, performance metrics, market-context snapshot,
  optional feature attribution, AI explanation, numeric-validation flag. Rows are append-only at the database
  privilege level; only the two explanation columns may be updated afterwards.
- **Feature attribution**: LightGBM regressor (100 trees, depth 3, `min_child_samples=5`, seed 42) fit on the
  strategy's own trades (entry-time features to realized return), then `shap.TreeExplainer`. Requires at least
  10 trades, otherwise `None`. The surrogate is fit and explained on the same trades (no cross-validation), so
  attributions describe the surrogate, not a causal effect.
- **Clustering**: similarity = 0.4 x same regime + 0.3 x same trigger + 0.3 x Jaccard of top-3 attributed
  features; failures at or above 0.6 are linked.
- **AI explanation**: generated by an LLM from the failure record; every number in the text must match the
  record (Safeguard 5). This checks numeric consistency, not causal correctness.

## 6. Evolution (`app/evolution/`)

- **Genes**: every numeric literal in entry/exit rules plus the numeric risk constraints; bounds from the
  indicator (RSI 0-100), the risk key (for example stop-loss 1-50), or +/-50% of the starting value.
- **Algorithm** (DEAP): tournament selection (size 5), uniform crossover (gene swap 0.5, applied with
  probability 0.7), Gaussian mutation (probability 0.3, per-gene 0.2, adaptive sigma starting at 10% of each gene's
  range and halving after 5 non-improving generations), 10% elitism, stop at the generation limit or when the best
  fitness improved 1% or less over 10 generations. Production defaults: population 20, up to 50 generations.
- **Fitness**: `weighted_avg_sharpe + 0.3 x backtest_robustness`, where weighted_avg_sharpe is the
  trade-count-weighted mean of per-regime per-trade Sharpe. **Fitness is evaluated on the full history in
  production (no holdout).**
- **Initial population**: the seed strategy plus Gaussian-perturbed clones (`random.Random(42)`).
- **Selection pressure and the validation gate are different objectives** (ADR 0007).

## 7. Knowledge graph (`app/graph/`)

Seven node labels (Strategy, Regime, Performance, Failure, ResearchNote, Researcher, AgentAnalysis) and nine edge
types (VALID_IN, FAILED_IN, MUTATED_FROM, INSPIRED_BY, ADAPTED_FROM, EVALUATED_BY, CAUSED_BY, AUTHORED_BY,
ANALYZED_IN). Postgres is the source of truth and Research Memory is a derived, idempotent index of it (upserted on
every write, re-derived from Postgres on a schedule). Every record and query is scoped by `organization_id`. It runs
on PostgreSQL alone (ADR 0012; Neo4j retired). No quantitative experiment was run on Research Memory.

## 8. Multi-agent desk (`app/agents/`)

An orchestration layer around an open-source multi-agent trading framework (see references). Twelve stages:
four analysts (market, sentiment, news, fundamentals), bull and bear researchers, research manager, trader, three
risk analysts, portfolio manager; five-level rating. Stellix adds: the current regime, validated strategies and
past failures injected into the prompts, per-analysis checkpoints, audit logging of every model call, numeric
redaction of price levels (Safeguard 1), and settlement of each call against the realized return over
`AGENTS_HOLDING_DAYS = 5` trading days versus a benchmark. Provider and model are configuration (currently
Anthropic Claude Haiku 4.5 for both lanes); a Gemini lane exists in code but is not used (a full Gemini
analysis did not complete in testing).

## 9. Experiments run for this evidence pack

| Experiment | Script | Question | Design |
|---|---|---|---|
| A | `scripts/evaluation/exp_regime_gating.py` | Does regime conditioning help out of sample, and beat random regime choice? | 60/40 chronological split; learn allowed regimes on train; gate entries on test; random-subset and exposure-matched controls; buy-and-hold baselines |
| B | `scripts/evaluation/exp_evolution_vs_random.py` | Does the GA generalize better than random search or the unmodified seed? | 60/40 split; 8 pre-selected strategies x 3 seeds; equal unique-evaluation budgets; run at two budgets (population 16 x 8 generations, and 24 x 15) via `EVAL_POP`, `EVAL_GENS`, `EVAL_TAG` |
| C | `scripts/evaluation/ablate_validation_score.py` | How much does each validation component drive the gate's decisions? | Post-hoc leave-one-component-out recomputation on stored results (not a re-run) |

Results and interpretation: [05-baselines-and-ablations.md](05-baselines-and-ablations.md).

## 10. Environment

Python 3.11.9, Windows 11. Key packages (from `evidence/manifest.json`): hmmlearn 0.3.3, ruptures 1.1.10, arch 7.2.0,
scikit-learn 1.9.1, vectorbt 1.0.0, deap 1.4.4, shap 0.51.0, lightgbm 4.7.0, pandas 2.3.3, numpy 2.4.6, scipy 1.17.1,
SQLAlchemy 2.0.54, FastAPI 0.139.0, langgraph 1.2.12. Git branch `feat/tradingagents-integration`; the working tree
has uncommitted changes (the manifest records the count), so the exact code state is the working tree, not a commit.
