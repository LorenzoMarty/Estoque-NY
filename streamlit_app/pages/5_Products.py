from __future__ import annotations

import pandas as pd
import streamlit as st
from lib.api_client import build_params, extract_items
from lib.auth import (
    get_access_token,
    get_api_base_url,
    get_api_client,
    init_session_state,
    require_auth,
)
from lib.cache import (
    clear_reference_caches,
    get_brands_cached,
    get_categories_cached,
)
from lib.ui import (
    api_call,
    endpoint_unavailable,
    render_sidebar_context,
    show_dataframe,
    show_page_header,
)

st.set_page_config(page_title="Products", page_icon="ðŸ§±", layout="wide")
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client)
show_page_header("Products", permission_hint="product.read")

if endpoint_unavailable(client, "GET", "/products"):
    st.stop()

base_url = get_api_base_url()
token = get_access_token()
categories = api_call(get_categories_cached, base_url, token) or []
brands = api_call(get_brands_cached, base_url, token) or []

category_map = {
    int(row["id"]): row.get("name", str(row["id"])) for row in categories if "id" in row
}
brand_map = {
    int(row["id"]): row.get("name", str(row["id"])) for row in brands if "id" in row
}

tab_products, tab_catalog = st.tabs(["Produtos", "Categorias e Marcas"])

with tab_products:
    st.subheader("Listagem")
    c1, c2, c3, c4 = st.columns(4)
    q = c1.text_input("Busca (name)")
    active_option = c2.selectbox("Active", ["", "true", "false"])
    category_filter = c3.number_input("Category ID", min_value=0, value=0, step=1)
    brand_filter = c4.number_input("Brand ID", min_value=0, value=0, step=1)

    c5, c6, c7, c8 = st.columns(4)
    page = c5.number_input("Page", min_value=1, value=1, step=1)
    page_size = c6.number_input(
        "Page Size", min_value=1, max_value=200, value=50, step=1
    )
    sort = c7.selectbox("Sort", ["id", "name", "created_at"])
    order = c8.selectbox("Order", ["asc", "desc"])

    active: bool | None = None
    if active_option == "true":
        active = True
    elif active_option == "false":
        active = False

    products = api_call(
        client.get,
        "/products",
        params=build_params(
            page=int(page),
            page_size=int(page_size),
            sort=sort,
            order=order,
            q=q or None,
            active=active,
            category_id=int(category_filter) if category_filter > 0 else None,
            brand_id=int(brand_filter) if brand_filter > 0 else None,
        ),
        expected_status=200,
    )

    product_rows = (
        extract_items(products) if isinstance(products, dict) else (products or [])
    )
    show_dataframe(product_rows)

    st.divider()
    st.subheader("Criar Produto")
    with st.form("create_product_form", clear_on_submit=False):
        name = st.text_input("Nome", key="product_create_name")
        description = st.text_area("Descricao", key="product_create_description")
        active_create = st.checkbox("Ativo", value=True, key="product_create_active")

        category_id = st.selectbox(
            "Categoria",
            options=[None] + sorted(category_map.keys()),
            format_func=lambda x: (
                "Sem categoria" if x is None else f"{x} - {category_map.get(x, '')}"
            ),
            key="product_create_category",
        )
        brand_id = st.selectbox(
            "Marca",
            options=[None] + sorted(brand_map.keys()),
            format_func=lambda x: (
                "Sem marca" if x is None else f"{x} - {brand_map.get(x, '')}"
            ),
            key="product_create_brand",
        )
        brand_legacy = st.text_input("Brand legado (opcional)")
        submit_create = st.form_submit_button("Criar Produto", use_container_width=True)

    if submit_create:
        if not name.strip():
            st.error("Nome e obrigatorio.")
        else:
            payload = {
                "name": name.strip(),
                "description": description.strip() or None,
                "category_id": category_id,
                "brand_id": brand_id,
                "brand": brand_legacy.strip() or None,
                "active": bool(active_create),
            }
            created = api_call(
                client.post,
                "/products",
                json_body=payload,
                expected_status={200, 201},
                spinner_text="Criando produto...",
            )
            if created is not None:
                clear_reference_caches()
                st.success("Produto criado.")
                st.rerun()

    st.divider()
    st.subheader("Editar Produto")
    product_ids = [int(row["id"]) for row in product_rows if "id" in row]
    selected_product_id = st.selectbox(
        "Produto ID",
        options=[None] + product_ids,
        format_func=lambda x: "Selecione..." if x is None else str(x),
    )

    if selected_product_id:
        current = next(
            (row for row in product_rows if row.get("id") == selected_product_id), None
        )
        if current:
            with st.form("update_product_form"):
                up_name = st.text_input("Nome", value=current.get("name", ""))
                up_description = st.text_area(
                    "Descricao", value=current.get("description") or ""
                )
                up_active = st.checkbox(
                    "Ativo", value=bool(current.get("active", True))
                )
                up_category = st.selectbox(
                    "Categoria",
                    options=[None] + sorted(category_map.keys()),
                    index=(
                        ([None] + sorted(category_map.keys())).index(
                            current.get("category_id")
                        )
                        if current.get("category_id")
                        in ([None] + sorted(category_map.keys()))
                        else 0
                    ),
                    format_func=lambda x: (
                        "Sem categoria"
                        if x is None
                        else f"{x} - {category_map.get(x, '')}"
                    ),
                )
                up_brand_id = st.selectbox(
                    "Marca",
                    options=[None] + sorted(brand_map.keys()),
                    index=(
                        ([None] + sorted(brand_map.keys())).index(
                            current.get("brand_id")
                        )
                        if current.get("brand_id")
                        in ([None] + sorted(brand_map.keys()))
                        else 0
                    ),
                    format_func=lambda x: (
                        "Sem marca" if x is None else f"{x} - {brand_map.get(x, '')}"
                    ),
                )
                up_brand_legacy = st.text_input(
                    "Brand legado", value=current.get("brand") or ""
                )
                submit_update = st.form_submit_button(
                    "Salvar Alteracoes", use_container_width=True
                )

            if submit_update:
                payload = {
                    "name": up_name.strip(),
                    "description": up_description.strip() or None,
                    "active": bool(up_active),
                    "category_id": up_category,
                    "brand_id": up_brand_id,
                    "brand": up_brand_legacy.strip() or None,
                }
                updated = api_call(
                    client.patch,
                    f"/products/{selected_product_id}",
                    json_body=payload,
                    expected_status=200,
                )
                if updated is not None:
                    clear_reference_caches()
                    st.success("Produto atualizado.")
                    st.rerun()

with tab_catalog:
    st.subheader("Categorias")
    if client.has_endpoint("POST", "/categories"):
        with st.form("create_category"):
            category_name = st.text_input("Nova categoria")
            create_category = st.form_submit_button("Criar Categoria")
        if create_category:
            created = api_call(
                client.post,
                "/categories",
                json_body={"name": category_name.strip()},
                expected_status={200, 201},
            )
            if created is not None:
                clear_reference_caches()
                st.success("Categoria criada.")
                st.rerun()
    else:
        st.info("Endpoint /categories nao disponivel.")

    if categories:
        st.dataframe(pd.DataFrame(categories), use_container_width=True)

    st.divider()
    st.subheader("Marcas")
    if client.has_endpoint("POST", "/brands"):
        with st.form("create_brand"):
            brand_name = st.text_input("Nova marca")
            create_brand = st.form_submit_button("Criar Marca")
        if create_brand:
            created = api_call(
                client.post,
                "/brands",
                json_body={"name": brand_name.strip()},
                expected_status={200, 201},
            )
            if created is not None:
                clear_reference_caches()
                st.success("Marca criada.")
                st.rerun()
    else:
        st.info("Endpoint /brands nao disponivel.")

    if brands:
        st.dataframe(pd.DataFrame(brands), use_container_width=True)
