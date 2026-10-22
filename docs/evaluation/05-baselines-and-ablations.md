# 05 - Baselines, comparisons and ablations

> Covers checklist items **"Baseline and comparison results"** and **"Component / ablation results"**.
> Only comparisons that were actually run are reported as results. Anything not run is in section 6 and
> is labelled **proposed, not run**. Raw per-strategy rows: `evidence/exp_regime_gating.csv`,
> `evidence/exp_evolution_vs_random.csv`, `evidence/ablation_score_components.csv`; summaries:
> `evidence/*_summary.json`. Methods are in [03-experimental-protocol.md](03-experimental-protocol.md) section 9.

**Statistical conventions.** Differences are paired across strategies. "95% CI" is a bootstrap percentile
interval (10,000 resamples, seed 42). p-values are two-sided Wilcoxon signed-rank tests on non-tied pairs. With
32 and 8 strategies, many of them sharing signals, these are descriptive. They are not independent-sample
significance claims, and no multiple-comparison correction was applied.

---

## 1. Experiment A - does regime conditioning help out of sample?

**Hypothesis under test** (the platform's first pillar): knowing which regimes a strategy works in improves it.

**Design.** 32 unique human-authored strategies (duplicates removed; GA variants excluded) on SPY, QQQ, GLD and
BTC-USD. Chronological 60/40 split per symbol. On the train slice, the platform's own regime-partitioned backtest
gives each strategy's "allowed regimes" (at least 3 trades and positive per-trade Sharpe). On the test slice each
strategy is run (a) ungated, (b) gated to the allowed regimes (entry signals masked, exits and stops unchanged),
(c) gated to every other regime subset of the same size (random control, at most 30), (d) buy-and-hold.
Test windows: SPY from 2022-06-23 (1,086 bars), QQQ and GLD from 2023-09-05 (785 bars), BTC-USD from 2023-09-06
(1,140 bars). For 5 of the 32 strategies no regime qualified, so the gated version stays in cash.

### Results

| Comparison (test period) | n | Mean difference | 95% CI | better / worse / tied | p |
|---|---|---|---|---|---|
| Gated minus ungated, **total return** (all 32) | 32 | **-1.05 pp** | -1.92 to -0.28 pp | 9 / 13 / 10 | 0.039 |
| Same, only strategies where the gate was active | 27 | -0.83 pp | -1.64 to -0.10 pp | 9 / 10 / 8 | 0.13 |
| Gated minus ungated, **max drawdown** (less negative = better), all | 32 | **+0.67 pp** | +0.34 to +1.06 pp | 17 / 1 / 14 | 1.5e-5 |
| Same, gate active only | 27 | +0.56 pp | +0.27 to +0.90 pp | 14 / 1 / 12 | 1.2e-4 |
| Gated minus ungated, **annualized daily Sharpe**, all | 32 | -0.05 | -0.18 to +0.08 | 13 / 9 / 10 | 0.57 |

**Informed versus random regime choice** (is the learned set better than a random set of the same size?)

| Control | n strategies | Mean percentile of the informed result among random subsets | Share above the median | p (vs 50%) |
|---|---|---|---|---|
| All random subsets of the same size | 27 | **71.8%** | 77.8% | 0.0005 |
| Exposure-matched (random subsets covering a similar share of test bars, within 10 points) | 16 | **72.9%** | 87.5% | 0.003 |

**Versus buy-and-hold** (same test windows; buy-and-hold price return was +103% SPY, +90% QQQ, +111% GLD,
+218% BTC-USD):

| Comparison | n | Mean difference | 95% CI | better / worse | p |
|---|---|---|---|---|---|
| Ungated strategy minus 100%-invested buy-and-hold, total return | 32 | -109 pp | -124 to -98 pp | 0 / 32 | 8e-7 |
| Ungated strategy minus **position-size-matched** buy-and-hold (that fraction of the buy-and-hold return) | 32 | **-13.9 pp** | -16.3 to -12.0 pp | 0 / 32 | 8e-7 |
| Gated strategy minus position-size-matched buy-and-hold | 32 | -15.0 pp | -17.4 to -12.9 pp | 0 / 32 | 8e-7 |
| Ungated strategy minus buy-and-hold, annualized daily Sharpe | 32 | -0.50 | -0.64 to -0.37 | 3 / 29 | 1.4e-6 |

### Interpretation

1. **Regime gating did not raise returns or Sharpe out of sample.** It lowered mean total return by about one
   percentage point and left the Sharpe ratio unchanged (CI spans zero).
2. **It reduced drawdown** in 17 of 32 strategies (worse in 1). This is partly mechanical: gating removes
   trades, so the strategy is in the market less and both return and drawdown shrink.
3. **The learned regime set beat random regime sets** (about the 72nd percentile on average), including against
   an exposure-matched control. This is the strongest evidence in the pack that regime labels carry some information
   about where a strategy's edge lies. Caveat: the labels are full-history fits, so test-period labels are smoothed
   (protocol section 2); a point-in-time labeling could weaken or remove this effect. It remains untested.
4. **None of the 32 strategies beat buy-and-hold in this window**, even after matching position size (all 32
   worse), and 29 of 32 had a lower Sharpe. The test windows were strong uptrends. These are long-only,
   15-20%-sized, stop-loss-protected rule sets, so the result mostly says that low-exposure rule sets lag a
   rising market. It is not evidence that they would lag in a falling one, and it was not tested there. It does
   mean the platform has **no measured out-of-sample return advantage over passive holding** in this data.

---

## 2. Experiment B - does evolution generalize? GA versus random search versus the untouched seed

**Design.** 8 strategies chosen by a rule fixed beforehand (the first two alphabetically per symbol with at least
15 train trades: SPY Breakout Hold, SPY Contrarian RSI, QQQ Bollinger Breakout, QQQ Breakout Hold, GLD Bollinger
Breakout, Gold Momentum Overlay v2, BTC Momentum, BTC Volatility Breakout). For each, 3 seeds. The platform's
own GA and a random-search baseline given **the same number of unique train-slice evaluations** each return their
best individual by train fitness; only that individual is scored on the held-out 40%. The unmodified seed strategy is
the third arm. The experiment was run at two search budgets:

| Budget | GA settings | Unique train evaluations per arm (mean, range) |
|---|---|---|
| Small | population 16, 8 generations | 41 (30-60) |
| Larger | population 24, 15 generations | 70 (50-113) |

(The nominal population x generations overstates the work: identical gene vectors, such as elites and unchanged
offspring, are cached, and random search receives exactly the number of unique evaluations the GA used.)

### Results (means over 8 strategies x 3 seeds)

| Arm | Budget | Train fitness | **Test fitness** | Train total return | Test total return | Test trades |
|---|---|---|---|---|---|---|
| Seed, unchanged | - | 0.754 | 0.051 | 27.2% | 8.8% | 19.4 |
| Genetic algorithm | small | 1.563 | 0.150 | 22.9% | 7.6% | 17.0 |
| Random search | small | 1.507 | 0.061 | 36.8% | 18.2% | 16.3 |
| Genetic algorithm | larger | **5.950** | 0.183 | 33.0% | 9.0% | 17.0 |
| Random search | larger | 2.017 | 0.064 | 109.8% | 30.1% | 15.3 |

Paired comparisons across the 8 strategies (seed-averaged; 95% bootstrap CI; Wilcoxon p):

| Comparison | Budget | Mean difference | 95% CI | better / worse | p |
|---|---|---|---|---|---|
| **Train** fitness, GA minus seed | small / larger | +0.81 / +5.20 | +0.05 to +2.23 / +0.05 to +15.4 | 6 / 0 (both) | 0.031 / 0.031 |
| **Train** fitness, GA minus random search | small / larger | +0.056 / +3.93 | +0.012 to +0.116 / +0.006 to +11.8 | 6 / 0 (both) | 0.031 / 0.031 |
| **Test** fitness, GA minus seed | small / larger | +0.099 / +0.133 | -0.009 to +0.233 / -0.007 to +0.318 | 6 / 1 (both) | 0.16 / 0.16 |
| **Test** fitness, GA minus random search | small / larger | +0.089 / +0.119 | -0.022 to +0.205 / -0.025 to +0.386 | 5 / 2 ; 4 / 3 | 0.47 / 0.94 |
| Test total return, GA minus seed | small / larger | -1.2 pp / +0.2 pp | -4.0 to +1.8 / -2.4 to +3.4 pp | 4 / 4 ; 3 / 5 | 0.64 / 0.95 |
| Test total return, GA minus random search (**confounded**, see below) | small / larger | -10.6 pp / -21.1 pp | -19.4 to -2.9 / -35.1 to -8.8 pp | 1 / 7 ; 0 / 8 | 0.039 / 0.008 |

Mean train-minus-test fitness gap: seed 0.70; GA 1.41 (small) and **5.77 (larger)**; random search 1.45 and 1.95.

### Interpretation

1. **The GA is a better in-sample optimizer** (6 of 8 strategies better than both the seed and random search, 0 worse, at
   both budgets), and with more budget it reaches far higher in-sample fitness (5.95).
2. **That advantage does not carry over.** With the larger budget the GA's mean fitness falls from 5.95 on train to
   0.18 on test; **the train/test gap grows with search effort (1.41 to 5.77)**, the signature of overfitting
   through a gameable objective (ADR 0007).
3. **Out-of-sample fitness gain over the unmodified seed is small and not statistically distinguishable from zero**
   (+0.10 to +0.13; CI includes 0; 6 better, 1 worse). The GA is also **not distinguishable from equal-budget random
   search** on test fitness (+0.09 to +0.12; p 0.47 and 0.94). Test return of the GA equals the seed's.
4. **Do not read the return rows as "random search is better".** The gene set includes `max_position_size_pct` with
   bounds 1-100% of equity (the seeds use 15-20%). Random search often draws a large position size, which scales
   return and risk together; fitness (a per-trade Sharpe) is invariant to position size, return is not. The
   -10.6 pp and -21.1 pp figures therefore mostly reflect position sizing, not signal quality. Test fitness is the
   fair comparison.
5. This agrees with ADR 0007 and with the classic result that genetic search for technical trading rules does not
   reliably beat buy-and-hold after costs (Allen and Karjalainen, 1999). **The evidence does not support the claim
   that the evolution engine produces strategies that generalize better than the originals.**
6. Production caveat: production evolution scores fitness on the *full* history, so the improvements in the lineage
   table in [04-results.md](04-results.md) section 5 are in-sample, like the "train" columns here.

Limits: 8 strategies, 3 seeds, one split, and modest budgets (70 unique evaluations at most on average). A
significance-aware fitness (ADR 0007, options 1-3) or a position-size-fixed gene set might change the picture; both
are untested (section 6).

---

## 3. Ablation C - how much does each validation component drive the gate? (post-hoc recomputation)

This is **not a re-run**: for each of the five components the stored sub-scores are re-combined without it
(remaining weights renormalized with the platform's own `compute_composite`), and the classification is recomputed.
It measures influence on decisions, not correctness.

| Component dropped | Classification changes, 36 base strategies | Spearman rank correlation with full composite (36) | Eligible-active count, all 120 validated (full = 6) |
|---|---|---|---|
| Walk-forward (30%) | 10 | 0.64 | 14 |
| Regime cross-validation (30%) | 3 | 0.74 | 15 |
| Monte Carlo (20%) | 4 | 0.93 | 27 |
| Persistence (10%) | 6 | 0.98 | 27 |
| Stress test (10%) | 4 | 0.99 | 6 |

Reading it: **walk-forward and regime cross-validation, the two 30% components, move the rankings most**. The
persistence and Monte Carlo components are the most *restrictive*: dropping either takes the eligible set from 6 to 27.
Persistence is zero for 85% of base strategies with fewer than 30 trades and for 92% with 30 or more, so it
is a near-binary filter that few strategies pass at any trade count. This supports the platform's statement that
"most strategies fail validation", but it is also a sign the persistence test may be too strict for strategies
that trade rarely; it was not calibrated against a known-edge positive control, which is a gap (section 6).

## 4. Baseline D - naive ranking by backtest Sharpe versus the validation composite

A workflow without regime-aware validation would rank strategies by their aggregate backtest Sharpe. On the
33 base strategies with a defined Sharpe, that ranking correlates only weakly with the validation composite
(Spearman 0.35, p = 0.048). Of the 10 highest-Sharpe strategies, **5 are classified `auto_fail`** and only 1 is
`eligible_active`. So validation changes which strategies get promoted, which is what it is designed to do. It does
not by itself show that the strategies it promotes are better on new data; Experiment A and the buy-and-hold
comparison above are the only held-out evidence.

## 5. Baseline E - buy-and-hold

Reported inside Experiment A (position-size-matched and fully invested). Summary: no strategy beat it on return,
29 of 32 had lower Sharpe, over test windows of +90% to +218% buy-and-hold price return. Prices are unadjusted
(no dividends) on both sides.

## 6. Proposed experiments - not run

| # | Experiment | Why it matters | Status |
|---|---|---|---|
| P1 | **Failure-memory ablation for the multi-agent desk**: same tickers and dates with and without injected regime and failure context; compare settled alpha | The third pillar ("compounding memory") has **no measured effect** yet; 9 desk analyses exist and only one has a non-trivial settled outcome | Not run (needs many LLM calls and weeks of settlement) |
| P2 | **Point-in-time regime labels**: refit the ensemble on an expanding window and rerun Experiment A | Removes the main look-ahead caveat | Not run |
| P3 | Significance-aware GA fitness (ADR 0007, options 1-3), and/or removing position size and stop-loss from the gene set, then Experiment B again at a larger budget | Tests whether the fix closes the train/test gap and removes the position-size confound | Not run |
| P4 | Positive-control calibration of the validation suite on synthetic data with a known edge | Shows whether persistence is too strict | Not run |
| P5 | Deflated Sharpe ratio / probability of backtest overfitting over the whole strategy population | Corrects for the many strategies tried (121) | Not run |
| P6 | Transaction-cost and slippage sensitivity (fees 0.1% only today) | Edge sizes here are small | Not run |
| P7 | Other market windows including a sustained bear market, other instruments, and adjusted prices | Test windows were strong uptrends | Not run |
| P8 | Knowledge-graph utility: does retrieval of past lineage change researcher decisions? | The graph has structural tests but no outcome study | Not run |
