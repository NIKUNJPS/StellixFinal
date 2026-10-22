"""Stellix Agent Desk from the terminal (Batch 30b) — the TradingAgents CLI, Stellix-aware.

TradingAgents ships an interactive CLI that runs the pipeline standalone and keeps its
memory in a local markdown file. This is its Stellix counterpart: it runs the SAME
desk service the web app runs (regime context, Postgres memory, LLM audit log,
research note, knowledge graph), in-process — no Celery worker needed — acting as a
named member of an organization whose role grants ``agents.run``.

Usage (from repo root, backend venv):

    backend/.venv/Scripts/python.exe scripts/agent_desk_cli.py status
    backend/.venv/Scripts/python.exe scripts/agent_desk_cli.py analyze NVDA --user dpark@meridian.com
    backend/.venv/Scripts/python.exe scripts/agent_desk_cli.py analyze 0700.HK --date 2026-09-01 \\
        --analysts market,news --language Chinese --portfolio my_book.json --user dpark@meridian.com
    backend/.venv/Scripts/python.exe scripts/agent_desk_cli.py retry <analysis-id> --user dpark@meridian.com
    backend/.venv/Scripts/python.exe scripts/agent_desk_cli.py backtest NVDA,AAPL --start 2026-06-01 \\
        --end 2026-08-01 --every 7 --user dpark@meridian.com
    backend/.venv/Scripts/python.exe scripts/agent_desk_cli.py settle --user dpark@meridian.com
    backend/.venv/Scripts/python.exe scripts/agent_desk_cli.py list --user dpark@meridian.com

``--portfolio`` takes the same JSON as TradingAgents' ``--portfolio`` flag:
``{"cash": 25000, "currency": "USD", "positions": [{"ticker": "NVDA", "quantity": 120, "average_price": 150}]}``.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import UTC, date, datetime
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND))
# Relative settings (AGENTS_DATA_DIR, ...) resolve exactly as they do for the API.
os.chdir(BACKEND)

try:
    from dotenv import load_dotenv

    if (BACKEND / ".env").exists():
        load_dotenv(BACKEND / ".env", override=False)
except ImportError:
    pass

import app.models  # noqa: E402,F401  (register all models)
from app.agents import runner  # noqa: E402
from app.db.session import dispose_engine, get_system_session, get_tenant_session  # noqa: E402
from app.db.tenant import mark_session_unscoped  # noqa: E402
from app.models.agent_analysis import AgentAnalysis, AgentBacktestRun  # noqa: E402
from app.models.user import User  # noqa: E402
from app.rbac.catalog import P  # noqa: E402
from app.services import agent_desk  # noqa: E402
from app.services.rbac import has_permission  # noqa: E402
from sqlalchemy import select  # noqa: E402


def _fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(2)


async def _member(email: str) -> User:
    async with get_system_session() as s:
        mark_session_unscoped(s.sync_session)
        user = (await s.execute(select(User).where(User.email == email.lower()))).scalar_one_or_none()
        if user is None or not user.is_active:
            _fail(f"no active user {email!r}")
        if not await has_permission(s, user, P.AGENTS_RUN):
            _fail(f"{email} has no agents.run permission in their organization")
        return user


def _require_configured() -> None:
    reason = runner.not_configured_reason()
    if reason:
        _fail(reason)


def _print_analysis(a: AgentAnalysis) -> None:
    print(f"\n{a.ticker} {a.trade_date}  status={a.status.value}  id={a.id}")
    print(f"  regime:  {a.regime_at_analysis or 'no label'}"
          + (f" (confidence {a.regime_confidence:.2f})" if a.regime_confidence is not None else ""))
    print(f"  rating:  {a.rating}   trader: {a.trader_action}   horizon: {a.time_horizon}")
    print(f"  models:  {a.llm_provider} {a.deep_model} / {a.quick_model}   LLM calls: {a.llm_call_count}")
    if a.error:
        print(f"  error:   {a.error}")
    decision = (a.reports or {}).get("final_trade_decision")
    if decision:
        print("\n" + decision)


async def cmd_status(_args) -> None:
    desk = runner.desk_settings()
    print(f"framework:     {agent_desk.TADESK_VERSION}")
    print(f"provider:      {desk.provider}  ({desk.deep_model} / {desk.quick_model})")
    print(f"configured:    {runner.not_configured_reason(desk) or 'yes'}")
    print(f"language:      {desk.output_language}")
    print(f"fundamentals:  {desk.fundamentals_vendors}")
    print(f"jev screening: {'on' if os.environ.get('TYPESAFE_API_KEY') or runner.settings.TYPESAFE_API_KEY else 'off'}")
    print(f"checkpoints:   {'on' if desk.checkpoint_enabled else 'off'}")
    print(f"providers:     {', '.join(runner.supported_providers())}")


async def cmd_analyze(args) -> None:
    _require_configured()
    user = await _member(args.user)
    trade_date = date.fromisoformat(args.date) if args.date else datetime.now(UTC).date()
    if trade_date > datetime.now(UTC).date():
        _fail("--date cannot be in the future")
    portfolio = json.loads(Path(args.portfolio).read_text(encoding="utf-8")) if args.portfolio else None
    async with get_tenant_session(user.organization_id) as session:
        analysis = await agent_desk.create_analysis(
            session,
            organization_id=user.organization_id,
            user_id=user.id,
            ticker=runner.normalize_ticker(args.ticker),
            trade_date=trade_date,
            selected_analysts=args.analysts.split(","),
            portfolio=portfolio,
            output_language=args.language,
        )
        print(f"running {analysis.ticker} {trade_date} ({', '.join(analysis.selected_analysts)}) ...")
        analysis = await agent_desk.run_analysis_in_session(session, analysis, interactive=True)
        _print_analysis(analysis)


async def cmd_retry(args) -> None:
    _require_configured()
    user = await _member(args.user)
    async with get_tenant_session(user.organization_id) as session:
        analysis = (
            await session.execute(select(AgentAnalysis).where(AgentAnalysis.id == args.analysis_id))
        ).scalar_one_or_none()
        if analysis is None:
            _fail("analysis not found in your organization")
        blocker = agent_desk.retry_blocker(analysis)
        if blocker:
            _fail(blocker)
        await agent_desk.mark_for_retry(session, analysis)
        analysis = await agent_desk.run_analysis_in_session(session, analysis, interactive=True)
        _print_analysis(analysis)


async def cmd_backtest(args) -> None:
    _require_configured()
    user = await _member(args.user)
    dates = runner.grid_dates(date.fromisoformat(args.start), date.fromisoformat(args.end), args.every)
    tickers = [runner.normalize_ticker(t) for t in args.tickers.split(",") if t.strip()]
    cells = len(dates) * len(tickers)
    if cells == 0:
        _fail("the grid has no dates up to today")
    if cells > runner.settings.AGENTS_BACKTEST_MAX_CELLS and not args.force:
        _fail(f"{cells} cells exceeds AGENTS_BACKTEST_MAX_CELLS; pass --force to run anyway")
    async with get_tenant_session(user.organization_id) as session:
        run = await agent_desk.create_backtest(
            session, organization_id=user.organization_id, user_id=user.id,
            tickers=tickers, trade_dates=dates, selected_analysts=args.analysts.split(","),
        )
        print(f"backtest {run.id}: {cells} cells ...")
        run = await agent_desk.run_backtest_in_session(session, run)
        print(f"status={run.status.value} completed={run.completed_cells} failed={run.failed_cells}")
        _print_summary(run.summary)


def _print_summary(summary: dict) -> None:
    print(f"\n{'regime':<18}{'rating':<13}{'n':>4}{'mean alpha':>13}{'hit rate':>11}")
    for g in summary.get("by_regime_rating", []):
        alpha = "—" if g["mean_alpha"] is None else f"{g['mean_alpha']:+.2%}"
        hit = "—" if g["hit_rate"] is None else f"{g['hit_rate']:.0%}"
        print(f"{g['regime']:<18}{g['rating']:<13}{g['n']:>4}{alpha:>13}{hit:>11}")
    print(f"scored {summary.get('scored_cells', 0)}, unscored {summary.get('unscored_cells', 0)}")


async def cmd_settle(args) -> None:
    user = await _member(args.user)
    async with get_tenant_session(user.organization_id) as session:
        print(await agent_desk.settle_org_pending(session))
        _print_summary(await agent_desk.track_record(session))


async def cmd_list(args) -> None:
    user = await _member(args.user)
    async with get_tenant_session(user.organization_id) as session:
        rows = (
            await session.execute(select(AgentAnalysis).order_by(AgentAnalysis.created_at.desc()).limit(args.limit))
        ).scalars().all()
        for a in rows:
            alpha = "pending" if a.settled_alpha is None else f"{a.settled_alpha:+.2%}"
            print(f"{a.created_at:%Y-%m-%d %H:%M}  {a.ticker:<10}{a.trade_date}  {a.status.value:<10}"
                  f"{(a.rating or '—'):<12}{(a.regime_at_analysis or '—'):<16}{alpha:<9}{a.id}")
        runs = (await session.execute(select(AgentBacktestRun).order_by(AgentBacktestRun.created_at.desc()).limit(5))).scalars().all()
        for r in runs:
            print(f"backtest {r.id}  {','.join(r.tickers)}  {r.status.value}  {r.completed_cells}/{r.total_cells}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status")
    a = sub.add_parser("analyze")
    a.add_argument("ticker")
    a.add_argument("--date")
    a.add_argument("--analysts", default="market,social,news,fundamentals")
    a.add_argument("--language")
    a.add_argument("--portfolio", help="JSON file in TradingAgents' PortfolioContext shape")
    a.add_argument("--user", required=True)
    r = sub.add_parser("retry")
    r.add_argument("analysis_id")
    r.add_argument("--user", required=True)
    b = sub.add_parser("backtest")
    b.add_argument("tickers")
    b.add_argument("--start", required=True)
    b.add_argument("--end", required=True)
    b.add_argument("--every", type=int, default=7)
    b.add_argument("--analysts", default="market,news")
    b.add_argument("--force", action="store_true")
    b.add_argument("--user", required=True)
    s = sub.add_parser("settle")
    s.add_argument("--user", required=True)
    li = sub.add_parser("list")
    li.add_argument("--limit", type=int, default=20)
    li.add_argument("--user", required=True)
    args = parser.parse_args()

    handler = {
        "status": cmd_status, "analyze": cmd_analyze, "retry": cmd_retry,
        "backtest": cmd_backtest, "settle": cmd_settle, "list": cmd_list,
    }[args.command]

    async def _run() -> None:
        try:
            await handler(args)
        finally:
            await dispose_engine()

    asyncio.run(_run())


if __name__ == "__main__":
    main()
