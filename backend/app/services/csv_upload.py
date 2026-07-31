"""CSV OHLCV upload: validate-then-confirm (Batch 21).

Institutional clients often hold proprietary OHLCV not on public APIs. This adds a
two-phase upload:

  1. ``build_validation_report`` reads the CSV, auto-detects columns, coerces types,
     and produces a per-row error report WITHOUT touching the DB. It **reuses the
     existing ingestion validators** — the shared OHLC sanity predicate
     (``ohlc_sanity_valid_mask``) drives the per-row error list, and
     ``validate_and_clean`` handles duplicate/gap warnings + dedup for the clean
     path. There is no second, divergent OHLC validator.
  2. If clean, the validated frame is stashed in Redis (10-min TTL) under an
     org-namespaced key. ``confirm_upload`` re-reads it, verifies org ownership, and
     persists via the SAME ``persist_market_data``/``persist_features`` yfinance uses.

Error vs. warning policy for the CSV path: a bar with a NaN/non-numeric OHLC value,
an unparseable timestamp, or an OHLC-sanity violation (e.g. high < low) is an
ERROR — it blocks the whole import (422), because a client uploading proprietary
data wants to know their file is wrong, not have rows silently dropped. Duplicate
timestamps and interval gaps remain WARNINGS (import proceeds; duplicates keep-last),
matching ``validate_and_clean``.
"""

from __future__ import annotations

import io
import json
import uuid

import pandas as pd

from app.clients import redis_client
from app.services.ingestion import (
    _OHLC_SANITY_RULES,
    ALLOWED_INTERVALS,
    validate_and_clean,
)

# 10-minute stash, org-namespaced (Batch 24 isolation rule).
_UPLOAD_TTL_SECONDS = 600
_KEY_PREFIX = "upload:csv:"

_OHLC_FIELDS = ("open", "high", "low", "close", "volume")
_ALL_FIELDS = ("date", *_OHLC_FIELDS)

# Column auto-detection: exact -> case-insensitive -> known variants. "date" is the
# logical timestamp field; the rest map straight to OHLCV.
_COLUMN_VARIANTS: dict[str, list[str]] = {
    "date": ["date", "datetime", "timestamp", "time", "dt", "day"],
    "open": ["open", "o", "open_price", "opening"],
    "high": ["high", "h", "high_price", "max"],
    "low": ["low", "l", "low_price", "min"],
    "close": ["close", "c", "close_price", "closing", "adj close", "adj_close", "adjclose", "last"],
    "volume": ["volume", "vol", "v", "qty", "quantity"],
}


class CsvUploadError(Exception):
    """Raised for unrecoverable CSV problems (unreadable file, no columns matched)."""


# --------------------------------------------------------------------------- #
# Parsing + column detection
# --------------------------------------------------------------------------- #
def read_csv_bytes(content: bytes) -> pd.DataFrame:
    """Parse raw CSV/TSV bytes into a DataFrame, sniffing the delimiter."""
    try:
        # sep=None + python engine sniffs comma vs tab vs semicolon.
        df = pd.read_csv(io.BytesIO(content), sep=None, engine="python")
    except Exception as exc:  # noqa: BLE001
        raise CsvUploadError(f"Could not parse the file as CSV: {exc}") from exc
    if df.empty or len(df.columns) == 0:
        raise CsvUploadError("The uploaded file has no data rows.")
    return df


def detect_columns(
    header: list[str], explicit: dict[str, str | None]
) -> tuple[dict[str, str], list[str]]:
    """Resolve each logical field to a real column. Returns (mapping, missing).

    ``explicit`` may pin any field (keys: date/open/high/low/close/volume) — an
    explicit non-empty value wins. Otherwise: exact match, then case-insensitive,
    then a known-variant match against the header."""
    lower = {c.lower().strip(): c for c in header}
    mapping: dict[str, str] = {}
    missing: list[str] = []
    for field in _ALL_FIELDS:
        pinned = (explicit.get(field) or "").strip()
        if pinned:
            if pinned in header:
                mapping[field] = pinned
            else:
                missing.append(field)
            continue
        found = None
        for candidate in _COLUMN_VARIANTS[field]:
            if candidate in header:  # exact
                found = candidate
                break
            if candidate.lower() in lower:  # case-insensitive / variant
                found = lower[candidate.lower()]
                break
        if found is None:
            missing.append(field)
        else:
            mapping[field] = found
    return mapping, missing


# --------------------------------------------------------------------------- #
# Validation report (reuses the shared OHLC predicate)
# --------------------------------------------------------------------------- #
def _iso(ts: object) -> str | None:
    if ts is None or pd.isna(ts):
        return None
    return pd.Timestamp(ts).isoformat()


def build_validation_report(
    df_raw: pd.DataFrame, *, interval: str, mapping: dict[str, str]
) -> tuple[dict, pd.DataFrame | None]:
    """Build the pre-import report. Returns (report, clean_df).

    ``clean_df`` is None when there are blocking errors (the caller must return 422
    and not stash anything). When clean, ``clean_df`` is the deduped, validated frame
    ready to persist.
    """
    total = int(len(df_raw))

    # Rename mapped columns into the canonical provider frame.
    df = df_raw.rename(
        columns={
            mapping["date"]: "timestamp",
            mapping["open"]: "open",
            mapping["high"]: "high",
            mapping["low"]: "low",
            mapping["close"]: "close",
            mapping["volume"]: "volume",
        }
    )[["timestamp", "open", "high", "low", "close", "volume"]].copy()

    # Coerce: unparseable timestamps -> NaT, non-numeric OHLCV -> NaN.
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
    for col in _OHLC_FIELDS:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    errors: list[dict] = []          # first 10 kept for the response
    error_rows: set[int] = set()     # distinct 1-based data-row numbers with any error

    def _add_error(pos: int, column: str, message: str) -> None:
        row_no = int(pos) + 1  # 1-based within the data rows (header excluded)
        error_rows.add(row_no)
        if len(errors) < 10:
            errors.append({"row": row_no, "column": column, "message": message})

    # 1) Unparseable / missing timestamps.
    for pos in df.index[df["timestamp"].isna()]:
        _add_error(pos, "date", "unparseable or missing timestamp")

    # 2) Missing / non-numeric OHLCV values.
    for col in _OHLC_FIELDS:
        for pos in df.index[df[col].isna()]:
            _add_error(pos, col, f"missing or non-numeric {col} value")

    # 3) OHLC sanity violations — the SAME rules validate_and_clean uses.
    for column, message, predicate in _OHLC_SANITY_RULES:
        invalid = predicate(df).fillna(False)  # NaN handled above; don't double-count
        for pos in df.index[invalid]:
            _add_error(pos, column, message)

    parseable = df["timestamp"].dropna()
    date_range = {
        "start": _iso(parseable.min()) if not parseable.empty else None,
        "end": _iso(parseable.max()) if not parseable.empty else None,
    }
    preview = _preview_rows(df)

    if error_rows:
        report = {
            "total_rows": total,
            "valid_rows": total - len(error_rows),
            "error_count": len(error_rows),
            "warning_count": 0,
            "errors": errors,
            "warnings": [],
            "date_range": date_range,
            "preview": preview,
        }
        return report, None

    # No blocking errors -> reuse validate_and_clean for dedup + duplicate/gap
    # warnings (the exact yfinance path).
    clean_df, raw_warnings = validate_and_clean(df, interval)
    warnings = [_warning_summary(w) for w in raw_warnings]
    clean_range = {
        "start": _iso(clean_df["timestamp"].min()) if not clean_df.empty else None,
        "end": _iso(clean_df["timestamp"].max()) if not clean_df.empty else None,
    }
    report = {
        "total_rows": total,
        "valid_rows": int(len(clean_df)),
        "error_count": 0,
        "warning_count": len(warnings),
        "errors": [],
        "warnings": warnings,
        "date_range": clean_range,
        "preview": preview,
    }
    return report, clean_df


def _preview_rows(df: pd.DataFrame) -> list[dict]:
    """First 5 rows as JSON-safe dicts (timestamps -> iso, numbers -> float)."""
    rows: list[dict] = []
    for r in df.head(5).itertuples(index=False):
        rows.append(
            {
                "timestamp": _iso(r.timestamp),
                "open": _num(r.open),
                "high": _num(r.high),
                "low": _num(r.low),
                "close": _num(r.close),
                "volume": _num(r.volume),
            }
        )
    return rows


def _num(v: object) -> float | None:
    if v is None or pd.isna(v):
        return None
    return float(v)


_WARNING_MESSAGES = {
    "duplicate_timestamps": "duplicate timestamps found — the latest row per timestamp was kept",
    "timestamp_gaps": "gaps larger than the expected interval were detected",
    "nan_rows_dropped": "rows with missing OHLC values were dropped",
    "ohlc_sanity_violation": "rows failing OHLC sanity checks were dropped",
}


def _warning_summary(w: dict) -> dict:
    return {
        "type": w["type"],
        "count": int(w.get("count", 0)),
        "message": _WARNING_MESSAGES.get(w["type"], w["type"]),
    }


# --------------------------------------------------------------------------- #
# Redis stash (org-namespaced, 10-min TTL)
# --------------------------------------------------------------------------- #
def _key(org_id: uuid.UUID | str, upload_id: str) -> str:
    return f"{_KEY_PREFIX}{org_id}:{upload_id}"


def _serialize(df: pd.DataFrame) -> list[dict]:
    out = df[["timestamp", "open", "high", "low", "close", "volume"]].copy()
    out["timestamp"] = out["timestamp"].map(lambda t: pd.Timestamp(t).isoformat())
    for col in _OHLC_FIELDS:
        out[col] = out[col].astype(float)
    return out.to_dict(orient="records")


def _deserialize(records: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame.from_records(records, columns=["timestamp", *_OHLC_FIELDS])
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    for col in _OHLC_FIELDS:
        df[col] = pd.to_numeric(df[col])
    return df


async def stash_upload(
    org_id: uuid.UUID, *, symbol: str, interval: str, df: pd.DataFrame
) -> str:
    """Serialize + store the validated frame, returning a fresh upload_id."""
    upload_id = uuid.uuid4().hex
    payload = {
        "organization_id": str(org_id),
        "symbol": symbol,
        "interval": interval,
        "records": _serialize(df),
    }
    await redis_client.get_client().set(
        _key(org_id, upload_id), json.dumps(payload), ex=_UPLOAD_TTL_SECONDS
    )
    return upload_id


async def fetch_upload(org_id: uuid.UUID, upload_id: str) -> dict | None:
    """Return the stashed payload (with a rebuilt DataFrame) or None if absent.

    The key is namespaced by the CALLER's org, so a cross-org upload_id simply
    misses — no other org's data is reachable. The stored organization_id is
    re-checked as belt-and-braces."""
    raw = await redis_client.get_client().get(_key(org_id, upload_id))
    if raw is None:
        return None
    payload = json.loads(raw)
    if payload.get("organization_id") != str(org_id):
        return None
    payload["df"] = _deserialize(payload["records"])
    return payload


async def delete_upload(org_id: uuid.UUID, upload_id: str) -> None:
    await redis_client.get_client().delete(_key(org_id, upload_id))


def is_allowed_interval(interval: str) -> bool:
    return interval in ALLOWED_INTERVALS
