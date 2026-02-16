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
    page_header,
    render_sidebar_context,
    section,
    show_meta,
    show_toast,
)

st.set_page_config(page_title=t("users_permissions"), page_icon="👥", layout="wide")
apply_base_styles()
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client, show_global_filters=False)
page_header(
    t("users_permissions"),
    descricao=t("users_permissions_help"),
    icon="👥",
)
st.caption(
    "Se alguma funcao nao aparecer, significa que o endpoint correspondente nao esta disponivel no backend."
)

me = api_call(client.get, "/auth/me", expected_status=200)
if isinstance(me, dict):
    section("Usuario logado")
    st.json(me)

section("Acoes principais")
tab_users, tab_roles = st.tabs(["Usuarios", "Perfis e permissoes"])

with tab_users:
    with st.expander(t("filters"), expanded=True):
        f1, f2, f3, f4 = st.columns(4)
        q = f1.text_input("Busca")
        page = f2.number_input(t("page"), min_value=1, value=1, step=1)
        page_size = f3.number_input(
            t("page_size"), min_value=1, max_value=200, value=50
        )
        sort = f4.selectbox(t("sort"), ["id", "email", "name", "created_at"])
        o1, _o2, _o3, _o4 = st.columns(4)
        order = o1.selectbox(t("order"), ["asc", "desc"])

    user_list_candidates = ["/users", "/auth/users"]
    user_list_path = next(
        (path for path in user_list_candidates if client.has_endpoint("GET", path)),
        None,
    )
    users: list[dict[str, object]] = []
    meta = {}
    if user_list_path:
        users_data = api_call(
            client.get,
            user_list_path,
            params=build_params(
                page=int(page),
                page_size=int(page_size),
                sort=sort,
                order=order,
                q=q or None,
            ),
            expected_status=200,
            spinner_text="Carregando usuarios...",
        )
        users = (
            extract_items(users_data)
            if isinstance(users_data, dict)
            else (users_data or [])
        )
        meta = extract_meta(users_data)

    section("Lista de usuarios")
    if users:
        display = []
        for row in users:
            if not isinstance(row, dict):
                continue
            display.append(
                {
                    **row,
                    "situacao": "Ativo" if row.get("active", True) else "Inativo",
                }
            )
        st.dataframe(pd.DataFrame(display), use_container_width=True)
        show_meta(meta)
    elif user_list_path:
        empty_state("Nenhum usuario encontrado para os filtros selecionados.")
    else:
        st.warning("Listagem de usuarios indisponivel no backend.")

    section("Novo usuario")
    if client.has_endpoint("POST", "/auth/register"):
        with st.form("register_user_form"):
            c1, c2 = st.columns(2)
            name = c1.text_input("Nome completo")
            email = c2.text_input("E-mail")
            password = st.text_input("Senha inicial", type="password")
            submit = st.form_submit_button(
                "Criar usuario",
                type="primary",
                use_container_width=True,
            )

        if submit:
            if not name.strip() or not email.strip() or not password:
                st.error("Nome, e-mail e senha sao obrigatorios.")
            else:
                created = api_call(
                    client.post,
                    "/auth/register",
                    json_body={
                        "name": name.strip(),
                        "email": email.strip(),
                        "password": password,
                    },
                    expected_status={200, 201},
                    spinner_text="Criando usuario...",
                )
                if created is not None:
                    st.success("Usuario criado com sucesso.")
                    show_toast("Usuario criado.")
                    st.rerun()
    else:
        st.warning("Cadastro de usuarios indisponivel no backend.")

with tab_roles:
    section("Perfis de acesso")
    role_list_candidates = ["/roles", "/auth/roles"]
    role_path = next(
        (path for path in role_list_candidates if client.has_endpoint("GET", path)),
        None,
    )
    roles: list[dict[str, object]] = []
    if role_path:
        roles_data = api_call(
            client.get,
            role_path,
            params=build_params(page=1, page_size=200, sort="id", order="asc"),
            expected_status=200,
            spinner_text="Carregando perfis...",
        )
        roles = (
            extract_items(roles_data)
            if isinstance(roles_data, dict)
            else (roles_data or [])
        )

    if roles:
        st.dataframe(pd.DataFrame(roles), use_container_width=True)
    elif role_path:
        empty_state("Nenhum perfil encontrado.")
    else:
        st.warning("Listagem de perfis indisponivel no backend.")

    section("Atribuir perfil a usuario")
    if client.has_endpoint("POST", "/auth/roles/assign"):
        with st.form("assign_role_form"):
            c1, c2 = st.columns(2)
            user_id = c1.number_input("ID do usuario", min_value=1, step=1)
            role_name = c2.text_input("Nome do perfil", value="admin")
            submit_assign = st.form_submit_button(
                "Confirmar atribuicao",
                type="primary",
                use_container_width=True,
            )

        if submit_assign:
            result = api_call(
                client.post,
                "/auth/roles/assign",
                json_body={"user_id": int(user_id), "role_name": role_name.strip()},
                expected_status={200, 204},
                spinner_text="Atribuindo perfil...",
            )
            if result is None:
                st.success("Perfil atribuido com sucesso.")
            else:
                st.success("Perfil atribuido.")
            show_toast("Perfil atualizado.")
    else:
        st.warning("Atribuicao de perfis indisponivel no backend.")
