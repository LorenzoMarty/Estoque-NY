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
from lib.i18n import t

STATUS_COLORS: dict[str, str] = {
    "DRAFT": "#64748b",
    "SHIPPED": "#b45309",
    "RECEIVED": "#15803d",
    "CANCELLED": "#b91c1c",
    "OPEN": "#0369a1",
    "CLOSED": "#374151",
    "POSTED": "#166534",
    "ACTIVE": "#166534",
    "INACTIVE": "#9f1239",
}


MOVE_TYPE_LABELS: dict[str, str] = {
    "RECEIPT": t("stock_entry"),
    "ISSUE": t("stock_exit"),
    "ADJUSTMENT": t("stock_adjustment"),
    "TRANSFER_SHIP": "Envio de transferencia",
    "TRANSFER_RECEIVE": "Recebimento de transferencia",
}


def apply_base_styles() -> None:
    st.markdown(
        """
        <style>
        .main .block-container {padding-top: 1.8rem; padding-bottom: 2rem; max-width: 1200px;}
        div[data-testid="stMetricValue"] {font-size: 1.55rem;}
        div[data-testid="stMetricLabel"] {font-size: 0.95rem;}
        .erp-card {background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px;}
        .erp-card-label {font-size: 0.9rem; color: #475569; margin-bottom: 6px;}
        .erp-card-value {font-size: 1.45rem; font-weight: 700; color: #0f172a;}
        .erp-section {font-size: 1.1rem; font-weight: 600; margin-top: 0.25rem;}
        .erp-status {display: inline-block; color: #ffffff; padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.82rem; font-weight: 600;}
        .erp-header h1 {font-size: 1.95rem; margin-bottom: 0.25rem;}
        .erp-header p {margin-top: 0; color: #475569; font-size: 1rem;}
        </style>
        """,
        unsafe_allow_html=True,
    )


def show_api_error(exc: ApiClientError) -> None:
    if exc.status_code:
        st.error(f"{exc.status_code} - {exc.message}")
    else:
        st.error(exc.message or t("api_error"))


def show_toast(message: str) -> None:
    if hasattr(st, "toast"):
        st.toast(message)


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
        st.warning(t("token_invalid"))
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
    st.warning(f"{t('endpoint_unavailable')}: {method.upper()} {path}")
    return True


def page_header(
    titulo: str, descricao: str | None = None, icon: str | None = None
) -> None:
    icon_text = f"{icon} " if icon else ""
    description = descricao or ""
    st.markdown(
        (
            "<div class='erp-header'>"
            f"<h1>{icon_text}{titulo}</h1>"
            f"<p>{description}</p>"
            "</div>"
        ),
        unsafe_allow_html=True,
    )


def section(title: str) -> None:
    st.markdown(f"<div class='erp-section'>{title}</div>", unsafe_allow_html=True)


def info_card(label: str, value: Any, icon: str | None = None) -> None:
    icon_text = f"{icon} " if icon else ""
    st.markdown(
        (
            "<div class='erp-card'>"
            f"<div class='erp-card-label'>{label}</div>"
            f"<div class='erp-card-value'>{icon_text}{value}</div>"
            "</div>"
        ),
        unsafe_allow_html=True,
    )


def confirm_dialog(texto: str, *, key: str | None = None) -> bool:
    checkbox_key = key or f"confirm_{abs(hash(texto))}"
    return st.checkbox(f"{texto} {t('confirm_checkbox')}", key=checkbox_key)


def empty_state(texto: str) -> None:
    st.info(texto)


def status_badge(status: Any) -> None:
    status_text = "-" if status is None else str(status)
    color = STATUS_COLORS.get(status_text.upper(), "#334155")
    label = humanize_status(status_text)
    st.markdown(
        f"<span class='erp-status' style='background:{color}'>{label}</span>",
        unsafe_allow_html=True,
    )


def form_actions(
    *,
    submit_label: str | None = None,
    cancel_label: str | None = None,
    submit_key: str | None = None,
    cancel_key: str | None = None,
    submit_type: str = "primary",
) -> tuple[bool, bool]:
    left, right = st.columns(2)
    submit = left.form_submit_button(
        submit_label or t("confirm"),
        type=submit_type,
        use_container_width=True,
        key=submit_key,
    )
    cancel = right.form_submit_button(
        cancel_label or t("cancel"),
        use_container_width=True,
        key=cancel_key,
    )
    return submit, cancel


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
        st.subheader(t("session"))
        st.caption(f"API: `{get_api_base_url()}`")
        st.write(_current_user_label())

        permissions = sorted(get_permissions_from_claims())
        if permissions:
            with st.expander("Permissoes do token", expanded=False):
                st.code("\n".join(permissions))

        if st.button(t("logout"), use_container_width=True):
            logout()
            st.switch_page("pages/1_Login.py")

        if not show_global_filters:
            return

        st.divider()
        st.subheader(t("global_context"))

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
            None: t("all"),
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
            t("branch"),
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
            spinner_text="Carregando locais...",
        )
        locations = location_rows or []

        location_options = [None] + [int(row["id"]) for row in locations if "id" in row]
        location_labels = {
            None: t("all"),
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
            t("location"),
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
    description: str | None = None,
    icon: str | None = None,
) -> None:
    page_header(title, descricao=description, icon=icon)
    if permission_hint and not can_show_menu(permission_hint):
        st.caption(
            f"Seu token nao inclui a permissao '{permission_hint}'. "
            "A autorizacao final sempre e aplicada no backend."
        )


def show_meta(meta: dict[str, Any]) -> None:
    if not meta:
        return
    col1, col2, col3, col4, col5 = st.columns(5)
    col1.metric(t("page"), meta.get("page"))
    col2.metric(t("page_size"), meta.get("page_size"))
    col3.metric(t("total"), meta.get("total"))
    col4.metric(t("next"), meta.get("next"))
    col5.metric(t("prev"), meta.get("prev"))


def show_dataframe(
    rows: list[dict[str, Any]],
    *,
    use_container_width: bool = True,
    empty_message: str | None = None,
) -> None:
    if not rows:
        empty_state(empty_message or t("no_data"))
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


def humanize_status(value: Any) -> str:
    if value is None:
        return "-"
    mapping = {
        "DRAFT": "Rascunho",
        "SHIPPED": "Enviada",
        "RECEIVED": "Recebida",
        "CANCELLED": "Cancelada",
        "OPEN": "Aberta",
        "CLOSED": "Fechada",
        "POSTED": "Confirmada",
        "ACTIVE": "Ativo",
        "INACTIVE": "Inativo",
    }
    text = str(value).upper()
    return mapping.get(text, str(value))


def humanize_move_type(value: Any) -> str:
    if value is None:
        return "-"
    return MOVE_TYPE_LABELS.get(str(value).upper(), str(value))
