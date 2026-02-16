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
    humanize_status,
    page_header,
    render_sidebar_context,
    section,
    show_meta,
    show_toast,
    status_badge,
)

st.set_page_config(page_title=t("transfers"), page_icon="🔁", layout="wide")
apply_base_styles()
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client)
page_header(
    t("transfers"),
    descricao="Gerencie transferencias entre filiais e locais de estoque.",
    icon="🔁",
)

if endpoint_unavailable(client, "GET", "/stock/transfers"):
    st.stop()

base_url = get_api_base_url()
token = get_access_token()

branches = api_call(get_branches_cached, base_url, token) or []
skus = api_call(get_skus_cached, base_url, token) or []

branch_map = {
    int(row["id"]): row.get("name", str(row["id"])) for row in branches if "id" in row
}
sku_map = {
    int(row["id"]): row.get("sku_code", str(row["id"])) for row in skus if "id" in row
}

if "show_transfer_form" not in st.session_state:
    st.session_state["show_transfer_form"] = False

action_col1, action_col2, action_col3 = st.columns([1, 1, 3])
if action_col1.button(
    t("create_new_transfer"), type="primary", use_container_width=True
):
    st.session_state["show_transfer_form"] = not st.session_state["show_transfer_form"]
if action_col2.button("Atualizar lista", use_container_width=True):
    st.rerun()

with st.expander(t("filters"), expanded=True):
    c1, c2, c3, c4 = st.columns(4)
    status_filter = c1.selectbox(
        t("status"), ["", "DRAFT", "SHIPPED", "RECEIVED", "CANCELLED"]
    )
    filter_branch = c2.number_input("Filial (ID)", min_value=0, step=1, value=0)
    filter_location = c3.number_input("Local (ID)", min_value=0, step=1, value=0)
    filter_sku = c4.number_input("Variacao (ID)", min_value=0, step=1, value=0)

    c5, c6, c7, c8 = st.columns(4)
    page = c5.number_input(t("page"), min_value=1, value=1, step=1)
    page_size = c6.number_input(t("page_size"), min_value=1, max_value=200, value=20)
    sort = c7.selectbox(
        t("sort"), ["created_at", "id", "status", "shipped_at", "received_at"]
    )
    order = c8.selectbox(t("order"), ["desc", "asc"])

transfers_data = api_call(
    client.get,
    "/stock/transfers",
    params=build_params(
        page=int(page),
        page_size=int(page_size),
        sort=sort,
        order=order,
        status=status_filter or None,
        branch_id=int(filter_branch) if filter_branch > 0 else None,
        location_id=int(filter_location) if filter_location > 0 else None,
        sku_id=int(filter_sku) if filter_sku > 0 else None,
    ),
    expected_status=200,
    spinner_text="Buscando transferencias...",
)

transfer_rows = extract_items(transfers_data)

section("Lista de transferencias")
if transfer_rows:
    display_rows: list[dict[str, object]] = []
    for row in transfer_rows:
        if not isinstance(row, dict):
            continue
        display_rows.append(
            {
                **row,
                "status_label": humanize_status(row.get("status")),
            }
        )
    st.dataframe(pd.DataFrame(display_rows), use_container_width=True)
else:
    empty_state(t("empty_transfers"))
show_meta(extract_meta(transfers_data))

section("Detalhe da transferencia")
transfer_ids = [int(row["id"]) for row in transfer_rows if "id" in row]
selected_transfer_id = st.selectbox(
    "Selecione a transferencia",
    options=[None] + transfer_ids,
    format_func=lambda x: "Selecione..." if x is None else f"Transferencia #{x}",
)

if selected_transfer_id:
    detail = api_call(
        client.get,
        f"/stock/transfers/{selected_transfer_id}",
        expected_status=200,
        spinner_text="Carregando detalhe...",
    )
    if isinstance(detail, dict):
        status_value = detail.get("status")
        st.write("Status atual:")
        status_badge(status_value)
        st.json({k: v for k, v in detail.items() if k != "items"})

        item_rows = detail.get("items", [])
        if isinstance(item_rows, list) and item_rows:
            item_display = []
            for item in item_rows:
                if not isinstance(item, dict):
                    continue
                sku_id = item.get("sku_id")
                item_display.append(
                    {
                        **item,
                        "variacao": sku_map.get(int(sku_id), sku_id) if sku_id else "-",
                    }
                )
            st.dataframe(pd.DataFrame(item_display), use_container_width=True)
        else:
            empty_state("Esta transferencia nao possui itens.")

        st.markdown("### Acoes da transferencia")
        a1, a2, a3 = st.columns(3)

        with a1:
            ship_confirm = confirm_dialog(
                "Tem certeza que deseja enviar esta transferencia?",
                key=f"ship_confirm_{selected_transfer_id}",
            )
            if st.button(
                t("send_transfer"),
                use_container_width=True,
                key=f"ship_{selected_transfer_id}",
            ):
                if not ship_confirm:
                    st.warning("Marque a confirmacao antes de enviar.")
                else:
                    ship_resp = api_call(
                        client.post,
                        f"/stock/transfers/{selected_transfer_id}/ship",
                        headers={"Idempotency-Key": str(uuid4())},
                        expected_status={200, 201},
                        spinner_text="Enviando transferencia...",
                    )
                    if ship_resp is not None:
                        st.success("Transferencia enviada com sucesso.")
                        show_toast("Transferencia enviada.")
                        st.rerun()

        with a2:
            receive_confirm = confirm_dialog(
                "Tem certeza que deseja confirmar o recebimento?",
                key=f"receive_confirm_{selected_transfer_id}",
            )
            if st.button(
                t("confirm_receipt"),
                use_container_width=True,
                key=f"receive_{selected_transfer_id}",
            ):
                if not receive_confirm:
                    st.warning("Marque a confirmacao antes de confirmar o recebimento.")
                else:
                    receive_resp = api_call(
                        client.post,
                        f"/stock/transfers/{selected_transfer_id}/receive",
                        headers={"Idempotency-Key": str(uuid4())},
                        expected_status={200, 201},
                        spinner_text="Confirmando recebimento...",
                    )
                    if receive_resp is not None:
                        st.success("Recebimento confirmado.")
                        show_toast("Recebimento confirmado.")
                        st.rerun()

        with a3:
            cancel_confirm = confirm_dialog(
                "Tem certeza que deseja cancelar esta transferencia?",
                key=f"cancel_confirm_{selected_transfer_id}",
            )
            if st.button(
                t("cancel_transfer"),
                use_container_width=True,
                key=f"cancel_{selected_transfer_id}",
            ):
                if not cancel_confirm:
                    st.warning("Marque a confirmacao antes de cancelar.")
                else:
                    cancel_resp = api_call(
                        client.post,
                        f"/stock/transfers/{selected_transfer_id}/cancel",
                        headers={"Idempotency-Key": str(uuid4())},
                        expected_status={200, 201},
                        spinner_text="Cancelando transferencia...",
                    )
                    if cancel_resp is not None:
                        st.success("Transferencia cancelada.")
                        show_toast("Transferencia cancelada.")
                        st.rerun()

if st.session_state.get("show_transfer_form"):
    section(t("create_new_transfer"))
    st.caption("Preencha os dados em 4 passos para criar uma nova transferencia.")

    if endpoint_unavailable(client, "POST", "/stock/transfers"):
        st.stop()

    if not branches:
        st.warning("Cadastre filiais antes de criar transferencias.")
        st.stop()

    branch_ids = sorted(branch_map.keys())
    st.write("**1. Escolher origem**")
    from_branch = st.selectbox(
        "Filial de origem",
        options=branch_ids,
        format_func=lambda x: f"{x} - {branch_map.get(x, '')}",
        key="new_transfer_from_branch",
    )
    from_locations = api_call(get_locations_cached, base_url, token, from_branch) or []
    from_location_map = {
        int(row["id"]): row.get("name", str(row["id"]))
        for row in from_locations
        if "id" in row
    }
    if not from_location_map:
        st.warning("A filial de origem nao possui locais cadastrados.")
        st.stop()
    from_location = st.selectbox(
        "Local de origem",
        options=sorted(from_location_map.keys()),
        format_func=lambda x: f"{x} - {from_location_map.get(x, '')}",
        key="new_transfer_from_location",
    )

    st.write("**2. Escolher destino**")
    to_branch = st.selectbox(
        "Filial de destino",
        options=branch_ids,
        format_func=lambda x: f"{x} - {branch_map.get(x, '')}",
        key="new_transfer_to_branch",
    )
    to_locations = api_call(get_locations_cached, base_url, token, to_branch) or []
    to_location_map = {
        int(row["id"]): row.get("name", str(row["id"]))
        for row in to_locations
        if "id" in row
    }
    if not to_location_map:
        st.warning("A filial de destino nao possui locais cadastrados.")
        st.stop()
    to_location = st.selectbox(
        "Local de destino",
        options=sorted(to_location_map.keys()),
        format_func=lambda x: f"{x} - {to_location_map.get(x, '')}",
        key="new_transfer_to_location",
    )

    st.write("**3. Adicionar produtos**")
    sku_options = sorted(sku_map.keys())
    if not sku_options:
        st.warning("Cadastre variacoes antes de criar transferencias.")
        st.stop()

    editor_df = pd.DataFrame([{"sku_id": sku_options[0], "qty": 1}])
    items_df = st.data_editor(
        editor_df,
        num_rows="dynamic",
        use_container_width=True,
        hide_index=True,
        column_config={
            "sku_id": st.column_config.SelectboxColumn(
                "Variacao (ID)",
                options=sku_options,
                required=True,
            ),
            "qty": st.column_config.NumberColumn(
                "Quantidade",
                min_value=1,
                step=1,
                required=True,
            ),
        },
        key="transfer_items_editor",
    )

    st.write("**4. Confirmar**")
    note = st.text_area("Observacao (opcional)")

    if st.button(
        "Confirmar criacao da transferencia", type="primary", use_container_width=True
    ):
        if from_branch == to_branch and from_location == to_location:
            st.error("Origem e destino nao podem ser iguais.")
            st.stop()

        items: list[dict[str, int]] = []
        for _, row in items_df.iterrows():
            sku_id = row.get("sku_id")
            qty = row.get("qty")
            if pd.isna(sku_id) or pd.isna(qty):
                continue
            qty_int = int(qty)
            if qty_int <= 0:
                st.error("A quantidade deve ser maior que zero.")
                st.stop()
            items.append({"sku_id": int(sku_id), "qty": qty_int})

        if not items:
            st.error("Adicione pelo menos um item valido.")
            st.stop()

        payload = {
            "from_branch_id": int(from_branch),
            "from_location_id": int(from_location),
            "to_branch_id": int(to_branch),
            "to_location_id": int(to_location),
            "items": items,
            "note": note or None,
        }
        created = api_call(
            client.post,
            "/stock/transfers",
            json_body=payload,
            headers={"Idempotency-Key": str(uuid4())},
            expected_status={200, 201},
            spinner_text="Criando transferencia...",
        )
        if isinstance(created, dict):
            st.success(f"Transferencia criada com sucesso. ID: {created.get('id')}")
            show_toast("Transferencia criada.")
            st.session_state["show_transfer_form"] = False
            st.rerun()
