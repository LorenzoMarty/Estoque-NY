from __future__ import annotations

import json

import pandas as pd
import streamlit as st
from lib.api_client import build_params, extract_items, extract_meta
from lib.auth import get_api_client, init_session_state, require_auth
from lib.ui import (
    api_call,
    render_sidebar_context,
    show_meta,
    show_page_header,
)

st.set_page_config(page_title="Audit Logs", page_icon="ðŸ•µï¸", layout="wide")
init_session_state()
require_auth()

client = get_api_client()
render_sidebar_context(client, show_global_filters=False)
show_page_header("Audit Logs", permission_hint="audit.read")

candidate_paths = [
    "/audit-logs",
    "/audit/logs",
    "/reports/audit-logs",
    "/logs/audit",
]
audit_path = next(
    (path for path in candidate_paths if client.has_endpoint("GET", path)),
    None,
)

if not audit_path:
    st.info("Nenhum endpoint de auditoria encontrado no OpenAPI.")
    st.caption(
        "Adicione um endpoint GET de audit logs no backend para habilitar esta tela."
    )
    st.stop()

st.subheader(f"Consulta ({audit_path})")
c1, c2, c3, c4 = st.columns(4)
user_id = c1.number_input("User ID", min_value=0, value=0, step=1)
action = c2.text_input("Action")
resource_type = c3.text_input("Resource Type")
q = c4.text_input("Busca")

c5, c6, c7, c8 = st.columns(4)
page = c5.number_input("Page", min_value=1, value=1, step=1)
page_size = c6.number_input("Page Size", min_value=1, max_value=200, value=50, step=1)
sort = c7.text_input("Sort", value="created_at")
order = c8.selectbox("Order", ["desc", "asc"])

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
)

rows = extract_items(data) if isinstance(data, dict) else (data or [])
if rows:
    st.dataframe(pd.DataFrame(rows), use_container_width=True)
else:
    st.info("Nenhum log encontrado.")
show_meta(extract_meta(data))

st.divider()
st.subheader("Detalhe before/after")
for row in rows:
    if not isinstance(row, dict):
        continue
    log_id = row.get("id")
    title = f"log {log_id} - {row.get('action', '')}"
    with st.expander(title):
        before_json = row.get("before_json") or row.get("before")
        after_json = row.get("after_json") or row.get("after")
        st.markdown("**Before**")
        if before_json is None:
            st.write("-")
        else:
            st.code(
                json.dumps(before_json, indent=2, ensure_ascii=False), language="json"
            )
        st.markdown("**After**")
        if after_json is None:
            st.write("-")
        else:
            st.code(
                json.dumps(after_json, indent=2, ensure_ascii=False), language="json"
            )
