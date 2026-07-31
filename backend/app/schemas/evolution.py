"""Pydantic schemas for the evolution endpoints (Batch 8)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.evolution_run import EvolutionRunStatus

# A GA run over a huge seed population or generation count is a genuine resource
# DoS on a shared server, not just an abuse-hardening nicety — cap list/int inputs
# to something far beyond any real research use case.
_MAX_SEED_STRATEGIES = 500


class GAConfigOverrides(BaseModel):
    """Mirrors app/evolution/ga.py's GAConfig fields exactly, all optional
    (only a field the caller actually sets should override GAConfig's own
    default) — replaces a raw ``dict`` so every knob gets an explicit type and a
    real-world-meaningful bound instead of being unpacked straight into the
    dataclass constructor (previously: a bad key wouldn't 422, it would 500)."""

    population_size: int | None = Field(default=None, ge=1, le=500)
    max_generations: int | None = Field(default=None, ge=1, le=500)
    crossover_prob: float | None = Field(default=None, ge=0.0, le=1.0)
    crossover_indpb: float | None = Field(default=None, ge=0.0, le=1.0)
    mutation_prob: float | None = Field(default=None, ge=0.0, le=1.0)
    mutation_indpb: float | None = Field(default=None, ge=0.0, le=1.0)
    sigma_base: float | None = Field(default=None, ge=0.0, le=10.0)
    elitism_fraction: float | None = Field(default=None, ge=0.0, le=1.0)
    tournament_size: int | None = Field(default=None, ge=1, le=100)
    plateau_generations: int | None = Field(default=None, ge=1, le=500)
    convergence_window: int | None = Field(default=None, ge=1, le=500)
    convergence_threshold_pct: float | None = Field(default=None, ge=0.0, le=100.0)


class EvolutionRunRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    strategy_ids: list[uuid.UUID] | Literal["all"] = "all"
    ga_config: GAConfigOverrides = Field(default_factory=GAConfigOverrides)

    @field_validator("strategy_ids")
    @classmethod
    def _cap_seed_count(cls, v: list[uuid.UUID] | Literal["all"]):
        if isinstance(v, list) and len(v) > _MAX_SEED_STRATEGIES:
            raise ValueError(f"strategy_ids: at most {_MAX_SEED_STRATEGIES} may be provided")
        return v


class EvolutionRunEnqueued(BaseModel):
    run_id: uuid.UUID
    message: str
    task_id: str | None = None


class GenerationRecordRead(BaseModel):
    generation: int
    best_fitness: float
    avg_fitness: float
    sigma: float


class EvolutionRunSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    symbol: str
    status: EvolutionRunStatus
    best_fitness: float | None
    generations_run: int
    candidate_count: int
    created_at: datetime


class EvolutionRunListResponse(BaseModel):
    total: int
    items: list[EvolutionRunSummary]


class EvolutionRunDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    symbol: str
    status: EvolutionRunStatus
    ga_config: dict
    seed_strategy_ids: list[str]
    generation_history: list[GenerationRecordRead]
    best_fitness: float | None
    generations_run: int
    candidate_strategy_ids: list[str]
    error: str | None
    created_at: datetime


class PendingCandidate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    parent_strategy_id: uuid.UUID | None
    robustness_score: float | None
    regime_compatibility: dict | None
    created_at: datetime


class PendingCandidatesResponse(BaseModel):
    items: list[PendingCandidate]


class CandidateDecisionRequest(BaseModel):
    justification: str = Field(min_length=1, max_length=2000)
