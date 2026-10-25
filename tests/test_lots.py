from datetime import timedelta

import pytest

from app.domain.lots import today_local
from tests.helpers import create_branch, create_sku, on_hand, register_and_login

pytestmark = pytest.mark.asyncio


async def _setup(client):
    headers = await register_and_login(client)
    branch_id, location_id = await create_branch(client, headers)
    sku_id = await create_sku(client, headers, sku_code="LOT-1")
    return headers, branch_id, location_id, sku_id


async def _receive(client, headers, setup, qty, lot_code=None, expires_on=None):
    _, branch_id, location_id, sku_id = setup
    body = {
        "branch_id": branch_id,
        "location_id": location_id,
        "sku_id": sku_id,
        "qty": qty,
    }
    if lot_code:
        body["lot_code"] = lot_code
    if expires_on:
        body["expires_on"] = str(expires_on)
    return await client.post("/stock/receipts", json=body, headers=headers)


async def _issue(client, headers, setup, qty, lot_id=None):
    _, branch_id, location_id, sku_id = setup
    body = {
        "branch_id": branch_id,
        "location_id": location_id,
        "sku_id": sku_id,
        "qty": qty,
    }
    if lot_id:
        body["lot_id"] = lot_id
    return await client.post("/stock/issues", json=body, headers=headers)


async def _lots(client, headers, **params):
    resp = await client.get("/stock/lots", params=params, headers=headers)
    assert resp.status_code == 200
    return resp.json()["items"]


async def test_issue_takes_the_oldest_expiry_first(client):
    setup = await _setup(client)
    headers = setup[0]
    today = today_local()
    later = await _receive(client, headers, setup, 5, "L-LATE", today + timedelta(60))
    sooner = await _receive(client, headers, setup, 5, "L-SOON", today + timedelta(10))
    assert later.status_code == sooner.status_code == 201
    assert sooner.json()["lots"][0]["code"] == "L-SOON"

    issue = await _issue(client, headers, setup, 7)

    assert issue.status_code == 201
    taken = {(a["code"], a["qty"]) for a in issue.json()["lots"]}
    assert taken == {("L-SOON", -5), ("L-LATE", -2)}  # oldest emptied first
    left = {lot["code"]: lot["on_hand"] for lot in await _lots(client, headers)}
    assert left == {"L-LATE": 3}  # the emptied lot is hidden
    assert await on_hand(client, headers, setup[1], setup[3]) == 3


async def test_a_lot_without_expiry_is_used_last(client):
    setup = await _setup(client)
    headers = setup[0]
    await _receive(client, headers, setup, 3, "NO-DATE")
    await _receive(client, headers, setup, 3, "DATED", today_local() + timedelta(500))

    issue = await _issue(client, headers, setup, 4)

    assert {(a["code"], a["qty"]) for a in issue.json()["lots"]} == {
        ("DATED", -3),
        ("NO-DATE", -1),
    }


async def test_untracked_stock_covers_what_the_lots_cannot(client):
    setup = await _setup(client)
    headers, branch_id, _, sku_id = setup
    await _receive(client, headers, setup, 4)  # no lot: untracked
    await _receive(client, headers, setup, 3, "L1", today_local() + timedelta(5))

    issue = await _issue(client, headers, setup, 5)

    assert issue.status_code == 201
    assert [(a["code"], a["qty"]) for a in issue.json()["lots"]] == [("L1", -3)]
    assert await on_hand(client, headers, branch_id, sku_id) == 2  # 7 - 5


async def test_a_named_lot_is_used_and_checked(client):
    setup = await _setup(client)
    headers = setup[0]
    soon = today_local() + timedelta(5)
    await _receive(client, headers, setup, 4, "SOON", soon)
    await _receive(client, headers, setup, 4, "LATE", today_local() + timedelta(90))
    lots = {lot["code"]: lot["id"] for lot in await _lots(client, headers)}

    explicit = await _issue(client, headers, setup, 2, lot_id=lots["LATE"])
    assert [(a["code"], a["qty"]) for a in explicit.json()["lots"]] == [("LATE", -2)]

    too_many = await _issue(client, headers, setup, 3, lot_id=lots["LATE"])
    assert too_many.status_code == 409 and "has 2 units" in too_many.text
    assert (await _issue(client, headers, setup, 1, lot_id=9999)).status_code == 404


async def test_lot_input_is_validated(client):
    setup = await _setup(client)
    headers = setup[0]
    day = today_local() + timedelta(30)

    assert (await _receive(client, headers, setup, 2, None, day)).status_code == 400
    assert (await _receive(client, headers, setup, 2, "X", day)).status_code == 201
    again = await _receive(client, headers, setup, 2, "X", day + timedelta(1))
    assert again.status_code == 409 and "already expires" in again.text
    same = await _receive(client, headers, setup, 2, "X", day)  # same expiry: tops up
    assert same.status_code == 201
    assert [lot["on_hand"] for lot in await _lots(client, headers)] == [4]


async def test_fefo_suggestion_matches_the_issue_that_follows(client):
    setup = await _setup(client)
    headers, branch_id, _, sku_id = setup
    await _receive(client, headers, setup, 5, "B", today_local() + timedelta(20))
    await _receive(client, headers, setup, 5, "A", today_local() + timedelta(3))

    plan = await client.get(
        "/stock/lots/fefo",
        params={"branch_id": branch_id, "sku_id": sku_id, "qty": 8},
        headers=headers,
    )
    body = plan.json()
    assert [(s["code"], s["qty"]) for s in body["steps"]] == [("A", 5), ("B", 3)]
    assert (body["from_lots"], body["untracked"]) == (8, 0)

    issue = await _issue(client, headers, setup, 8)
    assert [(a["code"], -a["qty"]) for a in issue.json()["lots"]] == [
        (s["code"], s["qty"]) for s in body["steps"]
    ]
    # asking for more than the lots hold reports the rest as untracked
    more = await client.get(
        "/stock/lots/fefo",
        params={"branch_id": branch_id, "sku_id": sku_id, "qty": 9},
        headers=headers,
    )
    assert (more.json()["from_lots"], more.json()["untracked"]) == (2, 7)


async def test_lots_expiring_within_n_days_are_listed_with_days_left(client):
    setup = await _setup(client)
    headers = setup[0]
    today = today_local()
    await _receive(client, headers, setup, 1, "EXPIRED", today - timedelta(2))
    await _receive(client, headers, setup, 1, "SOON", today + timedelta(7))
    await _receive(client, headers, setup, 1, "FAR", today + timedelta(200))
    await _receive(client, headers, setup, 1, "NODATE")

    soon = await _lots(client, headers, expiring_within_days=30)

    assert [(lot["code"], lot["days_to_expiry"]) for lot in soon] == [
        ("EXPIRED", -2),
        ("SOON", 7),
    ]
    everything = await _lots(client, headers)
    assert [lot["code"] for lot in everything] == ["EXPIRED", "SOON", "FAR", "NODATE"]


async def test_adjustments_use_lots_too_and_transfers_do_not_touch_them(client):
    setup = await _setup(client)
    headers, branch_id, location_id, sku_id = setup
    adjust = await client.post(
        "/stock/adjustments",
        json={
            "branch_id": branch_id,
            "location_id": location_id,
            "sku_id": sku_id,
            "qty_delta": 6,
            "lot_code": "ADJ",
            "expires_on": str(today_local() + timedelta(40)),
        },
        headers=headers,
    )
    assert adjust.status_code == 201 and adjust.json()["lots"][0]["qty"] == 6

    writeoff = await client.post(
        "/stock/adjustments",
        json={
            "branch_id": branch_id,
            "location_id": location_id,
            "sku_id": sku_id,
            "qty_delta": -2,
            "reason_code": "EXPIRY",
        },
        headers=headers,
    )
    assert [(a["code"], a["qty"]) for a in writeoff.json()["lots"]] == [("ADJ", -2)]

    dest_branch, dest_location = await create_branch(client, headers, "Destino")
    transfer = await client.post(
        "/stock/transfers",
        json={
            "from_branch_id": branch_id,
            "from_location_id": location_id,
            "to_branch_id": dest_branch,
            "to_location_id": dest_location,
            "items": [{"sku_id": sku_id, "qty": 3}],
        },
        headers=headers,
    )
    transfer_id = transfer.json()["id"]
    await client.post(f"/stock/transfers/{transfer_id}/ship", headers=headers)
    await client.post(f"/stock/transfers/{transfer_id}/receive", headers=headers)

    assert [lot["on_hand"] for lot in await _lots(client, headers)] == [4]  # unchanged


async def test_lots_require_auth(client):
    assert (await client.get("/stock/lots")).status_code == 401


async def test_a_blank_lot_code_is_no_lot_and_never_a_lot_named_empty(client):
    setup = await _setup(client)
    headers = setup[0]
    day = today_local() + timedelta(30)

    plain = await _receive(client, headers, setup, 2, "   ")
    assert plain.status_code == 201 and plain.json()["lots"] == []
    assert await _lots(client, headers) == []

    dated = await _receive(client, headers, setup, 2, "   ", day)
    assert dated.status_code == 400 and "needs a lot_code" in dated.text


async def test_losing_the_race_to_create_a_lot_joins_the_winners_lot(
    client, monkeypatch
):
    from sqlalchemy import select

    from app.core.db import get_sessionmaker
    from app.domain import lots as lots_module
    from app.models.entities import Lot, StockMove
    from app.models.enums import MoveType

    setup = await _setup(client)
    _, branch_id, _, sku_id = setup
    day = today_local() + timedelta(30)
    # the winner: this lot already exists when the loser looks it up
    await _receive(client, setup[0], setup, 1, "RACE", day)

    real_find = lots_module._find_lot
    calls = []

    async def blind_first_time(session, move, code):
        calls.append(code)
        if len(calls) == 1:
            return None  # the loser did not see the winner's row yet
        return await real_find(session, move, code)

    monkeypatch.setattr(lots_module, "_find_lot", blind_first_time)

    async with get_sessionmaker()() as session:
        move = StockMove(
            branch_id=branch_id, sku_id=sku_id, move_type=MoveType.RECEIPT, qty=4
        )
        session.add(move)
        await session.flush()
        allocations = await lots_module.allocate_lots(
            session, move, lots_module.LotSpec(code="RACE", expires_on=day)
        )
        await session.commit()

    assert calls == ["RACE", "RACE"]  # looked up, hit the constraint, looked up again
    assert [(a.code, a.qty) for a in allocations] == [("RACE", 4)]
    async with get_sessionmaker()() as session:
        rows = (await session.scalars(select(Lot))).all()
    assert len(rows) == 1  # one lot, not two and not an error
