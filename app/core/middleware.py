import logging
import re
import time
from uuid import uuid4

from fastapi import Request
from starlette.responses import Response

from app.core.observability import tag_request

_VALID_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")


class _RequestAdapter(logging.LoggerAdapter):
    def process(self, msg, kwargs):
        extra = kwargs.get("extra", {})
        extra.setdefault("request_id", self.extra.get("request_id"))
        kwargs["extra"] = extra
        return msg, kwargs


async def request_context_middleware(request: Request, call_next) -> Response:
    incoming = request.headers.get("X-Request-ID", "")
    # Accept a caller's id only if it is short and plain: it ends up in logs, response
    # headers and Sentry tags, so a forged or huge value must not get through.
    request_id = incoming if _VALID_REQUEST_ID.fullmatch(incoming) else str(uuid4())
    request.state.request_id = request_id
    tag_request(request_id)

    logger = _RequestAdapter(
        logging.getLogger("app.request"),
        {"request_id": request_id},
    )
    started_at = time.perf_counter()

    try:
        response = await call_next(request)
    finally:
        elapsed_ms = round((time.perf_counter() - started_at) * 1000, 2)
        logger.info(
            "request completed method=%s path=%s status=%s duration_ms=%s user_id=%s",
            request.method,
            request.url.path,
            getattr(locals().get("response"), "status_code", "unknown"),
            elapsed_ms,
            getattr(request.state, "user_id", None),
        )

    response.headers["X-Request-ID"] = request_id
    return response


class SecurityHeadersMiddleware:
    """Pure ASGI (not BaseHTTPMiddleware) so exceptions still reach Sentry unwrapped."""

    def __init__(self, app, hsts: bool = False):
        self.app = app
        self.headers = [
            (b"x-content-type-options", b"nosniff"),
            (b"x-frame-options", b"DENY"),
            (b"referrer-policy", b"strict-origin-when-cross-origin"),
        ]
        if hsts:
            self.headers.append(
                (b"strict-transport-security", b"max-age=31536000; includeSubDomains")
            )

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                message["headers"] = [*message.get("headers", []), *self.headers]
            await send(message)

        await self.app(scope, receive, send_with_headers)
