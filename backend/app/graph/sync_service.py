"""GraphSyncService — real-time write-through from Postgres into Research Memory.

Called synchronously from the Postgres-side service layer immediately after any
create/update (NOT a batch ETL job). The index is in-process, so a write lands
immediately, and the scheduled rebuild (``memory_index``) re-derives the whole index from
the database so it can never drift.
"""

from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.tenant import get_bound_organization
from app.graph.repository import GraphRepository

if TYPE_CHECKING:
    from app.models.failure import Failure
    from app.models.performance_snapshot import PerformanceSnapshot
    from app.models.research_note import ResearchNote
    from app.models.strategy import Strategy

logger = logging.getLogger(__name__)


_process_memory_repository: GraphRepository | None = None


def _default_repository() -> GraphRepository:
    """The process-wide index. The API process installs the rebuilt index through
    ``set_repository_override`` (see ``memory_index``); worker processes write into
    their own copy, and their changes reach the API's index on its next rebuild."""
    global _process_memory_repository
    if _process_memory_repository is None:
        from app.graph.memory_repository import InMemoryGraphRepository

        _process_memory_repository = InMemoryGraphRepository()
    return _process_memory_repository


# Every ``GraphSyncService()`` constructed with no explicit repository (i.e. every real
# call site in services/ and routes/) resolves through here: the API installs its live
# index, and tests inject a single shared ``InMemoryGraphRepository`` so writes made deep
# inside a service function and reads made from a route handler see the same index.
_repository_override: GraphRepository | None = None


def set_repository_override(repository: GraphRepository | None) -> None:
    global _repository_override
    _repository_override = repository


class GraphSyncService:
    def __init__(self, repository: GraphRepository | None = None) -> None:
        self._repository = repository

    @property
    def repository(self) -> GraphRepository:
        if self._repository is not None:
            return self._repository
        if _repository_override is not None:
            return _repository_override
        self._repository = _default_repository()
        return self._repository

    async def _degrade_gracefully(self, op_name: str, coro) -> None:
        # The index is in-process, so there is no connectivity failure to absorb; a bug in
        # the sync logic itself is allowed to propagate, exactly as before. ``op_name`` is
        # kept so call sites read the same.
        await coro

    async def delete_strategy_node(self, organization_id: uuid.UUID, strategy_id: uuid.UUID) -> None:
        """Batch 25: remove a discarded draft's node so the nightly consistency sweep
        does not report it as an orphan. Degrades like every other sync call."""
        async def _delete() -> None:
            await self.repository.delete_node(str(organization_id), label="Strategy", key_value=str(strategy_id))

        await self._degrade_gracefully("delete_strategy_node", _delete())

    # --- Regime / Researcher resolution (internal, Postgres-backed) --------- #
    async def _ensure_regime_node(
        self, session: AsyncSession, regime_label: str
    ) -> None:
        """MERGE a Regime node keyed by (org, regime_label); see docs/schemas.md for
        why the node is one-per-label (not one-per-segment)."""
        from sqlalchemy import func

        from app.models.regime_label import RegimeLabelRecord

        bounds = (
            await session.execute(
                select(
                    func.min(RegimeLabelRecord.timestamp),
                    func.max(RegimeLabelRecord.timestamp),
                ).where(RegimeLabelRecord.regime_label == regime_label)
            )
        ).first()
        min_ts, max_ts = bounds if bounds else (None, None)
        latest = (
            await session.execute(
                select(RegimeLabelRecord)
                .where(RegimeLabelRecord.regime_label == regime_label)
                .order_by(RegimeLabelRecord.timestamp.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        organization_id = get_bound_organization(session.sync_session)
        properties = {
            "regime_label": regime_label,
            "confidence_score": latest.confidence_score if latest else None,
            "symbol": latest.symbol if latest else None,
            "start_date": min_ts.isoformat() if min_ts else None,
            "end_date": max_ts.isoformat() if max_ts else None,
        }
        await self.repository.merge_node(
            str(organization_id), label="Regime", key_value=regime_label, properties=properties
        )

    async def _ensure_researcher_node(self, session: AsyncSession, user_id: uuid.UUID) -> None:
        from app.models.user import User

        user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if user is None:
            return
        organization_id = get_bound_organization(session.sync_session)
        await self.repository.merge_node(
            str(organization_id),
            label="Researcher",
            key_value=str(user_id),
            properties={"name": user.full_name or user.email, "role": user.role.value},
        )

    # --- the 4 named sync methods (Part 1's explicit surface) --------------- #
    async def sync_strategy_node(self, session: AsyncSession, strategy: Strategy) -> None:
        await self._degrade_gracefully("sync_strategy_node", self._sync_strategy_node(session, strategy))

    async def _sync_strategy_node(self, session: AsyncSession, strategy: Strategy) -> None:
        organization_id = str(strategy.organization_id)
        strategy_id = str(strategy.id)
        await self.repository.merge_node(
            organization_id,
            label="Strategy",
            key_value=strategy_id,
            properties={
                "name": strategy.name,
                "version": strategy.version,
                "status": strategy.status.value,
                "robustness_score": strategy.robustness_score,
            },
        )

        # AUTHORED_BY: the human who created the strategy. This is the edge the
        # "researcher leaves, the strategy stays traceable to them" guarantee rests
        # on — without it a departed author's strategies become anonymous. Mirrors the
        # ResearchNote -> Researcher AUTHORED_BY edge below. Skipped for GA/LLM-created
        # strategies (created_by_user_id is NULL), which have no human author.
        if strategy.created_by_user_id is not None:
            await self._ensure_researcher_node(session, strategy.created_by_user_id)
            await self.repository.merge_edge(
                organization_id,
                edge_type="AUTHORED_BY",
                from_label="Strategy",
                from_key=strategy_id,
                to_label="Researcher",
                to_key=str(strategy.created_by_user_id),
            )

        if strategy.parent_strategy_id is not None:
            edge_type = "MUTATED_FROM" if strategy.creator.value == "ga_engine" else "ADAPTED_FROM"
            await self.repository.merge_edge(
                organization_id,
                edge_type=edge_type,
                from_label="Strategy",
                from_key=strategy_id,
                to_label="Strategy",
                to_key=str(strategy.parent_strategy_id),
            )

        if strategy.inspired_by_note_id is not None:
            await self.repository.merge_edge(
                organization_id,
                edge_type="INSPIRED_BY",
                from_label="Strategy",
                from_key=strategy_id,
                to_label="ResearchNote",
                to_key=str(strategy.inspired_by_note_id),
            )

        for regime_label, sharpe in (strategy.regime_compatibility or {}).items():
            if sharpe is None or sharpe <= 0:
                continue
            await self._ensure_regime_node(session, regime_label)
            await self.repository.merge_edge(
                organization_id,
                edge_type="VALID_IN",
                from_label="Strategy",
                from_key=strategy_id,
                to_label="Regime",
                to_key=regime_label,
            )

    async def sync_failure_node(self, session: AsyncSession, failure: Failure) -> None:
        await self._degrade_gracefully("sync_failure_node", self._sync_failure_node(session, failure))

    async def _sync_failure_node(self, session: AsyncSession, failure: Failure) -> None:
        organization_id = str(failure.organization_id)
        failure_id = str(failure.id)
        strategy_id = str(failure.strategy_id)
        failure_timestamp = failure.failure_timestamp.isoformat()

        await self.repository.merge_node(
            organization_id,
            label="Failure",
            key_value=failure_id,
            properties={
                "trigger_condition": failure.trigger_condition.value,
                "llm_explanation": failure.llm_generated_explanation,
                "failure_timestamp": failure_timestamp,
            },
        )

        await self._ensure_regime_node(session, failure.regime_at_failure)
        await self.repository.merge_edge(
            organization_id,
            edge_type="FAILED_IN",
            from_label="Strategy",
            from_key=strategy_id,
            to_label="Regime",
            to_key=failure.regime_at_failure,
            edge_key={"failure_id": failure_id},
            properties={
                "trigger_condition": failure.trigger_condition.value,
                "llm_explanation": failure.llm_generated_explanation,
                "failure_timestamp": failure_timestamp,
            },
        )

        # A durable failure-time Performance snapshot (distinct from performance_snapshots,
        # which get replaced on every backtest re-run) — see docs/schemas.md CAUSED_BY.
        metrics = failure.performance_metrics_at_failure or {}
        performance_id = f"{failure_id}-at-failure"
        await self.repository.merge_node(
            organization_id,
            label="Performance",
            key_value=performance_id,
            properties={
                "sharpe_ratio": metrics.get("sharpe"),
                "max_drawdown": metrics.get("max_drawdown"),
                "win_rate": metrics.get("win_rate"),
                "profit_factor": None,
                "period_start": None,
                "period_end": failure_timestamp,
            },
        )
        await self.repository.merge_edge(
            organization_id,
            edge_type="CAUSED_BY",
            from_label="Failure",
            from_key=failure_id,
            to_label="Performance",
            to_key=performance_id,
        )

    async def sync_performance_node(
        self, session: AsyncSession, performance: PerformanceSnapshot
    ) -> None:
        await self._degrade_gracefully(
            "sync_performance_node", self._sync_performance_node(session, performance)
        )

    async def _sync_performance_node(
        self, session: AsyncSession, performance: PerformanceSnapshot
    ) -> None:
        organization_id = str(performance.organization_id)
        performance_id = str(performance.id)
        await self.repository.merge_node(
            organization_id,
            label="Performance",
            key_value=performance_id,
            properties={
                "sharpe_ratio": performance.sharpe_ratio,
                "max_drawdown": performance.max_drawdown,
                "win_rate": performance.win_rate,
                "profit_factor": performance.profit_factor,
                "period_start": performance.period_start.isoformat() if performance.period_start else None,
                "period_end": performance.period_end.isoformat() if performance.period_end else None,
            },
        )
        await self.repository.merge_edge(
            organization_id,
            edge_type="EVALUATED_BY",
            from_label="Strategy",
            from_key=str(performance.strategy_id),
            to_label="Performance",
            to_key=performance_id,
        )

    async def sync_research_note_node(self, session: AsyncSession, note: ResearchNote) -> None:
        await self._degrade_gracefully(
            "sync_research_note_node", self._sync_research_note_node(session, note)
        )

    async def _sync_research_note_node(self, session: AsyncSession, note: ResearchNote) -> None:
        organization_id = str(note.organization_id)
        note_id = str(note.id)
        await self.repository.merge_node(
            organization_id,
            label="ResearchNote",
            key_value=note_id,
            properties={
                "title": note.title,
                "content": note.content,
                "hypothesis": note.hypothesis,
                "method": note.method,
                "status": note.status.value,
                "tags": list(note.tags or []),
                "created_at": note.created_at.isoformat() if note.created_at else None,
                "updated_at": note.updated_at.isoformat() if note.updated_at else None,
            },
        )
        await self._ensure_researcher_node(session, note.author_user_id)
        await self.repository.merge_edge(
            organization_id,
            edge_type="AUTHORED_BY",
            from_label="ResearchNote",
            from_key=note_id,
            to_label="Researcher",
            to_key=str(note.author_user_id),
        )
        # Batch 10: a note -> its related strategies, reusing the INSPIRED_BY label
        # (per the batch's own instruction) even though Batch 7's INSPIRED_BY edge
        # runs the opposite direction (Strategy -> ResearchNote, off the single FK
        # Strategy.inspired_by_note_id). Same edge type, two directions, two distinct
        # relationships: "this strategy's origin was this note" vs. "this note calls
        # out these strategies as related" — see docs/schemas.md.
        for strategy_id in note.related_strategy_ids or []:
            await self.repository.merge_edge(
                organization_id,
                edge_type="INSPIRED_BY",
                from_label="ResearchNote",
                from_key=note_id,
                to_label="Strategy",
                to_key=str(strategy_id),
            )

    # --- Batch 30 (ADR 0009): multi-agent desk ------------------------------ #
    async def sync_agent_analysis_node(self, session: AsyncSession, analysis) -> None:
        await self._degrade_gracefully(
            "sync_agent_analysis_node", self._sync_agent_analysis_node(session, analysis)
        )

    async def _sync_agent_analysis_node(self, session: AsyncSession, analysis) -> None:
        organization_id = str(analysis.organization_id)
        analysis_id = str(analysis.id)
        await self.repository.merge_node(
            organization_id,
            label="AgentAnalysis",
            key_value=analysis_id,
            properties={
                "ticker": analysis.ticker,
                "trade_date": analysis.trade_date.isoformat(),
                "rating": analysis.rating,
                "regime_at_analysis": analysis.regime_at_analysis,
                "settled_alpha": analysis.settled_alpha,
            },
        )
        if analysis.regime_at_analysis:
            await self._ensure_regime_node(session, analysis.regime_at_analysis)
            await self.repository.merge_edge(
                organization_id,
                edge_type="ANALYZED_IN",
                from_label="AgentAnalysis",
                from_key=analysis_id,
                to_label="Regime",
                to_key=analysis.regime_at_analysis,
            )
        if analysis.requested_by_user_id is not None:
            await self._ensure_researcher_node(session, analysis.requested_by_user_id)
            await self.repository.merge_edge(
                organization_id,
                edge_type="AUTHORED_BY",
                from_label="AgentAnalysis",
                from_key=analysis_id,
                to_label="Researcher",
                to_key=str(analysis.requested_by_user_id),
            )
