from __future__ import annotations

from uuid import uuid4

import streamlit as st
from lib.api_client import build_params
from lib.auth import (
    get_access_token,
    get_api_base_url,
    get_api_client,
    init_session_state,
    require_auth,
)
from lib.cache import (
    get_branches_cached,
    get_locations_cached,
    get_skus_cached,
)
from lib.ui import (
    api_call,
    endpoint_unavailable,
    render_sidebar_context,
    show_dataframe,
    show_page_header,
)

st.set_page_config(page_title="Stock Explorer", page_icon="ðŸ“¦", layout="wide")
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client)
show_page_header("Stock Explorer", permission_hint="stock.balance.read")

selected_branch = st.session_state.get("selected_branch_id")
selected_location = st.session_state.get("selected_location_id")

tab_balances, tab_moves, tab_actions = st.tabs(["Balances", "Moves", "Acoes Rapidas"])

with tab_balances:
    if endpoint_unavailable(client, "GET", "/stock/balances"):
        st.stop()
    st.subheader("Balances")
    c1, c2, c3, c4 = st.columns(4)
    sku_id = c1.number_input("SKU ID", min_value=0, value=0, step=1, key="bal_sku")
    product_id = c2.number_input(
        "Product ID", min_value=0, value=0, step=1, key="bal_product"
    )
    q = c3.text_input("Busca", key="bal_q")
    page = c4.number_input("Page", min_value=1, value=1, step=1, key="bal_page")

    c5, c6, c7 = st.columns(3)
    page_size = c5.number_input(
        "Page Size", min_value=1, max_value=200, value=50, step=1, key="bal_page_size"
    )
    sort = c6.selectbox(
        "Sort",
        ["updated_at", "id", "on_hand", "branch_id", "sku_id", "location_id"],
        key="bal_sort",
    )
    order = c7.selectbox("Order", ["desc", "asc"], key="bal_order")

    balances = api_call(
        client.get,
        "/stock/balances",
        params=build_params(
            page=int(page),
            page_size=int(page_size),
            sort=sort,
            order=order,
            q=q or None,
            branch_id=selected_branch,
            location_id=selected_location,
            sku_id=int(sku_id) if sku_id > 0 else None,
            product_id=int(product_id) if product_id > 0 else None,
        ),
        expected_status=200,
    )
    rows = balances if isinstance(balances, list) else []
    show_dataframe(rows)

with tab_moves:
    if endpoint_unavailable(client, "GET", "/stock/moves"):
        st.stop()
    st.subheader("Moves")
    c1, c2, c3, c4 = st.columns(4)
    sku_id = c1.number_input("SKU ID", min_value=0, value=0, step=1, key="movexp_sku")
    product_id = c2.number_input(
        "Product ID", min_value=0, value=0, step=1, key="movexp_product"
    )
    move_type = c3.selectbox(
        "Type",
        ["", "RECEIPT", "ISSUE", "ADJUSTMENT", "TRANSFER_SHIP", "TRANSFER_RECEIVE"],
        key="movexp_type",
    )
    q = c4.text_input("Busca", key="movexp_q")

    c5, c6, c7, c8 = st.columns(4)
    page = c5.number_input("Page", min_value=1, value=1, step=1, key="movexp_page")
    page_size = c6.number_input(
        "Page Size",
        min_value=1,
        max_value=200,
        value=50,
        step=1,
        key="movexp_page_size",
    )
    sort = c7.selectbox(
        "Sort",
        ["occurred_at", "id", "created_at", "qty", "move_type"],
        key="movexp_sort",
    )
    order = c8.selectbox("Order", ["desc", "asc"], key="movexp_order")

    moves = api_call(
        client.get,
        "/stock/moves",
        params=build_params(
            page=int(page),
            page_size=int(page_size),
            sort=sort,
            order=order,
            q=q or None,
            branch_id=selected_branch,
            location_id=selected_location,
            sku_id=int(sku_id) if sku_id > 0 else None,
            product_id=int(product_id) if product_id > 0 else None,
            type=move_type or None,
        ),
        expected_status=200,
    )
    rows = moves if isinstance(moves, list) else []
    show_dataframe(rows)

with tab_actions:
    st.subheader("Receipts / Issues / Adjustments")
    base_url = get_api_base_url()
    token = get_access_token()
    branches = api_call(get_branches_cached, base_url, token) or []
    skus = api_call(get_skus_cached, base_url, token) or []
    branch_map = {
        int(row["id"]): row.get("name", str(row["id"]))
        for row in branches
        if "id" in row
    }
    sku_map = {
        int(row["id"]): row.get("sku_code", str(row["id"]))
        for row in skus
        if "id" in row
    }

    if not branch_map or not sku_map:
        st.info("Cadastre branch/location/sku antes de lancar movimentos.")
        st.stop()

    branch_id = st.selectbox(
        "Branch",
        options=sorted(branch_map.keys()),
        index=(
            sorted(branch_map.keys()).index(selected_branch)
            if selected_branch in branch_map
            else 0
        ),
        format_func=lambda x: f"{x} - {branch_map.get(x, '')}",
    )

    locations = api_call(get_locations_cached, base_url, token, branch_id) or []
    location_map = {
        int(row["id"]): row.get("name", str(row["id"]))
        for row in locations
        if "id" in row
    }
    if not location_map:
        st.warning("A branch selecionada nao possui location.")
        st.stop()
    location_id = st.selectbox(
        "Location",
        options=sorted(location_map.keys()),
        index=(
            sorted(location_map.keys()).index(selected_location)
            if selected_location in location_map
            else 0
        ),
        format_func=lambda x: f"{x} - {location_map.get(x, '')}",
    )

    sku_id = st.selectbox(
        "SKU",
        options=sorted(sku_map.keys()),
        format_func=lambda x: f"{x} - {sku_map.get(x, '')}",
    )
    action_type = st.selectbox("Acao", ["RECEIPT", "ISSUE", "ADJUSTMENT"])
    if action_type == "ADJUSTMENT":
        qty_delta = st.number_input("Qty Delta (pode ser negativo)", value=0, step=1)
    else:
        qty = st.number_input("Quantidade", min_value=1, value=1, step=1)
    reason = st.text_input("Reason")
    reference_id = st.text_input("Reference ID (opcional)")

    if st.button("Executar Acao", type="primary", use_container_width=True):
        headers = {"Idempotency-Key": str(uuid4())}
        if action_type == "RECEIPT":
            path = "/stock/receipts"
            payload = {
                "branch_id": int(branch_id),
                "location_id": int(location_id),
                "sku_id": int(sku_id),
                "qty": int(qty),
                "reason": reason or None,
                "reference_id": reference_id or None,
            }
        elif action_type == "ISSUE":
            path = "/stock/issues"
            payload = {
                "branch_id": int(branch_id),
                "location_id": int(location_id),
                "sku_id": int(sku_id),
                "qty": int(qty),
                "reason": reason or None,
                "reference_id": reference_id or None,
            }
        else:
            path = "/stock/adjustments"
            payload = {
                "branch_id": int(branch_id),
                "location_id": int(location_id),
                "sku_id": int(sku_id),
                "qty_delta": int(qty_delta),
                "reason": reason or None,
                "reference_id": reference_id or None,
            }

        result = api_call(
            client.post,
            path,
            json_body=payload,
            headers=headers,
            expected_status={200, 201},
            spinner_text="Lancando movimento...",
        )
        if result is not None:
            st.success("Movimento registrado com sucesso.")
            st.json(result)
