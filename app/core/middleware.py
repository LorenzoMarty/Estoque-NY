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
