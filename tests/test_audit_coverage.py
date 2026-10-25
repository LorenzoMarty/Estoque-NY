"""Every route that writes must leave an audit entry, or be exempt with a reason (#16).

The check is static: a write endpoint (POST/PUT/PATCH/DELETE) passes when its source
calls `write_audit_log`, or calls one of the HELPERS that does. A new write route that
does neither fails here, so the author has to audit it or justify the exemption.
"""

import inspect

from fastapi.routing import APIRoute

from app.api.routes import archive, data_io, purchasing
from app.main import create_app

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Shared helpers that write the audit entry on behalf of several endpoints.
HELPERS = [archive._run, data_io._audit_and_commit, purchasing._change]

# Routes that change no business data. Add here only with a reason.
EXEMPT = {
    "app.api.routes.auth.login_user": "session start; failed attempts are throttled",
    "app.api.routes.auth.logout": "revokes the caller's own refresh token",
    "app.api.routes.auth.refresh_access_token": "rotates the caller's own token",
}


def _routes(routes):
    for route in routes:
        if isinstance(route, APIRoute):
            yield route
        elif hasattr(route, "original_router"):  # FastAPI's lazily included routers
            yield from _routes(route.original_router.routes)
        elif hasattr(route, "routes"):
            yield from _routes(route.routes)


def _write_endpoints():
    seen = {}
    for route in _routes(create_app().routes):
        if route.methods & WRITE_METHODS:
            endpoint = route.endpoint
            seen[f"{endpoint.__module__}.{endpoint.__qualname__}"] = (route, endpoint)
    return seen


def _audits(endpoint) -> bool:
    source = inspect.getsource(endpoint)
    if "write_audit_log" in source:
        return True
    return any(
        helper.__name__ in source and "write_audit_log" in inspect.getsource(helper)
        for helper in HELPERS
    )


def test_every_write_route_is_audited_or_explicitly_exempt():
    endpoints = _write_endpoints()
    assert len(endpoints) >= 40  # guards against the walker silently finding nothing

    unaudited = sorted(
        f"{sorted(route.methods & WRITE_METHODS)[0]} {route.path} ({name})"
        for name, (route, endpoint) in endpoints.items()
        if name not in EXEMPT and not _audits(endpoint)
    )
    assert not unaudited, (
        "Write routes without an audit entry: "
        + "; ".join(unaudited)
        + ". Call write_audit_log or add the endpoint to EXEMPT with a reason."
    )


def test_exemptions_and_helpers_point_at_real_code():
    endpoints = _write_endpoints()
    assert set(EXEMPT) <= set(endpoints), "stale EXEMPT entry"
    for helper in HELPERS:
        assert "write_audit_log" in inspect.getsource(helper), helper.__name__
        assert any(
            helper.__name__ in inspect.getsource(endpoint)
            for _, endpoint in endpoints.values()
        ), f"{helper.__name__} is not used by any write endpoint"


def test_the_check_would_catch_an_unaudited_route():
    async def sneaky_write():
        return None

    assert not _audits(sneaky_write)
