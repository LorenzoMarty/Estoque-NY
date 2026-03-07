#!/usr/bin/env python
"""Prepare static assets for Vercel by copying frontend files into public/."""

from __future__ import annotations

import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = PROJECT_ROOT / "frontend"
PUBLIC_DIR = PROJECT_ROOT / "public"
STATIC_ITEMS = ("index.html", "css", "js", "vendor")


def _copy_item(name: str) -> None:
    source = FRONTEND_DIR / name
    target = PUBLIC_DIR / name

    if not source.exists():
        raise FileNotFoundError(f"Missing frontend asset: {source}")

    if source.is_dir():
        shutil.copytree(source, target)
        return

    shutil.copy2(source, target)


def main() -> None:
    if PUBLIC_DIR.exists():
        shutil.rmtree(PUBLIC_DIR)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    for item in STATIC_ITEMS:
        _copy_item(item)

    print(f"Prepared Vercel static assets in {PUBLIC_DIR}")


if __name__ == "__main__":
    main()
