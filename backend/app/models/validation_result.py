"""ValidationResult — the 5-method validation breakdown + composite (Batch 5)."""

from __future__ import annotations

import uuid

from sqlalchemy import JSON, Enum, Float, ForeignKey, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel
from app.validation.composite import ValidationClassification

_JSONB = JSON().with_variant(JSONB(), "postgresql")


class ValidationResult(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "validation_results"

    strategy_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("strategies.id", ondelete="CASCADE"), nullable=False, index=True
    )

    walk_forward_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    regime_cv_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    monte_carlo_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    persistence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    stress_test_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # NULL = N/A

    composite_score: Mapped[float] = mapped_column(Float, nullable=False)
    classification: Mapped[ValidationClassification] = mapped_column(
        Enum(
            ValidationClassification,
            name="validation_classification",
            native_enum=True,
            values_callable=lambda enum_cls: [m.value for m in enum_cls],
        ),
        nullable=False,
    )
    # Fold-by-fold, per-regime, and simulation details for the UI to render.
    method_details: Mapped[dict] = mapped_column(_JSONB, nullable=False, default=dict)
