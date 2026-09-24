# ADR 0008: `strategy.robustness_score` has three writers, only one of which is the validated composite

- **Status:** Accepted and implemented (migration `0021_validated_gate_score`)
- **Date:** 2026-09-18
- **Batch:** 26 (audit during the step 2 diagnostic)

## Context

`Strategy.robustness_score` is the number the activation gate reads. As it stood before
this ADR:

```python
# app/strategy/lifecycle.py (before this ADR)
def assert_activatable(strategy, *, has_approval: bool) -> None:
    """candidate -> active guard: BOTH robustness >= 0.70 AND an approve record."""
    if strategy.robustness_score is None or strategy.robustness_score < ROBUSTNESS_THRESHOLD:
        raise ActivationGateNotMet(...)
```

The intent (Batch 4/5) is that this field holds the **5-method validation composite**. An
audit of every write site shows it does not always.

## Every write site

| Site | Value written | Correct? |
|---|---|---|
| `app/services/strategy.py:922` (`run_strategy_validation`) | `report.composite_score` — the real 5-method composite | Yes |
| `app/services/strategy.py:750` (`run_strategy_backtest`) | `result.robustness_score` — a **single backtest**: 60% aggregate Sharpe + 40% regime consistency | **No** |
| `app/services/evolution.py:348` (`_persist_backtest_result`, GA candidate registration) | `result.robustness_score` — the same single-backtest number | **No** |
| `app/services/strategy.py:255` (rule edit → draft) | `None` | Yes (reset) |
| `app/services/strategy.py:584` (transition → draft) | `None` | Yes (reset) |

The gate does not additionally require a `ValidationResult` row to exist, so nothing else
catches the difference.

The two incorrect writers are reachable from the normal product flow. `POST
/strategies/{id}/backtest` needs only an authenticated user — no special permission — and
runs after validation just as happily as before it, overwriting the validated composite
with the single-backtest number.

## Evidence (live dev database, 2026-09-18)

Of 128 strategies carrying a gate score:

- **64** have a gate score that disagrees with their own latest validated composite.
- **10** carry a gate score although they were **never validated at all**.
- **3** would clear the 0.70 gate on a score the 5-method suite never produced. One of
  them, `Frontend Approval Queue Test` (gate 0.77, no validation result), is the single
  `active` strategy in the entire database.

The discovery case: eight GA candidates registered during a step 2 run carried
`robustness_score = 0.8076` from their registration backtest. Run through the real suite,
they scored **0.5796**. Until they were validated, an approver looking at the UI would have
seen a strategy apparently clearing the gate by a wide margin, and approving it would have
activated it — because the gate was reading a number no validation had ever produced.

## Decision

Both parts were implemented together, because either alone leaves a hole.

1. **The fields are separated.** `robustness_score` holds the validated composite and is
   written only by `run_strategy_validation`. The single-backtest number moved to
   `strategies.backtest_robustness` (display only); `run_strategy_backtest` and the GA's
   `_persist_backtest_result` now write there. The gate is structurally unable to read an
   unvalidated number.
2. **The gate requires the evidence.** `validation_results.strategy_version` records the
   version a result validated, and `assert_activatable` now takes `validated_version` and
   refuses activation when it is missing or does not equal the strategy's current version.
   Editing rules therefore invalidates the evidence instead of carrying it forward.

Migration `0021_validated_gate_score` also repaired the existing data: each strategy's
gate score became its latest validated composite (NULL where nothing validated it), the
preserved backtest numbers moved to the new column, and any ACTIVE strategy without a
validation record was demoted to candidate.

## Verification

Re-running the query that found the problem, against the live dev database after the
migration (134 strategies, 118 carrying a gate score):

| Check | Before | After |
|---|---|---|
| Gate score disagrees with the validated composite | 64 | **0** |
| Gate score present but never validated | 10 | **0** |
| Would pass 0.70 without a real composite | 3 | **0** |
| ACTIVE strategies with no validation record | 1 | **0** |

`Frontend Approval Queue Test` was demoted from active to candidate with an audit_log
entry recording the reason; its 0.77 is preserved as `backtest_robustness`. All 118
validation results carry the version they validated.

Tests: `tests/test_activation_gate_evidence.py` (6 cases — never-validated, stale
version, happy path, below threshold, unapproved, and a source-level assertion that
neither backtest writer can reach the gate field). `tests/test_evolution_e2e.py` now
asserts a registered GA candidate has `backtest_robustness` but **no** gate score.
Full suite: 579 passed, 9 skipped, 0 failed.

## Consequences

- The gate now means what its docstring says: nothing reaches `active` without the
  5-method suite having passed the rules being activated.
- No genuine approval in this project ever relied on the gap — every approval path also
  requires a human approver holding `strategy.approve`, and the one affected active
  strategy was test data in `Batch10 Gov Test Org`, not a real research record.
- **The platform now has zero active strategies**, which is the truthful state: none has
  earned activation under the real gate. The best validated composite in the demo
  organization is 0.6736.
- Editing a validated strategy's rules invalidates its evidence, so it must be
  re-validated before it can be activated again. That is intended, and it is a behaviour
  change for anyone who previously edited and re-approved without re-validating.
- A strategy's `backtest_robustness` may look much better than its `robustness_score`.
  That is expected: one backtest is not five validation methods. UI that shows the
  backtest number should not imply it is a gate score.
- Related: [ADR 0007](0007-evolution-fitness-misaligned-with-approval-gate.md), found in
  the same diagnostic.
