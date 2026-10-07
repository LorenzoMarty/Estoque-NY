import logging
from typing import Any

from fastapi import HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.domain.errors import (
    BusinessRuleError,
    ConflictError,
    DomainError,
    NotFoundError,
)

logger = logging.getLogger("app.errors")


def _error_body(
    *,
    request: Request,
    code: str,
    message: str,
    details: Any = None,
) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "request_id": getattr(request.state, "request_id", None),
        }
    }


async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    status_code = 400
    code = "domain_error"
    if isinstance(exc, NotFoundError):
        status_code = 404
        code = "not_found"
    elif isinstance(exc, ConflictError):
        status_code = 409
        code = "conflict"
    elif isinstance(exc, BusinessRuleError):
        status_code = 422
        code = "business_rule"

    return JSONResponse(
        status_code=status_code,
        content=_error_body(
            request=request,
            code=code,
            message=exc.message,
        ),
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail
    message = detail if isinstance(detail, str) else "request failed"
    details = None if isinstance(detail, str) else detail
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body(
            request=request,
            code="http_error",
            message=message,
            details=details,
        ),
        headers=exc.headers,
    )


async def request_validation_error_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content=_error_body(
            request=request,
            code="validation_error",
            message="invalid request payload",
            # ctx.error holds the raw exception of custom validators; stringify it.
            details=jsonable_encoder(exc.errors(), custom_encoder={Exception: str}),
        ),
    )


async def unhandled_exception_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    logger.exception("unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content=_error_body(
            request=request,
            code="internal_error",
            message="internal server error",
        ),
    )


def register_exception_handlers(app) -> None:
    app.add_exception_handler(DomainError, domain_error_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, request_validation_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
