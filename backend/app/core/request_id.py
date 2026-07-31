"""Per-request trace ID (Batch 13).

Registered as the outermost middleware (added last in app/main.py — Starlette
wraps later `add_middleware` calls around earlier ones) so request_id is bound
before CORS, security headers, or the global exception handler run, and stays
bound for the life of the request. `RequestIDMiddleware` (API side) and
`app.worker.logging_context.with_log_context` (Celery side) share the same
structlog contextvars key ("request_id"), which is what lets one user action
stay traceable across the API process and into any background task it enqueues.
"""

from __future__ import annotations

import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

REQUEST_ID_HEADER = "X-Request-ID"


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        try:
            response = await call_next(request)
            response.headers[REQUEST_ID_HEADER] = request_id
            return response
        finally:
            # Always clear, even when call_next raised — nothing from this
            # request's context should leak into whatever handles the next one.
            structlog.contextvars.clear_contextvars()
