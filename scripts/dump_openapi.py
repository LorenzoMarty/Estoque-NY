"""Write the API's OpenAPI document to frontend/openapi.json (stable key order)."""

import json
import sys
from pathlib import Path

from app.main import app

OUT = Path(__file__).resolve().parent.parent / "frontend" / "openapi.json"


def render() -> str:
    return (
        json.dumps(app.openapi(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    )


if __name__ == "__main__":
    OUT.write_text(render(), encoding="utf-8", newline="\n")
    sys.stdout.write(f"wrote {OUT}\n")
