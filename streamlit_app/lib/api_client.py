from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

import httpx
from tenacity import (
    Retrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

RETRYABLE_STATUS_CODES = {502, 503, 504}


class ApiClientError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        payload: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.payload = payload


class UnauthorizedError(ApiClientError):
    pass


@dataclass
class _RetryableResponseError(Exception):
    response: httpx.Response


def build_params(
    *,
    page: int | None = None,
    page_size: int | None = None,
    sort: str | None = None,
    order: str | None = None,
    q: str | None = None,
    **filters: Any,
) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if page is not None:
        params["page"] = page
    if page_size is not None:
        params["page_size"] = page_size
    if sort:
        params["sort"] = sort
    if order:
        params["order"] = order
    if q:
        params["q"] = q
    for key, value in filters.items():
        if value is None:
            continue
        params[key] = value
    return params


def extract_items(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        items = data.get("items")
        if isinstance(items, list):
            return [row for row in items if isinstance(row, dict)]
    return []


def extract_meta(data: Any) -> dict[str, Any]:
    if isinstance(data, dict):
        meta = data.get("meta")
        if isinstance(meta, dict):
            return meta
    return {}


class ApiClient:
    def __init__(
        self,
        *,
        base_url: str,
        token: str | None = None,
        timeout_seconds: float = 30.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout_seconds = timeout_seconds
        self._openapi: dict[str, Any] | None = None
        self._available_endpoints: set[tuple[str, str]] | None = None

    def with_token(self, token: str | None) -> ApiClient:
        self.token = token
        return self

    def _make_headers(
        self,
        headers: dict[str, str] | None = None,
        *,
        use_auth: bool = True,
    ) -> dict[str, str]:
        output: dict[str, str] = {"Accept": "application/json"}
        if headers:
            output.update(headers)
        if use_auth and self.token:
            output["Authorization"] = f"Bearer {self.token}"
        return output

    def _decode_response_body(self, response: httpx.Response) -> Any:
        if response.status_code == 204:
            return None
        content_type = response.headers.get("content-type", "")
        if "application/json" in content_type:
            return response.json()
        text = response.text
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text

    def _raise_for_response(self, response: httpx.Response) -> None:
        payload = self._decode_response_body(response)
        detail = "request failed"
        if isinstance(payload, dict):
            error_obj = payload.get("error")
            if isinstance(error_obj, dict):
                message = error_obj.get("message")
                if isinstance(message, str) and message:
                    detail = message
                else:
                    detail = str(error_obj)
            raw_detail = payload.get("detail")
            if isinstance(raw_detail, str):
                detail = raw_detail
            elif raw_detail is not None:
                detail = str(raw_detail)
        elif isinstance(payload, str) and payload:
            detail = payload

        error_cls = UnauthorizedError if response.status_code == 401 else ApiClientError
        raise error_cls(
            detail,
            status_code=response.status_code,
            payload=payload,
        )

    def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: Any | None = None,
        headers: dict[str, str] | None = None,
        expected_status: int | set[int] | None = None,
        use_auth: bool = True,
    ) -> Any:
        method = method.upper()
        url = f"{self.base_url}{path}"
        request_headers = self._make_headers(headers, use_auth=use_auth)

        response: httpx.Response | None = None
        retrying = Retrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
            retry=retry_if_exception_type(
                (httpx.TransportError, _RetryableResponseError)
            ),
            reraise=True,
        )

        try:
            for attempt in retrying:
                with attempt:
                    with httpx.Client(timeout=self.timeout_seconds) as client:
                        response = client.request(
                            method=method,
                            url=url,
                            params=params,
                            json=json_body,
                            headers=request_headers,
                        )
                    if response.status_code in RETRYABLE_STATUS_CODES:
                        raise _RetryableResponseError(response)
        except _RetryableResponseError as exc:
            response = exc.response
        except httpx.TransportError as exc:
            raise ApiClientError(f"network error: {exc}") from exc

        if response is None:
            raise ApiClientError("empty response")

        allowed_statuses: set[int] | None = None
        if expected_status is not None:
            if isinstance(expected_status, int):
                allowed_statuses = {expected_status}
            else:
                allowed_statuses = expected_status

        if allowed_statuses is not None:
            if response.status_code not in allowed_statuses:
                self._raise_for_response(response)
        elif response.status_code >= 400:
            self._raise_for_response(response)

        return self._decode_response_body(response)

    def get(
        self,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        expected_status: int | set[int] | None = None,
        use_auth: bool = True,
    ) -> Any:
        return self.request(
            "GET",
            path,
            params=params,
            headers=headers,
            expected_status=expected_status,
            use_auth=use_auth,
        )

    def post(
        self,
        path: str,
        *,
        json_body: Any | None = None,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        expected_status: int | set[int] | None = None,
    ) -> Any:
        return self.request(
            "POST",
            path,
            params=params,
            json_body=json_body,
            headers=headers,
            expected_status=expected_status,
        )

    def patch(
        self,
        path: str,
        *,
        json_body: Any | None = None,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        expected_status: int | set[int] | None = None,
    ) -> Any:
        return self.request(
            "PATCH",
            path,
            params=params,
            json_body=json_body,
            headers=headers,
            expected_status=expected_status,
        )

    def delete(
        self,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        expected_status: int | set[int] | None = None,
    ) -> Any:
        return self.request(
            "DELETE",
            path,
            params=params,
            headers=headers,
            expected_status=expected_status,
        )

    def fetch_openapi(self) -> dict[str, Any] | None:
        if self._openapi is not None:
            return self._openapi

        try:
            spec = self.get("/openapi.json", use_auth=False)
        except ApiClientError:
            self._openapi = {}
            self._available_endpoints = set()
            return None

        if not isinstance(spec, dict):
            self._openapi = {}
            self._available_endpoints = set()
            return None

        self._openapi = spec
        paths = spec.get("paths", {})
        available: set[tuple[str, str]] = set()
        if isinstance(paths, dict):
            for path, methods in paths.items():
                if not isinstance(path, str) or not isinstance(methods, dict):
                    continue
                for method in methods:
                    if isinstance(method, str):
                        available.add((method.upper(), path))
        self._available_endpoints = available
        return spec

    def has_endpoint(self, method: str, path: str) -> bool:
        if self._available_endpoints is None:
            self.fetch_openapi()

        # OpenAPI unavailable: do not block the UI.
        if not self._available_endpoints:
            return True

        method = method.upper()
        if (method, path) in self._available_endpoints:
            return True

        normalized = path.rstrip("/")
        if normalized and (method, normalized) in self._available_endpoints:
            return True

        for available_method, available_path in self._available_endpoints:
            if available_method != method:
                continue
            pattern = "^" + re.sub(r"\{[^/]+\}", r"[^/]+", available_path) + "$"
            if re.match(pattern, path):
                return True
        return False
