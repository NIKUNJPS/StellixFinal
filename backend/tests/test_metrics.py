"""Prometheus metrics (Batch 13): /metrics is live and exposes both the
automatic HTTP metrics (prometheus-fastapi-instrumentator) and the custom
business counters, and the business counters actually increment at their
real call sites (not just registered and never touched)."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from app.core.metrics import failures_detected_total, strategies_created_total
from app.db.tenant import bind_organization
from app.failure import detection
from app.models.failure import FailureTrigger
from app.models.strategy import Strategy, StrategyStatus
from app.services.failure import persist_failure

from tests.data_helpers import seed_strategy
from tests.helpers import bearer, register_org

pytestmark = pytest.mark.anyio

_VALID_ENTRY = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": "<", "value": 30}]}
_VALID_EXIT = {"operator": "AND", "conditions": [{"indicator": "rsi_14", "comparator": ">", "value": 70}]}
_RISK = {"max_drawdown_pct": 20, "max_position_size_pct": 10, "stop_loss_pct": 5}


async def test_metrics_endpoint_exposes_expected_metric_names(client):
    resp = await client.get("/metrics")
    assert resp.status_code == 200
    body = resp.text
    for name in (
        "strategies_created_total",
        "validations_run_total",
        "evolution_runs_total",
        "llm_calls_total",
        "failures_detected_total",
        "active_strategies_gauge",
        "celery_queue_pending_gauge",
        "service_health_gauge",
        "http_requests_total",  # from prometheus-fastapi-instrumentator, not hand-rolled
    ):
        assert name in body, f"{name} missing from /metrics output"


async def test_strategy_creation_increments_counter(client):
    before = strategies_created_total._value.get()

    token, _org = await register_org(client, org_name="MetricsCo", email="m@metricsco.com")
    resp = await client.post(
        "/strategies",
        json={
            "name": "Metrics Test Strategy",
            "parameters": {"rsi_period": 14},
            "entry_rules": _VALID_ENTRY,
            "exit_rules": _VALID_EXIT,
            "risk_constraints": _RISK,
        },
        headers=bearer(token),
    )
    assert resp.status_code == 201

    after = strategies_created_total._value.get()
    assert after == before + 1


async def test_failure_detection_increments_labeled_counter(client, db_session_factory):
    token, org = await register_org(client, org_name="FailMetricsCo", email="f@failmetricsco.com")
    strategy_id = await seed_strategy(
        db_session_factory, organization_id=org, status=StrategyStatus.ACTIVE, valid_rules=True
    )

    before = failures_detected_total.labels(trigger_condition=FailureTrigger.SHARPE_DECLINE.value)._value.get()

    assessment = detection.FailureAssessment(
        trigger=FailureTrigger.SHARPE_DECLINE,
        performance_metrics={"sharpe": -0.6},
        regime_at_failure="Bear",
        failure_timestamp=datetime(2024, 1, 1, tzinfo=UTC),
    )
    async with db_session_factory() as session:
        bind_organization(session.sync_session, org)
        strategy = await session.get(Strategy, strategy_id)
        await persist_failure(session, strategy=strategy, assessment=assessment)

    after = failures_detected_total.labels(trigger_condition=FailureTrigger.SHARPE_DECLINE.value)._value.get()
    assert after == before + 1
