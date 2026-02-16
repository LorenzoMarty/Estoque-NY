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
    show_dataframe,
    show_meta,
    show_toast,
    status_badge,
)

st.set_page_config(page_title=t("inventory_counts"), page_icon="🧾", layout="wide")
apply_base_styles()
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client)
page_header(
    t("inventory_counts"),
    descricao=t("inventory_help"),
    icon="🧾",
)

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

if "show_count_form" not in st.session_state:
    st.session_state["show_count_form"] = False

a1, a2, a3 = st.columns([1, 1, 3])
if a1.button(t("create_count"), type="primary", use_container_width=True):
    st.session_state["show_count_form"] = not st.session_state["show_count_form"]
if a2.button("Atualizar lista", use_container_width=True):
    st.rerun()

with st.expander(t("filters"), expanded=True):
    c1, c2, c3, c4 = st.columns(4)
    status_filter = c1.selectbox(
        t("status"), ["", "OPEN", "CLOSED", "POSTED", "CANCELLED"]
    )
    branch_id = c2.number_input("Filial (ID)", min_value=0, value=0, step=1)
    location_id = c3.number_input("Local (ID)", min_value=0, value=0, step=1)
    page = c4.number_input(t("page"), min_value=1, value=1, step=1)

    c5, c6, c7 = st.columns(3)
    page_size = c5.number_input(t("page_size"), min_value=1, max_value=200, value=20)
    sort = c6.selectbox(
        t("sort"), ["started_at", "id", "status", "closed_at", "posted_at"]
    )
    order = c7.selectbox(t("order"), ["desc", "asc"])

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
    spinner_text="Buscando contagens...",
)
count_rows = extract_items(counts_data)

section("Contagens de estoque")
if count_rows:
    display_rows = []
    for row in count_rows:
        if not isinstance(row, dict):
            continue
        display_rows.append({**row, "status_label": humanize_status(row.get("status"))})
    show_dataframe(display_rows)
else:
    empty_state(t("empty_counts"))
show_meta(extract_meta(counts_data))

section("Detalhe da contagem")
count_ids = [int(row["id"]) for row in count_rows if "id" in row]
selected_count_id = st.selectbox(
    "Selecione a contagem",
    options=[None] + count_ids,
    format_func=lambda x: "Selecione..." if x is None else f"Contagem #{x}",
)

if selected_count_id:
    detail = api_call(
        client.get,
        f"/stock/inventory-counts/{selected_count_id}",
        expected_status=200,
        spinner_text="Carregando detalhe...",
    )
    if isinstance(detail, dict):
        st.write("Status atual:")
        status_badge(detail.get("status"))
        st.json({k: v for k, v in detail.items() if k != "lines"})

        line_rows = detail.get("lines", [])
        if isinstance(line_rows, list) and line_rows:
            display_rows = []
            for row in line_rows:
                if not isinstance(row, dict):
                    continue
                diff = row.get("diff_qty")
                if diff is None:
                    system_qty = row.get("system_qty", 0)
                    counted_qty = row.get("counted_qty", 0)
                    diff = int(counted_qty) - int(system_qty)
                display_rows.append(
                    {
                        "sku_id": row.get("sku_id"),
                        "variacao": sku_map.get(int(row.get("sku_id", 0)), ""),
                        t("system_qty"): row.get("system_qty"),
                        t("counted_qty"): row.get("counted_qty"),
                        t("diff_qty"): diff,
                    }
                )

            line_df = pd.DataFrame(display_rows)
            edited_df = st.data_editor(
                line_df,
                use_container_width=True,
                num_rows="fixed",
                hide_index=True,
                column_config={
                    "sku_id": st.column_config.NumberColumn(disabled=True),
                    "variacao": st.column_config.TextColumn(disabled=True),
                    t("system_qty"): st.column_config.NumberColumn(disabled=True),
                    t("counted_qty"): st.column_config.NumberColumn(
                        min_value=0, step=1
                    ),
                    t("diff_qty"): st.column_config.NumberColumn(disabled=True),
                },
                key=f"count_lines_editor_{selected_count_id}",
            )

            resumo_col1, resumo_col2 = st.columns(2)
            divergentes = int(
                (edited_df[t("diff_qty")].fillna(0).astype(int) != 0).sum()
            )
            corretos = int((edited_df[t("diff_qty")].fillna(0).astype(int) == 0).sum())
            resumo_col1.success(f"Itens corretos: {corretos}")
            resumo_col2.error(f"Itens com divergencia: {divergentes}")

            if st.button("Salvar contagens informadas", use_container_width=True):
                payload_lines: list[dict[str, int]] = []
                for _, row in edited_df.iterrows():
                    sku_id_value = row.get("sku_id")
                    counted_qty_value = row.get(t("counted_qty"))
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
                        spinner_text="Salvando contagens...",
                    )
                    if patched is not None:
                        st.success("Linhas atualizadas com sucesso.")
                        show_toast("Contagens salvas.")
                        st.rerun()

            uploaded = st.file_uploader(
                "Importar CSV (colunas: sku_id,counted_qty)",
                type=["csv"],
                key=f"csv_upload_{selected_count_id}",
            )
            if uploaded is not None and st.button(
                "Aplicar valores do CSV",
                key=f"apply_csv_{selected_count_id}",
                use_container_width=True,
            ):
                csv_df = pd.read_csv(uploaded)
                required = {"sku_id", "counted_qty"}
                if not required.issubset(set(csv_df.columns)):
                    st.error("CSV invalido. Use as colunas sku_id e counted_qty.")
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
                        show_toast("CSV aplicado.")
                        st.rerun()
        else:
            empty_state("Esta contagem ainda nao possui linhas.")

        st.markdown("### Acoes da contagem")
        c1, c2, c3 = st.columns(3)

        with c1:
            close_confirm = confirm_dialog(
                "Deseja fechar esta contagem?",
                key=f"close_confirm_{selected_count_id}",
            )
            if st.button(
                t("close_count"),
                use_container_width=True,
                key=f"close_{selected_count_id}",
            ):
                if not close_confirm:
                    st.warning("Marque a confirmacao antes de fechar.")
                else:
                    response = api_call(
                        client.post,
                        f"/stock/inventory-counts/{selected_count_id}/close",
                        headers={"Idempotency-Key": str(uuid4())},
                        expected_status=200,
                        spinner_text="Fechando contagem...",
                    )
                    if response is not None:
                        st.success("Contagem fechada.")
                        show_toast("Contagem fechada.")
                        st.rerun()

        with c2:
            post_confirm = confirm_dialog(
                "Deseja aplicar os ajustes desta contagem no estoque?",
                key=f"post_confirm_{selected_count_id}",
            )
            if st.button(
                t("post_count"),
                type="primary",
                use_container_width=True,
                key=f"post_{selected_count_id}",
            ):
                if not post_confirm:
                    st.warning("Marque a confirmacao antes de aplicar ajustes.")
                else:
                    response = api_call(
                        client.post,
                        f"/stock/inventory-counts/{selected_count_id}/post",
                        headers={"Idempotency-Key": str(uuid4())},
                        expected_status=200,
                        spinner_text="Aplicando ajustes...",
                    )
                    if response is not None:
                        st.success("Ajustes aplicados com sucesso.")
                        show_toast("Ajustes aplicados.")
                        st.rerun()

        with c3:
            cancel_confirm = confirm_dialog(
                "Deseja cancelar esta contagem?",
                key=f"cancel_confirm_{selected_count_id}",
            )
            if st.button(
                t("cancel_operation"),
                use_container_width=True,
                key=f"cancel_{selected_count_id}",
            ):
                if not cancel_confirm:
                    st.warning("Marque a confirmacao antes de cancelar.")
                else:
                    response = api_call(
                        client.post,
                        f"/stock/inventory-counts/{selected_count_id}/cancel",
                        headers={"Idempotency-Key": str(uuid4())},
                        expected_status=200,
                        spinner_text="Cancelando contagem...",
                    )
                    if response is not None:
                        st.success("Contagem cancelada.")
                        show_toast("Contagem cancelada.")
                        st.rerun()

if st.session_state.get("show_count_form"):
    section(t("create_count"))
    if endpoint_unavailable(client, "POST", "/stock/inventory-counts"):
        st.stop()
    if not branches:
        st.warning("Cadastre filiais e locais antes de iniciar contagens.")
        st.stop()

    branch_ids = sorted(branch_map.keys())
    create_branch = st.selectbox(
        "Filial",
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
        st.warning("A filial selecionada nao possui locais cadastrados.")
        st.stop()

    create_location = st.selectbox(
        "Local de estoque",
        options=sorted(location_map.keys()),
        format_func=lambda x: f"{x} - {location_map.get(x, '')}",
        key="create_count_location",
    )
    scope = st.selectbox(
        "Escopo da contagem",
        ["ALL", "SKUS"],
        format_func=lambda x: (
            "Todos os itens" if x == "ALL" else "Variacoes selecionadas"
        ),
    )

    selected_skus: list[int] = []
    if scope == "SKUS":
        sku_options = sorted(sku_map.keys())
        selected_skus = st.multiselect(
            "Selecione as variacoes",
            options=sku_options,
            format_func=lambda x: f"{x} - {sku_map.get(x, '')}",
        )

    if st.button("Confirmar nova contagem", type="primary", use_container_width=True):
        payload = {
            "branch_id": int(create_branch),
            "location_id": int(create_location),
            "scope": scope,
            "sku_ids": selected_skus or None,
        }
        if scope == "SKUS" and not selected_skus:
            st.error("Selecione ao menos uma variacao para o escopo escolhido.")
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
            st.success(f"Contagem criada com sucesso. ID: {created.get('id')}")
            show_toast("Contagem criada.")
            st.session_state["show_count_form"] = False
            st.rerun()
