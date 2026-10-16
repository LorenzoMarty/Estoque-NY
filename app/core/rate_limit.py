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
# Hard ceiling: if even after dropping idle entries there are more, forget the oldest.
_HARD_CAP = 50_000


class SlidingWindowLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = {}
        self._clock = clock
        self._next_evict = 0.0

    def hit(self, key: tuple[str, str], limit: int, window: float) -> float | None:
        """Record a request. Returns None if allowed, else seconds to wait."""
        now = self._clock()
        if len(self._hits) > _MAX_TRACKED_KEYS and now >= self._next_evict:
            # at most one sweep per window, so a flood of new keys cannot make
            # every request pay for a scan of the whole table
            self._evict(now, window)
            self._next_evict = now + window
        if len(self._hits) > _HARD_CAP:
            for oldest in list(self._hits)[: len(self._hits) - _HARD_CAP]:
                del self._hits[oldest]  # oldest first (dicts keep insertion order)
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
        trusted_proxy_hops: int = 0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.app = app
        self.limits = limits
        self.window = window_seconds
        self.trusted_proxy_hops = trusted_proxy_hops
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
        if self.trusted_proxy_hops > 0:
            # Each trusted proxy appends the address it saw, so the client is the
            # `hops`-th entry from the right; anything further left can be forged.
            for name, value in scope["headers"]:
                if name == b"x-forwarded-for":
                    entries = [e.strip() for e in value.decode("latin-1").split(",")]
                    entries = [e for e in entries if e]
                    if entries:
                        return entries[max(0, len(entries) - self.trusted_proxy_hops)]
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
