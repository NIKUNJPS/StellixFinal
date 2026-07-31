"""Real-data smoke: the ensemble should flag Crisis/High-Volatility during the 2020
COVID crash on the S&P 500. This is a judgment-call test — the output is printed for
eyeballing, with a soft assertion that the crash window is not labeled calm.

Opt-in: RUN_INTEGRATION=1 (network).
"""

from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

pytestmark = pytest.mark.integration


def test_covid_crash_flags_crisis_or_high_vol():
    from app.features.engineering import compute_features
    from app.providers import get_provider
    from app.regime.engine import detect_regimes
    from app.services.ingestion import validate_and_clean

    raw = get_provider("yfinance").fetch_ohlcv("^GSPC", date(2019, 6, 1), date(2020, 6, 1), "1d")
    clean, _warnings = validate_and_clean(raw, "1d")
    feats = compute_features(clean).rename(columns={"realized_vol_20": "realized_vol"})
    df = feats[["log_return", "realized_vol"]]

    result = detect_regimes(df)
    labels = result.frame["regime_label"]

    lo = pd.Timestamp("2020-02-15", tz="UTC")
    hi = pd.Timestamp("2020-04-30", tz="UTC")
    covid = labels[(labels.index >= lo) & (labels.index <= hi)]

    print("\n--- ^GSPC regime labels ---")
    print("overall:", labels.value_counts().to_dict())
    print("COVID window (2020-02-15 .. 2020-04-30):", covid.value_counts().to_dict())

    assert not covid.empty, "no data in the COVID window"
    assert covid.isin(["Crisis", "High-Volatility"]).any(), (
        "expected Crisis/High-Volatility during the COVID crash, got "
        f"{covid.value_counts().to_dict()}"
    )
