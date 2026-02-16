from __future__ import annotations

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

st.set_page_config(page_title="Reports", page_icon="ðŸ“ˆ", layout="wide")
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client)
show_page_header("Reports", permission_hint="reports.read")

if endpoint_unavailable(client, "GET", "/reports/stock/valuation"):
    st.stop()

selected_branch = st.session_state.get("selected_branch_id")
selected_location = st.session_state.get("selected_location_id")

tab_valuation, tab_movements, tab_turnover, tab_abc = st.tabs(
    ["Valuation", "Movements", "Turnover", "ABC"]
)

with tab_valuation:
    st.subheader("Stock Valuation")
    c1, c2, c3, c4 = st.columns(4)
    sku_id = c1.number_input("SKU ID", min_value=0, value=0, step=1)
    page = c2.number_input("Page", min_value=1, value=1, step=1, key="valuation_page")
    page_size = c3.number_input(
        "Page Size",
        min_value=1,
        max_value=200,
        value=50,
        step=1,
        key="valuation_page_size",
    )
    _unused = c4.empty()

    valuation_data = api_call(
        client.get,
        "/reports/stock/valuation",
        params=build_params(
            page=int(page),
            page_size=int(page_size),
            branch_id=selected_branch,
            location_id=selected_location,
            sku_id=int(sku_id) if sku_id > 0 else None,
        ),
        expected_status=200,
    )
    rows = extract_items(valuation_data)
    if rows:
        df = pd.DataFrame(rows)
        st.dataframe(df, use_container_width=True)
        if "valuation" in df.columns and "sku_id" in df.columns:
            chart_df = df[["sku_id", "valuation"]].set_index("sku_id")
            st.bar_chart(chart_df)
        st.download_button(
            "Exportar CSV",
            data=df.to_csv(index=False).encode("utf-8"),
            file_name="stock_valuation.csv",
            mime="text/csv",
        )
    else:
        st.info("Sem dados para valuation.")
    show_meta(extract_meta(valuation_data))

with tab_movements:
    if endpoint_unavailable(client, "GET", "/reports/stock/movements"):
        st.stop()
    st.subheader("Stock Movements")
    c1, c2, c3, c4 = st.columns(4)
    move_type = c1.selectbox(
        "Move Type",
        ["", "RECEIPT", "ISSUE", "ADJUSTMENT", "TRANSFER_SHIP", "TRANSFER_RECEIVE"],
    )
    sku_id = c2.number_input("SKU ID", min_value=0, value=0, step=1, key="mov_sku")
    page = c3.number_input("Page", min_value=1, value=1, step=1, key="mov_page")
    page_size = c4.number_input(
        "Page Size",
        min_value=1,
        max_value=200,
        value=50,
        step=1,
        key="mov_page_size",
    )

    movements_data = api_call(
        client.get,
        "/reports/stock/movements",
        params=build_params(
            page=int(page),
            page_size=int(page_size),
            branch_id=selected_branch,
            location_id=selected_location,
            sku_id=int(sku_id) if sku_id > 0 else None,
            move_type=move_type or None,
        ),
        expected_status=200,
    )
    rows = extract_items(movements_data)
    if rows:
        df = pd.DataFrame(rows)
        st.dataframe(df, use_container_width=True)
        st.download_button(
            "Exportar CSV (dados da tabela)",
            data=df.to_csv(index=False).encode("utf-8"),
            file_name="stock_movements.csv",
            mime="text/csv",
        )
    else:
        st.info("Sem dados de movements.")
    show_meta(extract_meta(movements_data))

    if st.button("Exportar CSV via endpoint"):
        csv_payload = api_call(
            client.get,
            "/reports/stock/movements",
            params=build_params(
                export="csv",
                page=int(page),
                page_size=int(page_size),
                branch_id=selected_branch,
                location_id=selected_location,
                sku_id=int(sku_id) if sku_id > 0 else None,
                move_type=move_type or None,
            ),
            expected_status=200,
        )
        if isinstance(csv_payload, str):
            st.download_button(
                "Download CSV do endpoint",
                data=csv_payload.encode("utf-8"),
                file_name="stock_movements_endpoint.csv",
                mime="text/csv",
            )

with tab_turnover:
    if endpoint_unavailable(client, "GET", "/reports/stock/turnover"):
        st.stop()
    st.subheader("Stock Turnover")
    c1, c2 = st.columns(2)
    page = c1.number_input("Page", min_value=1, value=1, step=1, key="turn_page")
    page_size = c2.number_input(
        "Page Size",
        min_value=1,
        max_value=200,
        value=50,
        step=1,
        key="turn_page_size",
    )

    turnover_data = api_call(
        client.get,
        "/reports/stock/turnover",
        params=build_params(
            page=int(page),
            page_size=int(page_size),
            branch_id=selected_branch,
            location_id=selected_location,
        ),
        expected_status=200,
    )
    rows = extract_items(turnover_data)
    if rows:
        df = pd.DataFrame(rows)
        st.dataframe(df, use_container_width=True)
        if "turnover" in df.columns and "sku_id" in df.columns:
            st.line_chart(df[["sku_id", "turnover"]].set_index("sku_id"))
        st.download_button(
            "Exportar CSV",
            data=df.to_csv(index=False).encode("utf-8"),
            file_name="stock_turnover.csv",
            mime="text/csv",
        )
    else:
        st.info("Sem dados para turnover.")
    show_meta(extract_meta(turnover_data))

with tab_abc:
    if endpoint_unavailable(client, "GET", "/reports/stock/abc"):
        st.stop()
    st.subheader("Curva ABC")
    c1, c2 = st.columns(2)
    page = c1.number_input("Page", min_value=1, value=1, step=1, key="abc_page")
    page_size = c2.number_input(
        "Page Size",
        min_value=1,
        max_value=200,
        value=50,
        step=1,
        key="abc_page_size",
    )

    abc_data = api_call(
        client.get,
        "/reports/stock/abc",
        params=build_params(
            page=int(page),
            page_size=int(page_size),
            branch_id=selected_branch,
            location_id=selected_location,
        ),
        expected_status=200,
    )
    rows = extract_items(abc_data)
    if rows:
        df = pd.DataFrame(rows)
        st.dataframe(df, use_container_width=True)
        if {"class_name", "movement_value"}.issubset(df.columns):
            grouped = df.groupby("class_name", as_index=True)["movement_value"].sum()
            st.bar_chart(grouped)
        st.download_button(
            "Exportar CSV",
            data=df.to_csv(index=False).encode("utf-8"),
            file_name="stock_abc.csv",
            mime="text/csv",
        )
    else:
        st.info("Sem dados para curva ABC.")
    show_meta(extract_meta(abc_data))
