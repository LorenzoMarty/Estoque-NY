from __future__ import annotations

from uuid import uuid4

import pandas as pd
import streamlit as st
from lib.api_client import build_params, extract_items, extract_meta
from lib.auth import (
    get_access_token,
    get_api_base_url,
    get_api_client,
    init_session_state,
    require_auth,
)
from lib.cache import get_branches_cached, get_locations_cached, get_skus_cached
from lib.i18n import t
from lib.ui import (
    api_call,
    apply_base_styles,
    confirm_dialog,
    empty_state,
    endpoint_unavailable,
    humanize_move_type,
    page_header,
    render_sidebar_context,
    section,
    show_meta,
    show_toast,
)

st.set_page_config(page_title=t("stock_explorer"), page_icon="📦", layout="wide")
apply_base_styles()
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client)
page_header(
    t("stock_explorer"),
    descricao="Consulte saldos, movimentacoes e registre entradas, saidas ou ajustes rapidos.",
    icon="📦",
)

selected_branch = st.session_state.get("selected_branch_id")
selected_location = st.session_state.get("selected_location_id")

tab_balances, tab_moves, tab_actions = st.tabs(
    ["Saldos", "Movimentacoes", "Acoes rapidas de estoque"]
)

with tab_balances:
    if endpoint_unavailable(client, "GET", "/stock/balances"):
        st.stop()
    section("Saldos por variacao")
    with st.expander(t("filters"), expanded=True):
        c1, c2, c3, c4 = st.columns(4)
        sku_id = c1.number_input(
            "Variacao (ID)", min_value=0, value=0, step=1, key="bal_sku"
        )
        product_id = c2.number_input(
            "Produto (ID)", min_value=0, value=0, step=1, key="bal_product"
        )
        q = c3.text_input("Busca", key="bal_q")
        page = c4.number_input(t("page"), min_value=1, value=1, step=1, key="bal_page")

        c5, c6, c7 = st.columns(3)
        page_size = c5.number_input(
            t("page_size"), min_value=1, max_value=200, value=50, key="bal_page_size"
        )
        sort = c6.selectbox(
            t("sort"),
            ["updated_at", "id", "on_hand", "branch_id", "sku_id", "location_id"],
            key="bal_sort",
        )
        order = c7.selectbox(t("order"), ["desc", "asc"], key="bal_order")

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
        spinner_text="Buscando saldos...",
    )
    rows = extract_items(balances) if isinstance(balances, dict) else (balances or [])
    if rows:
        st.dataframe(pd.DataFrame(rows), use_container_width=True)
    else:
        empty_state(t("empty_balances"))
    show_meta(extract_meta(balances))

with tab_moves:
    if endpoint_unavailable(client, "GET", "/stock/moves"):
        st.stop()
    section("Movimentacoes de estoque")

    with st.expander(t("filters"), expanded=True):
        c1, c2, c3, c4 = st.columns(4)
        sku_id = c1.number_input(
            "Variacao (ID)", min_value=0, value=0, step=1, key="movexp_sku"
        )
        product_id = c2.number_input(
            "Produto (ID)", min_value=0, value=0, step=1, key="movexp_product"
        )
        move_type = c3.selectbox(
            "Tipo",
            ["", "RECEIPT", "ISSUE", "ADJUSTMENT", "TRANSFER_SHIP", "TRANSFER_RECEIVE"],
            key="movexp_type",
        )
        q = c4.text_input("Busca", key="movexp_q")

        c5, c6, c7, c8 = st.columns(4)
        page = c5.number_input(
            t("page"), min_value=1, value=1, step=1, key="movexp_page"
        )
        page_size = c6.number_input(
            t("page_size"), min_value=1, max_value=200, value=50, key="movexp_page_size"
        )
        sort = c7.selectbox(
            t("sort"),
            ["occurred_at", "id", "created_at", "qty", "move_type"],
            key="movexp_sort",
        )
        order = c8.selectbox(t("order"), ["desc", "asc"], key="movexp_order")

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
        spinner_text="Buscando movimentacoes...",
    )
    rows = extract_items(moves) if isinstance(moves, dict) else (moves or [])
    if rows:
        display_rows = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            display_rows.append(
                {**row, "tipo_label": humanize_move_type(row.get("move_type"))}
            )
        st.dataframe(pd.DataFrame(display_rows), use_container_width=True)
    else:
        empty_state(t("empty_moves"))
    show_meta(extract_meta(moves))

with tab_actions:
    section("Entradas, saidas e ajustes")
    st.caption("Use esta area para lancamentos rapidos no estoque.")

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
        st.warning("Cadastre filial, local e variacao antes de lancar movimentos.")
        st.stop()

    c1, c2 = st.columns(2)
    branch_id = c1.selectbox(
        "Filial",
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
        st.warning("A filial selecionada nao possui local cadastrado.")
        st.stop()
    location_id = c2.selectbox(
        "Local de estoque",
        options=sorted(location_map.keys()),
        index=(
            sorted(location_map.keys()).index(selected_location)
            if selected_location in location_map
            else 0
        ),
        format_func=lambda x: f"{x} - {location_map.get(x, '')}",
    )

    c3, c4 = st.columns(2)
    sku_id = c3.selectbox(
        "Variacao",
        options=sorted(sku_map.keys()),
        format_func=lambda x: f"{x} - {sku_map.get(x, '')}",
    )
    action_type = c4.selectbox(
        "Tipo de lancamento",
        ["RECEIPT", "ISSUE", "ADJUSTMENT"],
        format_func=lambda x: {
            "RECEIPT": "Entrada de estoque",
            "ISSUE": "Saida de estoque",
            "ADJUSTMENT": "Ajuste de estoque",
        }[x],
    )

    if action_type == "ADJUSTMENT":
        qty_delta = st.number_input(
            "Quantidade de ajuste (pode ser negativa)", value=0, step=1
        )
    else:
        qty = st.number_input("Quantidade", min_value=1, value=1, step=1)
    reason = st.text_input("Motivo")
    reference_id = st.text_input("Referencia externa (opcional)")
    confirmed = confirm_dialog(
        "Deseja confirmar este lancamento?", key="stock_action_confirm"
    )

    if st.button("Confirmar lancamento", type="primary", use_container_width=True):
        if not confirmed:
            st.warning("Marque a confirmacao antes de lancar o movimento.")
            st.stop()

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
            spinner_text="Registrando movimento...",
        )
        if result is not None:
            st.success("Movimento registrado com sucesso.")
            show_toast("Movimento registrado.")
            st.json(result)
