import pytest

from tests.helpers import register_and_login

pytestmark = pytest.mark.asyncio


async def _new(client, headers, **extra):
    body = {"name": "Maria Silva", "document": "123.456.789-09", "email": "Maria@X.com"}
    resp = await client.post("/customers", json=body | extra, headers=headers)
    return resp


async def test_create_normalizes_and_rejects_duplicate_document(client):
    headers = await register_and_login(client)

    resp = await _new(client, headers)
    dup = await _new(client, headers, document="12345678909")

    assert resp.status_code == 201
    assert resp.json()["document"] == "12345678909"
    assert resp.json()["email"] == "maria@x.com"
    assert dup.status_code == 409
    bad = await _new(client, headers, document="1", email="nope")
    assert bad.status_code == 400


async def test_consent_grant_withdraw_and_history(client):
    headers = await register_and_login(client)
    cid = (await _new(client, headers)).json()["id"]
    url = f"/customers/{cid}/consents"

    await client.post(
        url,
        json={"purpose": "MARKETING_EMAIL", "granted": True, "source": "store"},
        headers=headers,
    )
    await client.post(
        url,
        json={"purpose": "MARKETING_EMAIL", "granted": False, "source": "store"},
        headers=headers,
    )

    current = (await client.get(f"/customers/{cid}", headers=headers)).json()
    export = (await client.get(f"/customers/{cid}/export", headers=headers)).json()
    assert current["consents"] == {"MARKETING_EMAIL": False}
    assert [c["granted"] for c in export["consent_history"]] == [True, False]


async def test_anonymize_blanks_pii_and_withdraws_consent(client):
    headers = await register_and_login(client)
    cid = (await _new(client, headers)).json()["id"]
    await client.post(
        f"/customers/{cid}/consents",
        json={"purpose": "MARKETING_WHATSAPP", "granted": True, "source": "site"},
        headers=headers,
    )

    resp = await client.post(f"/customers/{cid}/anonymize", headers=headers)
    again = await client.post(f"/customers/{cid}/anonymize", headers=headers)
    edit = await client.patch(f"/customers/{cid}", json={"name": "X"}, headers=headers)

    body = resp.json()
    assert resp.status_code == 200 and again.status_code == 200
    assert body["document"] is None and body["email"] is None
    assert body["anonymized_at"] and body["consents"] == {"MARKETING_WHATSAPP": False}
    assert edit.status_code == 409
    # the document is free again and the audit log never holds the PII
    assert (await _new(client, headers)).status_code == 201
    logs = (await client.get("/admin/audit-logs", headers=headers)).text
    assert "12345678909" not in logs


async def test_list_search_and_update(client):
    headers = await register_and_login(client)
    await _new(client, headers)
    await _new(client, headers, name="Joao", document="999", email=None)

    found = await client.get("/customers", params={"q": "maria"}, headers=headers)
    patched = await client.patch(
        "/customers/1", json={"phone": "+5511999"}, headers=headers
    )
    missing = await client.get("/customers/999", headers=headers)

    assert [c["name"] for c in found.json()["items"]] == ["Maria Silva"]
    assert patched.json()["phone"] == "+5511999"
    assert missing.status_code == 404
