from __future__ import annotations

from pathlib import Path

import streamlit as st
from dotenv import load_dotenv
from lib.auth import (
    can_show_menu,
    init_session_state,
    is_authenticated,
    set_api_base_url,
)
from lib.i18n import t
from lib.ui import apply_base_styles, page_header

APP_DIR = Path(__file__).resolve().parent
load_dotenv(APP_DIR / ".env")
load_dotenv()

st.set_page_config(page_title=t("app_title"), page_icon="📦", layout="wide")
apply_base_styles()
init_session_state()

with st.sidebar:
    st.subheader("Configuracao")
    api_base_input = st.text_input(
        t("api_url"),
        value=st.session_state.get("api_base_url", "http://localhost:8000"),
        help="Informe o endereco base da API FastAPI.",
    )
    set_api_base_url(api_base_input.strip())

page_header(
    t("dashboard"),
    descricao="Escolha uma area no menu para operar transferencias, contagens, cadastros e relatorios.",
    icon="🏪",
)
st.caption(t("app_subtitle"))

if not is_authenticated():
    st.warning("Voce precisa entrar para continuar.")
    st.page_link("pages/1_Login.py", label=t("login_title"), icon="🔐")
    st.stop()

st.success("Sessao autenticada.")

permission_map = {
    "pages/2_Dashboard.py": (t("dashboard"), None),
    "pages/3_Transfers.py": (t("transfers"), "stock.transfer.read"),
    "pages/4_Inventory_Counts.py": (t("inventory_counts"), "stock.inventory.create"),
    "pages/5_Products.py": (t("products"), "product.read"),
    "pages/6_SKUs.py": (t("product_variations"), "sku.read"),
    "pages/7_Users_Roles.py": (t("users_permissions"), "auth.user.manage"),
    "pages/8_Reports.py": (t("reports"), "reports.read"),
    "pages/9_Audit_Logs.py": (t("audit_logs"), "audit.read"),
    "pages/10_Stock_Explorer.py": (t("stock_explorer"), "stock.balance.read"),
}

st.subheader("Navegacao")
for page_path, (label, permission) in permission_map.items():
    if can_show_menu(permission):
        st.page_link(page_path, label=label)
