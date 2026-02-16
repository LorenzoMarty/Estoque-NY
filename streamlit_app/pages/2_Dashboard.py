from __future__ import annotations

from typing import Any

import pandas as pd
import streamlit as st
from lib.api_client import build_params, extract_items, extract_meta
from lib.auth import get_api_client, init_session_state, require_auth
from lib.i18n import t
from lib.ui import (
    api_call,
    apply_base_styles,
    empty_state,
    endpoint_unavailable,
    info_card,
    page_header,
    render_sidebar_context,
    section,
    show_meta,
    status_badge,
)

st.set_page_config(page_title=t("dashboard"), page_icon="📊", layout="wide")
apply_base_styles()
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client)
page_header(
    t("dashboard"),
    descricao="Acompanhe os principais indicadores e as ultimas movimentacoes.",
    icon="📊",
)


def _count_from_response(data: Any) -> int:
    if isinstance(data, list):
        return len(data)
    if isinstance(data, dict):
        meta = extract_meta(data)
        if meta and isinstance(meta.get("total"), int):
            return int(meta["total"])
        return len(extract_items(data))
    return 0


selected_branch = st.session_state.get("selected_branch_id")
selected_location = st.session_state.get("selected_location_id")

health_data = None
health_db_data = None
if not endpoint_unavailable(client, "GET", "/health"):
    health_data = api_call(client.get, "/health", expected_status=200)
if not endpoint_unavailable(client, "GET", "/health/db"):
    health_db_data = api_call(client.get, "/health/db", expected_status=200)

section("Saude do sistema")
health_col1, health_col2 = st.columns(2)
with health_col1:
    st.write(f"**{t('api_status')}**")
    if isinstance(health_data, dict):
        status_badge(health_data.get("status", "indisponivel"))
        st.json(health_data)
    else:
        status_badge("CANCELLED")
        st.caption("Servico indisponivel.")
with health_col2:
    st.write(f"**{t('db_status')}**")
    if isinstance(health_db_data, dict):
        status_badge(health_db_data.get("status", "indisponivel"))
        st.json(health_db_data)
    else:
        status_badge("CANCELLED")
        st.caption("Banco de dados indisponivel.")

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
    rows = extract_items(balances) if isinstance(balances, dict) else (balances or [])
    if rows:
        stock_total = int(
            sum(int(row.get("on_hand", 0)) for row in rows if isinstance(row, dict))
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

section("Indicadores principais")
metric_cols = st.columns(4)
with metric_cols[0]:
    info_card("Produtos cadastrados", product_count, icon="📦")
with metric_cols[1]:
    info_card("Variacoes cadastradas", sku_count, icon="🏷️")
with metric_cols[2]:
    info_card("Transferencias pendentes", pending_transfers, icon="🔁")
with metric_cols[3]:
    info_card("Contagens abertas", open_counts, icon="🧾")

st.caption(f"Saldo total em estoque (unidades): {stock_total}")

section(t("latest_movements"))
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
rows = extract_items(moves) if isinstance(moves, dict) else (moves or [])
if rows:
    st.dataframe(pd.DataFrame(rows), use_container_width=True)
else:
    empty_state("Nenhuma movimentacao recente encontrada.")
show_meta(extract_meta(moves))
