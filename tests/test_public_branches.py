import pytest

from tests.helpers import register_and_login

pytestmark = pytest.mark.asyncio

URL = "/public/v1/branches"
PROFILE = {
    "public_name": "NY Centro",
    "address": "Av. Brasil 100, Chuí",
    "phone": "+55 53 3265-0000",
    "opening_hours": {"mon": "09:00-18:00", "sun": None},
    "timezone": "America/Sao_Paulo",
}


async def _branch(client, headers, name, **profile):
    resp = await client.post(
        "/branches", json={"name": name, **profile}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def test_only_branches_with_a_public_name_are_listed_without_internal_data(
    client,
):
    headers = await register_and_login(client)
    await _branch(client, headers, "Interna")
    await _branch(client, headers, "Filial A", **PROFILE)

    resp = await client.get(URL)  # no auth

    assert resp.status_code == 200
    assert resp.json() == {
        "branches": [
            {k: v for k, v in PROFILE.items() if k != "public_name"}
            | {"name": "NY Centro"}
        ]
    }
    assert "Interna" not in resp.text and "Filial A" not in resp.text
    assert "id" not in resp.json()["branches"][0]
    assert "max-age=60" in resp.headers["cache-control"]


async def test_editing_a_branch_changes_the_response_and_etag(client):
    headers = await register_and_login(client)
    branch_id = await _branch(client, headers, "Filial A", **PROFILE)
    first = await client.get(URL)

    # PUT with only the name must not wipe the profile
    keep = await client.put(
        f"/branches/{branch_id}", json={"name": "Filial A2"}, headers=headers
    )
    assert keep.status_code == 200
    assert (await client.get(URL)).json() == first.json()

    edit = await client.put(
        f"/branches/{branch_id}",
        json={"name": "Filial A2", "phone": "+55 53 0000-1111"},
        headers=headers,
    )
    assert edit.status_code == 200
    second = await client.get(URL)
    assert second.json()["branches"][0]["phone"] == "+55 53 0000-1111"
    assert second.headers["etag"] != first.headers["etag"]

    cached = await client.get(URL, headers={"If-None-Match": second.headers["etag"]})
    assert cached.status_code == 304


@pytest.mark.parametrize(
    "bad",
    [
        {"opening_hours": {"funday": "09:00-18:00"}},
        {"opening_hours": {"mon": "9-18"}},
        {"timezone": "Mars/Base"},
    ],
)
async def test_invalid_profile_is_rejected(client, bad):
    headers = await register_and_login(client)
    resp = await client.post("/branches", json={"name": "X", **bad}, headers=headers)
    assert resp.status_code == 400
