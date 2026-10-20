#!/usr/bin/env python
"""Load the products that used to be hardcoded in Catalogo-NY into the Estoque API.

Idempotent: a product is identified by its SKU code (NY-<code>), so re-running only
fills what is missing and re-applies the storefront fields. Uses only the stdlib.

  python scripts/seed_catalog_from_site.py --email admin@x.com --password ...
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

SEED_FILE = Path(__file__).with_name("catalog_seed.json")
BRANCH_NAME = "Matriz"
LOCATION_NAME = "Matriz - Deposito"


class Api:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.headers = {"Content-Type": "application/json"}

    def call(self, method: str, path: str, body: dict | None = None, **headers):
        request = urllib.request.Request(
            self.base_url + path,
            method=method,
            data=None if body is None else json.dumps(body).encode(),
            headers={**self.headers, **headers},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")
            raise SystemExit(f"{method} {path} -> {error.code}: {detail}") from error

    def all_items(self, path: str) -> list[dict]:
        items: list[dict] = []
        page = 1
        while True:
            data = self.call("GET", f"{path}?page={page}&page_size=200")
            items.extend(data["items"])
            if len(items) >= (data["meta"].get("total") or 0) or not data["items"]:
                return items
            page += 1


def _by_name(items: list[dict]) -> dict[str, dict]:
    return {item["name"]: item for item in items}


def _ensure(api: Api, path: str, name: str, known: dict[str, dict], **extra) -> int:
    if name not in known:
        known[name] = api.call("POST", path, {"name": name, **extra})
    return known[name]["id"]


def _ensure_stock_place(api: Api) -> tuple[int, int]:
    branches = _by_name(api.all_items("/branches"))
    branch_id = _ensure(api, "/branches", BRANCH_NAME, branches)
    locations = [
        loc for loc in api.all_items("/locations") if loc["branch_id"] == branch_id
    ]
    location = next((loc for loc in locations if loc["type"] == "STOCK"), None)
    if location is None:
        location = api.call(
            "POST",
            "/locations",
            {"branch_id": branch_id, "name": LOCATION_NAME, "type": "STOCK"},
        )
    return branch_id, location["id"]


def seed(api: Api, products: list[dict], site_url: str, stock: int) -> None:
    categories = _by_name(api.all_items("/catalog/categories"))
    brands = _by_name(api.all_items("/catalog/brands"))
    skus = {sku["sku_code"]: sku for sku in api.all_items("/catalog/skus")}
    branch_id, location_id = _ensure_stock_place(api)

    for item in products:
        code = f"NY-{item['code'].upper()}"
        image = item["image_path"]
        fields = {
            "published": True,
            "featured": item["featured"],
            "image_url": f"{site_url.rstrip('/')}/src/{image}" if image else None,
        }
        if code in skus:
            api.call("PATCH", f"/catalog/products/{skus[code]['product_id']}", fields)
            print(f"= {code} already exists, storefront fields refreshed")
            continue

        product = api.call(
            "POST",
            "/catalog/products",
            {
                "name": item["name"],
                "description": item["description"],
                "category_id": _ensure(
                    api, "/catalog/categories", item["sector"], categories
                ),
                "brand_id": _ensure(api, "/catalog/brands", item["brand"], brands),
                **fields,
            },
        )
        sku = api.call(
            "POST",
            "/catalog/skus",
            {
                "product_id": product["id"],
                "sku_code": code,
                "name": item["name"],
                "price": str(item["price"]),
            },
        )
        api.call(
            "POST",
            "/stock/receipts",
            {
                "branch_id": branch_id,
                "location_id": location_id,
                "sku_id": sku["id"],
                "qty": stock,
                "reason": "seed from Catalogo-NY",
            },
            **{"Idempotency-Key": str(uuid.uuid4())},
        )
        print(f"+ {code} {item['name']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--api", default="http://127.0.0.1:8010", help="Estoque API.")
    parser.add_argument(
        "--site-url",
        default="http://127.0.0.1:5173",
        help="Site origin serving the images.",
    )
    parser.add_argument("--email", default=os.environ.get("SEED_EMAIL"))
    parser.add_argument("--password", default=os.environ.get("SEED_PASSWORD"))
    parser.add_argument(
        "--stock", type=int, default=10, help="Units received per product."
    )
    args = parser.parse_args()
    if not args.email or not args.password:
        sys.exit("Provide --email/--password or SEED_EMAIL/SEED_PASSWORD.")

    api = Api(args.api)
    token = api.call(
        "POST", "/auth/login", {"email": args.email, "password": args.password}
    )
    api.headers["Authorization"] = f"Bearer {token['access_token']}"
    seed(
        api,
        json.loads(SEED_FILE.read_text(encoding="utf-8"))["products"],
        args.site_url,
        args.stock,
    )


if __name__ == "__main__":
    main()
