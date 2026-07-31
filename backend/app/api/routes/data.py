"""Data ingestion & retrieval endpoints (Batch 2).

- POST /data/ingest                  enqueue an async ingest (never blocks the request)
- GET  /data/ingest/{job_id}/status  poll job status (tenant-scoped)
- GET  /data/market/{symbol}         read ingested OHLCV (tenant-scoped; powers the chart)
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_tenant_db, require_scope
from app.core.logging import get_current_request_id
from app.core.rate_limit import ingest_rate_limiter
from app.features.engineering import compute_features
from app.models.ingestion_job import IngestionJob, IngestionStatus
from app.models.market_data import MarketData
from app.models.organization import Organization
from app.models.user import User
from app.schemas.data import (
    CsvConfirmRequest,
    CsvConfirmResponse,
    IngestEnqueuedResponse,
    IngestRequest,
    JobStatusResponse,
    MarketBar,
    MarketSeriesResponse,
)
from app.services import csv_upload
from app.services.ingestion import (
    IngestionInputError,
    enforce_tier_ingest_limit,
    persist_features,
    persist_market_data,
)

router = APIRouter(prefix="/data", tags=["Market Data"])
logger = logging.getLogger(__name__)

_CSV_MAX_BYTES = 50 * 1024 * 1024  # 50MB
_CSV_SOURCE = "csv_upload"


@router.post(
    "/ingest",
    response_model=IngestEnqueuedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Enqueue an async market-data ingestion job",
    dependencies=[Depends(ingest_rate_limiter), Depends(require_scope("data:write"))],
)
async def ingest(
    payload: IngestRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> IngestEnqueuedResponse:
    organization = (
        await db.execute(
            select(Organization).where(Organization.id == current_user.organization_id)
        )
    ).scalar_one()

    try:
        enforce_tier_ingest_limit(organization, payload.start_date, payload.end_date)
    except IngestionInputError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    job = IngestionJob(
        symbol=payload.symbol,
        start_date=payload.start_date,
        end_date=payload.end_date,
        interval=payload.interval,
        provider=payload.provider,
        status=IngestionStatus.PENDING,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Enqueue AFTER the job row is committed so the worker can see it.
    from app.worker.tasks import ingest_market_data

    async_result = ingest_market_data.delay(
        job_id=str(job.id),
        organization_id=str(current_user.organization_id),
        symbol=payload.symbol,
        start=payload.start_date.isoformat(),
        end=payload.end_date.isoformat(),
        interval=payload.interval,
        provider=payload.provider,
        request_id=get_current_request_id(),
    )
    job.celery_task_id = async_result.id
    await db.commit()

    return IngestEnqueuedResponse(
        job_id=job.id,
        status=IngestionStatus.PENDING,
        message="Ingestion enqueued. Poll /data/ingest/{job_id}/status for progress.",
    )


@router.get(
    "/ingest/{job_id}/status",
    response_model=JobStatusResponse,
    summary="Poll ingestion job status",
)
async def ingest_status(
    job_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> JobStatusResponse:
    job = (
        await db.execute(select(IngestionJob).where(IngestionJob.id == job_id))
    ).scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return JobStatusResponse(
        job_id=job.id,
        symbol=job.symbol,
        status=job.status,
        rows_ingested=job.rows_ingested,
        features_computed=job.features_computed,
        warnings=job.warnings or [],
        error=job.error,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.get(
    "/market/{symbol}",
    response_model=MarketSeriesResponse,
    summary="Read ingested OHLCV for a symbol (tenant-scoped)",
    dependencies=[Depends(require_scope("data:read"))],
)
async def market_series(
    symbol: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
    limit: int = Query(default=1000, ge=1, le=10000),
) -> MarketSeriesResponse:
    symbol = symbol.strip().upper()
    rows = (
        await db.execute(
            select(MarketData)
            .where(MarketData.symbol == symbol)
            .order_by(MarketData.timestamp.asc())
            .limit(limit)
        )
    ).scalars().all()
    return MarketSeriesResponse(
        symbol=symbol,
        count=len(rows),
        points=[MarketBar.model_validate(r) for r in rows],
    )


# --------------------------------------------------------------------------- #
# CSV upload (Batch 21) — validate-then-confirm. Reuses the SAME OHLC validators
# and persistence the yfinance ingest uses (app/services/ingestion.py).
# --------------------------------------------------------------------------- #
@router.post(
    "/upload-csv",
    summary="Validate an uploaded OHLCV CSV (no DB write; returns a report + upload_id)",
    dependencies=[Depends(require_scope("data:write"))],
)
async def upload_csv(
    file: UploadFile = File(...),
    symbol: str = Form(...),
    interval: str = Form("1d"),
    date_column: str | None = Form(None),
    open_column: str | None = Form(None),
    high_column: str | None = Form(None),
    low_column: str | None = Form(None),
    close_column: str | None = Form(None),
    volume_column: str | None = Form(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    symbol = symbol.strip().upper()
    if not symbol:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A symbol is required.")
    if not csv_upload.is_allowed_interval(interval):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"interval must be one of {sorted(csv_upload.ALLOWED_INTERVALS)}",
        )

    # Bounded read (limit+1) so an oversized file is rejected without loading it all.
    content = await file.read(_CSV_MAX_BYTES + 1)
    if len(content) > _CSV_MAX_BYTES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"CSV exceeds the {_CSV_MAX_BYTES // (1024 * 1024)}MB limit.",
        )

    try:
        df_raw = csv_upload.read_csv_bytes(content)
    except csv_upload.CsvUploadError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    mapping, missing = csv_upload.detect_columns(
        list(df_raw.columns),
        {
            "date": date_column,
            "open": open_column,
            "high": high_column,
            "low": low_column,
            "close": close_column,
            "volume": volume_column,
        },
    )
    if missing:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Could not map required column(s): {', '.join(missing)}. "
            f"Detected header: {list(df_raw.columns)}. Provide an explicit mapping.",
        )

    report, clean_df = csv_upload.build_validation_report(
        df_raw, interval=interval, mapping=mapping
    )

    if clean_df is None:
        # Blocking errors -> 422 WITH the report as the response body (no DB write).
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content=jsonable_encoder(report)
        )
    if clean_df.empty:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "No valid rows remained after validation.",
        )

    upload_id = await csv_upload.stash_upload(
        current_user.organization_id, symbol=symbol, interval=interval, df=clean_df
    )
    report["upload_id"] = upload_id
    return report


@router.post(
    "/upload-csv/confirm",
    response_model=CsvConfirmResponse,
    summary="Persist a previously-validated CSV upload into market_data",
    dependencies=[Depends(require_scope("data:write"))],
)
async def confirm_csv_upload(
    payload: CsvConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> CsvConfirmResponse:
    stored = await csv_upload.fetch_upload(current_user.organization_id, payload.upload_id)
    if stored is None:
        # Expired, never existed, or belongs to another org (org-namespaced key).
        raise HTTPException(status.HTTP_410_GONE, "Upload expired, please re-upload.")

    df = stored["df"]
    symbol = stored["symbol"]
    interval = stored["interval"]

    # Same persistence path yfinance uses. Dedup is the market_data PK
    # (organization_id, symbol, timestamp) upsert — there is no interval column.
    inserted = await persist_market_data(
        db, organization_id=current_user.organization_id, symbol=symbol, source=_CSV_SOURCE, df=df
    )
    # Compute features too, so uploaded data is immediately usable downstream
    # (regime detection reads the feature matrix). Best-effort: technical indicators
    # (e.g. ATR-14) need a minimum history, so a very small upload legitimately can't
    # produce features — that's not an error, the bars still persist.
    features_computed = 0
    try:
        features = compute_features(df)
        features_computed = await persist_features(
            db, organization_id=current_user.organization_id, symbol=symbol, features=features
        )
    except Exception:  # noqa: BLE001
        logger.warning(
            "Feature computation skipped for CSV upload of %s (%d rows) — insufficient history",
            symbol,
            len(df),
        )
    await db.commit()
    await csv_upload.delete_upload(current_user.organization_id, payload.upload_id)

    return CsvConfirmResponse(
        inserted=inserted,
        features_computed=features_computed,
        symbol=symbol,
        interval=interval,
        date_range={
            "start": df["timestamp"].min().isoformat() if not df.empty else None,
            "end": df["timestamp"].max().isoformat() if not df.empty else None,
        },
    )
