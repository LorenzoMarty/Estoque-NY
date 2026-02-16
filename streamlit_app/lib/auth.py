from __future__ import annotations

import base64
import json
import os
from typing import Any

import streamlit as st
from lib.api_client import ApiClient, ApiClientError
from lib.i18n import t

try:
    import jwt  # type: ignore[import-not-found]
except Exception:  # pragma: no cover
    jwt = None

SESSION_DEFAULTS: dict[str, Any] = {
    "api_base_url": "",
    "access_token": None,
    "refresh_token": None,
    "user_claims": {},
    "current_user": None,
    "selected_branch_id": None,
    "selected_location_id": None,
}


def init_session_state() -> None:
    env_api_base = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")
    if "api_base_url" not in st.session_state:
        st.session_state["api_base_url"] = env_api_base
    for key, default_value in SESSION_DEFAULTS.items():
        st.session_state.setdefault(key, default_value)
    if not st.session_state.get("api_base_url"):
        st.session_state["api_base_url"] = env_api_base


def get_api_base_url() -> str:
    return str(st.session_state.get("api_base_url", "")).rstrip("/")


def set_api_base_url(base_url: str) -> None:
    st.session_state["api_base_url"] = base_url.rstrip("/")


def get_access_token() -> str | None:
    token = st.session_state.get("access_token")
    return str(token) if token else None


def get_api_client() -> ApiClient:
    return ApiClient(base_url=get_api_base_url(), token=get_access_token())


def decode_token_claims(token: str) -> dict[str, Any]:
    if jwt is not None:
        try:
            claims = jwt.decode(
                token,
                options={"verify_signature": False, "verify_exp": False},
                algorithms=["HS256", "RS256", "ES256"],
            )
            if isinstance(claims, dict):
                return claims
        except Exception:
            pass

    # Fallback when PyJWT is not available.
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return {}
        payload = parts[1]
        payload += "=" * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload.encode("utf-8")).decode("utf-8")
        parsed = json.loads(decoded)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        return {}
    return {}


def is_authenticated() -> bool:
    return bool(st.session_state.get("access_token"))


def login(email: str, password: str) -> tuple[bool, str]:
    base_url = get_api_base_url()
    if not base_url:
        return False, "URL da API nao configurada."

    client = ApiClient(base_url=base_url)
    try:
        response = client.post(
            "/auth/login",
            json_body={"email": email, "password": password},
            expected_status=200,
        )
    except ApiClientError as exc:
        return False, exc.message

    if not isinstance(response, dict) or "access_token" not in response:
        return False, "Resposta de login invalida."

    access_token = str(response.get("access_token"))
    refresh_token = response.get("refresh_token")

    st.session_state["access_token"] = access_token
    st.session_state["refresh_token"] = str(refresh_token) if refresh_token else None
    st.session_state["user_claims"] = decode_token_claims(access_token)

    me_payload: dict[str, Any] | None = None
    authed_client = ApiClient(base_url=base_url, token=access_token)
    if authed_client.has_endpoint("GET", "/auth/me"):
        try:
            me = authed_client.get("/auth/me", expected_status=200)
            if isinstance(me, dict):
                me_payload = me
        except ApiClientError:
            me_payload = None
    st.session_state["current_user"] = me_payload
    return True, "Acesso realizado com sucesso."


def logout() -> None:
    for key in (
        "access_token",
        "refresh_token",
        "user_claims",
        "current_user",
        "selected_branch_id",
        "selected_location_id",
    ):
        st.session_state[key] = SESSION_DEFAULTS.get(key)


def get_permissions_from_claims() -> set[str]:
    claims = st.session_state.get("user_claims") or {}
    if not isinstance(claims, dict):
        return set()

    permissions: set[str] = set()
    raw_permissions = claims.get("permissions")
    if isinstance(raw_permissions, list):
        permissions.update(str(item) for item in raw_permissions)

    raw_perms = claims.get("perms")
    if isinstance(raw_perms, list):
        permissions.update(str(item) for item in raw_perms)

    scope = claims.get("scope")
    if isinstance(scope, str):
        permissions.update(scope.split())
    return permissions


def can_show_menu(permission_key: str | None) -> bool:
    if permission_key is None:
        return True
    permissions = get_permissions_from_claims()
    if not permissions:
        return True
    return permission_key in permissions


def require_auth() -> None:
    if is_authenticated():
        return
    st.warning(t("token_invalid"))
    try:
        st.switch_page("pages/1_Login.py")
    except Exception:
        st.stop()
    st.stop()
