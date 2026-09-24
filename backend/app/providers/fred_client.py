"""FRED (Federal Reserve Economic Data) client — Batch 28 macro dashboard.

A real, official, documented API from the Federal Reserve Bank of St. Louis
(https://fred.stlouisfed.org/docs/api/fred/series_observations.html), requiring a
free, self-service API key (FRED_API_KEY — deferred-credential pattern, same as
ALPHA_VANTAGE_API_KEY: unset means the macro dashboard reports "not configured",
never fabricated data).

Deliberately NOT ``app.providers.base.MarketDataProvider``: FRED serves labeled
economic time series (one value per date, no OHLCV), a structurally different shape
than a tradable symbol's bars — forcing it into the OHLCV contract would misrepresent
what the data is.

Response quirk (FRED's own documented behavior): every ``value`` is a STRING, and a
missing observation is represented as a non-numeric placeholder (historically ``"."``).
This client treats ANY value that fails float parsing as missing — defensive against
the exact placeholder rather than assuming only ``"."`` occurs.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import requests

BASE_URL = "https://api.stlouisfed.org/fred/series/observations"


class FredError(Exception):
    """Raised when FRED cannot return usable data (no key, network, bad series id)."""


@dataclass(frozen=True)
class FredPoint:
    obs_date: date
    value: float | None  # None = FRED reported this observation as missing


def fetch_series(api_key: str | None, series_id: str, *, limit: int = 260) -> list[FredPoint]:
    """The most recent ``limit`` observations for ``series_id``, oldest first.

    Raises ``FredError`` (never returns fabricated data) when no key is configured,
    the request fails, or FRED reports an error for this series id.
    """
    if not api_key:
        raise FredError("FRED_API_KEY is not set; the macro dashboard is not configured")

    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "sort_order": "desc",
        "limit": limit,
    }
    try:
        resp = requests.get(BASE_URL, params=params, timeout=15)
    except Exception as exc:  # noqa: BLE001 — normalize any client error
        raise FredError(f"FRED request failed for {series_id!r}: {exc}") from exc

    if resp.status_code != 200:
        try:
            detail = resp.json().get("error_message", resp.text)
        except Exception:  # noqa: BLE001
            detail = resp.text
        raise FredError(f"FRED error for {series_id!r} ({resp.status_code}): {detail}")

    try:
        payload = resp.json()
        raw_observations = payload["observations"]
    except (ValueError, KeyError) as exc:
        raise FredError(f"FRED returned an unexpected response shape for {series_id!r}") from exc

    points: list[FredPoint] = []
    for obs in raw_observations:
        try:
            obs_date = date.fromisoformat(obs["date"])
        except (KeyError, ValueError):
            continue  # skip a malformed row rather than fail the whole series
        raw_value = obs.get("value")
        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            value = None  # FRED's missing-observation marker (e.g. ".")
        points.append(FredPoint(obs_date=obs_date, value=value))

    # FRED returned newest-first (sort_order=desc, for a bounded `limit` on long
    # series); present chronologically, oldest first, for charting.
    points.sort(key=lambda p: p.obs_date)
    return points


def fetch_latest(api_key: str | None, series_id: str) -> FredPoint | None:
    """The single most recent REAL (non-missing) observation for ``series_id``, or
    None if every recent observation is missing."""
    points = fetch_series(api_key, series_id, limit=10)
    for point in reversed(points):
        if point.value is not None:
            return point
    return None
