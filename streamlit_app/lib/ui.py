from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

import pandas as pd
import streamlit as st
from lib.api_client import ApiClient, ApiClientError, UnauthorizedError
from lib.auth import (
    can_show_menu,
    get_access_token,
    get_api_base_url,
    get_permissions_from_claims,
    logout,
)
from lib.cache import get_branches_cached, get_locations_cached


def show_api_error(exc: ApiClientError) -> None:
    if exc.status_code:
        st.error(f"{exc.status_code} - {exc.message}")
    else:
        st.error(exc.message)


def api_call(
    fn: Callable[..., Any],
    *args: Any,
    spinner_text: str | None = None,
    **kwargs: Any,
) -> Any | None:
    try:
        if spinner_text:
            with st.spinner(spinner_text):
                return fn(*args, **kwargs)
        return fn(*args, **kwargs)
    except UnauthorizedError:
        logout()
        st.warning("Token expirado ou invalido. Faca login novamente.")
        try:
            st.switch_page("pages/1_Login.py")
        except Exception:
            st.stop()
        st.stop()
    except ApiClientError as exc:
        show_api_error(exc)
        return None


def endpoint_unavailable(client: ApiClient, method: str, path: str) -> bool:
    available = client.has_endpoint(method, path)
    if available:
        return False
    st.info(f"Endpoint indisponivel: {method.upper()} {path}")
    return True


def _current_user_label() -> str:
    user = st.session_state.get("current_user") or {}
    if isinstance(user, dict) and user.get("email"):
        return f"{user.get('name') or ''} ({user.get('email')})".strip()
    claims = st.session_state.get("user_claims") or {}
    if isinstance(claims, dict):
        sub = claims.get("sub")
        if sub is not None:
            return f"user_id={sub}"
    return "desconhecido"


def render_sidebar_context(
    client: ApiClient, *, show_global_filters: bool = True
) -> None:
    with st.sidebar:
        st.subheader("Sessao")
        st.caption(f"API: `{get_api_base_url()}`")
        st.write(_current_user_label())

        permissions = sorted(get_permissions_from_claims())
        if permissions:
            with st.expander("Permissions (claims)", expanded=False):
                st.code("\n".join(permissions))

        if st.button("Sair", use_container_width=True):
            logout()
            st.switch_page("pages/1_Login.py")

        if not show_global_filters:
            return

        st.divider()
        st.subheader("Contexto Global")

        base_url = get_api_base_url()
        token = get_access_token()
        branch_rows = api_call(
            get_branches_cached,
            base_url,
            token,
            spinner_text="Carregando filiais...",
        )
        branches = branch_rows or []

        branch_options = [None] + [int(row["id"]) for row in branches if "id" in row]
        branch_labels = {
            None: "Todas",
            **{
                int(row["id"]): f"{row['id']} - {row.get('name', '')}"
                for row in branches
                if "id" in row
            },
        }
        current_branch = st.session_state.get("selected_branch_id")
        if current_branch not in branch_options:
            current_branch = None

        selected_branch = st.selectbox(
            "Branch",
            options=branch_options,
            format_func=lambda x: branch_labels.get(x, str(x)),
            index=branch_options.index(current_branch),
            key="sidebar_branch_select",
        )
        st.session_state["selected_branch_id"] = selected_branch

        location_rows = api_call(
            get_locations_cached,
            base_url,
            token,
            selected_branch,
            spinner_text="Carregando locations...",
        )
        locations = location_rows or []

        location_options = [None] + [int(row["id"]) for row in locations if "id" in row]
        location_labels = {
            None: "Todas",
            **{
                int(row["id"]): f"{row['id']} - {row.get('name', '')}"
                for row in locations
                if "id" in row
            },
        }
        current_location = st.session_state.get("selected_location_id")
        if current_location not in location_options:
            current_location = None

        selected_location = st.selectbox(
            "Location",
            options=location_options,
            format_func=lambda x: location_labels.get(x, str(x)),
            index=location_options.index(current_location),
            key="sidebar_location_select",
        )
        st.session_state["selected_location_id"] = selected_location


def show_page_header(
    title: str,
    *,
    permission_hint: str | None = None,
) -> None:
    st.title(title)
    if permission_hint and not can_show_menu(permission_hint):
        st.caption(
            f"Sem claim '{permission_hint}' no token. "
            "Backend continua como fonte de autorizacao."
        )


def show_meta(meta: dict[str, Any]) -> None:
    if not meta:
        return
    col1, col2, col3, col4, col5 = st.columns(5)
    col1.metric("Page", meta.get("page"))
    col2.metric("Page Size", meta.get("page_size"))
    col3.metric("Total", meta.get("total"))
    col4.metric("Next", meta.get("next"))
    col5.metric("Prev", meta.get("prev"))


def show_dataframe(
    rows: list[dict[str, Any]], *, use_container_width: bool = True
) -> None:
    if not rows:
        st.info("Nenhum registro encontrado.")
        return
    st.dataframe(pd.DataFrame(rows), use_container_width=use_container_width)


def parse_json_input(raw_text: str) -> dict[str, Any] | None:
    if not raw_text.strip():
        return {}
    try:
        parsed = json.loads(raw_text)
        if not isinstance(parsed, dict):
            st.error("JSON deve ser um objeto.")
            return None
        return parsed
    except json.JSONDecodeError as exc:
        st.error(f"JSON invalido: {exc}")
        return None
