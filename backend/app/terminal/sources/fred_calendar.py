"""Economic calendar from FRED's official release-dates API (Batch 31, ADR 0010).

Schedule: ``fred/release/dates`` for a curated set of market-moving US releases.
Actuals: the latest two observations of each release's headline series, so the widget
shows the latest actual and the prior reading. Release names come from FRED itself
(``fred/release``), so a wrong ID shows up as the wrong name instead of hiding.

Consensus forecasts have no official free source and are never shown or estimated.
Needs ``FRED_API_KEY`` (same deferred credential as the macro dashboard).
"""

from __future__ import annotations

from datetime import date, timedelta

import requests

from app.core.config import settings
from app.providers.fred_client import FredError, fetch_series
from app.terminal.cache import SourceNotConfigured

_BASE = "https://api.stlouisfed.org/fred"

# FRED release id -> (headline series, how to express its change)
RELEASES: dict[int, tuple[str, str]] = {
    10: ("CPIAUCSL", "pct_change"),      # Consumer Price Index
    50: ("PAYEMS", "diff"),              # Employment Situation (nonfarm payrolls, thousands)
    53: ("A191RL1Q225SBEA", "level"),    # Gross Domestic Product (real, q/q annualised %)
    46: ("PPIACO", "pct_change"),        # Producer Price Index
    9: ("RSAFS", "pct_change"),          # Advance retail sales
    180: ("ICSA", "level"),              # Unemployment insurance weekly claims
    54: ("PCEPI", "pct_change"),         # Personal income and outlays (PCE price index)
    101: ("DFEDTARU", "level"),          # FOMC press release (target range, upper bound)
}


def _key() -> str:
    if not settings.FRED_API_KEY:
        raise SourceNotConfigured("FRED_API_KEY is not set, so the economic calendar is not configured.")
    return settings.FRED_API_KEY


def _get(path: str, **params) -> dict:
    r = requests.get(f"{_BASE}/{path}", params={"api_key": _key(), "file_type": "json", **params}, timeout=15)
    r.raise_for_status()
    return r.json()


def economic_calendar(days_ahead: int = 30) -> list[dict]:
    key = _key()
    today = date.today()
    horizon = today + timedelta(days=days_ahead)
    events = []
    for release_id, (series_id, mode) in RELEASES.items():
        info = _get("release", release_id=release_id).get("releases", [{}])[0]
        dates = _get(
            "release/dates",
            release_id=release_id,
            realtime_start=(today - timedelta(days=45)).isoformat(),
            realtime_end=horizon.isoformat(),
            include_release_dates_with_no_data="true",
            sort_order="asc",
            limit=100,
        ).get("release_dates", [])
        try:
            points = [p for p in fetch_series(key, series_id, limit=3) if p.value is not None]
        except FredError:
            points = []
        latest = points[-1] if points else None
        prior = points[-2] if len(points) >= 2 else None
        change = None
        if latest and prior and prior.value:
            change = (latest.value - prior.value) / prior.value * 100 if mode == "pct_change" else (
                latest.value - prior.value if mode == "diff" else None)
        for d in dates:
            when = date.fromisoformat(d["date"])
            events.append(
                {
                    "date": when.isoformat(),
                    "release_id": release_id,
                    "name": info.get("name") or f"FRED release {release_id}",
                    "link": info.get("link"),
                    "upcoming": when >= today,
                    "series_id": series_id,
                    "latest_value": latest.value if latest else None,
                    "latest_period": latest.obs_date.isoformat() if latest else None,
                    "prior_value": prior.value if prior else None,
                    "change": round(change, 3) if change is not None else None,
                    "change_kind": mode,
                }
            )
    events.sort(key=lambda e: e["date"])
    return events
