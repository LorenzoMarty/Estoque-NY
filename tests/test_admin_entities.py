import pytest


async def _auth_headers(client, prefix: str = "") -> dict[str, str]:
    register_payload = {
        "name": "Admin User",
        "email": "admin@example.com",
        "password": "Password123!",
    }
    register_response = await client.post(
        f"{prefix}/auth/register",
        json=register_payload,
    )
    assert register_response.status_code == 201

    login_response = await client.post(
        f"{prefix}/auth/login",
        json={
            "email": register_payload["email"],
            "password": register_payload["password"],
        },
    )
    assert login_response.status_code == 200
    access_token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {access_token}"}


@pytest.mark.asyncio
async def test_admin_routes_require_auth(client):
    response = await client.get("/branches")
    assert response.status_code == 401
    payload = response.json()
    assert payload["error"]["message"] == "missing bearer token"


@pytest.mark.asyncio
async def test_health_routes_available_with_and_without_api_prefix(client):
    direct_health = await client.get("/health")
    assert direct_health.status_code == 200
    assert direct_health.json()["status"] == "ok"

    vercel_health = await client.get("/api/health")
    assert vercel_health.status_code == 200
    assert vercel_health.json()["status"] == "ok"

    direct_db_health = await client.get("/health/db")
    assert direct_db_health.status_code == 200
    assert direct_db_health.json()["db"] == "up"

    vercel_db_health = await client.get("/api/health/db")
    assert vercel_db_health.status_code == 200
    assert vercel_db_health.json()["db"] == "up"


@pytest.mark.asyncio
async def test_auth_routes_available_with_api_prefix(client):
    headers = await _auth_headers(client, prefix="/api")
    response = await client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["email"] == "admin@example.com"


@pytest.mark.asyncio
async def test_admin_crud_branches_locations_brands(client):
    headers = await _auth_headers(client)

    create_branch = await client.post(
        "/branches",
        json={"name": "Filial Matriz"},
        headers=headers,
    )
    assert create_branch.status_code == 201
    branch = create_branch.json()
    branch_id = branch["id"]

    list_branches = await client.get(
        "/branches?page=1&page_size=20&sort=name&order=asc&q=matriz",
        headers=headers,
    )
    assert list_branches.status_code == 200
    branches_payload = list_branches.json()
    assert branches_payload["meta"]["total"] >= 1
    assert any(row["id"] == branch_id for row in branches_payload["items"])

    update_branch = await client.put(
        f"/branches/{branch_id}",
        json={"name": "Filial Centro"},
        headers=headers,
    )
    assert update_branch.status_code == 200
    assert update_branch.json()["name"] == "Filial Centro"

    create_location = await client.post(
        "/locations",
        json={
            "branch_id": branch_id,
            "name": "Deposito A",
            "type": "STOCK",
        },
        headers=headers,
    )
    assert create_location.status_code == 201
    location = create_location.json()
    location_id = location["id"]
    assert location["branch_id"] == branch_id

    list_locations = await client.get(
        f"/locations?page=1&page_size=20&branch_id={branch_id}",
        headers=headers,
    )
    assert list_locations.status_code == 200
    locations_payload = list_locations.json()
    assert locations_payload["meta"]["total"] >= 1
    assert any(row["id"] == location_id for row in locations_payload["items"])

    update_location = await client.put(
        f"/locations/{location_id}",
        json={
            "branch_id": branch_id,
            "name": "Deposito Principal",
            "type": "STORE",
        },
        headers=headers,
    )
    assert update_location.status_code == 200
    assert update_location.json()["name"] == "Deposito Principal"

    create_brand = await client.post(
        "/brands",
        json={"name": "Marca Teste"},
        headers=headers,
    )
    assert create_brand.status_code == 201
    brand_id = create_brand.json()["id"]

    list_brands = await client.get(
        "/brands?page=1&page_size=20&sort=name&order=asc&q=teste",
        headers=headers,
    )
    assert list_brands.status_code == 200
    brands_payload = list_brands.json()
    assert brands_payload["meta"]["total"] >= 1
    assert any(row["id"] == brand_id for row in brands_payload["items"])

    update_brand = await client.put(
        f"/brands/{brand_id}",
        json={"name": "Marca Atualizada"},
        headers=headers,
    )
    assert update_brand.status_code == 200
    assert update_brand.json()["name"] == "Marca Atualizada"

    delete_branch_with_location = await client.delete(
        f"/branches/{branch_id}",
        headers=headers,
    )
    assert delete_branch_with_location.status_code == 400
    assert (
        delete_branch_with_location.json()["error"]["message"]
        == "cannot delete branch with associated locations"
    )

    delete_brand = await client.delete(
        f"/brands/{brand_id}",
        headers=headers,
    )
    assert delete_brand.status_code == 204

    delete_location = await client.delete(
        f"/locations/{location_id}",
        headers=headers,
    )
    assert delete_location.status_code == 204

    delete_branch = await client.delete(
        f"/branches/{branch_id}",
        headers=headers,
    )
    assert delete_branch.status_code == 204
