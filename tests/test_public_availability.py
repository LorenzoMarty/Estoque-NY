import pytest

from tests.helpers import create_branch, receipt, register_and_login
from tests.test_public_catalog import _product, _publish, _sku

pytestmark = pytest.mark.asyncio


async def test_available_at_lists_only_public_branches_with_stock_and_no_numbers(
    client,
):
    headers = await register_and_login(client)
    shop, shop_loc = await create_branch(client, headers, "Loja")
    hidden, hidden_loc = await create_branch(client, headers, "Interna")
    empty, _ = await create_branch(client, headers, "Vazia")
    product = await _product(client, headers, "Alfa")
    sku = await _sku(client, headers, product, "S-A", price="10.00")
    await _publish(client, headers, product)
    await receipt(client, headers, shop, shop_loc, sku, 7)
    await receipt(client, headers, hidden, hidden_loc, sku, 3)
    for branch_id, public_name in ((shop, "NY Centro"), (empty, "NY Vazia")):
        response = await client.put(
            f"/branches/{branch_id}",
            json={"name": f"B{branch_id}", "public_name": public_name},
            headers=headers,
        )
        assert response.status_code == 200

    response = await client.get("/public/v1/catalog")
    item = response.json()["sectors"][0]["products"][0]

    assert item["available_at"] == ["NY Centro"]
    assert '"7"' not in response.text and ": 7" not in response.text
