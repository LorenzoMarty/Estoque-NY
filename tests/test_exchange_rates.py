from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest

from tests.helpers import register_and_login


def _body(rate="5.10", day="2026-11-01", cur="BRL"):
    return {"quote_currency": cur, "rate": rate, "source": "BCB", "effective_date": day}


@pytest.mark.asyncio
async def test_rates_are_append_only_and_historic_values_stay(client):
    headers = await register_and_login(client)
    first = await client.post("/exchange-rates", json=_body(), headers=headers)
    assert first.status_code == 201
    new = await client.post(
        "/exchange-rates", json=_body("5.50", "2026-11-05"), headers=headers
    )
    assert new.status_code == 201
    dup = await client.post("/exchange-rates", json=_body("9.99"), headers=headers)
    assert dup.status_code == 409

    old = await client.get(
        "/exchange-rates", params={"on": "2026-11-03"}, headers=headers
    )
    assert [float(r["rate"]) for r in old.json()] == [5.10]
    latest = await client.get(
        "/exchange-rates", params={"quote_currency": "brl"}, headers=headers
    )
    assert [float(r["rate"]) for r in latest.json()] == [5.50, 5.10]


@pytest.mark.asyncio
async def test_rejects_unknown_currency_and_non_positive_rate(client):
    headers = await register_and_login(client)
    bad_cur = await client.post(
        "/exchange-rates", json=_body(cur="EUR"), headers=headers
    )
    assert bad_cur.status_code == 400
    bad_rate = await client.post(
        "/exchange-rates", json=_body(rate="0"), headers=headers
    )
    assert bad_rate.status_code == 400


def test_late_evening_utc_is_still_the_same_sao_paulo_day():
    from app.domain.lots import LOCAL_TZ

    t = datetime(2026, 11, 2, 1, 30, tzinfo=UTC)  # 22:30 on Nov 1 in Sao Paulo
    assert t.date().isoformat() == "2026-11-02"
    assert t.astimezone(LOCAL_TZ).date().isoformat() == "2026-11-01"
    assert LOCAL_TZ == ZoneInfo("America/Sao_Paulo")
