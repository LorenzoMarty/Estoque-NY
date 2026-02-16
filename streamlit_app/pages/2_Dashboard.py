from __future__ import annotations

from typing import Any

import pandas as pd
import streamlit as st
from lib.api_client import build_params, extract_items, extract_meta
from lib.auth import get_api_client, init_session_state, require_auth
from lib.ui import (
    api_call,
    endpoint_unavailable,
    render_sidebar_context,
    show_meta,
    show_page_header,
)

st.set_page_config(page_title="Dashboard", page_icon="ðŸ“Š", layout="wide")
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client)
show_page_header("Dashboard")


def _count_from_response(data: Any) -> int:
    if isinstance(data, list):
        return len(data)
    if isinstance(data, dict):
        meta = extract_meta(data)
        if meta and isinstance(meta.get("total"), int):
            return int(meta["total"])
        return len(extract_items(data))
    return 0


col1, col2 = st.columns(2)
health_data = None
health_db_data = None

if not endpoint_unavailable(client, "GET", "/health"):
    health_data = api_call(client.get, "/health", expected_status=200)
if not endpoint_unavailable(client, "GET", "/health/db"):
    health_db_data = api_call(client.get, "/health/db", expected_status=200)

with col1:
    st.subheader("API")
    st.write(health_data or {"status": "indisponivel"})
with col2:
    st.subheader("DB")
    st.write(health_db_data or {"status": "indisponivel"})

selected_branch = st.session_state.get("selected_branch_id")
selected_location = st.session_state.get("selected_location_id")

product_count = 0
sku_count = 0
stock_total = 0
pending_transfers = 0
open_counts = 0

if client.has_endpoint("GET", "/products"):
    products = api_call(
        client.get,
        "/products",
        params=build_params(page=1, page_size=200, sort="id", order="asc"),
        expected_status=200,
    )
    product_count = _count_from_response(products) if products is not None else 0

if client.has_endpoint("GET", "/skus"):
    skus = api_call(
        client.get,
        "/skus",
        params=build_params(page=1, page_size=200, sort="id", order="asc"),
        expected_status=200,
    )
    sku_count = _count_from_response(skus) if skus is not None else 0

if client.has_endpoint("GET", "/stock/balances"):
    balances = api_call(
        client.get,
        "/stock/balances",
        params=build_params(
            page=1,
            page_size=200,
            sort="updated_at",
            order="desc",
            branch_id=selected_branch,
            location_id=selected_location,
        ),
        expected_status=200,
    )
    if isinstance(balances, list):
        stock_total = int(
            sum(int(row.get("on_hand", 0)) for row in balances if isinstance(row, dict))
        )

if client.has_endpoint("GET", "/stock/transfers"):
    transfers = api_call(
        client.get,
        "/stock/transfers",
        params=build_params(
            page=1,
            page_size=1,
            status="DRAFT",
            branch_id=selected_branch,
            location_id=selected_location,
        ),
        expected_status=200,
    )
    pending_transfers = _count_from_response(transfers) if transfers is not None else 0

if client.has_endpoint("GET", "/stock/inventory-counts"):
    counts = api_call(
        client.get,
        "/stock/inventory-counts",
        params=build_params(
            page=1,
            page_size=1,
            status="OPEN",
            branch_id=selected_branch,
            location_id=selected_location,
        ),
        expected_status=200,
    )
    open_counts = _count_from_response(counts) if counts is not None else 0

metric_cols = st.columns(5)
metric_cols[0].metric("Produtos", product_count)
metric_cols[1].metric("SKUs", sku_count)
metric_cols[2].metric("Saldo Total", stock_total)
metric_cols[3].metric("Transfers DRAFT", pending_transfers)
metric_cols[4].metric("Inventory OPEN", open_counts)

st.divider()
st.subheader("Ultimas Movimentacoes")
if endpoint_unavailable(client, "GET", "/stock/moves"):
    st.stop()

moves = api_call(
    client.get,
    "/stock/moves",
    params=build_params(
        page=1,
        page_size=20,
        sort="occurred_at",
        order="desc",
        branch_id=selected_branch,
        location_id=selected_location,
    ),
    expected_status=200,
)
if isinstance(moves, list):
    if moves:
        st.dataframe(pd.DataFrame(moves), use_container_width=True)
    else:
        st.info("Sem movimentacoes recentes.")
elif isinstance(moves, dict):
    rows = extract_items(moves)
    if rows:
        st.dataframe(pd.DataFrame(rows), use_container_width=True)
    else:
        st.info("Sem movimentacoes recentes.")
    show_meta(extract_meta(moves))
