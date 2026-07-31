"""Structural multi-tenancy enforcement (see ADR 0002 / 0003, PROJECT_CONSTITUTION §3).

The goal: make it *structurally impossible* to write a tenant-leaking query by
accident. Two cooperating mechanisms:

1. ``TenantScopedModel`` — a declarative mixin adding the mandatory
   ``organization_id`` column (UUID, FK → ``organizations.id``, indexed,
   non-nullable). Every tenant-owned model inherits it.

2. Session-bound auto-filtering — an ``organization_id`` is bound onto the
   SQLAlchemy ``Session`` (in ``session.info``). Event listeners then:
     * inject a ``with_loader_criteria`` ``organization_id`` filter into every ORM
       SELECT that touches a ``TenantScopedModel`` (reads are auto-scoped), and
     * stamp / validate ``organization_id`` on every insert, update, and delete of a
       ``TenantScopedModel`` (writes cannot cross tenants).

   **Fail-closed:** touching a ``TenantScopedModel`` with no organization bound
   raises ``TenantContextError`` — it never silently returns or writes unscoped rows.
   This is the runtime safety net Batch 1 asks for: a query without a tenant filter
   raises rather than leaking. System-level operations that legitimately need
   unscoped access (migrations, the ``/health`` probe, login/registration before a
   tenant is known) must opt in explicitly via ``mark_session_unscoped``.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Uuid
from sqlalchemy.orm import (
    Mapped,
    ORMExecuteState,
    Session,
    declared_attr,
    mapped_column,
    with_loader_criteria,
)

# Keys used inside ``Session.info``.
ORGANIZATION_ID_KEY = "stellix_organization_id"
UNSCOPED_KEY = "stellix_unscoped"


class TenantContextError(RuntimeError):
    """Raised when tenant-scoped data is accessed without a valid tenant context.

    A fail-closed guard: it signals a programming error (a query that would have
    leaked or mis-attributed tenant data), not a user-facing condition.
    """


class TenantScopedModel:
    """Mixin marking a model as owned by exactly one organization (tenant).

    Provides the mandatory ``organization_id`` column. Presence of this mixin is what
    the enforcement listeners key on, so *every* table holding client data must use
    it.
    """

    @declared_attr
    def organization_id(cls) -> Mapped[uuid.UUID]:  # noqa: N805
        return mapped_column(
            Uuid(as_uuid=True),
            ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )


# --------------------------------------------------------------------------- #
# Session binding helpers
# --------------------------------------------------------------------------- #
def bind_organization(session: Session, organization_id: uuid.UUID) -> None:
    """Bind an organization to a session so all subsequent ORM access is auto-scoped."""
    session.info[ORGANIZATION_ID_KEY] = organization_id
    session.info.pop(UNSCOPED_KEY, None)


def mark_session_unscoped(session: Session) -> None:
    """Explicitly allow this session to touch tenant data with no organization bound.

    Reserved for system operations (migrations, health checks) and pre-auth flows
    (registration, login) where the tenant is not yet established. Using this on an
    authenticated request path that reads client data is a bug.
    """
    session.info[UNSCOPED_KEY] = True
    session.info.pop(ORGANIZATION_ID_KEY, None)


def get_bound_organization(session: Session) -> uuid.UUID | None:
    return session.info.get(ORGANIZATION_ID_KEY)


def _is_unscoped(session: Session) -> bool:
    return bool(session.info.get(UNSCOPED_KEY))


# --------------------------------------------------------------------------- #
# Event listeners (registered on the sync Session class; fire for AsyncSession too,
# since AsyncSession delegates to an underlying sync Session)
# --------------------------------------------------------------------------- #
def _apply_tenant_filter(state: ORMExecuteState) -> None:
    """do_orm_execute: auto-scope SELECTs against TenantScopedModel entities.

    Applies unconditionally rather than first checking whether the statement
    "touches" a tenant model — that check used to key off ``state.all_mappers``,
    which is empty for a bare aggregate like ``select(func.count()).select_from(X)``
    (no mapped column is referenced, only the FROM clause), so the filter was
    silently skipped and cross-tenant row *counts* leaked through paginated list
    endpoints' ``total`` fields (confirmed live in Batch 10: a second org's admin
    saw another org's true ``audit_log`` count). ``with_loader_criteria`` is itself
    a no-op for statements that don't touch ``TenantScopedModel``, so applying it
    unconditionally is both cheap and correct — no detection heuristic to miss.
    Every session reaching this point has already called ``bind_organization`` or
    ``mark_session_unscoped`` (both session factories call one or the other before
    yielding), so this can't newly raise for a legitimately-unscoped query.
    """
    if not state.is_select or state.is_column_load or state.is_relationship_load:
        return

    organization_id = get_bound_organization(state.session)
    if organization_id is None:
        if _is_unscoped(state.session):
            return
        raise TenantContextError(
            "Query against a tenant-scoped model with no organization bound to the "
            "session. Use get_tenant_session(organization_id), or "
            "mark_session_unscoped() for system / pre-auth operations."
        )

    state.statement = state.statement.options(
        with_loader_criteria(
            TenantScopedModel,
            lambda cls: cls.organization_id == organization_id,
            include_aliases=True,
        )
    )


def _enforce_tenant_on_flush(session: Session, flush_context: Any, instances: Any) -> None:
    """before_flush: stamp/validate organization_id on inserts, updates, deletes."""
    if _is_unscoped(session):
        return
    organization_id = get_bound_organization(session)

    def _guard(obj: object, *, is_new: bool) -> None:
        if not isinstance(obj, TenantScopedModel):
            return
        if organization_id is None:
            raise TenantContextError(
                f"Attempt to write tenant-scoped {type(obj).__name__} with no "
                "organization bound to the session."
            )
        current = getattr(obj, "organization_id", None)
        if is_new and current is None:
            obj.organization_id = organization_id  # type: ignore[attr-defined]
        elif current != organization_id:
            raise TenantContextError(
                f"Cross-tenant write blocked: {type(obj).__name__} belongs to "
                f"{current!r} but session is bound to {organization_id!r}."
            )

    for obj in session.new:
        _guard(obj, is_new=True)
    for obj in session.dirty:
        _guard(obj, is_new=False)
    for obj in session.deleted:
        _guard(obj, is_new=False)


def register_tenant_guards() -> None:
    """Idempotently register the tenant enforcement listeners on Session."""
    from sqlalchemy import event

    if not event.contains(Session, "do_orm_execute", _apply_tenant_filter):
        event.listen(Session, "do_orm_execute", _apply_tenant_filter)
    if not event.contains(Session, "before_flush", _enforce_tenant_on_flush):
        event.listen(Session, "before_flush", _enforce_tenant_on_flush)
