"""frontend/openapi.json must match the API, or the generated TS types go stale (#51).

Fix: `uv run python -m scripts.dump_openapi` then, in frontend/, `npm run gen:api`.
"""

from scripts.dump_openapi import OUT, render


def test_openapi_snapshot_is_current():
    assert OUT.read_text(encoding="utf-8").replace("\r\n", "\n") == render(), (
        "frontend/openapi.json is stale: run `uv run python -m scripts.dump_openapi` "
        "and `npm run gen:api` in frontend/"
    )
