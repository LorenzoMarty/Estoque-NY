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

st.set_page_config(page_title="Inventory Counts", page_icon="ðŸ§¾", layout="wide")
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client)
show_page_header("Inventory Counts", permission_hint="stock.inventory.create")

if endpoint_unavailable(client, "GET", "/stock/inventory-counts"):
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

tab_list, tab_create = st.tabs(["Listagem e Operacao", "Criar Contagem"])

with tab_list:
    st.subheader("Filtros")
    c1, c2, c3, c4 = st.columns(4)
    status_filter = c1.selectbox(
        "Status", ["", "OPEN", "CLOSED", "POSTED", "CANCELLED"]
    )
    branch_id = c2.number_input("Branch ID", min_value=0, value=0, step=1)
    location_id = c3.number_input("Location ID", min_value=0, value=0, step=1)
    page = c4.number_input("Page", min_value=1, value=1, step=1)

    c5, c6, c7, c8 = st.columns(4)
    page_size = c5.number_input(
        "Page Size", min_value=1, max_value=200, value=20, step=1
    )
    sort = c6.selectbox(
        "Sort", ["started_at", "id", "status", "closed_at", "posted_at"]
    )
    order = c7.selectbox("Order", ["desc", "asc"])
    _unused = c8.empty()

    counts_data = api_call(
        client.get,
        "/stock/inventory-counts",
        params=build_params(
            page=int(page),
            page_size=int(page_size),
            sort=sort,
            order=order,
            status=status_filter or None,
            branch_id=int(branch_id) if branch_id > 0 else None,
            location_id=int(location_id) if location_id > 0 else None,
        ),
        expected_status=200,
    )
    count_rows = extract_items(counts_data)
    show_dataframe(count_rows)
    show_meta(extract_meta(counts_data))

    st.divider()
    count_ids = [int(row["id"]) for row in count_rows if "id" in row]
    selected_count_id = st.selectbox(
        "Inventory Count ID",
        options=[None] + count_ids,
        format_func=lambda x: "Selecione..." if x is None else str(x),
    )

    if selected_count_id:
        detail = api_call(
            client.get,
            f"/stock/inventory-counts/{selected_count_id}",
            expected_status=200,
        )
        if isinstance(detail, dict):
            st.json({k: v for k, v in detail.items() if k != "lines"})
            line_rows = detail.get("lines", [])
            if isinstance(line_rows, list) and line_rows:
                display_rows = []
                for row in line_rows:
                    if not isinstance(row, dict):
                        continue
                    display_rows.append(
                        {
                            **row,
                            "sku_code": sku_map.get(int(row.get("sku_id", 0)), ""),
                        }
                    )
                line_df = pd.DataFrame(display_rows)
                edited_df = st.data_editor(
                    line_df,
                    use_container_width=True,
                    num_rows="fixed",
                    hide_index=True,
                    key=f"count_lines_editor_{selected_count_id}",
                )

                if st.button("Salvar Linhas", use_container_width=True):
                    payload_lines: list[dict[str, int]] = []
                    for _, row in edited_df.iterrows():
                        sku_id_value = row.get("sku_id")
                        counted_qty_value = row.get("counted_qty")
                        if pd.isna(sku_id_value) or pd.isna(counted_qty_value):
                            continue
                        payload_lines.append(
                            {
                                "sku_id": int(sku_id_value),
                                "counted_qty": int(counted_qty_value),
                            }
                        )
                    if not payload_lines:
                        st.warning("Nenhuma linha valida para atualizar.")
                    else:
                        patched = api_call(
                            client.patch,
                            f"/stock/inventory-counts/{selected_count_id}/lines",
                            json_body={"lines": payload_lines},
                            headers={"Idempotency-Key": str(uuid4())},
                            expected_status=200,
                            spinner_text="Atualizando linhas...",
                        )
                        if patched is not None:
                            st.success("Linhas atualizadas.")
                            st.rerun()

                uploaded = st.file_uploader(
                    "Upload CSV (sku_id,counted_qty)",
                    type=["csv"],
                    key=f"csv_upload_{selected_count_id}",
                )
                if uploaded is not None and st.button(
                    "Aplicar CSV",
                    key=f"apply_csv_{selected_count_id}",
                ):
                    csv_df = pd.read_csv(uploaded)
                    required = {"sku_id", "counted_qty"}
                    if not required.issubset(set(csv_df.columns)):
                        st.error("CSV deve conter colunas sku_id,counted_qty.")
                    else:
                        csv_lines = [
                            {
                                "sku_id": int(row["sku_id"]),
                                "counted_qty": int(row["counted_qty"]),
                            }
                            for _, row in csv_df.iterrows()
                        ]
                        patched_csv = api_call(
                            client.patch,
                            f"/stock/inventory-counts/{selected_count_id}/lines",
                            json_body={"lines": csv_lines},
                            headers={"Idempotency-Key": str(uuid4())},
                            expected_status=200,
                            spinner_text="Aplicando CSV...",
                        )
                        if patched_csv is not None:
                            st.success("CSV aplicado com sucesso.")
                            st.rerun()

            status_value = detail.get("status")
            st.markdown("### Acoes")
            c1, c2, c3 = st.columns(3)
            if c1.button("Close", use_container_width=True):
                response = api_call(
                    client.post,
                    f"/stock/inventory-counts/{selected_count_id}/close",
                    headers={"Idempotency-Key": str(uuid4())},
                    expected_status=200,
                )
                if response is not None:
                    st.success("Contagem fechada.")
                    st.rerun()

            if c2.button("Post", type="primary", use_container_width=True):
                response = api_call(
                    client.post,
                    f"/stock/inventory-counts/{selected_count_id}/post",
                    headers={"Idempotency-Key": str(uuid4())},
                    expected_status=200,
                )
                if response is not None:
                    st.success("Contagem postada.")
                    st.rerun()

            if c3.button("Cancel", use_container_width=True):
                response = api_call(
                    client.post,
                    f"/stock/inventory-counts/{selected_count_id}/cancel",
                    headers={"Idempotency-Key": str(uuid4())},
                    expected_status=200,
                )
                if response is not None:
                    st.success("Contagem cancelada.")
                    st.rerun()

            st.caption(f"Status atual: {status_value}")

with tab_create:
    if endpoint_unavailable(client, "POST", "/stock/inventory-counts"):
        st.stop()
    if not branches:
        st.info("Cadastre branches e locations para iniciar contagens.")
        st.stop()

    branch_ids = sorted(branch_map.keys())
    create_branch = st.selectbox(
        "Branch",
        options=branch_ids,
        format_func=lambda x: f"{x} - {branch_map.get(x, '')}",
        key="create_count_branch",
    )
    create_locations = (
        api_call(get_locations_cached, base_url, token, create_branch) or []
    )
    location_map = {
        int(row["id"]): row.get("name", str(row["id"]))
        for row in create_locations
        if "id" in row
    }
    if not location_map:
        st.warning("Nao ha locations para a branch selecionada.")
        st.stop()

    create_location = st.selectbox(
        "Location",
        options=sorted(location_map.keys()),
        format_func=lambda x: f"{x} - {location_map.get(x, '')}",
        key="create_count_location",
    )
    scope = st.selectbox("Scope", ["ALL", "SKUS"])

    selected_skus: list[int] = []
    if scope == "SKUS":
        sku_options = sorted(sku_map.keys())
        selected_skus = st.multiselect(
            "SKU IDs",
            options=sku_options,
            format_func=lambda x: f"{x} - {sku_map.get(x, '')}",
        )

    if st.button("Criar Contagem", type="primary", use_container_width=True):
        payload = {
            "branch_id": int(create_branch),
            "location_id": int(create_location),
            "scope": scope,
            "sku_ids": selected_skus or None,
        }
        if scope == "SKUS" and not selected_skus:
            st.error("Selecione ao menos um SKU para scope=SKUS.")
            st.stop()

        created = api_call(
            client.post,
            "/stock/inventory-counts",
            json_body=payload,
            headers={"Idempotency-Key": str(uuid4())},
            expected_status={200, 201},
            spinner_text="Criando contagem...",
        )
        if isinstance(created, dict):
            st.success(f"Contagem criada com ID {created.get('id')}.")
            st.json(created)
