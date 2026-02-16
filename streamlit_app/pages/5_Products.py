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
from lib.cache import clear_reference_caches, get_brands_cached, get_categories_cached
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
    show_toast,
)

st.set_page_config(page_title=t("products"), page_icon="🧱", layout="wide")
apply_base_styles()
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client)
page_header(
    t("products"),
    descricao="Produto e o cadastro principal. Variacoes, tamanhos e cores ficam em outra tela.",
    icon="🧱",
)

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

a1, a2, a3 = st.columns([1, 1, 3])
if a1.button(t("new_product"), type="primary", use_container_width=True):
    st.session_state["open_product_create"] = True
if a2.button("Atualizar lista", use_container_width=True):
    st.rerun()

with st.expander(t("filters"), expanded=True):
    f1, f2, f3, f4 = st.columns(4)
    q = f1.text_input("Busca por nome")
    active_option = f2.selectbox("Situacao", ["", "ativo", "inativo"])
    category_filter = f3.number_input("Categoria (ID)", min_value=0, value=0, step=1)
    brand_filter = f4.number_input("Marca (ID)", min_value=0, value=0, step=1)

    f5, f6, f7, f8 = st.columns(4)
    page = f5.number_input(t("page"), min_value=1, value=1, step=1)
    page_size = f6.number_input(t("page_size"), min_value=1, max_value=200, value=50)
    sort = f7.selectbox(t("sort"), ["id", "name", "created_at"])
    order = f8.selectbox(t("order"), ["asc", "desc"])

active: bool | None = None
if active_option == "ativo":
    active = True
elif active_option == "inativo":
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
    spinner_text="Buscando produtos...",
)

product_rows = (
    extract_items(products) if isinstance(products, dict) else (products or [])
)

section("Lista de produtos")
if product_rows:
    display_rows = []
    for row in product_rows:
        if not isinstance(row, dict):
            continue
        display_rows.append(
            {
                **row,
                "situacao": "Ativo" if row.get("active", True) else "Inativo",
            }
        )
    st.dataframe(pd.DataFrame(display_rows), use_container_width=True)
else:
    empty_state(t("empty_products"))
show_meta(extract_meta(products))

if st.session_state.get("open_product_create", False):
    section(t("new_product"))
    with st.form("create_product_form", clear_on_submit=False):
        c1, c2 = st.columns(2)
        name = c1.text_input("Nome do produto")
        active_create = c2.checkbox("Produto ativo", value=True)
        description = st.text_area("Descricao")
        c3, c4, c5 = st.columns(3)
        category_id = c3.selectbox(
            "Categoria",
            options=[None] + sorted(category_map.keys()),
            format_func=lambda x: (
                "Sem categoria" if x is None else f"{x} - {category_map.get(x, '')}"
            ),
        )
        brand_id = c4.selectbox(
            "Marca",
            options=[None] + sorted(brand_map.keys()),
            format_func=lambda x: (
                "Sem marca" if x is None else f"{x} - {brand_map.get(x, '')}"
            ),
        )
        brand_legacy = c5.text_input("Marca (campo legado)")
        submit_col, cancel_col = st.columns(2)
        submit_create = submit_col.form_submit_button(
            "Confirmar novo produto",
            type="primary",
            use_container_width=True,
        )
        cancel_create = cancel_col.form_submit_button(
            t("cancel"),
            use_container_width=True,
        )

    if cancel_create:
        st.session_state["open_product_create"] = False
        st.rerun()

    if submit_create:
        if not name.strip():
            st.error("Informe o nome do produto.")
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
                spinner_text="Salvando produto...",
            )
            if created is not None:
                clear_reference_caches()
                st.success("Produto criado com sucesso.")
                show_toast("Produto salvo.")
                st.session_state["open_product_create"] = False
                st.rerun()

section("Editar produto")
product_ids = [int(row["id"]) for row in product_rows if "id" in row]
selected_product_id = st.selectbox(
    "Selecione um produto",
    options=[None] + product_ids,
    format_func=lambda x: "Selecione..." if x is None else f"Produto #{x}",
)

if selected_product_id:
    current = next(
        (row for row in product_rows if row.get("id") == selected_product_id), None
    )
    if current:
        with st.form("update_product_form"):
            c1, c2 = st.columns(2)
            up_name = c1.text_input("Nome", value=current.get("name", ""))
            up_active = c2.checkbox(
                "Produto ativo", value=bool(current.get("active", True))
            )
            up_description = st.text_area(
                "Descricao", value=current.get("description") or ""
            )
            c3, c4, c5 = st.columns(3)
            category_options = [None] + sorted(category_map.keys())
            up_category = c3.selectbox(
                "Categoria",
                options=category_options,
                index=(
                    category_options.index(current.get("category_id"))
                    if current.get("category_id") in category_options
                    else 0
                ),
                format_func=lambda x: (
                    "Sem categoria" if x is None else f"{x} - {category_map.get(x, '')}"
                ),
            )
            brand_options = [None] + sorted(brand_map.keys())
            up_brand_id = c4.selectbox(
                "Marca",
                options=brand_options,
                index=(
                    brand_options.index(current.get("brand_id"))
                    if current.get("brand_id") in brand_options
                    else 0
                ),
                format_func=lambda x: (
                    "Sem marca" if x is None else f"{x} - {brand_map.get(x, '')}"
                ),
            )
            up_brand_legacy = c5.text_input(
                "Marca (campo legado)", value=current.get("brand") or ""
            )
            submit_update = st.form_submit_button(
                "Salvar alteracoes",
                type="primary",
                use_container_width=True,
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
                spinner_text="Salvando alteracoes...",
            )
            if updated is not None:
                clear_reference_caches()
                st.success("Produto atualizado com sucesso.")
                show_toast("Produto atualizado.")
                st.rerun()

with st.expander("Categorias e marcas", expanded=False):
    section("Categorias")
    if client.has_endpoint("POST", "/categories"):
        with st.form("create_category"):
            category_name = st.text_input("Nova categoria")
            create_category = st.form_submit_button("Adicionar categoria")
        if create_category:
            if not category_name.strip():
                st.warning("Informe o nome da categoria.")
            else:
                created = api_call(
                    client.post,
                    "/categories",
                    json_body={"name": category_name.strip()},
                    expected_status={200, 201},
                )
                if created is not None:
                    clear_reference_caches()
                    st.success("Categoria criada.")
                    show_toast("Categoria criada.")
                    st.rerun()
    else:
        st.info("Cadastro de categorias indisponivel no backend.")

    if categories:
        st.dataframe(pd.DataFrame(categories), use_container_width=True)

    section("Marcas")
    if client.has_endpoint("POST", "/brands"):
        with st.form("create_brand"):
            brand_name = st.text_input("Nova marca")
            create_brand = st.form_submit_button("Adicionar marca")
        if create_brand:
            if not brand_name.strip():
                st.warning("Informe o nome da marca.")
            else:
                created = api_call(
                    client.post,
                    "/brands",
                    json_body={"name": brand_name.strip()},
                    expected_status={200, 201},
                )
                if created is not None:
                    clear_reference_caches()
                    st.success("Marca criada.")
                    show_toast("Marca criada.")
                    st.rerun()
    else:
        st.info("Cadastro de marcas indisponivel no backend.")

    if brands:
        st.dataframe(pd.DataFrame(brands), use_container_width=True)
