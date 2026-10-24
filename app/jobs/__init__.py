"""Scheduled jobs: `python -m app.jobs <name>` (cron wiring in render.yaml, issue #53).

Add a job by writing an async function and listing it in JOBS. Each run logs start,
duration and success or failure, and exits non-zero on failure so the cron shows it red.
"""

import asyncio
import logging
import sys
import time
from collections.abc import Awaitable, Callable

from app.core.logging import configure_logging
from app.db.session import dispose_engine
from app.services.idempotency_service import purge_expired_idempotency_keys

logger = logging.getLogger("app.jobs")

JOBS: dict[str, Callable[[], Awaitable[object]]] = {
    "purge_idempotency_keys": purge_expired_idempotency_keys,
}


async def run_job(name: str) -> bool:
    """Run one job; True on success. Never raises (the caller picks the exit code)."""
    started = time.monotonic()
    logger.info("job started name=%s", name)
    try:
        result = await JOBS[name]()
    except Exception:
        logger.exception("job failed name=%s", name)
        return False
    elapsed_ms = (time.monotonic() - started) * 1000
    logger.info(
        "job finished name=%s result=%s duration_ms=%.0f", name, result, elapsed_ms
    )
    return True


def main(argv: list[str]) -> int:
    configure_logging()
    if len(argv) != 1 or argv[0] not in JOBS:
        print(f"usage: python -m app.jobs <{'|'.join(JOBS)}>", file=sys.stderr)
        return 2

    async def _run() -> bool:
        try:
            return await run_job(argv[0])
        finally:
            await dispose_engine()

    return 0 if asyncio.run(_run()) else 1
