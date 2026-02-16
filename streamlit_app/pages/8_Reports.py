from __future__ import annotations

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
    page_header,
    render_sidebar_context,
    section,
    show_meta,
)

st.set_page_config(page_title=t("reports"), page_icon="📈", layout="wide")
apply_base_styles()
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client)
page_header(
    t("reports"),
    descricao="Acompanhe indicadores de estoque e exporte dados para analise.",
    icon="📈",
)

if endpoint_unavailable(client, "GET", "/reports/stock/valuation"):
    st.stop()

selected_branch = st.session_state.get("selected_branch_id")
selected_location = st.session_state.get("selected_location_id")

tab_valuation, tab_movements, tab_turnover, tab_abc = st.tabs(
    ["Valor em estoque", "Movimentacoes", "Giro", "Curva ABC"]
)

with tab_valuation:
    section("Valor em estoque")
    st.caption(t("valuation_help"))
    with st.expander(t("filters"), expanded=True):
        c1, c2, c3 = st.columns(3)
        sku_id = c1.number_input("Variacao (ID)", min_value=0, value=0, step=1)
        page = c2.number_input(
            t("page"), min_value=1, value=1, step=1, key="valuation_page"
        )
        page_size = c3.number_input(
            t("page_size"),
            min_value=1,
            max_value=200,
            value=50,
            key="valuation_page_size",
        )

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
        spinner_text="Gerando relatorio...",
    )
    rows = extract_items(valuation_data)
    if rows:
        df = pd.DataFrame(rows)
        st.dataframe(df, use_container_width=True)
        if "valuation" in df.columns and "sku_id" in df.columns:
            st.bar_chart(df[["sku_id", "valuation"]].set_index("sku_id"))
        st.download_button(
            t("download_excel"),
            data=df.to_csv(index=False).encode("utf-8"),
            file_name="valor_estoque.csv",
            mime="text/csv",
        )
    else:
        empty_state("Sem dados para valor em estoque.")
    show_meta(extract_meta(valuation_data))

with tab_movements:
    if endpoint_unavailable(client, "GET", "/reports/stock/movements"):
        st.stop()
    section("Movimentacoes")
    st.caption("Mostra entradas, saidas e ajustes dentro do periodo selecionado.")

    with st.expander(t("filters"), expanded=True):
        c1, c2, c3, c4 = st.columns(4)
        move_type = c1.selectbox(
            "Tipo de movimentacao",
            ["", "RECEIPT", "ISSUE", "ADJUSTMENT", "TRANSFER_SHIP", "TRANSFER_RECEIVE"],
        )
        sku_id = c2.number_input(
            "Variacao (ID)", min_value=0, value=0, step=1, key="mov_sku"
        )
        page = c3.number_input(t("page"), min_value=1, value=1, step=1, key="mov_page")
        page_size = c4.number_input(
            t("page_size"), min_value=1, max_value=200, value=50, key="mov_page_size"
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
        spinner_text="Gerando relatorio...",
    )
    rows = extract_items(movements_data)
    if rows:
        df = pd.DataFrame(rows)
        st.dataframe(df, use_container_width=True)
        st.download_button(
            t("download_excel"),
            data=df.to_csv(index=False).encode("utf-8"),
            file_name="movimentacoes_estoque.csv",
            mime="text/csv",
        )
    else:
        empty_state("Sem dados de movimentacoes.")
    show_meta(extract_meta(movements_data))

    if st.button("Baixar em Excel via endpoint", use_container_width=True):
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
                t("download_excel"),
                data=csv_payload.encode("utf-8"),
                file_name="movimentacoes_endpoint.csv",
                mime="text/csv",
            )

with tab_turnover:
    if endpoint_unavailable(client, "GET", "/reports/stock/turnover"):
        st.stop()
    section("Giro de estoque")
    st.caption(t("turnover_help"))

    with st.expander(t("filters"), expanded=True):
        c1, c2 = st.columns(2)
        page = c1.number_input(t("page"), min_value=1, value=1, step=1, key="turn_page")
        page_size = c2.number_input(
            t("page_size"), min_value=1, max_value=200, value=50, key="turn_page_size"
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
        spinner_text="Gerando relatorio...",
    )
    rows = extract_items(turnover_data)
    if rows:
        df = pd.DataFrame(rows)
        st.dataframe(df, use_container_width=True)
        if "turnover" in df.columns and "sku_id" in df.columns:
            st.line_chart(df[["sku_id", "turnover"]].set_index("sku_id"))
        st.download_button(
            t("download_excel"),
            data=df.to_csv(index=False).encode("utf-8"),
            file_name="giro_estoque.csv",
            mime="text/csv",
        )
    else:
        empty_state("Sem dados de giro para os filtros selecionados.")
    show_meta(extract_meta(turnover_data))

with tab_abc:
    if endpoint_unavailable(client, "GET", "/reports/stock/abc"):
        st.stop()
    section("Curva ABC")
    st.caption(t("abc_help"))

    with st.expander(t("filters"), expanded=True):
        c1, c2 = st.columns(2)
        page = c1.number_input(t("page"), min_value=1, value=1, step=1, key="abc_page")
        page_size = c2.number_input(
            t("page_size"), min_value=1, max_value=200, value=50, key="abc_page_size"
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
        spinner_text="Gerando relatorio...",
    )
    rows = extract_items(abc_data)
    if rows:
        df = pd.DataFrame(rows)
        st.dataframe(df, use_container_width=True)
        if {"class_name", "movement_value"}.issubset(df.columns):
            grouped = df.groupby("class_name", as_index=True)["movement_value"].sum()
            st.bar_chart(grouped)
        st.download_button(
            t("download_excel"),
            data=df.to_csv(index=False).encode("utf-8"),
            file_name="curva_abc.csv",
            mime="text/csv",
        )
    else:
        empty_state("Sem dados para curva ABC.")
    show_meta(extract_meta(abc_data))
