"""Ensemble voting tests: crisis override and confidence-score sanity."""

from __future__ import annotations

import pandas as pd
from app.regime.ensemble import ensemble_vote


def test_confidence_is_one_when_all_agree():
    votes = pd.DataFrame(
        {"hmm": ["Bull"], "pelt": ["Bull"], "gmm": ["Bull"], "garch": ["Bull"]}
    )
    final, confidence = ensemble_vote(votes, [False])
    assert final.iloc[0] == "Bull"
    assert confidence.iloc[0] == 1.0


def test_confidence_is_half_at_two_of_four():
    votes = pd.DataFrame(
        {"hmm": ["Bull"], "pelt": ["Bull"], "gmm": ["Bear"], "garch": ["Bear"]}
    )
    final, confidence = ensemble_vote(votes, [False])
    assert confidence.iloc[0] == 0.5
    assert final.iloc[0] in ("Bull", "Bear")


def test_crisis_override_beats_majority():
    # Two models vote Bull, but GARCH flags Crisis → final must be Crisis.
    votes = pd.DataFrame(
        {"hmm": ["Bull"], "pelt": ["Bull"], "gmm": ["Bear"], "garch": ["Crisis"]}
    )
    final, confidence = ensemble_vote(votes, [True])
    assert final.iloc[0] == "Crisis"
    # Only GARCH agrees with the forced Crisis label → confidence 0.25.
    assert confidence.iloc[0] == 0.25


def test_three_of_four_agreement_confidence():
    votes = pd.DataFrame(
        {"hmm": ["Bear"], "pelt": ["Bear"], "gmm": ["Bear"], "garch": ["High-Volatility"]}
    )
    final, confidence = ensemble_vote(votes, [False])
    assert final.iloc[0] == "Bear"
    assert confidence.iloc[0] == 0.75
