from __future__ import annotations

import pandas as pd
import streamlit as st
from lib.api_client import build_params, extract_items
from lib.auth import get_api_client, init_session_state, require_auth
from lib.ui import api_call, render_sidebar_context, show_page_header

st.set_page_config(page_title="Users & Roles", page_icon="ðŸ‘¥", layout="wide")
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client, show_global_filters=False)
show_page_header("Users & Roles", permission_hint="auth.user.manage")

st.caption(
    "Observacao: este frontend adapta-se aos endpoints disponiveis. "
    "No backend atual, gestao completa de usuarios/roles pode nao estar exposta."
)

current_user = api_call(client.get, "/auth/me", expected_status=200)
if isinstance(current_user, dict):
    st.subheader("Usuario Atual")
    st.json(current_user)

tab_users, tab_roles = st.tabs(["Usuarios", "Roles"])

with tab_users:
    st.subheader("Criar Usuario")
    if client.has_endpoint("POST", "/auth/register"):
        with st.form("register_user_form"):
            name = st.text_input("Nome")
            email = st.text_input("E-mail")
            password = st.text_input("Senha", type="password")
            submit = st.form_submit_button("Criar Usuario")

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
                )
                if created is not None:
                    st.success("Usuario criado.")
                    st.json(created)
    else:
        st.info("Endpoint /auth/register indisponivel.")

    st.divider()
    st.subheader("Listagem de Usuarios")
    user_list_candidates = ["/users", "/auth/users"]
    user_list_path = next(
        (path for path in user_list_candidates if client.has_endpoint("GET", path)),
        None,
    )
    if user_list_path:
        users_data = api_call(
            client.get,
            user_list_path,
            params=build_params(page=1, page_size=100, sort="id", order="asc"),
            expected_status=200,
        )
        users = (
            extract_items(users_data)
            if isinstance(users_data, dict)
            else (users_data or [])
        )
        if users:
            st.dataframe(pd.DataFrame(users), use_container_width=True)
        else:
            st.info("Nenhum usuario retornado.")
    else:
        st.info("Nao existe endpoint de listagem de usuarios exposto.")
        st.caption(
            "Ativar/desativar usuario tambem depende de endpoint especifico no backend."
        )

with tab_roles:
    st.subheader("Atribuir Role")
    if client.has_endpoint("POST", "/auth/roles/assign"):
        with st.form("assign_role_form"):
            user_id = st.number_input("User ID", min_value=1, step=1)
            role_name = st.selectbox(
                "Role",
                options=["admin", "stock_operator", "viewer"],
            )
            submit_assign = st.form_submit_button("Atribuir Role")

        if submit_assign:
            result = api_call(
                client.post,
                "/auth/roles/assign",
                json_body={"user_id": int(user_id), "role_name": role_name},
                expected_status={200, 204},
            )
            if result is None:
                st.success("Role atribuida com sucesso.")
            else:
                st.success("Role atribuida.")
    else:
        st.info("Endpoint /auth/roles/assign indisponivel.")

    st.divider()
    st.subheader("Roles e Permissions")
    role_list_candidates = ["/roles", "/auth/roles"]
    role_path = next(
        (path for path in role_list_candidates if client.has_endpoint("GET", path)),
        None,
    )
    if role_path:
        roles_data = api_call(client.get, role_path, expected_status=200)
        roles = (
            extract_items(roles_data)
            if isinstance(roles_data, dict)
            else (roles_data or [])
        )
        if roles:
            st.dataframe(pd.DataFrame(roles), use_container_width=True)
        else:
            st.info("Nenhuma role retornada.")
    else:
        st.info("Nao existe endpoint de listagem de roles/permissions exposto.")
