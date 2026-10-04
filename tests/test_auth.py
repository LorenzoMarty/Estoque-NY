import pytest

from tests.helpers import register_and_login

PASSWORD = "Password123!"


@pytest.mark.asyncio
async def test_login_returns_working_token_pair(client):
    headers = await register_and_login(client)

    me = await client.get("/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == "admin@example.com"


@pytest.mark.asyncio
async def test_login_rejects_wrong_password_and_unknown_user(client):
    await register_and_login(client)

    wrong = await client.post(
        "/auth/login", json={"email": "admin@example.com", "password": "wrong-pass-1"}
    )
    assert wrong.status_code == 401

    unknown = await client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": PASSWORD}
    )
    assert unknown.status_code == 401


@pytest.mark.asyncio
async def test_duplicate_email_registration_conflicts(client):
    await register_and_login(client)

    duplicate = await client.post(
        "/auth/register",
        json={"name": "Other", "email": "admin@example.com", "password": PASSWORD},
    )
    assert duplicate.status_code == 409


@pytest.mark.asyncio
async def test_invalid_and_wrong_type_tokens_are_rejected(client):
    await client.post(
        "/auth/register",
        json={"name": "Admin", "email": "admin@example.com", "password": PASSWORD},
    )
    login = await client.post(
        "/auth/login", json={"email": "admin@example.com", "password": PASSWORD}
    )
    tokens = login.json()

    garbage = await client.get(
        "/auth/me", headers={"Authorization": "Bearer not-a-token"}
    )
    assert garbage.status_code == 401

    refresh_as_access = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {tokens['refresh_token']}"}
    )
    assert refresh_as_access.status_code == 401

    access_as_refresh = await client.post(
        "/auth/refresh", json={"refresh_token": tokens["access_token"]}
    )
    assert access_as_refresh.status_code == 401

    refreshed = await client.post(
        "/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refreshed.status_code == 200
    new_headers = {"Authorization": f"Bearer {refreshed.json()['access_token']}"}
    assert (await client.get("/auth/me", headers=new_headers)).status_code == 200


@pytest.mark.asyncio
async def test_deactivated_user_cannot_login_or_use_existing_token(client):
    admin_headers = await register_and_login(client)
    operator_headers = await register_and_login(
        client, email="op@example.com", name="Operator"
    )
    operator_id = (await client.get("/auth/me", headers=operator_headers)).json()["id"]

    deactivate = await client.patch(
        f"/auth/users/{operator_id}", json={"active": False}, headers=admin_headers
    )
    assert deactivate.status_code == 200

    login = await client.post(
        "/auth/login", json={"email": "op@example.com", "password": PASSWORD}
    )
    assert login.status_code == 403

    stale = await client.get("/auth/me", headers=operator_headers)
    assert stale.status_code == 401


@pytest.mark.asyncio
async def test_first_user_is_admin_and_later_users_are_operators(client):
    admin_headers = await register_and_login(client)
    operator_headers = await register_and_login(
        client, email="op@example.com", name="Operator"
    )

    assert (await client.get("/auth/users", headers=admin_headers)).status_code == 200
    assert (
        await client.get("/auth/users", headers=operator_headers)
    ).status_code == 403


@pytest.mark.asyncio
async def test_viewer_role_can_read_but_not_write(client):
    admin_headers = await register_and_login(client)
    viewer_headers = await register_and_login(
        client, email="viewer@example.com", name="Viewer"
    )
    viewer_id = (await client.get("/auth/me", headers=viewer_headers)).json()["id"]

    assign = await client.post(
        "/auth/roles/assign",
        json={"user_id": viewer_id, "role_name": "viewer"},
        headers=admin_headers,
    )
    assert assign.status_code == 204

    assert (await client.get("/branches", headers=viewer_headers)).status_code == 200
    create = await client.post(
        "/branches", json={"name": "Nova"}, headers=viewer_headers
    )
    assert create.status_code == 403
