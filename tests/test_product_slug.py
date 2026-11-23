import pytest

from app.domain.slugs import slugify
from tests.helpers import register_and_login


def test_slugify_strips_accents_and_symbols():
    assert slugify("Perfume Sedução 100ml!") == "perfume-seducao-100ml"
    assert slugify("???") == "produto"


async def _product(client, headers, name, **extra):
    r = await client.post(
        "/catalog/products", json={"name": name, **extra}, headers=headers
    )
    assert r.status_code == 201
    return r.json()


@pytest.mark.asyncio
async def test_slug_is_unique_and_stable_across_renames(client):
    headers = await register_and_login(client)
    a = await _product(client, headers, "Café Especial")
    b = await _product(client, headers, "Café Especial")
    assert (a["slug"], b["slug"]) == ("cafe-especial", "cafe-especial-2")

    renamed = await client.patch(
        f"/catalog/products/{a['id']}", json={"name": "Outro nome"}, headers=headers
    )
    assert renamed.json()["slug"] == "cafe-especial"


@pytest.mark.asyncio
async def test_public_descriptions_fall_back_to_pt(client):
    headers = await register_and_login(client)
    p = await _product(
        client, headers, "Chocolate", description="Barra", description_en="Bar"
    )
    await client.patch(
        f"/catalog/products/{p['id']}", json={"published": True}, headers=headers
    )
    sku = await client.post(
        "/catalog/skus",
        json={
            "product_id": p["id"],
            "sku_code": "CH-1",
            "unit": "UN",
            "cost": "1.00",
            "price": "2.00",
        },
        headers=headers,
    )
    assert sku.status_code == 201, sku.text
    items = (await client.get("/public/v1/catalog")).json()["sectors"][0]["products"]
    got = items[0]
    assert got["slug"] == "chocolate"
    assert (got["description"], got["description_es"], got["description_en"]) == (
        "Barra",
        "Barra",
        "Bar",
    )
