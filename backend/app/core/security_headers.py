"""Baseline security response headers (Batch 11), applied to every response.

Added as the outermost user middleware (registered after CORSMiddleware in
app/main.py — Starlette wraps later `add_middleware` calls around earlier
ones) so the headers land on literally every response this process emits,
including CORS preflight replies and the global unhandled-exception 500.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

# A pure JSON API serves no HTML/JS/CSS of its own, so the strictest baseline
# (deny everything) is also the correct one — there is no legitimate resource
# this backend needs a browser to load under its own origin.
_CSP = "default-src 'none'; frame-ancestors 'none'"
_HSTS = "max-age=63072000; includeSubDomains"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, *, is_production: bool) -> None:
        super().__init__(app)
        self._is_production = is_production

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = _CSP
        # Strict-Transport-Security instructs the browser to refuse plain http://
        # for this host for the given duration — correct in production (behind
        # TLS), actively broken in local dev (http://localhost has no cert).
        if self._is_production:
            response.headers["Strict-Transport-Security"] = _HSTS
        return response
