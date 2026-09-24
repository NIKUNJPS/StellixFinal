"""Dynamic RBAC service (Batch 26) — permission resolution, role visibility, role
administration.

This module is the ONLY place that reads the roles / role_permissions tables for a
tenant. ``Role`` is not a TenantScopedModel (system roles have no organization), so
every query here filters ``organization_id IS NULL OR organization_id = <org>`` itself;
nothing else in the codebase should query roles directly. See docs/adr/0006.

Resolution rule: a user's effective role is ``users.role_id``, or — when that is NULL —
the system role for their legacy ``users.role`` value. A role belonging to a different
organization grants nothing (fail closed).
"""

from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditEventType
from app.models.rbac import Permission, Role, RolePermission
from app.models.user import User, UserRole
from app.rbac.catalog import (
    PERMISSION_CATALOG,
    SYSTEM_ROLES,
    SYSTEM_ROLES_BY_KEY,
    P,
    permission_id,
    system_role_id,
)
from app.services.audit import write_audit_log


# The legacy ``users.role`` enum values (the five original system roles). A newer
# system role — e.g. Quant Engineer (Batch 26 Part B) — has a system_key that is NOT a
# UserRole value, so it can never be mirrored onto the deprecated ``users.role`` column
# (that column is authorization-irrelevant since Part A; role_id is authoritative).
_LEGACY_ROLE_VALUES: frozenset[str] = frozenset(r.value for r in UserRole)


class RbacError(Exception):
    http_status = 409


class RoleNotFound(RbacError):
    http_status = 404


class RoleForbidden(RbacError):
    http_status = 403


class RoleInvalid(RbacError):
    http_status = 422


# --------------------------------------------------------------------------- #
# Seeding
# --------------------------------------------------------------------------- #
async def seed_rbac_catalog(session: AsyncSession) -> None:
    """Idempotently insert missing catalog permissions and system roles.

    Grants are written only when a system role is first created, so this never
    re-adds a permission a SuperAdmin deliberately removed. Used for fresh databases
    (the test suite); production is seeded by migration 0020.
    """
    existing_perms = set((await session.execute(select(Permission.key))).scalars())
    for spec in PERMISSION_CATALOG:
        if spec.key not in existing_perms:
            session.add(
                Permission(id=permission_id(spec.key), key=spec.key, category=spec.category, description=spec.description)
            )
    existing_roles = set((await session.execute(select(Role.system_key).where(Role.system_key.is_not(None)))).scalars())
    await session.flush()
    for spec in SYSTEM_ROLES:
        if spec.key in existing_roles:
            continue
        session.add(
            Role(
                id=system_role_id(spec.key),
                organization_id=None,
                name=spec.name,
                description=spec.description,
                is_system_default=True,
                system_key=spec.key,
            )
        )
        await session.flush()
        for key in spec.permissions:
            session.add(RolePermission(role_id=system_role_id(spec.key), permission_id=permission_id(key)))
    await session.commit()


# --------------------------------------------------------------------------- #
# Resolution
# --------------------------------------------------------------------------- #
def effective_role_id(user: User) -> uuid.UUID:
    return user.role_id or system_role_id(user.role.value)


def _visible_to(organization_id: uuid.UUID):
    return or_(Role.organization_id.is_(None), Role.organization_id == organization_id)


async def get_effective_role(session: AsyncSession, user: User) -> Role | None:
    return (
        await session.execute(
            select(Role).where(Role.id == effective_role_id(user)).where(_visible_to(user.organization_id))
        )
    ).scalar_one_or_none()


async def permission_keys_for_user(session: AsyncSession, user: User) -> frozenset[str]:
    """Every permission key the user's effective role grants (empty if the role is
    missing or belongs to another organization)."""
    cached = getattr(user, "_rbac_permission_keys", None)
    if cached is not None:
        return cached
    keys = frozenset(
        (
            await session.execute(
                select(Permission.key)
                .join(RolePermission, RolePermission.permission_id == Permission.id)
                .join(Role, Role.id == RolePermission.role_id)
                .where(Role.id == effective_role_id(user))
                .where(_visible_to(user.organization_id))
            )
        ).scalars()
    )
    # Per-object memo: a request resolves permissions once no matter how many checks run.
    user._rbac_permission_keys = keys  # type: ignore[attr-defined]
    return keys


async def has_permission(session: AsyncSession, user: User, key: str) -> bool:
    return key in await permission_keys_for_user(session, user)


def forget_cached_permissions(user: User) -> None:
    if hasattr(user, "_rbac_permission_keys"):
        del user._rbac_permission_keys  # type: ignore[attr-defined]


async def users_with_permission(
    session: AsyncSession, *, organization_id: uuid.UUID, key: str, active_only: bool = True
) -> list[User]:
    """Users of one organization whose effective role grants ``key``."""
    granting = (
        await session.execute(
            select(Role.id, Role.system_key)
            .join(RolePermission, RolePermission.role_id == Role.id)
            .join(Permission, Permission.id == RolePermission.permission_id)
            .where(Permission.key == key)
            .where(_visible_to(organization_id))
        )
    ).all()
    role_ids = [rid for rid, _ in granting]
    # Only the five original system roles have a legacy users.role value to match a
    # NULL-role_id user by; a newer system role's holders always carry an explicit role_id.
    legacy_values = [UserRole(sk) for _, sk in granting if sk in _LEGACY_ROLE_VALUES]
    if not role_ids:
        return []
    stmt = (
        select(User)
        .where(User.organization_id == organization_id)
        .where(or_(User.role_id.in_(role_ids), User.role_id.is_(None) & User.role.in_(legacy_values)))
        .order_by(User.created_at.asc())
    )
    if active_only:
        stmt = stmt.where(User.is_active.is_(True))
    return list((await session.execute(stmt)).scalars().all())


# --------------------------------------------------------------------------- #
# Reading roles
# --------------------------------------------------------------------------- #
async def roles_visible_to_org(session: AsyncSession, organization_id: uuid.UUID) -> list[Role]:
    return list(
        (
            await session.execute(
                select(Role)
                .where(_visible_to(organization_id))
                .order_by(Role.organization_id.is_not(None), Role.is_system_default.desc(), Role.name)
            )
        ).scalars()
    )


async def permission_keys_by_role(session: AsyncSession, role_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[str]]:
    rows = (
        await session.execute(
            select(RolePermission.role_id, Permission.key)
            .join(Permission, Permission.id == RolePermission.permission_id)
            .where(RolePermission.role_id.in_(role_ids))
        )
    ).all()
    out: dict[uuid.UUID, list[str]] = defaultdict(list)
    for role_id, key in rows:
        out[role_id].append(key)
    return {rid: sorted(keys) for rid, keys in out.items()}


async def member_counts_by_role(session: AsyncSession, organization_id: uuid.UUID | None = None) -> dict[uuid.UUID, int]:
    """How many users hold each role (legacy NULL role_id users counted under their system role)."""
    stmt = select(User.role_id, User.role, func.count()).group_by(User.role_id, User.role)
    if organization_id is not None:
        stmt = stmt.where(User.organization_id == organization_id)
    counts: dict[uuid.UUID, int] = defaultdict(int)
    for role_id, legacy, n in (await session.execute(stmt)).all():
        counts[role_id or system_role_id(legacy.value)] += n
    return dict(counts)


async def get_permissions_by_keys(session: AsyncSession, keys: list[str]) -> list[Permission]:
    unique = sorted(set(keys))
    perms = list((await session.execute(select(Permission).where(Permission.key.in_(unique)))).scalars())
    missing = set(unique) - {p.key for p in perms}
    if missing:
        raise RoleInvalid(f"Unknown permission key(s): {', '.join(sorted(missing))}")
    return perms


async def _set_role_permissions(session: AsyncSession, role: Role, keys: list[str]) -> tuple[list[str], list[str]]:
    perms = await get_permissions_by_keys(session, keys)
    before = sorted(
        (
            await session.execute(
                select(Permission.key)
                .join(RolePermission, RolePermission.permission_id == Permission.id)
                .where(RolePermission.role_id == role.id)
            )
        ).scalars()
    )
    await session.execute(delete(RolePermission).where(RolePermission.role_id == role.id))
    for perm in perms:
        session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await session.flush()
    return before, sorted(p.key for p in perms)


async def _assert_org_keeps_a_role_manager(session: AsyncSession, organization_id: uuid.UUID) -> None:
    """Lock-out guard: an organization must always retain at least one active member
    who can manage roles, or nobody could ever repair its access again."""
    if not await users_with_permission(session, organization_id=organization_id, key=P.ROLES_MANAGE):
        raise RbacError(
            "This change would leave the organization with no active member who can manage roles."
        )


# --------------------------------------------------------------------------- #
# Organization custom roles (org admins)
# --------------------------------------------------------------------------- #
def _clean_name(name: str) -> str:
    cleaned = " ".join((name or "").split())
    if not cleaned:
        raise RoleInvalid("A role name is required")
    return cleaned


async def _get_visible_role(session: AsyncSession, organization_id: uuid.UUID, role_id: uuid.UUID) -> Role:
    role = (
        await session.execute(select(Role).where(Role.id == role_id).where(_visible_to(organization_id)))
    ).scalar_one_or_none()
    if role is None:
        # Another org's custom role collapses to the same 404 as a missing one.
        raise RoleNotFound("Role not found")
    return role


async def _name_taken(session: AsyncSession, organization_id: uuid.UUID | None, name: str, exclude: uuid.UUID | None) -> bool:
    stmt = select(Role.id).where(func.lower(Role.name) == name.lower())
    if organization_id is None:
        stmt = stmt.where(Role.organization_id.is_(None))
    else:
        stmt = stmt.where(_visible_to(organization_id))  # no clash with system role names either
    if exclude is not None:
        stmt = stmt.where(Role.id != exclude)
    return (await session.execute(stmt.limit(1))).first() is not None


async def create_org_role(
    session: AsyncSession, *, actor: User, name: str, description: str, permission_keys: list[str]
) -> Role:
    name = _clean_name(name)
    if await _name_taken(session, actor.organization_id, name, None):
        raise RbacError(f"A role named '{name}' already exists")
    role = Role(
        organization_id=actor.organization_id,
        name=name,
        description=description or "",
        is_system_default=False,
        created_by_user_id=actor.id,
    )
    session.add(role)
    await session.flush()
    _, after = await _set_role_permissions(session, role, permission_keys)
    await write_audit_log(
        session,
        organization_id=actor.organization_id,
        actor=actor,
        event_type=AuditEventType.ROLE_CREATED,
        entity_type="role",
        entity_id=role.id,
        entity_name=role.name,
        after_state={"permissions": after},
    )
    await session.commit()
    await session.refresh(role)
    return role


async def update_org_role(
    session: AsyncSession,
    *,
    actor: User,
    role_id: uuid.UUID,
    name: str | None,
    description: str | None,
    permission_keys: list[str] | None,
) -> Role:
    role = await _get_visible_role(session, actor.organization_id, role_id)
    if role.organization_id is None:
        raise RoleForbidden("System roles are managed by the platform, not by organizations")
    if name is not None:
        new_name = _clean_name(name)
        if await _name_taken(session, actor.organization_id, new_name, role.id):
            raise RbacError(f"A role named '{new_name}' already exists")
        role.name = new_name
    if description is not None:
        role.description = description
    before = after = None
    if permission_keys is not None:
        before, after = await _set_role_permissions(session, role, permission_keys)
        await _assert_org_keeps_a_role_manager(session, actor.organization_id)
    await write_audit_log(
        session,
        organization_id=actor.organization_id,
        actor=actor,
        event_type=AuditEventType.ROLE_PERMISSIONS_CHANGED if permission_keys is not None else AuditEventType.ROLE_UPDATED,
        entity_type="role",
        entity_id=role.id,
        entity_name=role.name,
        before_state={"permissions": before} if before is not None else None,
        after_state={"permissions": after} if after is not None else {"name": role.name},
    )
    await session.commit()
    await session.refresh(role)
    return role


async def delete_org_role(session: AsyncSession, *, actor: User, role_id: uuid.UUID) -> None:
    role = await _get_visible_role(session, actor.organization_id, role_id)
    if role.organization_id is None:
        raise RoleForbidden("System roles cannot be deleted by an organization")
    holders = await session.scalar(select(func.count()).select_from(User).where(User.role_id == role.id))
    if holders:
        raise RbacError(f"'{role.name}' is still assigned to {holders} member(s); reassign them first")
    await write_audit_log(
        session,
        organization_id=actor.organization_id,
        actor=actor,
        event_type=AuditEventType.ROLE_DELETED,
        entity_type="role",
        entity_id=role.id,
        entity_name=role.name,
    )
    await session.delete(role)
    await session.commit()


async def assign_role(session: AsyncSession, *, actor: User, target: User, role_id: uuid.UUID) -> User:
    if target.organization_id != actor.organization_id:
        raise RoleNotFound("User not found")
    role = await _get_visible_role(session, actor.organization_id, role_id)
    before = await get_effective_role(session, target)
    target.role_id = role.id
    if role.system_key in _LEGACY_ROLE_VALUES:
        # Keep the deprecated column truthful for the five original system roles
        # (rollback window). A newer system role (e.g. Quant Engineer) has no legacy
        # UserRole value, so users.role is left as-is — role_id is authoritative.
        target.role = UserRole(role.system_key)
    forget_cached_permissions(target)
    await session.flush()
    await _assert_org_keeps_a_role_manager(session, actor.organization_id)
    await write_audit_log(
        session,
        organization_id=actor.organization_id,
        actor=actor,
        event_type=AuditEventType.USER_ROLE_CHANGED,
        entity_type="user",
        entity_id=target.id,
        entity_name=target.email,
        before_state={"role_id": str(before.id) if before else None, "role": before.name if before else None},
        after_state={"role_id": str(role.id), "role": role.name},
    )
    await session.commit()
    await session.refresh(target)
    return target


# --------------------------------------------------------------------------- #
# Platform system roles + permission catalog (SuperAdmin)
# --------------------------------------------------------------------------- #
async def _get_system_role(session: AsyncSession, role_id: uuid.UUID) -> Role:
    role = (
        await session.execute(select(Role).where(Role.id == role_id).where(Role.organization_id.is_(None)))
    ).scalar_one_or_none()
    if role is None:
        raise RoleNotFound("System role not found")
    return role


async def create_system_role(
    session: AsyncSession, *, name: str, description: str, permission_keys: list[str], created_by: uuid.UUID
) -> tuple[Role, list[str]]:
    name = _clean_name(name)
    if await _name_taken(session, None, name, None):
        raise RbacError(f"A system role named '{name}' already exists")
    role = Role(organization_id=None, name=name, description=description or "", created_by_user_id=created_by)
    session.add(role)
    await session.flush()
    _, after = await _set_role_permissions(session, role, permission_keys)
    return role, after


async def update_system_role(
    session: AsyncSession, *, role_id: uuid.UUID, name: str | None, description: str | None
) -> tuple[Role, dict, dict]:
    role = await _get_system_role(session, role_id)
    before = {"name": role.name, "description": role.description}
    if name is not None and _clean_name(name) != role.name:
        if role.is_system_default:
            raise RoleForbidden("Default system roles cannot be renamed")
        new_name = _clean_name(name)
        if await _name_taken(session, None, new_name, role.id):
            raise RbacError(f"A system role named '{new_name}' already exists")
        role.name = new_name
    if description is not None:
        role.description = description
    await session.flush()
    return role, before, {"name": role.name, "description": role.description}


async def set_system_role_permissions(
    session: AsyncSession, *, role_id: uuid.UUID, permission_keys: list[str]
) -> tuple[Role, list[str], list[str]]:
    role = await _get_system_role(session, role_id)
    if role.system_key == "admin" and P.ROLES_MANAGE not in permission_keys:
        # Removing this from the Admin system role would lock every organization out of
        # its own role management at once.
        raise RbacError("The Admin system role must keep 'roles.manage'")
    before, after = await _set_role_permissions(session, role, permission_keys)
    return role, before, after


async def delete_system_role(session: AsyncSession, *, role_id: uuid.UUID) -> Role:
    role = await _get_system_role(session, role_id)
    if role.is_system_default:
        raise RoleForbidden("Default system roles cannot be deleted")
    holders = await session.scalar(select(func.count()).select_from(User).where(User.role_id == role.id))
    if holders:
        raise RbacError(f"'{role.name}' is still assigned to {holders} user(s)")
    await session.delete(role)
    await session.flush()
    return role


async def create_permission(session: AsyncSession, *, key: str, category: str, description: str) -> Permission:
    key = (key or "").strip()
    if not key or " " in key:
        raise RoleInvalid("A permission key is required and cannot contain spaces")
    if (await session.execute(select(Permission.id).where(Permission.key == key))).first():
        raise RbacError(f"Permission '{key}' already exists")
    perm = Permission(key=key, category=category.strip() or "Custom", description=description or "")
    session.add(perm)
    await session.flush()
    return perm
