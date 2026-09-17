"""Top-level API router aggregating all route modules."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.routes import (
    api_keys,
    auth,
    billing,
    contact,
    data,
    evolution,
    failures,
    governance,
    graph,
    health,
    llm,
    market,
    notifications,
    onboarding,
    organizations,
    portfolio,
    regimes,
    research_notes,
    roles,
    strategies,
    superadmin,
    system,
    usage,
    users,
    ws,
)
from app.core.rate_limit import global_rate_limiter, llm_rate_limiter

api_router = APIRouter()
api_router.include_router(health.router)
# ws.router carries no HTTP dependencies: the global/auth rate limiters below are
# Depends()-based HTTP guards and simply do not run on a WebSocket scope. The
# endpoint authenticates its own token inline instead (app/api/routes/ws.py), so
# adding _GLOBAL_LIMIT here would be decoration, not protection.
api_router.include_router(ws.router)
# auth.router is deliberately excluded from the global limiter: it's pre-auth
# (no JWT to key on yet) and already carries its own dedicated IP/account
# limiters (see app/core/rate_limit.py and the dependencies on each route).
api_router.include_router(auth.router)
# billing.webhook_router: Stripe calls this server-to-server with no JWT at
# all (same reason auth.router is excluded from _GLOBAL_LIMIT above) —
# authenticity comes entirely from Stripe's own signature, verified inside
# the route itself, not from a JWT-keyed rate limiter that has no key to key on.
api_router.include_router(billing.webhook_router)
# Batch 15: public demo-request form — anonymous visitor, no JWT to key the
# global limiter on (same reason auth/billing.webhook are excluded); carries its
# own dedicated per-IP limiter declared on the route itself.
api_router.include_router(contact.router)

# Batch 11: the 100/min/user global default (Enterprise: 500/min) applies
# router-wide to every authenticated feature router, so it automatically covers
# new routes added later without needing to remember to wire it in per-route.
_GLOBAL_LIMIT = [Depends(global_rate_limiter)]
api_router.include_router(users.router, dependencies=_GLOBAL_LIMIT)
# Batch 26: organization custom roles + role catalog for org admins.
api_router.include_router(roles.router, dependencies=_GLOBAL_LIMIT)
api_router.include_router(organizations.router, dependencies=_GLOBAL_LIMIT)
api_router.include_router(data.router, dependencies=_GLOBAL_LIMIT)
api_router.include_router(regimes.router, dependencies=_GLOBAL_LIMIT)
api_router.include_router(strategies.router, dependencies=_GLOBAL_LIMIT)
api_router.include_router(portfolio.router, dependencies=_GLOBAL_LIMIT)
# Batch 25: public, delayed global index quotes (cache read only, never a provider call).
api_router.include_router(market.router, dependencies=_GLOBAL_LIMIT)
api_router.include_router(failures.router, dependencies=_GLOBAL_LIMIT)
api_router.include_router(research_notes.router, dependencies=_GLOBAL_LIMIT)
api_router.include_router(graph.router, dependencies=_GLOBAL_LIMIT)
api_router.include_router(evolution.router, dependencies=_GLOBAL_LIMIT)
# llm.router additionally gets the per-org LLM budget limit (50/hour/org) on
# every route in the module — LLM calls cost real money per call.
api_router.include_router(llm.router, dependencies=[*_GLOBAL_LIMIT, Depends(llm_rate_limiter)])
api_router.include_router(governance.router, dependencies=_GLOBAL_LIMIT)
api_router.include_router(notifications.router, dependencies=_GLOBAL_LIMIT)
api_router.include_router(system.router, dependencies=_GLOBAL_LIMIT)
api_router.include_router(api_keys.router, dependencies=_GLOBAL_LIMIT)
api_router.include_router(billing.router, dependencies=_GLOBAL_LIMIT)
# Batch 21: rate-limit visibility + onboarding status, both authenticated + org-scoped.
api_router.include_router(usage.router, dependencies=_GLOBAL_LIMIT)
api_router.include_router(onboarding.router, dependencies=_GLOBAL_LIMIT)
# superadmin.router: internal founder control plane. Deliberately NOT behind the
# per-org global rate limiter (it's cross-tenant, keyed on the founder's single
# account) and NOT subject to org-status enforcement (require_super_admin exempts
# is_super_admin from that gate) — the founder's console must always work.
#
# Batch 22: include_in_schema=False keeps EVERY /superadmin/* path out of the public
# OpenAPI schema (and therefore the public /docs page), so the internal control plane
# is never advertised to anonymous visitors. The routes still function exactly the
# same — this only affects schema/doc generation. Enforced by test_public_openapi.py.
api_router.include_router(
    superadmin.router, dependencies=_GLOBAL_LIMIT, include_in_schema=False
)
