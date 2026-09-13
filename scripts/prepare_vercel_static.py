#!/usr/bin/env python
"""Prepare static assets for Vercel by copying the Vite build output into public/."""

from __future__ import annotations

import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = PROJECT_ROOT / "frontend" / "dist"
PUBLIC_DIR = PROJECT_ROOT / "public"


def main() -> None:
    if not DIST_DIR.exists():
        raise FileNotFoundError(
            f"Missing frontend build output: {DIST_DIR}. "
            "Run `npm run build` in frontend/ first."
        )

    if PUBLIC_DIR.exists():
        shutil.rmtree(PUBLIC_DIR)

    shutil.copytree(DIST_DIR, PUBLIC_DIR)

    print(f"Prepared Vercel static assets in {PUBLIC_DIR}")


if __name__ == "__main__":
    main()
