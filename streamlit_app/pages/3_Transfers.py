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
    show_meta,
    show_page_header,
)

st.set_page_config(page_title="Transfers", page_icon="ðŸ”", layout="wide")
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client)
show_page_header("Transfers", permission_hint="stock.transfer.read")

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

tab_list, tab_create = st.tabs(["Listagem", "Criar Transfer"])

with tab_list:
    st.subheader("Filtros")
    c1, c2, c3, c4 = st.columns(4)
    status_filter = c1.selectbox(
        "Status", ["", "DRAFT", "SHIPPED", "RECEIVED", "CANCELLED"]
    )
    filter_branch = c2.number_input("Branch ID", min_value=0, step=1, value=0)
    filter_location = c3.number_input("Location ID", min_value=0, step=1, value=0)
    filter_sku = c4.number_input("SKU ID", min_value=0, step=1, value=0)

    c5, c6, c7, c8 = st.columns(4)
    page = c5.number_input("Page", min_value=1, value=1, step=1)
    page_size = c6.number_input(
        "Page Size", min_value=1, max_value=200, value=20, step=1
    )
    sort = c7.selectbox(
        "Sort", ["created_at", "id", "status", "shipped_at", "received_at"]
    )
    order = c8.selectbox("Order", ["desc", "asc"])

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
    )

    transfer_rows = extract_items(transfers_data)
    show_dataframe(transfer_rows)
    show_meta(extract_meta(transfers_data))

    st.divider()
    st.subheader("Detalhe da Transfer")
    transfer_ids = [int(row["id"]) for row in transfer_rows if "id" in row]
    selected_transfer_id = st.selectbox(
        "Transfer ID",
        options=[None] + transfer_ids,
        format_func=lambda x: "Selecione..." if x is None else str(x),
    )

    if selected_transfer_id:
        detail = api_call(
            client.get,
            f"/stock/transfers/{selected_transfer_id}",
            expected_status=200,
        )
        if isinstance(detail, dict):
            st.json({k: v for k, v in detail.items() if k != "items"})
            item_rows = detail.get("items", [])
            if isinstance(item_rows, list):
                st.dataframe(pd.DataFrame(item_rows), use_container_width=True)

            st.markdown("### Acoes")
            status_value = detail.get("status")
            confirm_ship = st.checkbox(
                "Confirmar ship", key=f"ship_confirm_{selected_transfer_id}"
            )
            if st.button(
                "Ship", key=f"ship_btn_{selected_transfer_id}", use_container_width=True
            ):
                if not confirm_ship:
                    st.warning("Marque a confirmacao para executar ship.")
                else:
                    ship_resp = api_call(
                        client.post,
                        f"/stock/transfers/{selected_transfer_id}/ship",
                        headers={"Idempotency-Key": str(uuid4())},
                        expected_status={200, 201},
                        spinner_text="Enviando transfer...",
                    )
                    if ship_resp is not None:
                        st.success("Transfer enviada com sucesso.")
                        st.rerun()

            confirm_receive = st.checkbox(
                "Confirmar receive",
                key=f"receive_confirm_{selected_transfer_id}",
            )
            if st.button(
                "Receive",
                key=f"receive_btn_{selected_transfer_id}",
                use_container_width=True,
            ):
                if not confirm_receive:
                    st.warning("Marque a confirmacao para executar receive.")
                else:
                    receive_resp = api_call(
                        client.post,
                        f"/stock/transfers/{selected_transfer_id}/receive",
                        headers={"Idempotency-Key": str(uuid4())},
                        expected_status={200, 201},
                        spinner_text="Recebendo transfer...",
                    )
                    if receive_resp is not None:
                        st.success("Transfer recebida com sucesso.")
                        st.rerun()

            confirm_cancel = st.checkbox(
                "Confirmar cancelamento",
                key=f"cancel_confirm_{selected_transfer_id}",
            )
            if st.button(
                "Cancel",
                key=f"cancel_btn_{selected_transfer_id}",
                use_container_width=True,
            ):
                if not confirm_cancel:
                    st.warning("Marque a confirmacao para cancelar.")
                else:
                    cancel_resp = api_call(
                        client.post,
                        f"/stock/transfers/{selected_transfer_id}/cancel",
                        headers={"Idempotency-Key": str(uuid4())},
                        expected_status={200, 201},
                        spinner_text="Cancelando transfer...",
                    )
                    if cancel_resp is not None:
                        st.success("Transfer cancelada.")
                        st.rerun()

            st.caption(f"Status atual: {status_value}")

with tab_create:
    if endpoint_unavailable(client, "POST", "/stock/transfers"):
        st.stop()

    st.subheader("Nova Transfer")
    if not branches:
        st.info("Cadastre branches antes de criar transferencias.")
        st.stop()

    branch_ids = sorted(branch_map.keys())
    from_branch = st.selectbox(
        "From Branch",
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
    from_location = st.selectbox(
        "From Location",
        options=sorted(from_location_map.keys()),
        format_func=lambda x: f"{x} - {from_location_map.get(x, '')}",
        key="new_transfer_from_location",
    )

    to_branch = st.selectbox(
        "To Branch",
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
    to_location = st.selectbox(
        "To Location",
        options=sorted(to_location_map.keys()),
        format_func=lambda x: f"{x} - {to_location_map.get(x, '')}",
        key="new_transfer_to_location",
    )

    note = st.text_area("Nota (opcional)")

    sku_options = sorted(sku_map.keys())
    editor_df = pd.DataFrame(
        [{"sku_id": sku_options[0] if sku_options else None, "qty": 1}],
    )
    items_df = st.data_editor(
        editor_df,
        num_rows="dynamic",
        use_container_width=True,
        hide_index=True,
        key="transfer_items_editor",
    )

    if st.button("Criar Transfer", type="primary", use_container_width=True):
        if from_branch == to_branch and from_location == to_location:
            st.error("Origem e destino nao podem ser iguais.")
            st.stop()

        items: list[dict[str, int]] = []
        for _, row in items_df.iterrows():
            sku_id = row.get("sku_id")
            qty = row.get("qty")
            if pd.isna(sku_id) or pd.isna(qty):
                continue
            sku_id_int = int(sku_id)
            qty_int = int(qty)
            if qty_int <= 0:
                st.error("Quantidade deve ser maior que zero.")
                st.stop()
            items.append({"sku_id": sku_id_int, "qty": qty_int})

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
            spinner_text="Criando transfer...",
        )
        if isinstance(created, dict):
            st.success(f"Transfer criada com ID {created.get('id')}.")
            st.json(created)
