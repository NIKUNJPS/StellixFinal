"""KillSwitchReview — CIO oversight of an emergency kill (Batch 25).

The kill itself stays instant (risk mitigation must never wait for a second
signature): the strategy is RETIRED in the same transaction that creates this row.
What this record adds is the *second* half of a dual-approval control — a CIO must
review every kill made by someone other than a CIO within ``REVIEW_WINDOW``.

Deliberately its own table rather than columns on ``strategies`` or ``audit_log``:
``audit_log`` is append-only (UPDATE revoked in migration 0010), and a strategy can in
principle be killed more than once over its life, so review state needs its own row
per kill. Acknowledging a review never reverses the kill — reactivation still means a
brand-new draft → candidate → active run through the normal state machine.

Field mapping to the Batch 25 brief (prefix dropped — the table already says
"kill switch"): ``kill_switch_triggered_by`` → ``triggered_by_user_id``,
``kill_switch_reason`` → ``reason``, ``kill_switch_review_deadline`` →
``review_deadline``, ``kill_switch_reviewed_by_cio`` → ``reviewed_by_user_id``.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.tenant import TenantScopedModel

# How long a CIO has to review a non-CIO kill before it is flagged overdue. Also the
# minimum window a killed strategy must stay visible in normal strategy views.
REVIEW_WINDOW = timedelta(days=14)


class KillSwitchReview(Base, UUIDPrimaryKeyMixin, TenantScopedModel, TimestampMixin):
    __tablename__ = "kill_switch_reviews"

    strategy_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("strategies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    triggered_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Role at the moment of the kill — decides whether a review is owed at all, and
    # must not change retroactively if the user's role changes later.
    triggered_by_role: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status_before_kill: Mapped[str] = mapped_column(String(16), nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    review_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # True when a CIO pulled the switch themselves: they ARE the reviewing authority.
    is_self_reviewed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
