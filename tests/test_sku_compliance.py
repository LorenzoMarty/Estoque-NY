import pytest

from tests.helpers import register_and_login


async def _create_product(client, headers) -> int:
    response = await client.post(
        "/catalog/products",
        json={"name": "Produto fiscal", "active": True},
        headers=headers,
    )
    assert response.status_code == 201
    return response.json()["id"]


async def _post_sku(client, headers, product_id, **extra):
    return await client.post(
        "/catalog/skus",
        json={
            "product_id": product_id,
            "sku_code": extra.pop("sku_code", "F-1"),
            **extra,
        },
        headers=headers,
    )


@pytest.mark.asyncio
async def test_sku_stores_ncm_and_origin(client):
    headers = await register_and_login(client)
    product_id = await _create_product(client, headers)

    response = await _post_sku(
        client, headers, product_id, ncm="22083020", origin="FOREIGN"
    )

    assert response.status_code == 201
    body = response.json()
    assert body["ncm"] == "22083020"
    assert body["origin"] == "FOREIGN"
    assert body["restricted"] is False


@pytest.mark.asyncio
async def test_legacy_sku_without_fiscal_fields_still_works(client):
    headers = await register_and_login(client)
    product_id = await _create_product(client, headers)

    response = await _post_sku(client, headers, product_id)

    assert response.status_code == 201
    assert response.json()["ncm"] is None
    assert response.json()["origin"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("ncm", ["2208302", "220830201", "2208302a", "22.08.30"])
async def test_ncm_must_have_exactly_eight_digits(client, ncm):
    headers = await register_and_login(client)
    product_id = await _create_product(client, headers)

    response = await _post_sku(client, headers, product_id, ncm=ncm)

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_origin_must_be_a_known_value(client):
    headers = await register_and_login(client)
    product_id = await _create_product(client, headers)

    response = await _post_sku(client, headers, product_id, origin="MOON")

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_chapter_71_ncm_cannot_be_active(client):
    headers = await register_and_login(client)
    product_id = await _create_product(client, headers)

    response = await _post_sku(client, headers, product_id, ncm="71131100")

    assert response.status_code == 422
    assert "chapter 71" in response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_restricted_sku_cannot_be_active(client):
    headers = await register_and_login(client)
    product_id = await _create_product(client, headers)

    response = await _post_sku(client, headers, product_id, restricted=True)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_restricted_sku_is_allowed_when_inactive(client):
    headers = await register_and_login(client)
    product_id = await _create_product(client, headers)

    response = await _post_sku(
        client, headers, product_id, ncm="71131100", active=False
    )

    assert response.status_code == 201
    assert response.json()["active"] is False


@pytest.mark.asyncio
async def test_update_cannot_activate_or_restrict_into_a_forbidden_state(client):
    headers = await register_and_login(client)
    product_id = await _create_product(client, headers)
    sku_id = (await _post_sku(client, headers, product_id)).json()["id"]

    to_chapter_71 = await client.patch(
        f"/catalog/skus/{sku_id}", json={"ncm": "71131100"}, headers=headers
    )
    assert to_chapter_71.status_code == 422

    ok = await client.patch(
        f"/catalog/skus/{sku_id}",
        json={"ncm": "71131100", "active": False},
        headers=headers,
    )
    assert ok.status_code == 200

    reactivate = await client.patch(
        f"/catalog/skus/{sku_id}", json={"active": True}, headers=headers
    )
    assert reactivate.status_code == 422
