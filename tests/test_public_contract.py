"""Contract tests for GET /public/v1/catalog (ADR 0001).

The JSON schema of the response is frozen in tests/contracts/. Inside v1 only
additive changes are allowed (new optional fields). Any difference fails this test
so it is seen in review:

* additive change  -> regenerate the snapshot:
      UPDATE_CONTRACT=1 uv run pytest tests/test_public_contract.py
  and copy the file to Catalogo-NY (`npm run contract:sync` there).
* breaking change (removed/renamed/retyped field, new required field)
  -> do not edit v1: add /public/v2 next to it and keep v1 for 90 days.
"""

import json
import os
from pathlib import Path

import pytest

from app.schemas.public import PublicBranchesOut, PublicCatalogOut

CONTRACTS = Path(__file__).parent / "contracts"
# route -> (response model, frozen snapshot)
FROZEN = {
    "/public/v1/catalog": (
        PublicCatalogOut,
        CONTRACTS / "public_catalog_v1.schema.json",
    ),
    "/public/v1/branches": (
        PublicBranchesOut,
        CONTRACTS / "public_branches_v1.schema.json",
    ),
}


def current_schema(route: str = "/public/v1/catalog") -> dict:
    return FROZEN[route][0].model_json_schema()


def _type(prop: dict) -> str:
    if "$ref" in prop:
        return prop["$ref"]
    if "anyOf" in prop:
        return "|".join(sorted(_type(p) for p in prop["anyOf"]))
    if prop.get("type") == "array":
        return f"array<{_type(prop['items'])}>"
    kind = str(prop.get("type"))
    return f"{kind}:{prop['format']}" if "format" in prop else kind


def breaking_changes(old: dict, new: dict) -> list[str]:
    """What a v1 consumer would trip over; additions of optional fields are fine."""
    problems: list[str] = []
    old_defs, new_defs = old.get("$defs", {}), new.get("$defs", {})
    for name, old_def in {"<root>": old, **old_defs}.items():
        new_def = new if name == "<root>" else new_defs.get(name)
        if new_def is None:
            problems.append(f"{name}: type removed")
            continue
        old_props, new_props = (
            old_def.get("properties", {}),
            new_def.get("properties", {}),
        )
        for field, prop in old_props.items():
            if field not in new_props:
                problems.append(f"{name}.{field}: field removed")
            elif _type(prop) != _type(new_props[field]):
                now = _type(new_props[field])
                problems.append(f"{name}.{field}: type changed {_type(prop)} -> {now}")
        for field in set(new_def.get("required", [])) - set(
            old_def.get("required", [])
        ):
            if field not in old_props:
                problems.append(f"{name}.{field}: new required field")
    return problems


@pytest.mark.parametrize("route", FROZEN)
def test_public_v1_matches_the_frozen_contract(route):
    snapshot = FROZEN[route][1]
    if os.environ.get("UPDATE_CONTRACT"):
        snapshot.write_text(
            json.dumps(current_schema(route), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    frozen = json.loads(snapshot.read_text(encoding="utf-8"))
    current = current_schema(route)

    breaking = breaking_changes(frozen, current)
    assert not breaking, (
        f"BREAKING change to {route}: "
        + "; ".join(breaking)
        + ". Do not change v1; add /public/v2 and keep v1 for 90 days (ADR 0001)."
    )
    assert current == frozen, (
        f"The {route} schema changed (additive). Regenerate the snapshot "
        "with UPDATE_CONTRACT=1 and copy it to Catalogo-NY."
    )


# --- the classifier itself -------------------------------------------------------


def _schema(**props) -> dict:
    return {
        "properties": {name: {"type": kind} for name, kind in props.items()},
        "required": list(props),
        "$defs": {},
    }


def test_removing_a_field_is_breaking():
    old = _schema(id="integer", name="string")
    assert breaking_changes(old, _schema(id="integer")) == [
        "<root>.name: field removed"
    ]


def test_changing_a_type_is_breaking():
    problems = breaking_changes(_schema(price="string"), _schema(price="number"))
    assert problems == ["<root>.price: type changed string -> number"]


def test_a_new_required_field_is_breaking_but_an_optional_one_is_not():
    old = _schema(id="integer")
    new_required = _schema(id="integer", extra="string")
    new_optional = {**new_required, "required": ["id"]}

    assert breaking_changes(old, new_required) == ["<root>.extra: new required field"]
    assert breaking_changes(old, new_optional) == []


def test_removing_a_nested_type_is_breaking():
    old = {**_schema(id="integer"), "$defs": {"Item": _schema(sku="string")}}
    new = _schema(id="integer")
    assert breaking_changes(old, new) == ["Item: type removed"]


@pytest.mark.parametrize("field", ["sectors", "meta"])
def test_the_real_schema_keeps_the_top_level_fields_the_site_reads(field):
    assert field in current_schema()["properties"]
