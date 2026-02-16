from sqlalchemy import text


async def create_branch(client, headers, name: str) -> int:
    response = await client.post("/branches", json={"name": name}, headers=headers)
    assert response.status_code == 201
    return response.json()["id"]


async def create_location(client, headers, branch_id: int, name: str) -> int:
    response = await client.post(
        "/locations",
        json={"branch_id": branch_id, "name": name, "type": "STOCK"},
        headers=headers,
    )
    assert response.status_code == 201
    return response.json()["id"]


async def create_sku(client, headers, product_name: str, sku_code: str) -> int:
    product = await client.post(
        "/products",
        json={"name": product_name, "active": True},
        headers=headers,
    )
    assert product.status_code == 201
    product_id = product.json()["id"]

    sku = await client.post(
        "/skus",
        json={
            "product_id": product_id,
            "sku_code": sku_code,
            "active": True,
            "unit": "UN",
        },
        headers=headers,
    )
    assert sku.status_code == 201
    return sku.json()["id"]


async def create_receipt(
    client,
    headers,
    *,
    branch_id: int,
    location_id: int,
    sku_id: int,
    qty: int,
) -> None:
    response = await client.post(
        "/stock/receipts",
        json={
            "branch_id": branch_id,
            "location_id": location_id,
            "sku_id": sku_id,
            "qty": qty,
            "reason": "seed",
        },
        headers=headers,
    )
    assert response.status_code == 201


async def get_balance(
    client, headers, *, branch_id: int, location_id: int, sku_id: int
) -> int:
    response = await client.get(
        f"/stock/balances?branch_id={branch_id}&location_id={location_id}&sku_id={sku_id}",
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    return payload[0]["on_hand"]


async def create_transfer(
    client,
    headers,
    *,
    from_branch_id: int,
    from_location_id: int,
    to_branch_id: int,
    to_location_id: int,
    items: list[dict],
) -> int:
    response = await client.post(
        "/stock/transfers",
        json={
            "from_branch_id": from_branch_id,
            "from_location_id": from_location_id,
            "to_branch_id": to_branch_id,
            "to_location_id": to_location_id,
            "items": items,
        },
        headers=headers,
    )
    assert response.status_code == 201
    return response.json()["id"]


async def admin_login(client, email: str, password: str) -> dict[str, str]:
    response = await client.post(
        "/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def register_user(client, *, name: str, email: str, password: str) -> None:
    response = await client.post(
        "/auth/register",
        json={"name": name, "email": email, "password": password},
    )
    assert response.status_code == 201


async def count_stock_moves(db_engine, *, transfer_id: int, move_type: str) -> int:
    async with db_engine.begin() as conn:
        value = await conn.scalar(
            text(
                "SELECT COUNT(*) FROM stock_moves WHERE transfer_id = :transfer_id "
                "AND move_type = :move_type"
            ),
            {"transfer_id": transfer_id, "move_type": move_type},
        )
    return int(value or 0)


async def count_audit_logs(db_engine, *, action: str) -> int:
    async with db_engine.begin() as conn:
        value = await conn.scalar(
            text("SELECT COUNT(*) FROM audit_logs WHERE action = :action"),
            {"action": action},
        )
    return int(value or 0)


async def setup_two_branches_with_sku(client, headers, *, sku_code: str, qty: int):
    from_branch_id = await create_branch(client, headers, "From Branch")
    from_location_id = await create_location(
        client, headers, from_branch_id, "From Stock"
    )
    to_branch_id = await create_branch(client, headers, "To Branch")
    to_location_id = await create_location(client, headers, to_branch_id, "To Stock")
    sku_id = await create_sku(client, headers, "Transfer Product", sku_code)
    await create_receipt(
        client,
        headers,
        branch_id=from_branch_id,
        location_id=from_location_id,
        sku_id=sku_id,
        qty=qty,
    )
    return from_branch_id, from_location_id, to_branch_id, to_location_id, sku_id


async def test_transfer_ship_insufficient_stock_returns_409(
    client, auth_headers, db_engine
):
    (
        from_branch_id,
        from_location_id,
        to_branch_id,
        to_location_id,
        sku_id,
    ) = await setup_two_branches_with_sku(
        client,
        auth_headers,
        sku_code="SKU-SHIP-INSUF",
        qty=5,
    )
    transfer_id = await create_transfer(
        client,
        auth_headers,
        from_branch_id=from_branch_id,
        from_location_id=from_location_id,
        to_branch_id=to_branch_id,
        to_location_id=to_location_id,
        items=[{"sku_id": sku_id, "qty": 10}],
    )

    ship = await client.post(
        f"/stock/transfers/{transfer_id}/ship", headers=auth_headers
    )
    assert ship.status_code == 409

    ship_moves = await count_stock_moves(
        db_engine,
        transfer_id=transfer_id,
        move_type="TRANSFER_SHIP",
    )
    assert ship_moves == 0


async def test_transfer_ship_idempotent_same_response(client, auth_headers, db_engine):
    (
        from_branch_id,
        from_location_id,
        to_branch_id,
        to_location_id,
        sku_id,
    ) = await setup_two_branches_with_sku(
        client,
        auth_headers,
        sku_code="SKU-SHIP-IDEMP",
        qty=20,
    )
    transfer_id = await create_transfer(
        client,
        auth_headers,
        from_branch_id=from_branch_id,
        from_location_id=from_location_id,
        to_branch_id=to_branch_id,
        to_location_id=to_location_id,
        items=[{"sku_id": sku_id, "qty": 5}],
    )

    headers = {**auth_headers, "Idempotency-Key": "ship-key-1"}
    first = await client.post(f"/stock/transfers/{transfer_id}/ship", headers=headers)
    second = await client.post(f"/stock/transfers/{transfer_id}/ship", headers=headers)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()

    ship_moves = await count_stock_moves(
        db_engine,
        transfer_id=transfer_id,
        move_type="TRANSFER_SHIP",
    )
    assert ship_moves == 1


async def test_transfer_receive_idempotent_and_without_key_returns_422(
    client, auth_headers
):
    (
        from_branch_id,
        from_location_id,
        to_branch_id,
        to_location_id,
        sku_id,
    ) = await setup_two_branches_with_sku(
        client,
        auth_headers,
        sku_code="SKU-RECV-IDEMP",
        qty=20,
    )
    transfer_id = await create_transfer(
        client,
        auth_headers,
        from_branch_id=from_branch_id,
        from_location_id=from_location_id,
        to_branch_id=to_branch_id,
        to_location_id=to_location_id,
        items=[{"sku_id": sku_id, "qty": 5}],
    )
    ship = await client.post(
        f"/stock/transfers/{transfer_id}/ship",
        headers={**auth_headers, "Idempotency-Key": "ship-key-recv"},
    )
    assert ship.status_code == 200

    receive_headers = {**auth_headers, "Idempotency-Key": "receive-key-1"}
    first = await client.post(
        f"/stock/transfers/{transfer_id}/receive", headers=receive_headers
    )
    second = await client.post(
        f"/stock/transfers/{transfer_id}/receive", headers=receive_headers
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()

    third = await client.post(
        f"/stock/transfers/{transfer_id}/receive", headers=auth_headers
    )
    assert third.status_code == 422


async def test_inventory_post_generates_adjustment(client, auth_headers):
    branch_id = await create_branch(client, auth_headers, "INV Branch")
    location_id = await create_location(client, auth_headers, branch_id, "INV Location")
    sku_id = await create_sku(client, auth_headers, "INV Product", "SKU-INV-POST")
    await create_receipt(
        client,
        auth_headers,
        branch_id=branch_id,
        location_id=location_id,
        sku_id=sku_id,
        qty=10,
    )

    create_count = await client.post(
        "/stock/inventory-counts",
        json={
            "branch_id": branch_id,
            "location_id": location_id,
            "scope": "SKUS",
            "sku_ids": [sku_id],
        },
        headers={**auth_headers, "Idempotency-Key": "inv-open-1"},
    )
    assert create_count.status_code == 201
    count_id = create_count.json()["id"]

    patch_lines = await client.patch(
        f"/stock/inventory-counts/{count_id}/lines",
        json={"lines": [{"sku_id": sku_id, "counted_qty": 7}]},
        headers={**auth_headers, "Idempotency-Key": "inv-lines-1"},
    )
    assert patch_lines.status_code == 200

    close_count = await client.post(
        f"/stock/inventory-counts/{count_id}/close",
        headers={**auth_headers, "Idempotency-Key": "inv-close-1"},
    )
    assert close_count.status_code == 200

    post_count = await client.post(
        f"/stock/inventory-counts/{count_id}/post",
        headers={**auth_headers, "Idempotency-Key": "inv-post-1"},
    )
    assert post_count.status_code == 200
    assert post_count.json()["status"] == "POSTED"

    on_hand = await get_balance(
        client,
        auth_headers,
        branch_id=branch_id,
        location_id=location_id,
        sku_id=sku_id,
    )
    assert on_hand == 7


async def test_transfer_ship_rollback_no_partial_update(client, auth_headers):
    from_branch_id = await create_branch(client, auth_headers, "Rollback From")
    from_location_id = await create_location(
        client, auth_headers, from_branch_id, "Rollback From Stock"
    )
    to_branch_id = await create_branch(client, auth_headers, "Rollback To")
    to_location_id = await create_location(
        client, auth_headers, to_branch_id, "Rollback To Stock"
    )
    sku_ok = await create_sku(client, auth_headers, "Rollback Product A", "SKU-RB-A")
    sku_low = await create_sku(client, auth_headers, "Rollback Product B", "SKU-RB-B")

    await create_receipt(
        client,
        auth_headers,
        branch_id=from_branch_id,
        location_id=from_location_id,
        sku_id=sku_ok,
        qty=10,
    )
    await create_receipt(
        client,
        auth_headers,
        branch_id=from_branch_id,
        location_id=from_location_id,
        sku_id=sku_low,
        qty=1,
    )

    transfer_id = await create_transfer(
        client,
        auth_headers,
        from_branch_id=from_branch_id,
        from_location_id=from_location_id,
        to_branch_id=to_branch_id,
        to_location_id=to_location_id,
        items=[{"sku_id": sku_ok, "qty": 5}, {"sku_id": sku_low, "qty": 5}],
    )
    ship = await client.post(
        f"/stock/transfers/{transfer_id}/ship",
        headers={**auth_headers, "Idempotency-Key": "ship-rollback-1"},
    )
    assert ship.status_code == 409

    assert (
        await get_balance(
            client,
            auth_headers,
            branch_id=from_branch_id,
            location_id=from_location_id,
            sku_id=sku_ok,
        )
        == 10
    )
    assert (
        await get_balance(
            client,
            auth_headers,
            branch_id=from_branch_id,
            location_id=from_location_id,
            sku_id=sku_low,
        )
        == 1
    )


async def test_rbac_forbidden_without_permission(client, auth_headers):
    await register_user(
        client,
        name="Viewer User",
        email="viewer@example.com",
        password="viewerpass123",
    )

    assign = await client.post(
        "/auth/roles/assign",
        json={"user_id": 2, "role_name": "viewer"},
        headers=auth_headers,
    )
    assert assign.status_code == 204

    viewer_headers = await admin_login(client, "viewer@example.com", "viewerpass123")
    forbidden = await client.post(
        "/stock/adjustments",
        json={"branch_id": 1, "location_id": 1, "sku_id": 1, "qty_delta": 1},
        headers=viewer_headers,
    )
    assert forbidden.status_code == 403


async def test_audit_log_generated_on_mutation(client, auth_headers, db_engine):
    response = await client.post(
        "/branches",
        json={"name": "Audit Branch"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert await count_audit_logs(db_engine, action="branch.create") == 1


async def test_reports_pagination_meta(client, auth_headers):
    branch_id = await create_branch(client, auth_headers, "Report Branch")
    location_id = await create_location(
        client, auth_headers, branch_id, "Report Location"
    )
    for index in range(3):
        sku_id = await create_sku(
            client,
            auth_headers,
            f"Report Product {index}",
            f"SKU-REPORT-{index}",
        )
        await create_receipt(
            client,
            auth_headers,
            branch_id=branch_id,
            location_id=location_id,
            sku_id=sku_id,
            qty=10 + index,
        )

    report = await client.get(
        "/reports/stock/valuation?page=1&page_size=2",
        headers=auth_headers,
    )
    assert report.status_code == 200
    payload = report.json()
    assert len(payload["items"]) == 2
    assert payload["meta"]["total"] >= 3
    assert payload["meta"]["next"] == 2
    assert payload["meta"]["prev"] is None
