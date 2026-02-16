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

APP_DIR = Path(__file__).resolve().parent
load_dotenv(APP_DIR / ".env")
load_dotenv()

st.set_page_config(page_title="Estoque ERP Backoffice", page_icon="ðŸ“¦", layout="wide")
init_session_state()

with st.sidebar:
    st.subheader("Configuracao")
    api_base_input = st.text_input(
        "API_BASE_URL",
        value=st.session_state.get("api_base_url", "http://localhost:8000"),
        help="URL base da API FastAPI",
    )
    set_api_base_url(api_base_input.strip())

st.title("Estoque ERP Backoffice")
st.caption(
    "Interface Streamlit basica para operar estoque, " "transferencias e inventario."
)

if not is_authenticated():
    st.info("Voce nao esta autenticado.")
    st.page_link("pages/1_Login.py", label="Ir para Login", icon="ðŸ”")
    st.stop()

st.success("Sessao autenticada.")

permission_map = {
    "pages/2_Dashboard.py": None,
    "pages/3_Transfers.py": "stock.transfer.read",
    "pages/4_Inventory_Counts.py": "stock.inventory.create",
    "pages/5_Products.py": "product.read",
    "pages/6_SKUs.py": "sku.read",
    "pages/7_Users_Roles.py": "auth.user.manage",
    "pages/8_Reports.py": "reports.read",
    "pages/9_Audit_Logs.py": "audit.read",
    "pages/10_Stock_Explorer.py": "stock.balance.read",
}

st.subheader("Navegacao")
for page_path, permission in permission_map.items():
    if can_show_menu(permission):
        label = page_path.split("/")[-1].replace("_", " ").replace(".py", "")
        st.page_link(page_path, label=label)
