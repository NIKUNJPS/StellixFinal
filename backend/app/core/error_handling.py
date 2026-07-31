"""Catch-all unhandled-exception handling (Batch 11, corrected in Batch 13).

Starlette special-cases an exception handler registered for the literal
``Exception`` class (or ``500``) onto ``ServerErrorMiddleware`` — which its own
docstring says is deliberately used "to wrap *everything* else up", i.e. it
sits OUTSIDE every middleware added via ``app.add_middleware`` (confirmed
directly against the installed starlette.applications.build_middleware_stack:
the ``key in (500, Exception)`` branch is pulled out of ``exception_handlers``
and passed to ``ServerErrorMiddleware`` specifically, never reaching
``ExceptionMiddleware``, which IS inside user middleware).

Batch 11 registered ``@app.exception_handler(Exception)`` believing this ran
inside CORSMiddleware. Live verification in Batch 13 (curling the new
sentry-test route with an ``Origin`` header and an inbound ``X-Request-ID``)
showed neither ever reached the client on a 500 — proving that belief wrong:
an exception uncaught by ``ExceptionMiddleware`` unwinds through CORS,
SecurityHeaders, and RequestID entirely before ``ServerErrorMiddleware``
finally catches it and sends a response via the raw ASGI ``send``, bypassing
every header those middlewares would have added.

The fix: catch the exception in a middleware of our own, registered FIRST
(`add_middleware` makes each later call the new outermost layer, so being
first means innermost among user middleware — right next to the router).
Every middleware added after it (CORS, SecurityHeaders, RequestID) then sees
`call_next()` return a normal Response instead of an exception, so each gets
to add its own headers on the way back out. ``ServerErrorMiddleware`` remains
registered as a last-resort net for anything that manages to escape even this
(e.g. an exception raised by another middleware itself), but in the normal
case it now never fires.

Plain ASGI (not BaseHTTPMiddleware) deliberately: BaseHTTPMiddleware's
call_next() runs the wrapped app in a separate anyio task (confirmed against
the installed starlette.middleware.base source), and a child task's
contextvars.bind_contextvars() calls are invisible to the parent task once
control returns to it. organization_id/user_id are bound during dependency
resolution (app/api/deps.py), which sits below this middleware in the stack —
if this middleware itself spawned another task, that binding would never be
visible here. As plain ASGI it awaits the inner app directly in the same
task, so contextvars bound anywhere below it (including request_id, bound one
layer further out in RequestIDMiddleware before this middleware even runs)
are all visible when logging the exception. response_started tracking mirrors
ServerErrorMiddleware's own guard against sending a second
http.response.start if a streaming response had already begun.
"""

from __future__ import annotations

import logging

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)


class UnhandledExceptionMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def _send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, _send)
        except Exception:
            request = Request(scope)
            # Never leak a raw exception/traceback to the client — the real
            # detail goes to the server log only.
            logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
            if not response_started:
                response = JSONResponse(status_code=500, content={"detail": "Internal server error"})
                await response(scope, receive, send)
            raise
