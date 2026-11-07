import asyncio
import logging
import time
import urllib.request

from app.core.config import get_settings

logger = logging.getLogger("app.site_hook")

_last_call = float("-inf")
_pending: asyncio.Task | None = None


def _post(url: str) -> None:
    req = urllib.request.Request(url, data=b"", method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310 - operator-set URL
        logger.info("site revalidation hook answered %s", resp.status)


async def _call(url: str) -> None:
    global _last_call
    _last_call = time.monotonic()
    try:
        await asyncio.to_thread(_post, url)
    except Exception:
        logger.exception("site revalidation hook failed")


async def _trailing(url: str, delay: float) -> None:
    global _pending
    await asyncio.sleep(delay)
    _pending = None
    await _call(url)


def notify_site_changed() -> None:
    """Tell the site the public catalog changed (call after commit; never raises).

    Leading call right away, then at most one trailing call per debounce window, so
    a bulk edit costs two hits, not one per row.
    ponytail: in-process state; with several workers each debounces on its own.
    """
    global _pending
    settings = get_settings()
    url = settings.site_revalidate_url
    if not url:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    wait = settings.site_revalidate_debounce_seconds - (time.monotonic() - _last_call)
    if wait <= 0:
        loop.create_task(_call(url))
    elif _pending is None:
        _pending = loop.create_task(_trailing(url, wait))
