async def register_and_login(
    client,
    *,
    email: str = "admin@example.com",
    name: str = "Admin User",
    password: str = "Password123!",
) -> dict[str, str]:
    register_response = await client.post(
        "/auth/register",
        json={"name": name, "email": email, "password": password},
    )
    assert register_response.status_code == 201
    login_response = await client.post(
        "/auth/login", json={"email": email, "password": password}
    )
    assert login_response.status_code == 200
    return {"Authorization": f"Bearer {login_response.json()['access_token']}"}


async def create_branch(client, headers, name="Filial A") -> tuple[int, int]:
    response = await client.post("/branches", json={"name": name}, headers=headers)
    assert response.status_code == 201
    branch_id = response.json()["id"]
    location_response = await client.post(
        "/locations",
        json={"branch_id": branch_id, "name": f"{name} - Deposito", "type": "STOCK"},
        headers=headers,
    )
    assert location_response.status_code == 201
    return branch_id, location_response.json()["id"]


async def create_sku(client, headers, *, sku_code="SKU-1") -> int:
    product_response = await client.post(
        "/catalog/products",
        json={"name": f"Produto {sku_code}", "active": True},
        headers=headers,
    )
    assert product_response.status_code == 201
    sku_response = await client.post(
        "/catalog/skus",
        json={
            "product_id": product_response.json()["id"],
            "sku_code": sku_code,
            "name": f"Produto {sku_code}",
            "unit": "UN",
            "cost": "10.00",
            "price": "20.00",
        },
        headers=headers,
    )
    assert sku_response.status_code == 201
    return sku_response.json()["id"]


async def receipt(client, headers, branch_id, location_id, sku_id, qty, **extra):
    return await client.post(
        "/stock/receipts",
        json={
            "branch_id": branch_id,
            "location_id": location_id,
            "sku_id": sku_id,
            "qty": qty,
        },
        headers={**headers, **extra},
    )


async def on_hand(client, headers, branch_id, sku_id) -> int:
    response = await client.get(
        f"/stock/balances?branch_id={branch_id}&sku_id={sku_id}", headers=headers
    )
    assert response.status_code == 200
    return sum(item["on_hand"] for item in response.json()["items"])
