from __future__ import annotations

import streamlit as st
from lib.auth import (
    init_session_state,
    is_authenticated,
    login,
    logout,
    set_api_base_url,
)
from lib.i18n import t
from lib.ui import apply_base_styles, page_header

st.set_page_config(page_title=t("login_title"), page_icon="🔐", layout="centered")
apply_base_styles()
init_session_state()

with st.sidebar:
    st.subheader("Configuracao")
    api_base_input = st.text_input(
        t("api_url"),
        value=st.session_state.get("api_base_url", "http://localhost:8000"),
    )
    set_api_base_url(api_base_input.strip())

page_header(
    t("login_title"),
    descricao="Entre com seu e-mail e senha para acessar as operacoes do estoque.",
    icon="🔐",
)

if is_authenticated():
    st.success(t("already_authenticated"))
    col1, col2 = st.columns(2)
    if col1.button(t("go_to_dashboard"), use_container_width=True):
        st.switch_page("pages/2_Dashboard.py")
    if col2.button(t("logout"), use_container_width=True):
        logout()
        st.rerun()
    st.stop()

left, center, right = st.columns([1, 1.2, 1])
with center:
    with st.container(border=True):
        with st.form("login_form", clear_on_submit=False):
            email = st.text_input(
                t("email"),
                placeholder=t("email_placeholder"),
                key="login_email",
            )
            password = st.text_input(
                t("password"),
                type="password",
                placeholder=t("password_placeholder"),
                key="login_password",
            )
            submitted = st.form_submit_button(
                t("login_button"),
                type="primary",
                use_container_width=True,
            )

if submitted:
    ok, message = login(email.strip(), password)
    if ok:
        st.success(message)
        st.switch_page("pages/2_Dashboard.py")
    else:
        st.error(message)
