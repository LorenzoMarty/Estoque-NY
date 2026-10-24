#!/usr/bin/env python
"""Purge idempotency keys older than IDEMPOTENCY_TTL_HOURS (run from cron)."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


async def _main() -> None:
    from app.db.session import dispose_engine
    from app.services.idempotency_service import purge_expired_idempotency_keys

    try:
        print(f"purged {await purge_expired_idempotency_keys()} idempotency keys")
    finally:
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(_main())
