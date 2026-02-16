import pytest


@pytest.mark.asyncio
async def test_stock_mvp_flow(client, auth_headers):
    branch_response = await client.post(
        "/branches",
        json={"name": "Matriz NY"},
        headers=auth_headers,
    )
    assert branch_response.status_code == 201
    branch_id = branch_response.json()["id"]

    location_response = await client.post(
        "/locations",
        json={
            "branch_id": branch_id,
            "name": "Estoque Principal",
            "type": "STOCK",
        },
        headers=auth_headers,
    )
    assert location_response.status_code == 201

    product_response = await client.post(
        "/products",
        json={"name": "Camiseta Basica", "brand": "NY", "active": True},
        headers=auth_headers,
    )
    assert product_response.status_code == 201
    product_id = product_response.json()["id"]

    sku_response = await client.post(
        "/skus",
        json={
            "product_id": product_id,
            "sku_code": "TSHIRT-BASIC-NY",
            "unit": "UN",
            "active": True,
        },
        headers=auth_headers,
    )
    assert sku_response.status_code == 201
    sku_id = sku_response.json()["id"]

    receipt_response = await client.post(
        "/stock/receipts",
        json={
            "branch_id": branch_id,
            "sku_id": sku_id,
            "qty": 10,
            "reason": "Entrada inicial",
        },
        headers=auth_headers,
    )
    assert receipt_response.status_code == 201
    receipt_payload = receipt_response.json()
    assert receipt_payload["qty"] == 10
    assert receipt_payload["balance_after"] == 10

    issue_response = await client.post(
        "/stock/issues",
        json={
            "branch_id": branch_id,
            "sku_id": sku_id,
            "qty": 3,
            "reason": "Venda balcao",
        },
        headers=auth_headers,
    )
    assert issue_response.status_code == 201
    issue_payload = issue_response.json()
    assert issue_payload["qty"] == -3
    assert issue_payload["balance_after"] == 7

    balance_response = await client.get(
        f"/stock/balances?branch_id={branch_id}&sku_id={sku_id}",
        headers=auth_headers,
    )
    assert balance_response.status_code == 200
    balances = balance_response.json()
    assert len(balances) == 1
    assert balances[0]["on_hand"] == 7

    moves_response = await client.get(
        f"/stock/moves?branch_id={branch_id}&sku_id={sku_id}&limit=10&offset=0",
        headers=auth_headers,
    )
    assert moves_response.status_code == 200
    moves = moves_response.json()
    assert len(moves) == 2
    assert moves[0]["qty"] == 10
    assert moves[1]["qty"] == -3
