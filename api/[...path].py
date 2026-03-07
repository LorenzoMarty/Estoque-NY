"""Vercel Python Function catch-all entrypoint for /api/* paths."""

from app.main import app

__all__ = ["app"]
