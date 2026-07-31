"""SHAP attribution tests: real surrogate ranks the true driver; min-trade guard."""

from __future__ import annotations

import numpy as np
import pandas as pd
from app.failure.shap_attribution import compute_feature_attribution
from app.features.engineering import FEATURE_COLUMNS


def _feature_df(n=80, seed=1):
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2022-01-01", periods=n, freq="D", tz="UTC")
    return pd.DataFrame({c: rng.normal(size=n) for c in FEATURE_COLUMNS}, index=idx)


def test_shap_returns_top5_and_ranks_the_true_driver():
    df = _feature_df(80)
    rng = np.random.default_rng(2)
    positions = rng.integers(0, 80, size=30)
    # Trade return is driven almost entirely by rsi_14 at entry.
    returns = df["rsi_14"].to_numpy()[positions] * 1.0 + rng.normal(0, 0.001, 30)
    trades = pd.DataFrame(
        {"entry_pos": positions, "return": returns, "regime": ["Bull"] * 30, "holding_bars": [5] * 30}
    )
    attribution = compute_feature_attribution(trades, df, top_k=5)

    assert attribution is not None and len(attribution) == 5
    for a in attribution:
        assert set(a.keys()) == {"feature_name", "shap_value", "direction"}
        assert a["feature_name"] in FEATURE_COLUMNS
        assert a["direction"] in ("positive", "negative")
    # The genuine driver ranks first (real SHAP, not feature_importances_ guesswork).
    assert attribution[0]["feature_name"] == "rsi_14"


def test_shap_returns_none_below_min_trades():
    df = _feature_df(30)
    trades = pd.DataFrame(
        {"entry_pos": list(range(5)), "return": [0.01] * 5, "regime": ["Bull"] * 5, "holding_bars": [5] * 5}
    )
    assert compute_feature_attribution(trades, df) is None
