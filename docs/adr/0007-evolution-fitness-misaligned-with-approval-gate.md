# ADR 0007: The evolution fitness function is misaligned with the approval gate

- **Status:** Accepted (finding recorded; fix deferred to a future batch)
- **Date:** 2026-09-18
- **Batch:** 26 (step 2 diagnostic, ahead of Part B)

## Context

The genetic optimizer scores an individual with `app/evolution/fitness.py`:

```
fitness = trade-count-weighted average Sharpe + 0.3 * single-backtest robustness
```

The activation gate (`app/strategy/lifecycle.py`) asks for something else entirely:

```
candidate -> active requires robustness_score >= 0.70 AND an approve record
```

where the 0.70 is meant to be the **5-method validation composite**
(`app/validation/composite.py`): walk-forward 30%, regime CV 30%, Monte Carlo 20%,
persistence 10%, stress 10%.

The two disagree in one specific way. Sharpe is a ratio; it says nothing about how much
evidence stands behind it. Persistence is a significance test; with too few trades it
cannot reject the null hypothesis no matter how good those trades look. So a strategy
that trades very rarely can score superbly on fitness and fail validation outright.

This was not theoretical. Meridian Capital Partners had 0 genuinely active strategies and
a best validated composite of 0.6736. Three GA runs were made in September 2026 with a
population of 24 over up to 40 generations, seeded from the only strategies whose entry
rules carry a tunable literal threshold, then every survivor was scored by the real
validation suite.

## Evidence

The SPY run is the clearest case. It reached **the highest fitness ever recorded in this
project, 5.8557**, and its best candidate validated at **0.4500** — among the lowest.

```
SPY Contrarian RSI (evolved (35.0, 79.13))
  walk_forward 0.25   regime_cv 0.25   monte_carlo 1.00   persistence 0.00   stress 1.00
  trades: Sideways 2, Low-Volatility 2   (4 trades over a decade of SPY data)
```

Monte Carlo and stress are perfect because a strategy that barely trades can barely lose.
Persistence is zero because four trades are indistinguishable from luck. The GA had pushed
the exit threshold to 79 to capture a handful of spectacular trades, exactly as its
fitness function asked.

Every run reproduced the pattern:

| Run | Symbol | Best fitness | Best validated composite | Trades in the best candidate |
|---|---|---|---|---|
| SPY Contrarian RSI | SPY | 5.8557 | 0.4500 | 4 |
| QQQ Strength Filter | QQQ | 0.7793 | 0.4193 | — |
| BTC Volatility Breakout | BTC-USD | 0.9733 | 0.5719 | 15, best p-value 0.071 |
| Earlier SPY run (killed during registration) | SPY | — | 0.5796 | 10, best p-value 0.873 |

None cleared 0.70. The best validated strategy in the organization remained the earlier
0.6736, whose own shortfall is the same one: 25 trades across a decade, a best p-value of
0.084 against an alpha of 0.05, and a persistence sub-score of 0.157.

## Decision

Record the finding; **do not change the fitness function in Batch 26.**

The behaviour is not a bug in the optimizer. The GA is a naive, greedy search and is meant
to be — the validation suite, not the fitness score, is the gatekeeper, and it rejected
every one of these candidates. This is the governance model working: an optimizer allowed
to exploit any gap between what is rewarded and what is required, and a gate that catches
it every time. Changing fitness mid-batch would also invalidate the comparison above,
which is the evidence for the change.

## Recommendation for a future batch

Add a statistical-evidence term to `compute_fitness` so the optimizer aims at what the gate
actually demands. Options, cheapest first:

1. **Trade-count floor.** Scale fitness toward zero below a minimum trade count per regime
   (persistence already refuses to test a regime with fewer than ~3 trades). Simple, and it
   removes the degenerate 4-trade optimum.
2. **Significance term.** Fold the persistence p-value into fitness directly. Costlier —
   persistence runs a permutation test per regime — but it aligns fitness with the gate.
3. **Sample-size-penalised Sharpe.** Use the standard error of the Sharpe estimate
   (approximately `sqrt((1 + Sharpe^2 / 2) / n)`) to shrink the ratio when `n` is small. No
   extra backtesting, and it is the statistically standard correction.

Whichever is chosen, re-run the same three seed groups and compare against the table above:
fitness should stop rising while the validated composite falls.

## Consequences

- Until this is done, GA output should be treated as **candidates for validation, never as
  evidence of quality**. A high fitness number is not a claim about a strategy.
- The evolution UI shows fitness per generation. It should not be read as progress toward
  approval; those are different scales measuring different things.
- Obtaining a genuinely active strategy needs entry rules that trade often enough for the
  statistics to work, which is a research question, not a tuning one. See
  [ADR 0008](0008-robustness-score-single-source-of-truth.md) for a related gate-integrity
  finding made during the same diagnostic.
