"""Data-quality validation tests: malformed OHLC, duplicates, NaN, gaps."""

from __future__ import annotations

from datetime import UTC, datetime

import numpy as np
import pandas as pd
from app.services.ingestion import validate_and_clean


def _ts(day: int) -> pd.Timestamp:
    return pd.Timestamp(datetime(2024, 1, day, tzinfo=UTC))


def _build_dirty_frame() -> pd.DataFrame:
    rows = [
        # timestamp, open, high, low, close, volume
        (_ts(1), 10, 11, 9, 10.0, 100),     # valid
        (_ts(1), 10, 11, 9, 10.5, 100),     # DUPLICATE timestamp (keep latest)
        (_ts(2), 10, 12, 9, 11.0, 100),     # valid
        (_ts(3), 10, 8, 12, 10.0, 100),     # MALFORMED: high < low
        (_ts(4), -5, 11, 9, 10.0, 100),     # NEGATIVE price
        (_ts(5), 11, 13, 10, np.nan, 100),  # NaN close
        (_ts(25), 11, 13, 10, 12.0, 100),   # valid but big GAP from _ts(2)
    ]
    return pd.DataFrame(rows, columns=["timestamp", "open", "high", "low", "close", "volume"])


def test_validation_rejects_and_warns():
    clean, warnings = validate_and_clean(_build_dirty_frame(), "1d")
    types = {w["type"] for w in warnings}

    # Malformed, negative, and NaN rows are gone; duplicate deduped to latest.
    assert len(clean) == 3
    assert {"nan_rows_dropped", "duplicate_timestamps", "ohlc_sanity_violation", "timestamp_gaps"} <= types

    # Every surviving row is OHLC-sane and positive.
    assert (clean["high"] >= clean["low"]).all()
    assert (clean[["open", "high", "low", "close"]] > 0).all().all()

    # Duplicate kept the LATEST value.
    first = clean[clean["timestamp"] == _ts(1)]
    assert float(first["close"].iloc[0]) == 10.5


def test_ohlc_violation_count_is_reported():
    clean, warnings = validate_and_clean(_build_dirty_frame(), "1d")
    sanity = next(w for w in warnings if w["type"] == "ohlc_sanity_violation")
    assert sanity["count"] == 2  # the high<low row and the negative-price row
