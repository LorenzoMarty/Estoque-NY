from __future__ import annotations

from typing import Any

import streamlit as st
from lib.api_client import (
    ApiClient,
    ApiClientError,
    build_params,
    extract_items,
)


def _client(base_url: str, token: str | None) -> ApiClient:
    return ApiClient(base_url=base_url, token=token)


@st.cache_data(ttl=120)
def get_branches_cached(base_url: str, token: str | None) -> list[dict[str, Any]]:
    client = _client(base_url, token)
    data = client.get(
        "/branches",
        params=build_params(page=1, page_size=200, sort="id", order="asc"),
        expected_status=200,
    )
    return extract_items(data) if isinstance(data, dict) else data or []


@st.cache_data(ttl=120)
def get_locations_cached(
    base_url: str,
    token: str | None,
    branch_id: int | None = None,
) -> list[dict[str, Any]]:
    client = _client(base_url, token)
    params = build_params(
        page=1,
        page_size=200,
        sort="id",
        order="asc",
        branch_id=branch_id,
    )
    data = client.get("/locations", params=params, expected_status=200)
    return extract_items(data) if isinstance(data, dict) else data or []


@st.cache_data(ttl=120)
def get_products_cached(base_url: str, token: str | None) -> list[dict[str, Any]]:
    client = _client(base_url, token)
    data = client.get(
        "/products",
        params=build_params(page=1, page_size=200, sort="id", order="asc"),
        expected_status=200,
    )
    return extract_items(data) if isinstance(data, dict) else data or []


@st.cache_data(ttl=120)
def get_skus_cached(base_url: str, token: str | None) -> list[dict[str, Any]]:
    client = _client(base_url, token)
    data = client.get(
        "/skus",
        params=build_params(page=1, page_size=200, sort="id", order="asc"),
        expected_status=200,
    )
    return extract_items(data) if isinstance(data, dict) else data or []


@st.cache_data(ttl=120)
def get_categories_cached(base_url: str, token: str | None) -> list[dict[str, Any]]:
    client = _client(base_url, token)
    if not client.has_endpoint("GET", "/categories"):
        return []
    try:
        data = client.get(
            "/categories",
            params=build_params(page=1, page_size=200, sort="id", order="asc"),
            expected_status=200,
        )
    except ApiClientError:
        return []
    return extract_items(data)


@st.cache_data(ttl=120)
def get_brands_cached(base_url: str, token: str | None) -> list[dict[str, Any]]:
    client = _client(base_url, token)
    if not client.has_endpoint("GET", "/brands"):
        return []
    try:
        data = client.get(
            "/brands",
            params=build_params(page=1, page_size=200, sort="id", order="asc"),
            expected_status=200,
        )
    except ApiClientError:
        return []
    return extract_items(data)


def clear_reference_caches() -> None:
    get_branches_cached.clear()
    get_locations_cached.clear()
    get_products_cached.clear()
    get_skus_cached.clear()
    get_categories_cached.clear()
    get_brands_cached.clear()
