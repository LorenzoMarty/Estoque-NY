import pytest


@pytest.mark.asyncio
async def test_error_response_envelope_contains_request_id(client):
    response = await client.post(
        "/stock/adjustments",
        json={"branch_id": 1, "sku_id": 1, "qty_delta": 1},
    )
    assert response.status_code == 401
    payload = response.json()
    assert "error" in payload
    assert payload["error"]["code"] == "http_error"
    assert payload["error"]["request_id"] is not None


@pytest.mark.asyncio
async def test_audit_logs_endpoint_returns_paginated_payload(client, auth_headers):
    branch = await client.post(
        "/branches",
        json={"name": "Audit Contract Branch"},
        headers=auth_headers,
    )
    assert branch.status_code == 201

    response = await client.get(
        "/audit-logs?page=1&page_size=10&sort=created_at&order=desc",
        headers=auth_headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert "items" in payload
    assert "meta" in payload
    assert payload["meta"]["page"] == 1
    assert payload["meta"]["page_size"] == 10
    assert payload["meta"]["total"] >= 1
    assert any(item.get("action") == "branch.create" for item in payload["items"])
