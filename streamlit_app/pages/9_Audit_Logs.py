from __future__ import annotations

import json

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
)

st.set_page_config(page_title=t("audit_logs"), page_icon="🕵️", layout="wide")
apply_base_styles()
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client, show_global_filters=False)
page_header(
    t("audit_logs"),
    descricao="Consulte o historico de alteracoes realizadas no sistema.",
    icon="🕵️",
)

candidate_paths = ["/audit-logs", "/audit/logs", "/reports/audit-logs", "/logs/audit"]
audit_path = next(
    (path for path in candidate_paths if client.has_endpoint("GET", path)), None
)

if not audit_path:
    st.warning("Nenhum endpoint de auditoria foi encontrado no OpenAPI.")
    st.caption("Ative um endpoint de auditoria no backend para usar esta tela.")
    st.stop()

section(f"Consulta de auditoria ({audit_path})")

with st.expander(t("filters"), expanded=True):
    c1, c2, c3, c4 = st.columns(4)
    user_id = c1.number_input("Usuario (ID)", min_value=0, value=0, step=1)
    action = c2.text_input("Acao")
    resource_type = c3.text_input("Tipo de recurso")
    q = c4.text_input("Busca geral")

    c5, c6, c7, c8 = st.columns(4)
    page = c5.number_input(t("page"), min_value=1, value=1, step=1)
    page_size = c6.number_input(t("page_size"), min_value=1, max_value=200, value=50)
    sort = c7.text_input(t("sort"), value="created_at")
    order = c8.selectbox(t("order"), ["desc", "asc"])

data = api_call(
    client.get,
    audit_path,
    params=build_params(
        page=int(page),
        page_size=int(page_size),
        sort=sort,
        order=order,
        q=q or None,
        user_id=int(user_id) if user_id > 0 else None,
        action=action or None,
        resource_type=resource_type or None,
    ),
    expected_status=200,
    spinner_text="Buscando registros de auditoria...",
)

rows = extract_items(data) if isinstance(data, dict) else (data or [])
if rows:
    st.dataframe(pd.DataFrame(rows), use_container_width=True)
else:
    empty_state(t("empty_audit_logs"))
show_meta(extract_meta(data))

section("Detalhes (antes e depois)")
for row in rows:
    if not isinstance(row, dict):
        continue
    log_id = row.get("id")
    title = f"Registro {log_id} - {row.get('action', '')}"
    with st.expander(title):
        before_json = row.get("before_json") or row.get("before")
        after_json = row.get("after_json") or row.get("after")

        st.markdown("**Antes**")
        if before_json is None:
            st.write("-")
        else:
            st.code(
                json.dumps(before_json, indent=2, ensure_ascii=False), language="json"
            )

        st.markdown("**Depois**")
        if after_json is None:
            st.write("-")
        else:
            st.code(
                json.dumps(after_json, indent=2, ensure_ascii=False), language="json"
            )
