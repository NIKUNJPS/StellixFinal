"""Pydantic schemas for the strategy endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.approval_record import ApprovalAction
from app.models.strategy import StrategyCreator, StrategyStatus
from app.schemas.validators import check_json_size
from app.validation.composite import ValidationClassification

# A generous cap for a free-text reason/justification/change-reason field — these
# land in Text columns (audit_log.justification, approval_records.justification,
# strategy_versions.change_reason) that are unbounded at the DB level; Batch 11's
# input-validation audit calls for a cap at the API boundary regardless.
_REASON_MAX_LENGTH = 2000


class StrategyCreateRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "SPY SMA 20/50 Crossover",
                "description": "Golden-cross momentum on SPY.",
                "symbol": "SPY",
                "parameters": {"fast": 20, "slow": 50},
                "entry_rules": {
                    "operator": "AND",
                    "conditions": [
                        {"indicator": "sma_20", "comparator": "crosses_above", "value_ref": "sma_50"}
                    ],
                },
                "exit_rules": {
                    "operator": "AND",
                    "conditions": [
                        {"indicator": "sma_20", "comparator": "crosses_below", "value_ref": "sma_50"}
                    ],
                },
                "risk_constraints": {"max_drawdown_pct": 15, "max_position_size_pct": 10, "stop_loss_pct": 5},
            }
        }
    )

    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    # Batch 26 Part B: the instrument this strategy trades — required at creation so
    # signal generation knows which symbol's bars to evaluate. Normalized to uppercase.
    symbol: str = Field(min_length=1, max_length=32)
    creator: StrategyCreator = StrategyCreator.HUMAN
    parameters: dict = Field(default_factory=dict)
    entry_rules: dict = Field(default_factory=dict)
    exit_rules: dict = Field(default_factory=dict)
    risk_constraints: dict = Field(default_factory=dict)
    parent_strategy_id: uuid.UUID | None = None
    # Batch 7: backs the Research Memory INSPIRED_BY relationship.
    inspired_by_note_id: uuid.UUID | None = None

    @field_validator("symbol")
    @classmethod
    def _normalize_symbol(cls, v: str) -> str:
        cleaned = (v or "").strip().upper()
        if not cleaned:
            raise ValueError("symbol is required")
        return cleaned

    _check_parameters_size = field_validator("parameters")(check_json_size)
    _check_entry_rules_size = field_validator("entry_rules")(check_json_size)
    _check_exit_rules_size = field_validator("exit_rules")(check_json_size)
    _check_risk_constraints_size = field_validator("risk_constraints")(check_json_size)


class StrategyUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    parameters: dict | None = None
    entry_rules: dict | None = None
    exit_rules: dict | None = None
    risk_constraints: dict | None = None
    change_reason: str | None = Field(default=None, max_length=_REASON_MAX_LENGTH)

    _check_parameters_size = field_validator("parameters")(check_json_size)
    _check_entry_rules_size = field_validator("entry_rules")(check_json_size)
    _check_exit_rules_size = field_validator("exit_rules")(check_json_size)
    _check_risk_constraints_size = field_validator("risk_constraints")(check_json_size)


class StrategySaveVersionRequest(BaseModel):
    """Batch 25: "save changes as a new version" — rules/params plus a mandatory,
    human-written reason recorded on the new StrategyVersion."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    parameters: dict | None = None
    entry_rules: dict | None = None
    exit_rules: dict | None = None
    risk_constraints: dict | None = None
    change_reason: str = Field(min_length=3, max_length=512)

    _check_parameters_size = field_validator("parameters")(check_json_size)
    _check_entry_rules_size = field_validator("entry_rules")(check_json_size)
    _check_exit_rules_size = field_validator("exit_rules")(check_json_size)
    _check_risk_constraints_size = field_validator("risk_constraints")(check_json_size)


class TransitionRequest(BaseModel):
    target_status: StrategyStatus
    reason: str | None = Field(default=None, max_length=_REASON_MAX_LENGTH)


class ApproveRequest(BaseModel):
    action: ApprovalAction
    justification: str = Field(min_length=1, max_length=_REASON_MAX_LENGTH)


class RetireRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=_REASON_MAX_LENGTH)


class BacktestRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)


class StrategyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    description: str | None
    symbol: str | None
    version: str
    creator: StrategyCreator
    created_by_user_id: uuid.UUID | None
    status: StrategyStatus
    parameters: dict
    entry_rules: dict
    exit_rules: dict
    risk_constraints: dict
    robustness_score: float | None
    regime_compatibility: dict | None
    parent_strategy_id: uuid.UUID | None
    inspired_by_note_id: uuid.UUID | None
    requires_review: bool
    created_at: datetime
    updated_at: datetime


class StrategyListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    symbol: str | None = None
    status: StrategyStatus
    creator: StrategyCreator
    # Batch 25: lets the explorer offer "delete draft" only to the draft's creator.
    created_by_user_id: uuid.UUID | None = None
    version: str
    robustness_score: float | None
    regime_compatibility: dict | None
    created_at: datetime
    updated_at: datetime


class StrategyListResponse(BaseModel):
    total: int
    count: int
    items: list[StrategyListItem]


class StrategyVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version_number: str
    parameters_snapshot: dict
    change_reason: str | None
    created_at: datetime


class VersionDiff(BaseModel):
    version_number: str
    change_reason: str | None
    created_at: datetime
    changed_keys: list[str]


class PerformanceSnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    regime_label: str
    sharpe_ratio: float | None
    max_drawdown: float | None
    win_rate: float | None
    profit_factor: float | None
    calmar_ratio: float | None
    trade_count: int
    period_start: datetime | None
    period_end: datetime | None
    # Batch 12
    sortino_ratio: float | None
    beta_vs_benchmark: float | None
    annualized_return: float | None
    volatility: float | None


class StrategyDetailResponse(BaseModel):
    strategy: StrategyRead
    versions: list[StrategyVersionRead]
    performance: list[PerformanceSnapshotRead]


class BacktestEnqueuedResponse(BaseModel):
    strategy_id: uuid.UUID
    symbol: str
    message: str
    task_id: str | None = None


class ValidateRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)


class ValidateEnqueuedResponse(BaseModel):
    strategy_id: uuid.UUID
    symbol: str
    message: str
    task_id: str | None = None


class ValidationResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    strategy_id: uuid.UUID
    walk_forward_score: float | None
    regime_cv_score: float | None
    monte_carlo_score: float | None
    persistence_score: float | None
    stress_test_score: float | None
    composite_score: float
    classification: ValidationClassification
    method_details: dict
    created_at: datetime


class MonteCarloDistributionResponse(BaseModel):
    strategy_id: uuid.UUID
    n_simulations: int
    tolerance: float | None
    p95_drawdown: float | None
    median_sharpe: float | None
    sharpe_hist: dict
    drawdown_hist: dict


# --------------------------------------------------------------------------- #
# Page 13 (Backtest Results) — Batch 12
# --------------------------------------------------------------------------- #
class TradeRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entry_timestamp: datetime
    exit_timestamp: datetime
    direction: str
    entry_price: float
    exit_price: float
    pnl: float
    return_pct: float
    regime_at_entry: str | None


class BacktestChartPoint(BaseModel):
    timestamp: str
    value: float | None


class BacktestChartSeries(BaseModel):
    equity_curve: list[BacktestChartPoint]
    drawdown_series: list[BacktestChartPoint]
    rolling_sharpe: list[BacktestChartPoint]


class BacktestResultsResponse(BaseModel):
    strategy_id: uuid.UUID
    has_run: bool
    aggregate: PerformanceSnapshotRead | None
    per_regime: list[PerformanceSnapshotRead]
    trades: list[TradeRecordRead]
    charts: BacktestChartSeries | None


class TopPerformerItem(BaseModel):
    strategy_id: uuid.UUID
    name: str
    sharpe_ratio: float | None
    robustness_score: float | None
    equity_curve: list[BacktestChartPoint]


class TopPerformersResponse(BaseModel):
    items: list[TopPerformerItem]
