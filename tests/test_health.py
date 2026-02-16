import pytest


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "env" in body


@pytest.mark.asyncio
async def test_health_db(client):
    response = await client.get("/health/db")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "up"}
