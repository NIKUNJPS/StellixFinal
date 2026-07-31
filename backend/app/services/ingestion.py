"""Ingestion service: validation, tier limits, persistence, and the run pipeline.

Data-quality policy (reject & log, never silently proceed):
- Duplicate timestamps for a symbol -> keep latest, warn.
- OHLC sanity violations (high<low, high<open/close, low>open/close, non-positive
  prices, negative volume) -> drop the offending rows, warn.
- NaN OHLC rows -> dropped; if the dropped fraction exceeds DATA_NAN_TOLERANCE, warn.
- Timestamp gaps larger than interval * DATA_GAP_INTERVAL_MULTIPLIER -> warn only
  (partial data is still useful; do not hard-fail).
"""

from __future__ import annotations

import logging
import math
import uuid
from datetime import date

import pandas as pd
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_tenant_session
from app.features.engineering import FEATURE_COLUMNS, compute_features
from app.models.feature_matrix import FeatureMatrix
from app.models.ingestion_job import IngestionJob, IngestionStatus
from app.models.market_data import MarketData
from app.models.organization import Organization, OrganizationTier
from app.providers import get_provider

logger = logging.getLogger(__name__)

ALLOWED_INTERVALS: set[str] = {"1m", "5m", "15m", "30m", "1h", "1d", "1wk", "1mo"}

_INTERVAL_DELTA: dict[str, pd.Timedelta] = {
    "1m": pd.Timedelta(minutes=1),
    "5m": pd.Timedelta(minutes=5),
    "15m": pd.Timedelta(minutes=15),
    "30m": pd.Timedelta(minutes=30),
    "1h": pd.Timedelta(hours=1),
    "1d": pd.Timedelta(days=1),
    "1wk": pd.Timedelta(days=7),
    "1mo": pd.Timedelta(days=30),
}

# Tier-based max ingest lookback (days). None = unlimited. Policy, not a DB field
# (documented in docs/schemas.md → Organization).
TIER_MAX_INGEST_DAYS: dict[OrganizationTier, int | None] = {
    OrganizationTier.STARTER: 1825,  # ~5 years
    OrganizationTier.PRO: None,
    OrganizationTier.ENTERPRISE: None,
}


class IngestionInputError(Exception):
    """Raised for invalid ingest requests (bad interval, tier limit exceeded, ...)."""


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #
# OHLC row-level sanity rules — the SINGLE source of truth for what makes a bar
# valid, shared by two callers so they can never diverge (Batch 21):
#   - validate_and_clean() below drops offending rows and emits an aggregate warning
#   - the CSV upload path (app/services/csv_upload.py) turns each violation into a
#     per-row {row, column, message} error for the pre-import validation report.
# Each entry is (column, message, invalid_predicate) where invalid_predicate(df)
# returns a boolean Series that is True on rows VIOLATING the rule.
_OHLC_SANITY_RULES: list[tuple[str, str, callable]] = [
    ("high", "high is less than low", lambda d: d["high"] < d["low"]),
    ("high", "high is less than open", lambda d: d["high"] < d["open"]),
    ("high", "high is less than close", lambda d: d["high"] < d["close"]),
    ("low", "low is greater than open", lambda d: d["low"] > d["open"]),
    ("low", "low is greater than close", lambda d: d["low"] > d["close"]),
    ("open", "open must be positive", lambda d: d["open"] <= 0),
    ("high", "high must be positive", lambda d: d["high"] <= 0),
    ("low", "low must be positive", lambda d: d["low"] <= 0),
    ("close", "close must be positive", lambda d: d["close"] <= 0),
    ("volume", "volume must be non-negative", lambda d: d["volume"] < 0),
]


def ohlc_sanity_valid_mask(df: pd.DataFrame) -> pd.Series:
    """Boolean Series, True where a row passes EVERY OHLC sanity rule.

    This is the exact predicate ``validate_and_clean`` uses to drop bad rows, and
    the CSV upload validation report uses to decide which rows are errors — one
    source of truth (Batch 21)."""
    valid = pd.Series(True, index=df.index)
    for _col, _msg, predicate in _OHLC_SANITY_RULES:
        # A NaN comparison yields False (not a violation); NaN OHLC is handled
        # separately (dropped in step 1 here; an explicit error in the CSV path).
        valid &= ~predicate(df).fillna(False)
    return valid


def validate_and_clean(df: pd.DataFrame, interval: str) -> tuple[pd.DataFrame, list[dict]]:
    """Apply data-quality rules. Returns (clean_df, warnings)."""
    warnings: list[dict] = []
    total = len(df)
    df = df.sort_values("timestamp").reset_index(drop=True)

    # 1) Drop NaN OHLC rows.
    ohlc = ["open", "high", "low", "close"]
    nan_mask = df[ohlc].isna().any(axis=1)
    dropped_nan = int(nan_mask.sum())
    if dropped_nan:
        df = df[~nan_mask]
        warning = {"type": "nan_rows_dropped", "count": dropped_nan}
        if total and dropped_nan / total > settings.DATA_NAN_TOLERANCE:
            warning["exceeds_tolerance"] = True
        warnings.append(warning)

    # 2) Duplicate timestamps -> keep latest.
    dup_count = int(df["timestamp"].duplicated(keep="last").sum())
    if dup_count:
        df = df.drop_duplicates(subset="timestamp", keep="last")
        warnings.append({"type": "duplicate_timestamps", "count": dup_count})

    # 3) OHLC sanity + non-negative prices/volume (shared predicate).
    valid = ohlc_sanity_valid_mask(df)
    invalid_count = int((~valid).sum())
    if invalid_count:
        sample = [
            pd.Timestamp(ts).isoformat() for ts in df.loc[~valid, "timestamp"].head(5)
        ]
        df = df[valid]
        warnings.append(
            {"type": "ohlc_sanity_violation", "count": invalid_count, "sample": sample}
        )

    df = df.sort_values("timestamp").reset_index(drop=True)

    # 4) Timestamp gaps (warn only).
    expected = _INTERVAL_DELTA.get(interval)
    if expected is not None and len(df) > 1:
        diffs = df["timestamp"].diff()
        gap_mask = diffs > expected * settings.DATA_GAP_INTERVAL_MULTIPLIER
        gap_count = int(gap_mask.sum())
        if gap_count:
            sample = [
                pd.Timestamp(ts).isoformat() for ts in df.loc[gap_mask, "timestamp"].head(5)
            ]
            warnings.append(
                {"type": "timestamp_gaps", "count": gap_count, "sample": sample}
            )

    return df, warnings


def enforce_tier_ingest_limit(
    organization: Organization, start: date, end: date
) -> None:
    """Reject ingests whose lookback exceeds the organization's tier limit."""
    max_days = TIER_MAX_INGEST_DAYS.get(organization.tier)
    if max_days is None:
        return
    requested = (end - start).days
    if requested > max_days:
        raise IngestionInputError(
            f"Requested range of {requested} days exceeds the {organization.tier.value} "
            f"tier limit of {max_days} days. Upgrade the plan or narrow the range."
        )


# --------------------------------------------------------------------------- #
# Persistence (Postgres upsert = "keep latest"; portable fallback for SQLite)
# --------------------------------------------------------------------------- #
def _f(value: object) -> float | None:
    """numpy/NaN -> python float or None."""
    if value is None:
        return None
    f = float(value)
    return None if math.isnan(f) else f


# asyncpg binds every column of every row as a separate query parameter and the
# PostgreSQL wire protocol caps a single statement at 32767 parameters. A
# multi-year daily series (crypto trades 365 days/yr) or any intraday series can
# exceed that in one INSERT, so we split into chunks sized by the widest row.
_PG_MAX_PARAMS = 30000  # safety margin under the hard 32767 limit


def _chunk_rows(rows: list[dict]) -> list[list[dict]]:
    """Split rows into batches whose total bound-parameter count stays under the
    asyncpg limit. Sizes off the widest row so heterogeneous dicts are safe."""
    if not rows:
        return []
    params_per_row = max(len(r) for r in rows)
    size = max(1, _PG_MAX_PARAMS // params_per_row)
    return [rows[i : i + size] for i in range(0, len(rows), size)]


async def persist_market_data(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    symbol: str,
    source: str,
    df: pd.DataFrame,
) -> int:
    rows = [
        {
            "organization_id": organization_id,
            "symbol": symbol,
            "timestamp": pd.Timestamp(r.timestamp).to_pydatetime(),
            "open": _f(r.open),
            "high": _f(r.high),
            "low": _f(r.low),
            "close": _f(r.close),
            "volume": _f(r.volume),
            "source": source,
        }
        for r in df.itertuples(index=False)
    ]
    if not rows:
        return 0

    if session.bind.dialect.name == "postgresql":
        # Chunk to stay under asyncpg's hard 32767 bound-parameter limit — a
        # multi-year daily (or any intraday) series can otherwise exceed it in a
        # single INSERT. params-per-row = number of keys in each row dict.
        for batch in _chunk_rows(rows):
            stmt = pg_insert(MarketData).values(batch)
            stmt = stmt.on_conflict_do_update(
                constraint="pk_market_data",
                set_={
                    "open": stmt.excluded.open,
                    "high": stmt.excluded.high,
                    "low": stmt.excluded.low,
                    "close": stmt.excluded.close,
                    "volume": stmt.excluded.volume,
                    "source": stmt.excluded.source,
                },
            )
            await session.execute(stmt)
    else:
        for row in rows:
            await session.merge(MarketData(**row))
            # Flush per row: a batched INSERT of a composite-PK + tz-datetime table
            # trips SQLAlchemy's insertmanyvalues sentinel matching on SQLite (same
            # reason tests/data_helpers.seed_market_data flushes per row). The
            # Postgres path above is unaffected.
            await session.flush()
    return len(rows)


async def persist_features(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    symbol: str,
    features: pd.DataFrame,
) -> int:
    rows = []
    for ts, frow in features.iterrows():
        values = {col: _f(frow[col]) for col in FEATURE_COLUMNS}
        rows.append(
            {
                "organization_id": organization_id,
                "symbol": symbol,
                "timestamp": pd.Timestamp(ts).to_pydatetime(),
                "features": values,
                **values,
            }
        )
    if not rows:
        return 0

    if session.bind.dialect.name == "postgresql":
        # feature_matrix is wide (features JSONB + one column per indicator), so
        # this hits the asyncpg parameter ceiling sooner than market_data. Chunk.
        for batch in _chunk_rows(rows):
            stmt = pg_insert(FeatureMatrix).values(batch)
            update_cols = {c: getattr(stmt.excluded, c) for c in ["features", *FEATURE_COLUMNS]}
            stmt = stmt.on_conflict_do_update(constraint="pk_feature_matrix", set_=update_cols)
            await session.execute(stmt)
    else:
        for row in rows:
            await session.merge(FeatureMatrix(**row))
            await session.flush()  # per-row flush — see persist_market_data note
    return len(rows)


# --------------------------------------------------------------------------- #
# Pipeline (invoked by the Celery task)
# --------------------------------------------------------------------------- #
async def _set_job(job_id: uuid.UUID, organization_id: uuid.UUID, **fields: object) -> None:
    async with get_tenant_session(organization_id) as session:
        job = (
            await session.execute(select(IngestionJob).where(IngestionJob.id == job_id))
        ).scalar_one()
        for key, value in fields.items():
            setattr(job, key, value)


async def run_ingestion(
    *,
    job_id: uuid.UUID,
    organization_id: uuid.UUID,
    symbol: str,
    start: date,
    end: date,
    interval: str,
    provider_name: str,
) -> None:
    """Full ingest pipeline: fetch -> validate -> persist market_data -> features.

    Updates the IngestionJob row throughout. Records failures on the job rather than
    crashing the worker.
    """
    await _set_job(job_id, organization_id, status=IngestionStatus.RUNNING)
    try:
        provider = get_provider(provider_name)
        raw = provider.fetch_ohlcv(symbol, start, end, interval)
        clean, warnings = validate_and_clean(raw, interval)
        if warnings:
            # Batch 13: these previously only reached a human via job.warnings
            # (below) — logging them too means a data-quality flag shows up in
            # log-based monitoring/alerting, not just a targeted per-job query.
            logger.warning(
                "Data-quality warnings for %s ingest (org=%s): %s", symbol, organization_id, warnings
            )
        if clean.empty:
            raise IngestionInputError("No valid rows remained after data-quality validation")

        feats = compute_features(clean)

        async with get_tenant_session(organization_id) as session:
            n_md = await persist_market_data(
                session,
                organization_id=organization_id,
                symbol=symbol,
                source=provider.name,
                df=clean,
            )
            n_ft = await persist_features(
                session, organization_id=organization_id, symbol=symbol, features=feats
            )
            job = (
                await session.execute(select(IngestionJob).where(IngestionJob.id == job_id))
            ).scalar_one()
            job.status = IngestionStatus.DONE
            job.rows_ingested = n_md
            job.features_computed = n_ft
            job.warnings = warnings
    except Exception as exc:  # noqa: BLE001 - record failure on the job
        await _set_job(
            job_id,
            organization_id,
            status=IngestionStatus.FAILED,
            error=str(exc)[:2000],
        )
        raise
