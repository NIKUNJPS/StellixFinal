# ADR 0005: Safeguard 5 ground truth covers every source the model was shown

- **Status:** Accepted
- **Date:** 2026-07-17
- **Batch:** 18 (follow-up)

## Context

Safeguard 5 (numeric cross-validation) is the hallucination control on the LLM
research assistant. `explain_failure` and `critique_strategy` ask the model to restate
every number it mentions in a `numeric_claims` list; `validate_numeric_claims`
(`app/llm/validation.py`) then checks each claim against real stored data. A claim that
contradicts a real value, or that references a metric with no known real value, fails
validation for the whole response. The result is persisted to `llm_audit_log` and drives
a warning badge on the Failure Intelligence page.

The control asserted more than it could deliver. `_extract_numeric_ground_truth`
(`app/llm/service.py`) built ground truth from only the record's top-level metric keys
plus `performance_metrics_at_failure` (or `regime_compatibility`). But
`_failure_record_dict` (`app/services/llm_explain.py`) serializes considerably more into
the prompt — including `market_context_snapshot` and `feature_attribution` — and the
system prompt instructs: *"For every specific number you mention ... also list it in
numeric_claims."*

So the model was shown numbers it had no way to cite safely. It complied with the
instruction, truthfully restated values like `close`, `sma_50`, `rsi_14`, `atr_14`, and
the SHAP magnitudes, and the guard — unable to find those in ground truth — failed the
entire response.

This was latent until Batch 18. With `ANTHROPIC_API_KEY` unset, `explain_failure` never
ran. Once a key was configured and the demo seed was backfilled, the bug appeared at
full scale, confirmed live on 2026-07-17:

- All 6 seeded demo failures: `llm_numeric_validation_passed = False`.
- All 6 corresponding `llm_audit_log` rows: `numeric_validation_passed = False`.
- In every case the model's numbers were **correct**. One flagged response claimed
  `sharpe_ratio = 0.13738311440223688` against a real `sharpe` of
  `0.13738311440223688` — an exact match — and was failed because it *also* cited
  `close`, `sma_50`, and `rsi_14`, which ground truth did not know about.

A guard that flags every response, including correct ones, is worse than no guard: it
trains researchers to ignore the badge, so a real hallucination reaches them wearing the
same warning everyone has learned to dismiss.

## Decision

**Ground truth is built from every source serialized into the prompt, not a subset.**
The invariant is: *the guard checks every number the model was shown.*

Concretely, `_extract_numeric_ground_truth` now registers numeric leaves from:

| Source | Registered as | Note |
| --- | --- | --- |
| Top-level metric keys | bare name | unchanged |
| `performance_metrics_at_failure` | bare name | unchanged |
| `regime_compatibility` | bare name | unchanged |
| `risk_constraints` | bare name | **new** — shown to `critique_strategy` |
| `market_context_snapshot` | bare name **and** `context_<key>` | **new** |
| `feature_attribution` | `shap_<feature>`, `shap_value_<feature>`, `<feature>_shap` | **new** |

Three properties of the fix are load-bearing, and each is driven by a real-data
observation rather than a guess:

1. **SHAP values are prefixed, never bare.** A feature name can collide with a
   market-context key: in real seeded records `atr_14` is both a context value (≈6.83)
   and a SHAP magnitude (≈0.016). Registering SHAP under the bare feature name would
   make one of those two true claims unverifiable — trading one false positive for
   another.

2. **Multiple aliases per SHAP value.** The model genuinely alternates naming across
   runs; live output used `shap_atr_14` in one call and `shap_value_macd` in another for
   the same kind of quantity. All three observed forms are accepted.

3. **Nulls are not registered.** `performance_metrics_at_failure.recent_sharpe` is
   routinely `null`. The model was shown `null`, so any number it claims for that field
   is unverifiable and must keep failing.

**What did NOT change:**

- **Tolerance is untouched** (`app/llm/validation.py`: 5% relative or 0.02 absolute).
  This ADR widens *what the guard can see*, never *how closely a seen number must match*.
- **No skip-unknown-keys escape hatch.** A claim whose metric exists in no source the
  model was shown is still a hallucination and still fails the response. Ignoring unknown
  keys would have been the easy fix and would have gutted the control — it is exactly the
  behaviour that makes a guard decorative.

Also removed: a dead `elif key == "sharpe"` branch in the same function. It was
unreachable — the preceding `isinstance(value, (int, float))` check caught every numeric
value first — and was only ever harmless because `validation._ALIASES` already maps
`sharpe` → `sharpe_ratio` on both sides of the comparison.

## Consequences

**The control now means what it says.** `numeric_validation_passed = False` indicates
the model stated a number that contradicts, or cannot be found in, the data it was
given. That is actionable. Previously it meant "the model mentioned a market-context
number", which is not.

**Ground truth is much larger** — roughly 3 keys to 32 on a real seeded record. This is
the intended consequence, not a side effect: those numbers were always in the prompt;
only the guard was blind to them. It does mean more surface where a *wrong* value can be
matched against a *right* one under an ambiguous name. The prefixing rule (1) is what
keeps that in check, and a regression test pins it: claiming the context value of
`atr_14` under the SHAP alias `shap_atr_14` must still fail.

**Verification.** Six regression tests in `tests/test_llm_numeric_validation.py`, built
on a record mirroring a real seeded row (including both traps — the `atr_14` collision
and the null `recent_sharpe`):

- correct claims drawn from all sources, in both SHAP naming forms → passes
- an invented key (`sharpe_ratio_v2`) alongside correct claims → still fails
- a wrong value (`sharpe_ratio = 99.9` vs real `0.137`) → still fails
- the context value claimed under a SHAP alias → still fails
- a number claimed for a null field → still fails

After the fix, the 6 seeded demo failures were regenerated through the real pipeline and
all 6 validate cleanly.

**Known limitation, deliberately out of scope.** `entry_rules` / `exit_rules` numbers
(e.g. an RSI threshold of 30) are shown to `critique_strategy` but are not registered,
because they carry no stable metric name the model would cite — a blind walk would
register them under meaningless keys like `value`. If a future critique prompt starts
drawing numeric claims from rule literals, this same class of false positive will return;
the invariant above is the thing to re-apply.

## Alternatives considered

- **(b) Narrow the prompt** so the model only lists `performance_metrics_at_failure`
  numbers in `numeric_claims`. Rejected: it shrinks what the guard covers. The market
  context and SHAP numbers are precisely the ones a failure explanation leans on, so
  they are the ones most worth verifying.
- **(c) Distinguish "contradicts a known value" from "unverifiable"** and only fail the
  former. Rejected for now: it weakens the control (an invented metric name is a
  classic hallucination shape), and once ground truth is complete, "unverifiable" is
  rare and genuinely suspicious. Worth revisiting only if a legitimate source of numbers
  cannot be registered.
