from __future__ import annotations

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
from lib.cache import clear_reference_caches, get_products_cached
from lib.i18n import t
from lib.ui import (
    api_call,
    apply_base_styles,
    empty_state,
    endpoint_unavailable,
    page_header,
    parse_json_input,
    render_sidebar_context,
    section,
    show_meta,
    show_toast,
)

st.set_page_config(page_title=t("product_variations"), page_icon="🏷️", layout="wide")
apply_base_styles()
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client)
page_header(
    t("product_variations"),
    descricao="Cada variacao representa um item vendavel: tamanho, cor, embalagem etc.",
    icon="🏷️",
)

if endpoint_unavailable(client, "GET", "/skus"):
    st.stop()

base_url = get_api_base_url()
token = get_access_token()
products = api_call(get_products_cached, base_url, token) or []
product_map = {
    int(row["id"]): row.get("name", str(row["id"])) for row in products if "id" in row
}

if "open_sku_create" not in st.session_state:
    st.session_state["open_sku_create"] = False

a1, a2, a3 = st.columns([1, 1, 3])
if a1.button(t("new_variation"), type="primary", use_container_width=True):
    st.session_state["open_sku_create"] = not st.session_state["open_sku_create"]
if a2.button("Atualizar lista", use_container_width=True):
    st.rerun()

with st.expander(t("filters"), expanded=True):
    c1, c2, c3, c4 = st.columns(4)
    q = c1.text_input("Busca")
    product_filter = c2.number_input("Produto (ID)", min_value=0, value=0, step=1)
    active_option = c3.selectbox("Situacao", ["", "ativo", "inativo"])
    page = c4.number_input(t("page"), min_value=1, value=1, step=1)

    c5, c6, c7, c8 = st.columns(4)
    page_size = c5.number_input(t("page_size"), min_value=1, max_value=200, value=50)
    sort = c6.selectbox(t("sort"), ["id", "sku_code", "name", "created_at"])
    order = c7.selectbox(t("order"), ["asc", "desc"])
    _ = c8.empty()

active: bool | None = None
if active_option == "ativo":
    active = True
elif active_option == "inativo":
    active = False

skus_data = api_call(
    client.get,
    "/skus",
    params=build_params(
        page=int(page),
        page_size=int(page_size),
        sort=sort,
        order=order,
        q=q or None,
        product_id=int(product_filter) if product_filter > 0 else None,
        active=active,
    ),
    expected_status=200,
    spinner_text="Buscando variacoes...",
)

sku_rows = (
    extract_items(skus_data) if isinstance(skus_data, dict) else (skus_data or [])
)

section("Lista de variacoes")
if sku_rows:
    display_rows = []
    for row in sku_rows:
        if not isinstance(row, dict):
            continue
        display_rows.append(
            {
                **row,
                "produto": product_map.get(
                    int(row.get("product_id", 0)), row.get("product_id")
                ),
                "situacao": "Ativo" if row.get("active", True) else "Inativo",
            }
        )
    st.dataframe(pd.DataFrame(display_rows), use_container_width=True)
else:
    empty_state(t("empty_variations"))
show_meta(extract_meta(skus_data))

if st.session_state.get("open_sku_create"):
    section(t("new_variation"))
    if not products:
        st.warning("Cadastre produtos antes de criar variacoes.")
        st.stop()

    with st.form("create_sku_form", clear_on_submit=False):
        c1, c2 = st.columns(2)
        product_id = c1.selectbox(
            "Produto",
            options=sorted(product_map.keys()),
            format_func=lambda x: f"{x} - {product_map.get(x, '')}",
        )
        sku_code = c2.text_input("Codigo da variacao")
        c3, c4 = st.columns(2)
        name = c3.text_input("Nome da variacao")
        unit = c4.selectbox("Unidade de medida", ["UN", "KG", "CX"])
        c5, c6, c7 = st.columns(3)
        barcode = c5.text_input("Codigo de barras principal")
        cost = c6.number_input("Custo", min_value=0.0, value=0.0)
        price = c7.number_input("Preco base", min_value=0.0, value=0.0)
        c8, c9 = st.columns(2)
        tax_code = c8.text_input("Codigo fiscal")
        active = c9.checkbox("Variacao ativa", value=True)
        attributes_raw = st.text_area("Atributos (JSON)", value="{}")
        submit_col, cancel_col = st.columns(2)
        submit_create = submit_col.form_submit_button(
            "Confirmar nova variacao",
            type="primary",
            use_container_width=True,
        )
        cancel_create = cancel_col.form_submit_button(
            t("cancel"),
            use_container_width=True,
        )

    if cancel_create:
        st.session_state["open_sku_create"] = False
        st.rerun()

    if submit_create:
        if not sku_code.strip():
            st.error("Informe o codigo da variacao.")
            st.stop()
        if cost < 0 or price < 0:
            st.error("Custo e preco devem ser maiores ou iguais a zero.")
            st.stop()
        attrs = parse_json_input(attributes_raw)
        if attrs is None:
            st.stop()

        payload = {
            "product_id": int(product_id),
            "sku_code": sku_code.strip(),
            "name": name.strip() or None,
            "barcode": barcode.strip() or None,
            "unit": unit,
            "attributes": attrs,
            "cost": cost,
            "price": price,
            "tax_code": tax_code.strip() or None,
            "active": active,
        }
        created = api_call(
            client.post,
            "/skus",
            json_body=payload,
            expected_status={200, 201},
            spinner_text="Salvando variacao...",
        )
        if created is not None:
            clear_reference_caches()
            st.success("Variacao criada com sucesso.")
            show_toast("Variacao criada.")
            st.session_state["open_sku_create"] = False
            st.rerun()

section("Editar variacao")
sku_ids = [int(row["id"]) for row in sku_rows if "id" in row]
selected_sku_id = st.selectbox(
    "Selecione uma variacao",
    options=[None] + sku_ids,
    format_func=lambda x: "Selecione..." if x is None else f"Variacao #{x}",
)

if selected_sku_id:
    selected_row = next(
        (row for row in sku_rows if row.get("id") == selected_sku_id), None
    )
    if selected_row:
        with st.form("update_sku_form"):
            c1, c2 = st.columns(2)
            up_name = c1.text_input("Nome", value=selected_row.get("name") or "")
            up_unit = c2.selectbox(
                "Unidade de medida",
                ["UN", "KG", "CX"],
                index=(
                    ["UN", "KG", "CX"].index((selected_row.get("unit") or "UN").upper())
                    if (selected_row.get("unit") or "UN").upper() in ["UN", "KG", "CX"]
                    else 0
                ),
            )
            c3, c4, c5 = st.columns(3)
            up_barcode = c3.text_input(
                "Codigo de barras principal", value=selected_row.get("barcode") or ""
            )
            up_active = c4.checkbox(
                "Variacao ativa", value=bool(selected_row.get("active", True))
            )
            up_tax_code = c5.text_input(
                "Codigo fiscal", value=selected_row.get("tax_code") or ""
            )
            c6, c7 = st.columns(2)
            up_cost = c6.number_input(
                "Custo", min_value=0.0, value=float(selected_row.get("cost", 0))
            )
            up_price = c7.number_input(
                "Preco base", min_value=0.0, value=float(selected_row.get("price", 0))
            )
            attrs_value = selected_row.get("attributes") or {}
            up_attributes_raw = st.text_area(
                "Atributos (JSON)",
                value=str(attrs_value).replace("'", '"'),
            )
            submit_update = st.form_submit_button(
                "Salvar alteracoes",
                type="primary",
                use_container_width=True,
            )

        if submit_update:
            attrs = parse_json_input(up_attributes_raw)
            if attrs is None:
                st.stop()
            payload = {
                "name": up_name.strip() or None,
                "unit": up_unit,
                "barcode": up_barcode.strip() or None,
                "active": up_active,
                "cost": up_cost,
                "price": up_price,
                "tax_code": up_tax_code.strip() or None,
                "attributes": attrs,
            }
            updated = api_call(
                client.patch,
                f"/skus/{selected_sku_id}",
                json_body=payload,
                expected_status=200,
                spinner_text="Salvando alteracoes...",
            )
            if updated is not None:
                clear_reference_caches()
                st.success("Variacao atualizada com sucesso.")
                show_toast("Variacao atualizada.")
                st.rerun()

        st.markdown("### Codigos de barras adicionais")
        add_barcodes = st.text_input(
            "Adicionar codigos (separados por virgula)",
            key=f"add_barcodes_{selected_sku_id}",
        )
        if st.button(
            "Adicionar codigos de barras",
            key=f"add_barcode_btn_{selected_sku_id}",
            use_container_width=True,
        ):
            barcodes = [
                item.strip() for item in add_barcodes.split(",") if item.strip()
            ]
            if not barcodes:
                st.warning("Informe ao menos um codigo de barras.")
            else:
                created = api_call(
                    client.post,
                    f"/skus/{selected_sku_id}/barcodes",
                    json_body={"barcodes": barcodes},
                    expected_status={200, 201},
                )
                if created is not None:
                    st.success("Codigos adicionados.")
                    show_toast("Codigos adicionados.")

        del_barcode = st.text_input(
            "Remover codigo especifico",
            key=f"remove_barcode_{selected_sku_id}",
        )
        if st.button(
            "Remover codigo de barras",
            key=f"remove_barcode_btn_{selected_sku_id}",
            use_container_width=True,
        ):
            if not del_barcode.strip():
                st.warning("Informe o codigo para remover.")
            else:
                removed = api_call(
                    client.delete,
                    f"/skus/{selected_sku_id}/barcodes/{del_barcode.strip()}",
                    expected_status={200, 204},
                )
                if removed is None:
                    st.success("Codigo removido.")
                    show_toast("Codigo removido.")
