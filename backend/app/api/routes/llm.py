"""LLM research assistant endpoints (Batch 9; streaming chat added in Batch 18)."""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_tenant_db, require_permission
from app.db.session import get_tenant_session
from app.graph.sync_service import GraphSyncService
from app.llm.guard import PricePredictionRejected, check_price_prediction_guard
from app.llm.router import llm_router
from app.llm.service import LLMService, LLMUnavailableError
from app.models.feature_matrix import FeatureMatrix
from app.models.llm_audit_log import LLMAuditLog
from app.models.regime_label import RegimeLabelRecord
from app.models.research_note import ResearchNote
from app.models.strategy import Strategy
from app.models.user import User
from app.rbac.catalog import P
from app.schemas.llm import (
    AuditLogEntry,
    AuditLogListResponse,
    ChatRequest,
    CritiqueResponse,
    GraphSummaryResponse,
    HypothesisRequest,
    HypothesisResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["LLM Assistant"])

_CHAT_SYSTEM_PROMPT = (
    "You are a quantitative research assistant for Stellix Labs, a regime-adaptive "
    "trading research platform. Answer the researcher's question about strategy "
    "design, market regimes, backtesting methodology, and risk. Never make a price "
    "forecast or give a price target for any instrument — discuss strategy structure "
    "and methodology instead. You have no authority to create, modify, or execute "
    "any strategy; you only provide analysis a human researcher then acts on."
)


async def _terminal_context(db: AsyncSession, symbol: str) -> str:
    """Batch 31: server-built context for a terminal-focused chat — the delayed quote,
    this org's latest Stellix regime label for the symbol, and recent headlines. Every
    part is optional; a failing source is simply left out (and said so)."""
    from app.terminal import market

    lines = [f"TERMINAL CONTEXT for {symbol} (delayed market data; cite it as such):"]
    try:
        q = (await market.quote_detail(symbol))["data"]
        fields = [("last", "Last"), ("change_pct", "Change %"), ("market_cap", "Market cap"),
                  ("pe_ratio", "P/E"), ("eps", "EPS"), ("fifty_two_week_low", "52w low"),
                  ("fifty_two_week_high", "52w high"), ("beta", "Beta")]
        lines.append("- Quote: " + ", ".join(f"{label} {q[k]}" for k, label in fields if q.get(k) is not None))
        if q.get("sector"):
            lines.append(f"- Sector: {q['sector']} / {q.get('industry')}")
    except Exception:  # noqa: BLE001 — context is best-effort
        lines.append("- Quote: unavailable right now.")
    regime = (
        await db.execute(
            select(RegimeLabelRecord)
            .where(RegimeLabelRecord.symbol == symbol)
            .order_by(RegimeLabelRecord.timestamp.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if regime is not None:
        label = getattr(regime.regime_label, "value", regime.regime_label)
        lines.append(f"- Stellix regime: {label} (confidence {regime.confidence_score:.2f}, "
                     f"as of {regime.timestamp.date().isoformat()})")
    else:
        lines.append("- Stellix regime: no regime label for this symbol in your organization.")
    try:
        headlines = (await market.news(symbol, None))["data"][:5]
        for h in headlines:
            lines.append(f"- Headline ({h.get('publisher')}, {h.get('published_at')}): {h['title']}")
    except Exception:  # noqa: BLE001
        lines.append("- Headlines: unavailable right now.")
    return "\n".join(lines)


async def _recent_market_context(db: AsyncSession, symbol: str) -> dict:
    row = (
        await db.execute(
            select(FeatureMatrix)
            .where(FeatureMatrix.symbol == symbol)
            .order_by(FeatureMatrix.timestamp.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        return {}
    return {
        "symbol": symbol,
        "timestamp": row.timestamp.isoformat(),
        "close_indicators": {
            "rsi_14": row.rsi_14,
            "macd": row.macd,
            "macd_signal": row.macd_signal,
            "sma_20": row.sma_20,
            "sma_50": row.sma_50,
            "realized_vol_20": row.realized_vol_20,
        },
    }


async def _recent_regime_history(db: AsyncSession, symbol: str, days: int = 30) -> list[dict]:
    since = datetime.now(UTC) - timedelta(days=days)
    rows = (
        await db.execute(
            select(RegimeLabelRecord)
            .where(RegimeLabelRecord.symbol == symbol)
            .where(RegimeLabelRecord.timestamp >= since)
            .order_by(RegimeLabelRecord.timestamp.asc())
        )
    ).scalars().all()
    return [
        {"timestamp": r.timestamp.isoformat(), "regime_label": r.regime_label.value, "confidence": r.confidence_score}
        for r in rows
    ]


async def _related_research_notes(db: AsyncSession, limit: int = 5) -> list[dict]:
    rows = (
        await db.execute(select(ResearchNote).order_by(ResearchNote.created_at.desc()).limit(limit))
    ).scalars().all()
    return [{"content": r.content, "hypothesis": r.hypothesis} for r in rows]


@router.post("/hypothesis", response_model=HypothesisResponse, status_code=status.HTTP_201_CREATED)
async def generate_hypothesis(
    payload: HypothesisRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> HypothesisResponse:
    # Safeguard 1 — NO PRICE PREDICTION: checked BEFORE the LLM is ever called.
    try:
        check_price_prediction_guard(payload.user_prompt)
    except PricePredictionRejected as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    symbol = payload.symbol.strip().upper()
    market_context = await _recent_market_context(db, symbol)
    regime_history = await _recent_regime_history(db, symbol)
    related_notes = await _related_research_notes(db)

    llm = LLMService(db, organization_id=current_user.organization_id, user_id=current_user.id)
    try:
        hypothesis = await llm.generate_hypothesis(
            market_context=market_context,
            regime_history=regime_history,
            related_research_notes=related_notes,
            user_prompt=payload.user_prompt,
        )
    except LLMUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    note = ResearchNote(
        content=hypothesis.rationale,
        hypothesis=hypothesis.hypothesis_text,
        author_user_id=current_user.id,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    await GraphSyncService().sync_research_note_node(db, note)

    return HypothesisResponse(hypothesis=hypothesis, research_note_id=note.id)


def _sse(payload: dict) -> str:
    """One Server-Sent Event frame. The blank line terminating the frame is part
    of the protocol, not formatting — without it the client never dispatches."""
    return f"data: {json.dumps(payload)}\n\n"


@router.post("/chat/stream")
async def chat_stream(
    payload: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> StreamingResponse:
    """Stream a research-chat answer over SSE (Batch 18).

    Streaming is text-only, so this endpoint is deliberately NOT one of the four
    structured functions: those return a validated object whose numeric_claims are
    cross-checked against stored data (Safeguard 5), and neither the object nor the
    check exists until a response is complete. Chat makes no claims about stored
    records, so there is nothing to cross-check — but Safeguard 1 still applies and
    runs below, before any provider is contacted.
    """
    # Safeguard 1 — NO PRICE PREDICTION. Checked here rather than inside the
    # generator so a rejected prompt gets a real 400 status: once a StreamingResponse
    # starts, headers are already sent and the status can no longer be changed, so an
    # in-stream rejection would have to masquerade as a 200. Nothing reaches either
    # provider's API either way.
    try:
        check_price_prediction_guard(payload.message)
    except PricePredictionRejected as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    user_prompt = payload.message
    if payload.context_symbol:
        context = await _terminal_context(db, payload.context_symbol.upper())
        user_prompt = f"{context}\n\nQUESTION:\n{payload.message}"

    model_key = llm_router.route("chat", payload.stakes)
    organization_id = current_user.organization_id
    user_id = current_user.id

    async def generate() -> AsyncIterator[str]:
        usage: dict | None = None
        text_parts: list[str] = []
        try:
            async for item in llm_router.stream_text(
                model_key=model_key,
                system_prompt=_CHAT_SYSTEM_PROMPT,
                user_prompt=user_prompt,
            ):
                if "usage" in item:
                    usage = item["usage"]
                    continue
                text_parts.append(item["chunk"])
                yield _sse({"chunk": item["chunk"], "model": item["model"], "done": False})
        except LLMUnavailableError as exc:
            # The stream is already open (HTTP 200 committed), so this surfaces as a
            # terminal error frame rather than a 503 — the client renders data.error.
            yield _sse({"error": str(exc), "done": True})
            return
        except Exception:  # noqa: BLE001 — never leak a raw traceback into the stream
            logger.exception("Unhandled error streaming chat for org=%s", organization_id)
            yield _sse({"error": "AI assistant failed mid-response", "done": True})
            return

        # Safeguard 4 — log-then-return, on the streaming path too. A streamed call
        # costs real money and must appear in the audit log like any other. Both SDKs
        # report real usage on the final message, so this is measured, not estimated.
        #
        # Its own session (the established get_tenant_session pattern used by
        # explain_failure/monitor_and_fail): a request-scoped `Depends(get_tenant_db)`
        # session's lifetime is tied to the request, and this code runs while the
        # response body is still streaming — writing through it here would depend on
        # teardown ordering rather than on anything guaranteed.
        if usage is not None:
            try:
                async with get_tenant_session(organization_id) as session:
                    session.add(
                        LLMAuditLog(
                            organization_id=organization_id,
                            user_id=user_id,
                            function_name="chat",
                            full_prompt=f"SYSTEM:\n{_CHAT_SYSTEM_PROMPT}\n\nUSER:\n{user_prompt}",
                            full_response="".join(text_parts),
                            model_used=usage["model_name"],
                            model_key=usage["model_key"],
                            input_tokens=usage["input_tokens"],
                            output_tokens=usage["output_tokens"],
                            estimated_cost_usd=usage["cost_usd"],
                            numeric_validation_passed=None,
                        )
                    )
                    await session.commit()
            except Exception:  # noqa: BLE001
                # The answer is already delivered; failing the audit write must not
                # retroactively break the user's response. Loud in logs instead.
                logger.exception("Failed to audit-log streamed chat for org=%s", organization_id)

        yield _sse({"chunk": "", "done": True})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # Tells nginx (the K8s ingress) not to buffer the response — without it
            # the proxy holds chunks back and the stream arrives all at once.
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/critique/{strategy_id}", response_model=CritiqueResponse)
async def critique_strategy(
    strategy_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> CritiqueResponse:
    strategy = (await db.execute(select(Strategy).where(Strategy.id == strategy_id))).scalar_one_or_none()
    if strategy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found")

    strategy_record = {
        "name": strategy.name,
        "status": strategy.status.value,
        "entry_rules": strategy.entry_rules,
        "exit_rules": strategy.exit_rules,
        "risk_constraints": strategy.risk_constraints,
        "robustness_score": strategy.robustness_score,
        "regime_compatibility": strategy.regime_compatibility,
    }

    llm = LLMService(db, organization_id=current_user.organization_id, user_id=current_user.id)
    try:
        critique, numeric_validation_passed = await llm.critique_strategy(strategy_record=strategy_record)
    except LLMUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return CritiqueResponse(critique=critique, numeric_validation_passed=numeric_validation_passed)


_GRAPH_QUERY_NAMES = {
    "failed-strategies-by-regime",
    "lineage",
    "robust-across-regimes",
    "recurring-failure-modes",
    "hypotheses-leading-to-active",
}


@router.get("/graph-summary", response_model=GraphSummaryResponse)
async def graph_summary(
    query_name: str = Query(..., max_length=64),
    result_id: str | None = Query(default=None, max_length=64),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> GraphSummaryResponse:
    if query_name not in _GRAPH_QUERY_NAMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown query_name {query_name!r}; expected one of {sorted(_GRAPH_QUERY_NAMES)}",
        )

    repo = GraphSyncService().repository
    org = str(current_user.organization_id)
    if query_name == "failed-strategies-by-regime":
        regime = result_id or "Bear"
        since = datetime.now(UTC) - timedelta(days=730)
        raw_results = {"items": await repo.failed_strategies_by_regime(org, regime=regime, since=since)}
    elif query_name == "lineage":
        if not result_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="lineage requires result_id=<strategy_id>")
        raw_results = await repo.lineage(org, strategy_id=result_id)
    elif query_name == "robust-across-regimes":
        raw_results = {"items": await repo.robust_across_regimes(org, min_regimes=4)}
    elif query_name == "recurring-failure-modes":
        raw_results = {"items": await repo.recurring_failure_modes(org, min_occurrences=3)}
    else:
        raw_results = {"items": await repo.hypotheses_leading_to_active(org)}

    llm = LLMService(db, organization_id=current_user.organization_id, user_id=current_user.id)
    try:
        summary = await llm.summarize_graph_query_result(query_name=query_name, raw_results=raw_results)
    except LLMUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return GraphSummaryResponse(query_name=query_name, summary=summary)


@router.get("/audit-log", response_model=AuditLogListResponse)
async def list_audit_log(
    current_user: User = Depends(require_permission(P.LLM_AUDIT_VIEW)),
    db: AsyncSession = Depends(get_tenant_db),
    function_name: str | None = Query(default=None, max_length=64),
    user_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> AuditLogListResponse:
    conditions = []
    if function_name:
        conditions.append(LLMAuditLog.function_name == function_name)
    if user_id:
        conditions.append(LLMAuditLog.user_id == user_id)

    total = await db.scalar(select(func.count()).select_from(LLMAuditLog).where(*conditions))
    rows = (
        await db.execute(
            select(LLMAuditLog, User.email, User.full_name)
            .outerjoin(User, User.id == LLMAuditLog.user_id)
            .where(*conditions)
            .order_by(LLMAuditLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return AuditLogListResponse(
        total=total or 0,
        count=len(rows),
        items=[
            AuditLogEntry.model_validate(entry).model_copy(update={"user_email": email, "user_name": name})
            for entry, email, name in rows
        ],
    )
