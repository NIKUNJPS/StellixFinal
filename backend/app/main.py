"""FastAPI application factory.

The ``/health`` route is mounted at the root (not under the versioned API prefix) so
liveness probes have a stable, version-independent URL. Feature routes go under
``settings.API_V1_PREFIX`` from later batches.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from app.api.router import api_router
from app.clients import redis_client
from app.core.config import settings
from app.core.error_handling import UnhandledExceptionMiddleware
from app.core.logging import configure_logging
from app.core.request_id import RequestIDMiddleware
from app.core.security_headers import SecurityHeadersMiddleware
from app.db.session import dispose_engine
from app.ws import bridge as ws_bridge

configure_logging()
logger = logging.getLogger(__name__)

# Public API description rendered at the top of the docs (Redoc). Covers what the
# platform is, how to authenticate, the rate-limit tiers, and the regime taxonomy.
# Every number here is the real configured value (app/core/rate_limit.py,
# app/models/regime_label.py) — keep it in sync if those change.
API_DESCRIPTION = """
**Stellix Labs** is the institutional memory layer for quantitative research:
regime-aware backtesting, preserved failure intelligence, a strategy knowledge
graph, and an evolution engine — all multi-tenant and org-isolated.

### Authentication
All feature endpoints require a **JWT bearer token**. The flow (Batch 24):

1. `POST /auth/register` creates an organization in **pending approval** and returns
   `202` — no token is issued yet.
2. A Stellix operator approves the organization.
3. `POST /auth/login` then returns a 15-minute **access token** (plus an httpOnly
   refresh cookie). Send it as `Authorization: Bearer <token>` on every request.

Programmatic clients can use an **API key** (`slx_…`) in the same `Authorization`
header instead of a JWT.

### Rate limits (per organization, token-bucket)
Enterprise tier gets a **5×** multiplier on every limit below; Starter and Pro use
the base values.

| Category | Base limit |
|---|---|
| Global (per user) | 100 / minute |
| Market-data ingestion | 10 / hour |
| Backtests | 30 / hour |
| Validations | 20 / hour |
| Evolution runs | 5 / hour |
| LLM calls | 50 / hour |

Live usage is available at `GET /usage/rate-limits`.

### Regime taxonomy
Detected regimes use a fixed six-label vocabulary: **Bull**, **Bear**,
**High-Volatility**, **Low-Volatility**, **Sideways**, **Crisis**.
"""

# Tag groups (display order + descriptions) for the public docs. Names match the
# tags applied to each router in app/api/routes/*.py. Internal-only surfaces
# (SuperAdmin) are excluded from the schema entirely, so they are not listed here.
OPENAPI_TAGS = [
    {"name": "Authentication", "description": "Register, log in, MFA, refresh, and API keys."},
    {"name": "Market Data", "description": "Ingest OHLCV (yfinance or CSV upload) and read tenant-scoped series."},
    {"name": "Regime Detection", "description": "Run the detection ensemble and read stored regimes, history, and cross-asset divergence."},
    {"name": "Strategy Lifecycle", "description": "Create strategies (rule DSL), backtest, validate, and move them through the approval lifecycle."},
    {"name": "Failure Intelligence", "description": "Recorded strategy failures, clusters, and heatmaps."},
    {"name": "Research Memory", "description": "Tenant-scoped memory of strategies, failures, regimes, notes and lineage, derived from Postgres."},
    {"name": "Evolution Engine", "description": "Genetic-algorithm evolution runs and lineage."},
    {"name": "LLM Assistant", "description": "Research-assistant endpoints (price-forecast-guarded)."},
    {"name": "Governance & Compliance", "description": "Append-only audit log, kill switch, and compliance export."},
    {"name": "Portfolio", "description": "Cross-strategy portfolio analytics."},
    {"name": "Usage & Billing", "description": "Rate-limit usage and subscription/billing."},
    {"name": "Onboarding", "description": "First-run onboarding status."},
    {"name": "Notifications", "description": "In-app notifications and the weekly digest preview."},
    {"name": "Research Notebook", "description": "Research notes and full-text search."},
    {"name": "Organization", "description": "Organization profile and settings."},
    {"name": "Users", "description": "The current user's own profile, sessions, and preferences."},
]

if settings.SENTRY_DSN:
    # Inert (no-op) when unset — same deferred-credential pattern as
    # ANTHROPIC_API_KEY (Batch 9). Sentry's Starlette/FastAPI integrations
    # patch ExceptionMiddleware to capture every exception BEFORE it would
    # reach any handler registered there, so this coexists correctly with
    # UnhandledExceptionMiddleware below (Sentry still gets the event for
    # reporting even though that middleware independently returns the clean,
    # CORS-correct 500 the client sees).
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        integrations=[StarletteIntegration(), FastApiIntegration()],
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage process-wide resources (DB engine pool, Redis client, Research Memory index)."""
    # Clients are created lazily on first use; nothing to eagerly open here.
    #
    # The WS bridge is the exception — it must be running before the first event is
    # published, not created on demand. It belongs to the API process only: it holds
    # this process's browser sockets. Celery workers never start it (they publish to
    # Redis and have nothing to deliver to). Each API replica runs its own.
    await ws_bridge.start()
    from app.graph import memory_index

    memory_index.start()  # API process only: workers never serve Research Memory reads
    yield
    # Graceful shutdown: release pooled connections.
    await memory_index.stop()
    await ws_bridge.stop()  # before close_client() — the bridge holds a Redis pubsub
    await redis_client.close_client()
    await dispose_engine()


def create_app() -> FastAPI:
    """Application factory."""
    app = FastAPI(
        title="Stellix Labs API",
        version="0.1.0",
        description=API_DESCRIPTION,
        openapi_tags=OPENAPI_TAGS,
        lifespan=lifespan,
    )

    # Registered FIRST so it becomes the INNERMOST user middleware (Starlette's
    # add_middleware makes each new call the new outermost layer, so being
    # first means every later-added middleware wraps it). Batch 13 correction:
    # registering @app.exception_handler(Exception) instead (as Batch 11 did)
    # does NOT run inside CORSMiddleware — Starlette special-cases the
    # Exception/500 key onto ServerErrorMiddleware, which its own docstring
    # says wraps *everything* else, including every app.add_middleware() layer.
    # Confirmed live: a deliberately-thrown exception came back with no
    # Access-Control-Allow-Origin and no X-Request-ID even though both
    # middlewares below were registered. Catching the exception here instead
    # means CORS/SecurityHeaders/RequestID all see call_next() return a normal
    # response and get to add their headers on the way back out.
    app.add_middleware(UnhandledExceptionMiddleware)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Registered AFTER CORSMiddleware so it wraps it (Starlette's add_middleware
    # makes each new call the new outermost layer) — security headers then land
    # on every response, including CORS preflight replies.
    app.add_middleware(SecurityHeadersMiddleware, is_production=settings.is_production)

    # Registered LAST so it becomes the new OUTERMOST layer (Batch 13): every
    # request — including ones that fail CORS or never reach a route — gets a
    # request_id bound before anything else runs, so it's present on every log
    # line this request produces (including the "unhandled exception" log
    # above), and on any Celery task it goes on to enqueue.
    app.add_middleware(RequestIDMiddleware)

    app.include_router(api_router)

    # Automatic HTTP metrics (request count, latency histograms, status code
    # breakdown) — from the library, not hand-rolled. Exposes GET /metrics in
    # the standard Prometheus text format. Custom business counters/gauges
    # live in app.core.metrics and are instrumented at their own call sites;
    # they share this same process-global prometheus_client registry, so they
    # show up on the same /metrics scrape automatically.
    Instrumentator().instrument(app).expose(app)

    return app


app = create_app()
