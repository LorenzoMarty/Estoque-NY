"""Smoke: publish a product in Estoque and see it in the public feed the site reads.

Env: SMOKE_API_URL, SMOKE_EMAIL, SMOKE_PASSWORD (required); SMOKE_SITE_ORIGIN (checks
the API allows the site via CORS) and SMOKE_WAIT_SECONDS (optional).
Exit code 1 on any failure, so a scheduled workflow run fails and notifies the
maintainer. The product is unpublished at the end; point it at staging only.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

API = os.environ["SMOKE_API_URL"].rstrip("/")


def call(method, path, body=None, token=None, headers=None):
    req = urllib.request.Request(
        API + path,
        data=None if body is None else json.dumps(body).encode(),
        method=method,
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read()
            return resp.status, dict(resp.headers), (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as exc:
        raise SystemExit(
            f"{method} {path} -> {exc.code}: {exc.read()[:200]!r}"
        ) from exc


def public_names():
    _, _, feed = call("GET", "/public/v1/catalog?page_size=200")
    return {p["name"] for s in feed["sectors"] for p in s["products"]}


def main() -> None:
    assert call("GET", "/health")[0] == 200
    site = os.environ.get("SMOKE_SITE_ORIGIN")
    if site:
        _, hdrs, _ = call("GET", "/public/v1/catalog", headers={"Origin": site})
        allowed = {k.lower(): v for k, v in hdrs.items()}.get(
            "access-control-allow-origin"
        )
        assert allowed in (site, "*"), f"CORS does not allow {site}: {allowed!r}"

    _, _, tok = call(
        "POST",
        "/auth/login",
        {"email": os.environ["SMOKE_EMAIL"], "password": os.environ["SMOKE_PASSWORD"]},
    )
    token = tok["access_token"]
    name = f"Smoke {int(time.time())}"
    _, _, product = call(
        "POST", "/catalog/products", {"name": name, "active": True}, token
    )
    pid = product["id"]
    try:
        call(
            "POST",
            "/catalog/skus",
            {
                "product_id": pid,
                "sku_code": f"SMOKE-{pid}-{int(time.time())}",
                "unit": "UN",
                "cost": "1.00",
                "price": "2.00",
            },
            token,
        )
        call("PATCH", f"/catalog/products/{pid}", {"published": True}, token)
        deadline = time.time() + int(os.environ.get("SMOKE_WAIT_SECONDS", "60"))
        while name not in public_names():
            if time.time() > deadline:
                raise SystemExit(f"{name!r} never reached /public/v1/catalog")
            time.sleep(3)
        print(f"ok: {name} visible in the public feed")
    finally:
        call("PATCH", f"/catalog/products/{pid}", {"published": False}, token)


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, SystemExit) as exc:
        sys.exit(f"SMOKE FAILED: {exc}")
