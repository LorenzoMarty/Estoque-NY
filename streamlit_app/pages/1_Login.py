from __future__ import annotations

import streamlit as st
from lib.auth import (
    init_session_state,
    is_authenticated,
    login,
    logout,
    set_api_base_url,
)

st.set_page_config(page_title="Login", page_icon="ðŸ”", layout="centered")
init_session_state()

st.title("Login")

with st.sidebar:
    st.subheader("Configuracao")
    api_base_input = st.text_input(
        "API_BASE_URL",
        value=st.session_state.get("api_base_url", "http://localhost:8000"),
    )
    set_api_base_url(api_base_input.strip())

if is_authenticated():
    st.success("Voce ja esta autenticado.")
    col1, col2 = st.columns(2)
    if col1.button("Ir para Dashboard", use_container_width=True):
        st.switch_page("pages/2_Dashboard.py")
    if col2.button("Sair", use_container_width=True):
        logout()
        st.rerun()
    st.stop()

with st.form("login_form", clear_on_submit=False):
    email = st.text_input("E-mail")
    password = st.text_input("Senha", type="password")
    submitted = st.form_submit_button("Entrar", use_container_width=True)

if submitted:
    ok, message = login(email.strip(), password)
    if ok:
        st.success(message)
        st.switch_page("pages/2_Dashboard.py")
    else:
        st.error(message)
