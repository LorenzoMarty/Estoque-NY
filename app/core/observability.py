"""Error reporting to Sentry, off unless SENTRY_DSN is set."""

import logging

import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration

from app.core.settings import Settings

logger = logging.getLogger("app.observability")


def init_sentry(settings: Settings, *, transport=None) -> bool:
    """Start Sentry when a DSN is configured; returns whether it is on.

    Unhandled exceptions are captured by the Starlette/FastAPI integration. The logging
    integration is limited to ERROR so the INFO request log does not become events, and
    personal data (cookies, IPs, request bodies) is not sent.
    """
    dsn = settings.sentry_dsn.strip()
    if not dsn:
        return False

    sentry_sdk.init(
        dsn=dsn,
        environment=settings.app_env,
        release=settings.sentry_release or None,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        send_default_pii=False,
        integrations=[
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR)
        ],
        transport=transport,
    )
    logger.info("sentry enabled for environment %s", settings.app_env)
    return True


def tag_request(request_id: str) -> None:
    """Attach the request id to whatever event this request produces."""
    sentry_sdk.get_current_scope().set_tag("request_id", request_id)
