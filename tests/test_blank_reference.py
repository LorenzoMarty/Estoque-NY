import pytest

from tests.helpers import create_branch, create_sku, register_and_login


async def _post(client, headers, path, branch_id, location_id, sku_id, **extra):
    body = {"branch_id": branch_id, "location_id": location_id, "sku_id": sku_id}
    return await client.post(path, json={**body, **extra}, headers=headers)


async def _setup(client):
    headers = await register_and_login(client)
    branch_id, location_id = await create_branch(client, headers)
    sku_id = await create_sku(client, headers)
    return headers, branch_id, location_id, sku_id


@pytest.mark.asyncio
@pytest.mark.parametrize("blank", ["", "   "])
@pytest.mark.parametrize(
    "path, extra",
    [
        ("/stock/receipts", {"qty": 5}),
        ("/stock/adjustments", {"qty_delta": 5}),
    ],
)
async def test_blank_reference_does_not_make_the_next_movement_conflict(
    client, blank, path, extra
):
    headers, branch_id, location_id, sku_id = await _setup(client)

    first = await _post(
        client,
        headers,
        path,
        branch_id,
        location_id,
        sku_id,
        reference_id=blank,
        **extra,
    )
    second = await _post(
        client,
        headers,
        path,
        branch_id,
        location_id,
        sku_id,
        reference_id=blank,
        **extra,
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["reference_id"] is None


@pytest.mark.asyncio
async def test_blank_reason_is_stored_as_no_reason_and_text_is_trimmed(client):
    headers, branch_id, location_id, sku_id = await _setup(client)

    blank = await _post(
        client, headers, "/stock/receipts", branch_id, location_id, sku_id,
        qty=1, reason="  ", reference_id=" ref-1 ",
    )  # fmt: skip

    assert blank.json()["reason"] is None
    assert blank.json()["reference_id"] == "ref-1"


@pytest.mark.asyncio
async def test_a_real_reference_is_still_unique_per_move_type(client):
    headers, branch_id, location_id, sku_id = await _setup(client)

    first = await _post(
        client, headers, "/stock/receipts", branch_id, location_id, sku_id,
        qty=1, reference_id="PO-1",
    )  # fmt: skip
    again = await _post(
        client, headers, "/stock/receipts", branch_id, location_id, sku_id,
        qty=1, reference_id="PO-1",
    )  # fmt: skip

    assert first.status_code == 201
    assert again.status_code == 409
