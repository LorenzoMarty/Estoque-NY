from __future__ import annotations

import streamlit as st
from lib.api_client import build_params, extract_items
from lib.auth import (
    get_access_token,
    get_api_base_url,
    get_api_client,
    init_session_state,
    require_auth,
)
from lib.cache import clear_reference_caches, get_products_cached
from lib.ui import (
    api_call,
    endpoint_unavailable,
    parse_json_input,
    render_sidebar_context,
    show_dataframe,
    show_page_header,
)

st.set_page_config(page_title="SKUs", page_icon="ðŸ·ï¸", layout="wide")
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client)
show_page_header("SKUs", permission_hint="sku.read")

if endpoint_unavailable(client, "GET", "/skus"):
    st.stop()

base_url = get_api_base_url()
token = get_access_token()
products = api_call(get_products_cached, base_url, token) or []
product_map = {
    int(row["id"]): row.get("name", str(row["id"])) for row in products if "id" in row
}

tab_list, tab_create = st.tabs(["Listagem e Edicao", "Criar SKU"])

with tab_list:
    st.subheader("Filtros")
    c1, c2, c3, c4 = st.columns(4)
    q = c1.text_input("Busca")
    product_filter = c2.number_input("Product ID", min_value=0, value=0, step=1)
    active_option = c3.selectbox("Active", ["", "true", "false"])
    page = c4.number_input("Page", min_value=1, value=1, step=1)

    c5, c6, c7, c8 = st.columns(4)
    page_size = c5.number_input(
        "Page Size", min_value=1, max_value=200, value=50, step=1
    )
    sort = c6.selectbox("Sort", ["id", "sku_code", "name", "created_at"])
    order = c7.selectbox("Order", ["asc", "desc"])
    _unused = c8.empty()

    active: bool | None = None
    if active_option == "true":
        active = True
    elif active_option == "false":
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
    )

    sku_rows = (
        extract_items(skus_data) if isinstance(skus_data, dict) else (skus_data or [])
    )
    show_dataframe(sku_rows)

    st.divider()
    st.subheader("Editar SKU")
    sku_ids = [int(row["id"]) for row in sku_rows if "id" in row]
    selected_sku_id = st.selectbox(
        "SKU ID",
        options=[None] + sku_ids,
        format_func=lambda x: "Selecione..." if x is None else str(x),
    )

    if selected_sku_id:
        selected_row = next(
            (row for row in sku_rows if row.get("id") == selected_sku_id), None
        )
        if selected_row:
            with st.form("update_sku_form"):
                up_name = st.text_input("Nome", value=selected_row.get("name") or "")
                up_unit = st.selectbox(
                    "UOM",
                    ["UN", "KG", "CX"],
                    index=(
                        ["UN", "KG", "CX"].index(
                            (selected_row.get("unit") or "UN").upper()
                        )
                        if (selected_row.get("unit") or "UN").upper()
                        in ["UN", "KG", "CX"]
                        else 0
                    ),
                )
                up_barcode = st.text_input(
                    "Barcode principal", value=selected_row.get("barcode") or ""
                )
                up_active = st.checkbox(
                    "Ativo", value=bool(selected_row.get("active", True))
                )
                up_cost = st.number_input(
                    "Cost", min_value=0.0, value=float(selected_row.get("cost", 0))
                )
                up_price = st.number_input(
                    "Price", min_value=0.0, value=float(selected_row.get("price", 0))
                )
                up_tax_code = st.text_input(
                    "Tax code", value=selected_row.get("tax_code") or ""
                )
                attrs_value = selected_row.get("attributes") or {}
                up_attributes_raw = st.text_area(
                    "Attributes JSON",
                    value=str(attrs_value).replace("'", '"'),
                )
                submit_update = st.form_submit_button(
                    "Salvar Alteracoes", use_container_width=True
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
                )
                if updated is not None:
                    clear_reference_caches()
                    st.success("SKU atualizada.")
                    st.rerun()

            st.markdown("### Multiplos Barcodes")
            add_barcodes = st.text_input(
                "Adicionar barcodes (separados por virgula)",
                key=f"add_barcodes_{selected_sku_id}",
            )
            if st.button(
                "Adicionar Barcodes", key=f"add_barcode_btn_{selected_sku_id}"
            ):
                barcodes = [
                    item.strip() for item in add_barcodes.split(",") if item.strip()
                ]
                if not barcodes:
                    st.warning("Informe pelo menos um barcode.")
                else:
                    created = api_call(
                        client.post,
                        f"/skus/{selected_sku_id}/barcodes",
                        json_body={"barcodes": barcodes},
                        expected_status={200, 201},
                    )
                    if created is not None:
                        st.success("Barcodes adicionados.")

            del_barcode = st.text_input(
                "Remover barcode especifico",
                key=f"remove_barcode_{selected_sku_id}",
            )
            if st.button(
                "Remover Barcode", key=f"remove_barcode_btn_{selected_sku_id}"
            ):
                if not del_barcode.strip():
                    st.warning("Informe o barcode para remover.")
                else:
                    removed = api_call(
                        client.delete,
                        f"/skus/{selected_sku_id}/barcodes/{del_barcode.strip()}",
                        expected_status={200, 204},
                    )
                    if removed is None:
                        st.success("Barcode removido.")

with tab_create:
    st.subheader("Criar SKU")
    if not products:
        st.info("Cadastre produtos antes de criar SKUs.")
        st.stop()

    with st.form("create_sku_form", clear_on_submit=False):
        product_id = st.selectbox(
            "Produto",
            options=sorted(product_map.keys()),
            format_func=lambda x: f"{x} - {product_map.get(x, '')}",
        )
        sku_code = st.text_input("SKU Code")
        name = st.text_input("Nome")
        unit = st.selectbox("UOM", ["UN", "KG", "CX"])
        barcode = st.text_input("Barcode principal")
        active = st.checkbox("Ativo", value=True)
        cost = st.number_input("Cost", min_value=0.0, value=0.0)
        price = st.number_input("Price", min_value=0.0, value=0.0)
        tax_code = st.text_input("Tax code")
        attributes_raw = st.text_area("Attributes JSON", value="{}")
        submit_create = st.form_submit_button("Criar SKU", use_container_width=True)

    if submit_create:
        if not sku_code.strip():
            st.error("SKU code e obrigatorio.")
            st.stop()
        if cost < 0 or price < 0:
            st.error("Cost e Price devem ser >= 0.")
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
            spinner_text="Criando SKU...",
        )
        if created is not None:
            clear_reference_caches()
            st.success("SKU criada.")
            st.rerun()
