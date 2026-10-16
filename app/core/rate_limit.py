"""Per-IP sliding-window rate limiting for login, refresh and public endpoints.

ponytail: counters live in process memory, so with N gunicorn workers the
effective limit is N times higher and a restart resets it. Move to a shared
store (Redis) if abuse shows up despite this.
"""

import json
import math
import time
from collections import deque
from collections.abc import Callable

from starlette.types import ASGIApp, Receive, Scope, Send

# Bucket name -> (method, path prefix). Matched against the path with an
# optional "/api" prefix removed (Vercel may forward either form).
_RULES: tuple[tuple[str, str | None, str], ...] = (
    ("login", "POST", "/auth/login"),
    ("refresh", "POST", "/auth/refresh"),
    ("public", None, "/public/"),
)

_MAX_TRACKED_KEYS = 10_000


class SlidingWindowLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = {}
        self._clock = clock

    def hit(self, key: tuple[str, str], limit: int, window: float) -> float | None:
        """Record a request. Returns None if allowed, else seconds to wait."""
        now = self._clock()
        if len(self._hits) > _MAX_TRACKED_KEYS:
            self._evict(now, window)
        hits = self._hits.setdefault(key, deque())
        while hits and now - hits[0] >= window:
            hits.popleft()
        if len(hits) >= limit:
            return window - (now - hits[0])
        hits.append(now)
        return None

    def _evict(self, now: float, window: float) -> None:
        for key in [k for k, h in self._hits.items() if not h or now - h[-1] >= window]:
            del self._hits[key]


class RateLimitMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        *,
        limits: dict[str, int],
        window_seconds: float = 60.0,
        trust_forwarded_for: bool = False,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.app = app
        self.limits = limits
        self.window = window_seconds
        self.trust_forwarded_for = trust_forwarded_for
        self.limiter = SlidingWindowLimiter(clock)

    def _bucket(self, scope: Scope) -> str | None:
        path = scope["path"]
        if path.startswith("/api/"):
            path = path[len("/api") :]
        for name, method, prefix in _RULES:
            if method is not None and scope["method"] != method:
                continue
            if path == prefix or (prefix.endswith("/") and path.startswith(prefix)):
                return name
        return None

    def _client_ip(self, scope: Scope) -> str:
        if self.trust_forwarded_for:
            # The rightmost entry is the one our own proxy appended; anything to
            # its left can be forged by the client.
            for name, value in scope["headers"]:
                if name == b"x-forwarded-for":
                    return value.decode("latin-1").split(",")[-1].strip()
        client = scope.get("client")
        return client[0] if client else "unknown"

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        bucket = self._bucket(scope) if scope["type"] == "http" else None
        limit = self.limits.get(bucket) if bucket else None
        if bucket is None or not limit:
            await self.app(scope, receive, send)
            return

        wait = self.limiter.hit((bucket, self._client_ip(scope)), limit, self.window)
        if wait is None:
            await self.app(scope, receive, send)
            return

        retry_after = max(1, math.ceil(wait))
        body = json.dumps(
            {
                "error": {
                    "code": "rate_limited",
                    "message": f"too many requests, retry in {retry_after}s",
                    "details": None,
                    "request_id": None,
                }
            }
        ).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 429,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                    (b"retry-after", str(retry_after).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
