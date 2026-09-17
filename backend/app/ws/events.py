"""Typed real-time event publishers (Batch 19).

Publishes to a Redis pub/sub channel, NOT directly to app.ws.manager. That is the
whole design, and it is not optional — see below.

Why Redis and not the in-process manager
----------------------------------------
``ws_manager`` is an in-memory dict scoped to one OS process. The processes that
KNOW something happened are usually not the processes HOLDING the browser sockets:

* Regime changes, failure alerts, evolution progress and backtest progress are all
  detected inside **Celery workers** (infra/k8s/celery-worker-deployment.yaml — a
  separate deployment, 1→3 replicas). A worker calling ws_manager directly would
  iterate its OWN empty connection dict, deliver to zero sockets, and — because the
  fan-out swallows per-socket errors — report success. Four of this batch's six
  event types would silently reach nobody.
* Even events raised inside the API process only reach the pod that raised them:
  infra/k8s/backend-deployment.yaml runs **replicas: 2**, so a user connected to
  pod A never sees an event published from pod B.

So publishers publish to Redis (reachable from every process, already configured),
and each API process subscribes and fans out to its own sockets (app/ws/bridge.py).
This is also why every function here is safe to call from sync Celery code via
asyncio.run: it opens a Redis connection, publishes, and returns — it never touches
a socket.

Fire-and-forget: a realtime notification is a convenience layer over data that is
already committed to Postgres. A Redis hiccup must never fail the regime detection
or the strategy transition that triggered it, so publish errors are logged and
swallowed. The UI degrades to its normal fetch-on-load path.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from app.clients import redis_client

logger = logging.getLogger(__name__)

# One channel for all realtime events. Payloads carry organization_id, and the
# bridge fans out per-org — a subscriber never delivers cross-tenant because the
# manager's only send APIs are org-keyed.
WS_CHANNEL = "stellix:ws:events"


def _now() -> str:
    return datetime.now(UTC).isoformat()


# Envelope scopes. "organization" (the default, and the only scope before Batch 25)
# is delivered to one tenant's sockets. "global" is reserved for genuinely public,
# non-tenant data — currently only market index quotes — and reaches every
# connected socket. Tenant data must never be published with the global scope.
SCOPE_ORGANIZATION = "organization"
SCOPE_GLOBAL = "global"


async def _publish_envelope(envelope: dict[str, Any], *, log_label: str) -> None:
    try:
        client = redis_client.get_client()
        await client.publish(WS_CHANNEL, json.dumps(envelope))
    except Exception:  # noqa: BLE001 — realtime is best-effort; see module docstring
        logger.warning(
            "WS publish failed for %s type=%s; event dropped",
            log_label,
            envelope["payload"].get("type"),
            exc_info=True,
        )


async def _publish(org_id: str, payload: dict[str, Any]) -> None:
    """Publish one org-scoped event envelope to Redis. Never raises."""
    await _publish_envelope(
        {"scope": SCOPE_ORGANIZATION, "organization_id": str(org_id), "payload": payload},
        log_label=f"org={org_id}",
    )


async def _publish_global(payload: dict[str, Any]) -> None:
    """Publish public, non-tenant data to every connected user. Never raises."""
    await _publish_envelope(
        {"scope": SCOPE_GLOBAL, "organization_id": None, "payload": payload}, log_label="global"
    )


async def publish_market_quotes(quotes: list[dict[str, Any]], metadata: dict[str, Any]) -> None:
    """Batch 25: refreshed global index quotes. Public data, so global scope — scoping
    it by org would be structurally wrong (every tenant sees the same market)."""
    await _publish_global({"type": "market_quotes", **metadata, "quotes": quotes, "timestamp": _now()})


async def publish_regime_change(
    org_id: str, symbol: str, old_regime: str, new_regime: str, confidence: float
) -> None:
    """Fire when regime detection finds a different regime than the stored one."""
    if new_regime == "Crisis":
        severity = "critical"
    elif new_regime in ("Bear", "High-Volatility"):
        severity = "warning"
    else:
        severity = "info"
    await _publish(
        org_id,
        {
            "type": "regime_update",
            "symbol": symbol,
            "old_regime": old_regime,
            "new_regime": new_regime,
            "confidence": round(confidence, 3),
            "severity": severity,
            "timestamp": _now(),
        },
    )


async def publish_failure_alert(
    org_id: str, failure_id: str, strategy_name: str, strategy_id: str, trigger: str
) -> None:
    await _publish(
        org_id,
        {
            "type": "failure_alert",
            "failure_id": str(failure_id),
            "strategy_name": strategy_name,
            "strategy_id": str(strategy_id),
            "trigger": trigger,
            "severity": "critical",
            "timestamp": _now(),
        },
    )


async def publish_evolution_progress(
    org_id: str,
    job_id: str,
    generation: int,
    max_generations: int,
    best_fitness: float,
    avg_fitness: float,
) -> None:
    pct = round((generation / max_generations) * 100) if max_generations else 0
    await _publish(
        org_id,
        {
            "type": "evolution_progress",
            "job_id": str(job_id),
            "generation": generation,
            "max_generations": max_generations,
            "best_fitness": round(best_fitness, 4),
            "avg_fitness": round(avg_fitness, 4),
            "pct_complete": pct,
            "timestamp": _now(),
        },
    )


async def publish_backtest_progress(
    org_id: str, backtest_id: str, pct_complete: int, status: str, current_step: str
) -> None:
    await _publish(
        org_id,
        {
            "type": "backtest_progress",
            "backtest_id": str(backtest_id),
            "pct_complete": pct_complete,
            "status": status,
            "current_step": current_step,
            "timestamp": _now(),
        },
    )


async def publish_strategy_status_change(
    org_id: str,
    strategy_id: str,
    strategy_name: str,
    old_status: str,
    new_status: str,
    changed_by_name: str,
) -> None:
    await _publish(
        org_id,
        {
            "type": "strategy_status",
            "strategy_id": str(strategy_id),
            "strategy_name": strategy_name,
            "old_status": old_status,
            "new_status": new_status,
            "changed_by": changed_by_name,
            "timestamp": _now(),
        },
    )


async def publish_approval_request(
    org_id: str,
    strategy_id: str,
    strategy_name: str,
    requested_by_name: str,
    robustness_score: float,
    approver_user_ids: list[str] | None = None,
) -> None:
    """Notify approvers that a strategy is ready for review.

    ``approver_user_ids`` narrows delivery to the users who can actually act
    (portfolio manager / CIO / admin). The spec's sketch carried a "send only to
    approver roles" comment above an unconditional org-wide broadcast; routing the
    intent through the payload keeps the manager's org-keyed contract while letting
    the bridge address specific users. Omitted/empty means org-wide — an approval
    request is not sensitive within a tenant, so a caller that has no role lookup
    handy degrades to informing everyone rather than nobody.
    """
    await _publish(
        org_id,
        {
            "type": "approval_request",
            "strategy_id": str(strategy_id),
            "strategy_name": strategy_name,
            "requested_by": requested_by_name,
            "robustness_score": round(robustness_score, 3),
            "message": "Strategy ready for review",
            "target_user_ids": [str(u) for u in approver_user_ids] if approver_user_ids else None,
            "timestamp": _now(),
        },
    )
