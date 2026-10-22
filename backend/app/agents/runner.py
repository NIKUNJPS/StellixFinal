"""TradingAgents adapter — builds and drives the multi-agent LangGraph pipeline.

Why this drives the graph itself instead of calling ``TradingAgentsGraph.propagate``:
``propagate`` settles and writes TradingAgents' own markdown decision log and a JSON
state file under ``~/.tradingagents``. In Stellix, memory lives in tenant-scoped
Postgres (Pillar 3), so the adapter uses the same building blocks ``propagate`` uses
(``Propagator.create_initial_state``, the compiled ``graph``, ``run_config``) but:

* injects Stellix's point-in-time ``past_context`` (lessons) and appends the regime /
  evidence block to the deterministic ``instrument_context`` every agent reads;
* streams node-by-node updates (``stream_mode="updates"``) so each finished agent is
  reported as a progress stage;
* passes the audit callback in the graph run config so every model call is captured.

Synchronous and blocking by nature (LangGraph + LLM calls) — the service runs it in a
worker thread inside a Celery task, never on a request path.
"""

from __future__ import annotations

import copy
import os
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from app.agents.redaction import redact_reports
from app.core.config import settings

ANALYST_KEYS: tuple[str, ...] = ("market", "social", "news", "fundamentals")
CRYPTO_SUFFIXES = ("-USD", "-USDT", "-USDC", "-BTC", "-ETH")

# google/anthropic reuse the credentials the rest of the LLM layer already has; the
# env var is the one TradingAgents' LangChain client reads.
_NATIVE_KEYS: dict[str, tuple[str, str]] = {
    "google": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
    "anthropic": ("ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"),
}

# Agent nodes reported as progress stages (tool and message-clear nodes are plumbing).
PIPELINE_STAGES: tuple[str, ...] = (
    "Market Analyst",
    "Sentiment Analyst",
    "News Analyst",
    "Fundamentals Analyst",
    "Bull Researcher",
    "Bear Researcher",
    "Research Manager",
    "Trader",
    "Aggressive Analyst",
    "Conservative Analyst",
    "Neutral Analyst",
    "Portfolio Manager",
)
_ANALYST_STAGE = {
    "market": "Market Analyst",
    "social": "Sentiment Analyst",
    "news": "News Analyst",
    "fundamentals": "Fundamentals Analyst",
}


class DeskNotConfigured(RuntimeError):
    """The configured provider has no API key — the deferred-credential 503."""


@dataclass(frozen=True)
class DeskSettings:
    provider: str
    deep_model: str
    quick_model: str
    max_debate_rounds: int
    max_risk_rounds: int
    holding_days: int
    data_dir: str
    backend_url: str | None = None
    output_language: str = "English"
    fundamentals_vendors: str = "yfinance"
    checkpoint_enabled: bool = False

    def snapshot(self) -> dict:
        return {
            "max_debate_rounds": self.max_debate_rounds,
            "max_risk_discuss_rounds": self.max_risk_rounds,
            "holding_period_days": self.holding_days,
            "output_language": self.output_language,
            "fundamental_data": self.fundamentals_vendors,
            "backend_url": self.backend_url,
            "jev_screening": bool(settings.TYPESAFE_API_KEY),
        }

    def signature(self, selected_analysts: list[str], portfolio_fingerprint: str) -> str:
        """Everything that shapes the graph or its prompts. A retry under a changed
        signature starts fresh instead of resuming a checkpoint made under another."""
        return "|".join(
            [
                "analysts=" + ",".join(selected_analysts),
                f"debate={self.max_debate_rounds}",
                f"risk={self.max_risk_rounds}",
                f"llm={self.provider}:{self.deep_model}:{self.quick_model}",
                f"lang={self.output_language}",
                f"fund={self.fundamentals_vendors}",
                f"portfolio={portfolio_fingerprint}",
            ]
        )


def desk_settings(output_language: str | None = None) -> DeskSettings:
    return DeskSettings(
        provider=settings.AGENTS_LLM_PROVIDER.strip().lower(),
        deep_model=settings.AGENTS_DEEP_MODEL,
        quick_model=settings.AGENTS_QUICK_MODEL,
        max_debate_rounds=settings.AGENTS_MAX_DEBATE_ROUNDS,
        max_risk_rounds=settings.AGENTS_MAX_RISK_ROUNDS,
        holding_days=settings.AGENTS_HOLDING_DAYS,
        data_dir=settings.AGENTS_DATA_DIR,
        backend_url=(settings.AGENTS_LLM_BACKEND_URL or None),
        output_language=(output_language or settings.AGENTS_OUTPUT_LANGUAGE or "English").strip(),
        fundamentals_vendors=settings.AGENTS_FUNDAMENTALS_VENDORS,
        checkpoint_enabled=settings.AGENTS_CHECKPOINT_ENABLED,
    )


def supported_providers() -> list[str]:
    """Every TradingAgents provider the desk can drive with Stellix settings alone.
    (azure and bedrock need their own credential files/chains and are not exposed.)"""
    from tradingagents.llm_clients.openai_client import OPENAI_COMPATIBLE_PROVIDERS

    return sorted({*_NATIVE_KEYS, *OPENAI_COMPATIBLE_PROVIDERS})


def _provider_spec(provider: str):
    from tradingagents.llm_clients.openai_client import OPENAI_COMPATIBLE_PROVIDERS

    return OPENAI_COMPATIBLE_PROVIDERS.get(provider)


def _key_env_var(provider: str) -> str | None:
    if provider in _NATIVE_KEYS:
        return _NATIVE_KEYS[provider][1]
    from tradingagents.llm_clients.api_key_env import get_api_key_env

    return get_api_key_env(provider)


def provider_api_key(provider: str) -> str | None:
    if provider in _NATIVE_KEYS:
        return getattr(settings, _NATIVE_KEYS[provider][0], None)
    env_var = _key_env_var(provider)
    return settings.AGENTS_LLM_API_KEY or (os.environ.get(env_var) if env_var else None)


def not_configured_reason(desk: DeskSettings | None = None) -> str | None:
    desk = desk or desk_settings()
    if desk.provider not in supported_providers():
        return (
            f"AGENTS_LLM_PROVIDER={desk.provider!r} is not supported. "
            f"Use one of: {', '.join(supported_providers())}."
        )
    spec = _provider_spec(desk.provider)
    if spec is not None and spec.require_base_url and not desk.backend_url:
        return f"AGENTS_LLM_BACKEND_URL is required for the {desk.provider!r} provider."
    if provider_api_key(desk.provider) or (spec is not None and spec.key_optional):
        return None
    if desk.provider in _NATIVE_KEYS:
        return f"{_NATIVE_KEYS[desk.provider][0]} is not set, so the multi-agent desk is unavailable."
    return f"AGENTS_LLM_API_KEY is not set for the {desk.provider!r} provider, so the desk is unavailable."


def is_configured(desk: DeskSettings | None = None) -> bool:
    return not_configured_reason(desk) is None


def normalize_ticker(raw: str) -> str:
    """Canonical Yahoo symbol via TradingAgents' own resolver (BTCUSD -> BTC-USD)."""
    from tradingagents.dataflows.symbols import normalize_symbol

    try:
        return normalize_symbol(raw)
    except Exception:  # noqa: BLE001 — fall back to plain upper-case, as the TA CLI does
        return raw.strip().upper()


def asset_type_for(ticker: str) -> str:
    return "crypto" if ticker.upper().endswith(CRYPTO_SUFFIXES) else "stock"


def analysts_for(selected: list[str], asset_type: str) -> list[str]:
    """Canonical order; crypto has no company fundamentals (TradingAgents CLI rule)."""
    chosen = [k for k in ANALYST_KEYS if k in set(selected)]
    if asset_type == "crypto":
        chosen = [k for k in chosen if k != "fundamentals"]
    return chosen


def expected_stages(selected_analysts: list[str]) -> list[str]:
    return [_ANALYST_STAGE[k] for k in selected_analysts] + list(PIPELINE_STAGES[4:])


def validate_portfolio(portfolio: dict | None) -> dict | None:
    """Validate a book with TradingAgents' own PortfolioContext. None stays None:
    no context is not the same as a flat book."""
    if portfolio is None:
        return None
    from tradingagents.portfolio import PortfolioContext

    return PortfolioContext.model_validate(portfolio).model_dump()


def _portfolio(portfolio: dict | None):
    if portfolio is None:
        return None
    from tradingagents.portfolio import PortfolioContext

    return PortfolioContext.model_validate(portfolio)


def build_ta_config(desk: DeskSettings) -> dict[str, Any]:
    from tradingagents.default_config import DEFAULT_CONFIG

    config = copy.deepcopy(DEFAULT_CONFIG)
    base = Path(desk.data_dir).resolve()
    config["data_vendors"] = {**config["data_vendors"], "fundamental_data": desk.fundamentals_vendors}
    config.update(
        {
            "llm_provider": desk.provider,
            "deep_think_llm": desk.deep_model,
            "quick_think_llm": desk.quick_model,
            "backend_url": desk.backend_url,
            "output_language": desk.output_language,
            "max_debate_rounds": desk.max_debate_rounds,
            "max_risk_discuss_rounds": desk.max_risk_rounds,
            "holding_period_days": desk.holding_days,
            # The adapter checkpoints per analysis itself (see run_pipeline).
            "checkpoint_enabled": False,
            "results_dir": str(base / "results"),
            "data_cache_dir": str(base / "cache"),
            # Unused (Stellix memory replaces it) but TradingAgentsGraph opens it.
            "memory_log_path": str(base / "memory" / "unused_trading_memory.md"),
        }
    )
    return config


def _export_environment(desk: DeskSettings) -> None:
    """TradingAgents reads provider keys, SEC's contact and Jev's key from the
    environment; pydantic-settings does not export .env values, so do it here."""
    reason = not_configured_reason(desk)
    if reason:
        raise DeskNotConfigured(reason)
    key, env_var = provider_api_key(desk.provider), _key_env_var(desk.provider)
    if key and env_var:
        os.environ[env_var] = key
    for name in ("SEC_EDGAR_USER_AGENT", "TYPESAFE_API_KEY", "TYPESAFE_DEFAULT_MODEL"):
        value = getattr(settings, name, None)
        if value:
            os.environ[name] = value


def checkpoint_dir(desk: DeskSettings, analysis_id: str) -> Path:
    """One directory per analysis: TradingAgents keys its checkpoint threads by
    ticker + date only, so a shared directory would let one tenant's run resume
    another tenant's saved state."""
    return Path(desk.data_dir).resolve() / "runs" / analysis_id


def clear_checkpoint_dir(desk: DeskSettings, analysis_id: str) -> None:
    import shutil

    shutil.rmtree(checkpoint_dir(desk, analysis_id), ignore_errors=True)


def create_graph(selected_analysts: list[str], ta_config: dict[str, Any]):
    """Test seam: tests replace this with a fake graph of the same shape."""
    from tradingagents.graph.trading_graph import TradingAgentsGraph

    return TradingAgentsGraph(selected_analysts=tuple(selected_analysts), config=ta_config)


@dataclass
class PipelineResult:
    final_state: dict[str, Any]
    stages: list[str] = field(default_factory=list)
    resumed: bool = False


def run_pipeline(
    *,
    desk: DeskSettings,
    ticker: str,
    trade_date: date,
    asset_type: str,
    selected_analysts: list[str],
    stellix_instrument_text: str,
    past_context_text: str,
    callbacks: list[Any],
    on_stage: Callable[[str], None],
    portfolio: dict | None = None,
    analysis_id: str | None = None,
) -> PipelineResult:
    """Run the full TradingAgents pipeline once. Blocking; call from a worker thread.

    With checkpointing on, LangGraph saves state after every node into this
    analysis's own SQLite file; a retry of the same analysis under the same
    signature resumes from the last finished agent.
    """
    from tradingagents.dataflows.config import run_config

    _export_environment(desk)
    ta_config = build_ta_config(desk)
    graph = create_graph(selected_analysts, ta_config)
    book = _portfolio(portfolio)

    with run_config(ta_config):
        # Deterministic company identity (TradingAgents #814), then Stellix's block.
        identity = graph.resolve_instrument_context(ticker, asset_type, trade_date.isoformat())
        instrument = f"{identity}\n\n{stellix_instrument_text}".strip()
        state = graph.propagator.create_initial_state(
            ticker,
            trade_date.isoformat(),
            asset_type=asset_type,
            past_context=past_context_text,
            instrument_context=instrument,
            portfolio_context=book.render(ticker) if book is not None else "",
        )
        args = graph.propagator.get_graph_args(callbacks=callbacks)
        args["stream_mode"] = "updates"

        def _drive(compiled, graph_input) -> tuple[dict[str, Any], list[str]]:
            final: dict[str, Any] = dict(state)
            stages: list[str] = []
            for chunk in compiled.stream(graph_input, **args):
                for node, delta in (chunk or {}).items():
                    if isinstance(delta, dict):
                        final.update({k: v for k, v in delta.items() if k != "messages"})
                    if node in PIPELINE_STAGES:
                        stages.append(node)
                        on_stage(node)
            return final, stages

        if not (desk.checkpoint_enabled and analysis_id):
            final, stages = _drive(graph.graph, state)
            return PipelineResult(final_state=final, stages=stages)

        from tradingagents.graph.checkpointer import get_checkpointer, thread_id

        signature = desk.signature(selected_analysts, book.fingerprint() if book is not None else "none")
        thread = {"configurable": {"thread_id": thread_id(ticker, trade_date.isoformat(), signature)}}
        args["config"] = {**args.get("config", {}), **thread}
        with get_checkpointer(checkpoint_dir(desk, analysis_id), ticker) as saver:
            compiled = graph.workflow.compile(checkpointer=saver)
            resumed = saver.get_tuple(thread) is not None
            # None resumes the saved thread; re-sending the state would duplicate
            # messages through the reducer (TradingAgents #1249).
            _partial, stages = _drive(compiled, None if resumed else state)
            # The checkpoint holds every node's output, including ones that ran in an
            # earlier attempt; the streamed deltas alone would miss those.
            final = dict(compiled.get_state(thread).values)
        return PipelineResult(final_state=final, stages=stages, resumed=resumed)


# --------------------------------------------------------------------------- outcome
_TRADER_ACTION = re.compile(r"FINAL TRANSACTION PROPOSAL:\s*\**\s*(BUY|HOLD|SELL)", re.IGNORECASE)


def _field(text: str, label: str) -> str | None:
    match = re.search(rf"\*\*{re.escape(label)}\*\*:\s*(.+)", text or "")
    if not match:
        return None
    value = match.group(1).strip()
    return None if value.lower() in {"not provided", "none", "n/a", ""} else value[:128]


@dataclass
class Outcome:
    rating: str
    trader_action: str | None
    time_horizon: str | None
    position_sizing: str | None
    reports: dict[str, Any]


def extract_outcome(final_state: dict[str, Any]) -> Outcome:
    from tradingagents.agents.rating import parse_rating

    decision = final_state.get("final_trade_decision") or ""
    trader_plan = final_state.get("trader_investment_plan") or ""
    action = _TRADER_ACTION.search(trader_plan)
    invest = final_state.get("investment_debate_state") or {}
    risk = final_state.get("risk_debate_state") or {}
    reports = {
        "market_report": final_state.get("market_report") or "",
        "sentiment_report": final_state.get("sentiment_report") or "",
        "news_report": final_state.get("news_report") or "",
        "fundamentals_report": final_state.get("fundamentals_report") or "",
        "investment_plan": final_state.get("investment_plan") or "",
        "trader_investment_plan": trader_plan,
        "final_trade_decision": decision,
        "investment_debate": {
            "bull_history": invest.get("bull_history", ""),
            "bear_history": invest.get("bear_history", ""),
            "judge_decision": invest.get("judge_decision", ""),
        },
        "risk_debate": {
            "aggressive_history": risk.get("aggressive_history", ""),
            "conservative_history": risk.get("conservative_history", ""),
            "neutral_history": risk.get("neutral_history", ""),
            "judge_decision": risk.get("judge_decision", ""),
        },
    }
    return Outcome(
        rating=parse_rating(decision),
        trader_action=action.group(1).capitalize() if action else None,
        time_horizon=_field(decision, "Time Horizon"),
        position_sizing=_field(trader_plan, "Position Sizing"),
        reports=redact_reports(reports),
    )


# --------------------------------------------------------------------------- settlement
def fetch_outcome(ticker: str, trade_date: date, holding_days: int) -> tuple[str, tuple]:
    """(benchmark, (raw, alpha, days, resolution_date)) via TradingAgents' settlement."""
    from tradingagents.default_config import DEFAULT_CONFIG
    from tradingagents.graph.settlement import fetch_returns, resolve_benchmark

    benchmark = resolve_benchmark(ticker, DEFAULT_CONFIG)
    return benchmark, fetch_returns(ticker, trade_date.isoformat(), holding_days, benchmark=benchmark)


def reflect(
    *, desk: DeskSettings, decision: str, raw: float, alpha: float, benchmark: str, callbacks: list[Any]
) -> str:
    """TradingAgents' Reflector on the quick model, with the audit callback attached."""
    from tradingagents.graph.reflection import Reflector
    from tradingagents.llm_clients import build_llm_kwargs, create_llm_client

    _export_environment(desk)
    config = build_ta_config(desk)
    kwargs = build_llm_kwargs(config)
    kwargs["callbacks"] = callbacks
    llm = create_llm_client(
        provider=desk.provider, model=desk.quick_model, base_url=desk.backend_url, **kwargs
    ).get_llm()
    return Reflector(llm).reflect_on_final_decision(
        final_decision=decision,
        raw_return=raw,
        alpha_return=alpha,
        benchmark_name=benchmark,
        holding_days=desk.holding_days,
    )


def grid_dates(start: date, end: date, every_n_days: int) -> list[str]:
    """TradingAgents' own backtest grid: every Nth calendar day, never past today."""
    from tradingagents.backtest import iter_grid

    return iter_grid(start.isoformat(), end.isoformat(), every_n_days)
