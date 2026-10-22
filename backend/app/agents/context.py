"""Stellix context injected into TradingAgents — regime, evidence, failures, lessons.

This is where the two systems meet. TradingAgents' agents reason from market data,
news, sentiment and fundamentals; Stellix adds what only an institutional memory has:

* **Regime (Pillar 1)** — the ensemble regime for the ticker on the trade date, its
  confidence, and the recent regime path.
* **Strategy evidence** — how the org's own strategies on this symbol performed *per
  regime* (Sharpe from ``regime_compatibility``), and their validated robustness.
* **Failures (Pillar 2)** — this symbol's recorded strategy failures, and which failure
  triggers recur org-wide in the current regime.
* **Lessons (Pillar 3)** — settled past desk calls on this ticker, plus settled calls on
  other tickers *made in the same regime*, each with realised alpha and its reflection.

Everything is **point-in-time**: a run dated D sees only what was knowable on D (regime
rows <= D, failures <= D, strategies created <= D, lessons whose outcome resolved
before D). This is what makes the agent backtest honest — without it, a historical run
would be told how its own future turned out.

The regime/evidence block goes into TradingAgents' ``instrument_context`` (read by every
agent); the lessons go into ``past_context`` (read by the Portfolio Manager), replacing
TradingAgents' local markdown decision log.
"""

from __future__ import annotations

import uuid
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_analysis import AgentAnalysis, AgentRunStatus
from app.models.failure import Failure
from app.models.regime_label import RegimeLabelRecord
from app.models.strategy import Strategy, StrategyStatus

_REGIME_PATH_BARS = 90
_MAX_SEGMENTS = 5
_MAX_STRATEGIES = 8
_MAX_FAILURES = 5
_MAX_SAME_TICKER_LESSONS = 5
_MAX_SAME_REGIME_LESSONS = 3


@dataclass
class DeskContext:
    regime: str | None = None
    regime_confidence: float | None = None
    regime_as_of: str | None = None
    regime_path: list[dict] = field(default_factory=list)
    strategies: list[dict] = field(default_factory=list)
    failures: list[dict] = field(default_factory=list)
    regime_failure_triggers: list[dict] = field(default_factory=list)
    lessons_same_ticker: list[dict] = field(default_factory=list)
    lessons_same_regime: list[dict] = field(default_factory=list)
    instrument_text: str = ""
    past_context_text: str = ""

    def as_record(self) -> dict:
        """Everything injected, verbatim — stored on the analysis for audit."""
        return {
            "regime": self.regime,
            "regime_confidence": self.regime_confidence,
            "regime_as_of": self.regime_as_of,
            "regime_path": self.regime_path,
            "strategies": self.strategies,
            "failures": self.failures,
            "regime_failure_triggers": self.regime_failure_triggers,
            "lessons_same_ticker": self.lessons_same_ticker,
            "lessons_same_regime": self.lessons_same_regime,
            "instrument_text": self.instrument_text,
            "past_context_text": self.past_context_text,
        }


def _end_of_day(d: date) -> datetime:
    return datetime.combine(d, time.max, tzinfo=UTC)


def _label(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _segments(rows: list[RegimeLabelRecord]) -> list[dict]:
    """Collapse per-bar labels (oldest first) into contiguous regime segments."""
    segments: list[dict] = []
    for row in rows:
        label = _label(row.regime_label)
        day = row.timestamp.date().isoformat()
        if segments and segments[-1]["regime"] == label:
            segments[-1]["end"] = day
            segments[-1]["bars"] += 1
        else:
            segments.append({"regime": label, "start": day, "end": day, "bars": 1})
    return segments[-_MAX_SEGMENTS:]


async def _regime(session: AsyncSession, ticker: str, trade_date: date, ctx: DeskContext) -> None:
    rows = (
        await session.execute(
            select(RegimeLabelRecord)
            .where(RegimeLabelRecord.symbol == ticker, RegimeLabelRecord.timestamp <= _end_of_day(trade_date))
            .order_by(RegimeLabelRecord.timestamp.desc())
            .limit(_REGIME_PATH_BARS)
        )
    ).scalars().all()
    if not rows:
        return
    latest = rows[0]
    ctx.regime = _label(latest.regime_label)
    ctx.regime_confidence = latest.confidence_score
    ctx.regime_as_of = latest.timestamp.date().isoformat()
    ctx.regime_path = _segments(list(reversed(rows)))


async def _strategies(session: AsyncSession, ticker: str, trade_date: date, ctx: DeskContext) -> None:
    rows = (
        await session.execute(
            select(Strategy)
            .where(
                Strategy.symbol == ticker,
                Strategy.status != StrategyStatus.DRAFT,
                Strategy.created_at <= _end_of_day(trade_date),
            )
            .order_by(Strategy.robustness_score.desc().nulls_last())
            .limit(_MAX_STRATEGIES)
        )
    ).scalars().all()
    for s in rows:
        compat = s.regime_compatibility or {}
        ctx.strategies.append(
            {
                "name": s.name,
                "status": _label(s.status),
                "robustness_score": s.robustness_score,
                "sharpe_in_current_regime": compat.get(ctx.regime) if ctx.regime else None,
                "sharpe_by_regime": compat,
            }
        )


async def _failures(session: AsyncSession, ticker: str, trade_date: date, ctx: DeskContext) -> None:
    cutoff = _end_of_day(trade_date)
    rows = (
        await session.execute(
            select(Failure, Strategy.name)
            .join(Strategy, Strategy.id == Failure.strategy_id)
            .where(Strategy.symbol == ticker, Failure.failure_timestamp <= cutoff)
            .order_by(Failure.failure_timestamp.desc())
            .limit(_MAX_FAILURES)
        )
    ).all()
    for failure, name in rows:
        ctx.failures.append(
            {
                "strategy": name,
                "regime": failure.regime_at_failure,
                "trigger": _label(failure.trigger_condition),
                "at": failure.failure_timestamp.date().isoformat(),
                "explanation": (failure.llm_generated_explanation or "")[:400] or None,
            }
        )
    if ctx.regime:
        triggers = (
            await session.execute(
                select(Failure.trigger_condition).where(
                    Failure.regime_at_failure == ctx.regime, Failure.failure_timestamp <= cutoff
                )
            )
        ).scalars().all()
        ctx.regime_failure_triggers = [
            {"trigger": _label(t), "count": n} for t, n in Counter(triggers).most_common(3)
        ]


def _lesson(a: AgentAnalysis) -> dict:
    return {
        "ticker": a.ticker,
        "trade_date": a.trade_date.isoformat(),
        "regime": a.regime_at_analysis,
        "rating": a.rating,
        "raw_return": a.settled_raw_return,
        "alpha": a.settled_alpha,
        "benchmark": a.benchmark,
        "holding_days": a.holding_days,
        "reflection": a.settled_reflection,
    }


async def _lessons(
    session: AsyncSession, ticker: str, trade_date: date, ctx: DeskContext, exclude_id: uuid.UUID | None
) -> None:
    # Strictly before trade_date: an outcome resolving ON the trade date is not yet
    # known when the analysis is made (TradingAgents #1251 semantics).
    base = select(AgentAnalysis).where(
        AgentAnalysis.status == AgentRunStatus.COMPLETED,
        AgentAnalysis.settled_resolution_date.is_not(None),
        AgentAnalysis.settled_resolution_date < trade_date,
    )
    if exclude_id is not None:
        base = base.where(AgentAnalysis.id != exclude_id)
    same_ticker = (
        await session.execute(
            base.where(AgentAnalysis.ticker == ticker)
            .order_by(AgentAnalysis.trade_date.desc())
            .limit(_MAX_SAME_TICKER_LESSONS)
        )
    ).scalars().all()
    ctx.lessons_same_ticker = [_lesson(a) for a in same_ticker]
    if ctx.regime:
        same_regime = (
            await session.execute(
                base.where(AgentAnalysis.ticker != ticker, AgentAnalysis.regime_at_analysis == ctx.regime)
                .order_by(AgentAnalysis.trade_date.desc())
                .limit(_MAX_SAME_REGIME_LESSONS)
            )
        ).scalars().all()
        ctx.lessons_same_regime = [_lesson(a) for a in same_regime]


def _pct(x: float | None) -> str:
    return "n/a" if x is None else f"{x:+.1%}"


def _num(x: float | None, fmt: str = "{:.2f}") -> str:
    return "n/a" if x is None else fmt.format(x)


def render_instrument_text(ctx: DeskContext, ticker: str, trade_date: date) -> str:
    lines = [f"STELLIX INSTITUTIONAL CONTEXT for {ticker} (point-in-time as of {trade_date.isoformat()}):"]
    if ctx.regime:
        lines.append(
            f"- Market regime (Stellix 4-model ensemble: HMM, GMM, PELT, GARCH): {ctx.regime} "
            f"(confidence {_num(ctx.regime_confidence)}, label dated {ctx.regime_as_of})."
        )
        if ctx.regime_path:
            path = " -> ".join(f"{s['regime']} ({s['start']}..{s['end']})" for s in ctx.regime_path)
            lines.append(f"- Recent regime path: {path}.")
        lines.append(
            "- Condition your analysis on this regime: say how the regime changes the "
            "weight you put on momentum, mean reversion, volatility and downside risk."
        )
    else:
        lines.append("- No Stellix regime label exists for this ticker on or before this date.")
    if ctx.strategies:
        lines.append("- This organization's systematic strategies on this symbol (validated robustness, Sharpe by regime):")
        for s in ctx.strategies:
            here = f", Sharpe in {ctx.regime}: {_num(s['sharpe_in_current_regime'])}" if ctx.regime else ""
            lines.append(f"  * {s['name']} [{s['status']}] robustness {_num(s['robustness_score'], '{:.3f}')}{here}")
    if ctx.failures:
        lines.append("- Recorded strategy failures on this symbol (most recent first):")
        for f in ctx.failures:
            lines.append(f"  * {f['at']}: {f['strategy']} failed ({f['trigger']}) in {f['regime']}")
    if ctx.regime_failure_triggers:
        trig = ", ".join(f"{t['trigger']} x{t['count']}" for t in ctx.regime_failure_triggers)
        lines.append(f"- Failure modes that recur org-wide in {ctx.regime}: {trig}.")
    return "\n".join(lines)


def render_past_context(ctx: DeskContext) -> str:
    if not ctx.lessons_same_ticker and not ctx.lessons_same_regime:
        return ""
    lines = ["STELLIX COMPOUNDING MEMORY — settled past desk calls (outcomes known before this date):"]

    def _fmt(lesson: dict) -> str:
        head = (
            f"{lesson['ticker']} {lesson['trade_date']} [{lesson['regime'] or 'no regime'}] "
            f"rated {lesson['rating']}: raw {_pct(lesson['raw_return'])}, alpha vs "
            f"{lesson['benchmark']} {_pct(lesson['alpha'])} over {lesson['holding_days']} days."
        )
        return f"- {head} Lesson: {lesson['reflection']}" if lesson["reflection"] else f"- {head}"

    if ctx.lessons_same_ticker:
        lines.append("Same ticker:")
        lines.extend(_fmt(x) for x in ctx.lessons_same_ticker)
    if ctx.lessons_same_regime:
        lines.append(f"Other tickers, same regime ({ctx.regime}):")
        lines.extend(_fmt(x) for x in ctx.lessons_same_regime)
    return "\n".join(lines)


async def build_desk_context(
    session: AsyncSession, *, ticker: str, trade_date: date, exclude_analysis_id: uuid.UUID | None = None
) -> DeskContext:
    ctx = DeskContext()
    await _regime(session, ticker, trade_date, ctx)
    await _strategies(session, ticker, trade_date, ctx)
    await _failures(session, ticker, trade_date, ctx)
    await _lessons(session, ticker, trade_date, ctx, exclude_analysis_id)
    ctx.instrument_text = render_instrument_text(ctx, ticker, trade_date)
    ctx.past_context_text = render_past_context(ctx)
    return ctx
