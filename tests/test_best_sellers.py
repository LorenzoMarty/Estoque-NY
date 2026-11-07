import pytest

from tests.helpers import create_branch, receipt, register_and_login

pytestmark = pytest.mark.asyncio


async def _product_sku(client, headers, name, code):
    product = await client.post(
        "/catalog/products", json={"name": name}, headers=headers
    )
    pid = product.json()["id"]
    await client.patch(
        f"/catalog/products/{pid}", json={"published": True}, headers=headers
    )
    sku = await client.post(
        "/catalog/skus",
        json={"product_id": pid, "sku_code": code, "price": "10"},
        headers=headers,
    )
    return pid, sku.json()["id"]


async def _fixture(client):
    """A sells 2+5=7 (one 4-unit sale is voided), B sells 6, C sells 6, D none."""
    headers = await register_and_login(client)
    branch_id, loc = await create_branch(client, headers)
    ids = {}
    for name in "ABCD":
        ids[name] = await _product_sku(client, headers, name, f"S-{name}")
        await receipt(client, headers, branch_id, loc, ids[name][1], 100)

    async def sell(name, qty):
        body = {
            "branch_id": branch_id,
            "items": [{"sku_id": ids[name][1], "qty": qty}],
        }
        resp = await client.post("/sales", json=body, headers=headers)
        assert resp.status_code == 201
        return resp.json()["id"]

    await sell("A", 2)
    await sell("A", 5)
    await sell("B", 6)
    await sell("C", 6)
    voided = await sell("D", 4)
    await client.post(
        f"/sales/{voided}/void", json={"reason": "mistake"}, headers=headers
    )
    return headers, branch_id, {n: v[0] for n, v in ids.items()}


async def test_ranking_matches_hand_computed_fixture(client):
    headers, branch_id, pid = await _fixture(client)

    resp = await client.get(
        "/reports/sales/best-sellers", params={"branch_id": branch_id}, headers=headers
    )

    rows = [(r["rank"], r["name"], r["qty"]) for r in resp.json()["items"]]
    # B and C tie on 6 units: the lower product id comes first; voided D is absent.
    assert rows == [(1, "A", 7), (2, "B", 6), (3, "C", 6)]


async def test_public_catalog_flags_best_sellers(client):
    headers, _, pid = await _fixture(client)

    resp = await client.get("/public/v1/catalog")

    flags = {
        p["name"]: p["best_seller"]
        for sector in resp.json()["sectors"]
        for p in sector["products"]
    }
    assert flags == {"A": True, "B": True, "C": True, "D": False}
