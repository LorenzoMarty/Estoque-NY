import logging
import time
from uuid import uuid4

from fastapi import Request
from starlette.responses import Response


class _RequestAdapter(logging.LoggerAdapter):
    def process(self, msg, kwargs):
        extra = kwargs.get("extra", {})
        extra.setdefault("request_id", self.extra.get("request_id"))
        kwargs["extra"] = extra
        return msg, kwargs


async def request_context_middleware(request: Request, call_next) -> Response:
    request_id = request.headers.get("X-Request-ID") or str(uuid4())
    request.state.request_id = request_id

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
