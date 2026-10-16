#!/usr/bin/env python
"""Mixed-workload load test: 5 branches hitting the stock API at once.

Runs against a live API (start it first), registers or logs in an admin, creates
branches/SKUs, then runs `--workers` concurrent clients for `--seconds`, each
looping over receipts, issues, balance reads and move listings. Prints the
status mix and p50/p95/p99 latency per operation, and checks that no balance
went negative.

    uv run python scripts/load_test.py --base-url http://127.0.0.1:8000 \
        --email load@example.com --password 'Load-Test-Pass-1'
"""

import argparse
import asyncio
import random
import statistics
import time
from collections import Counter, defaultdict

import httpx

BRANCHES = 5
SKUS = 20


def _percentile(values: list[float], pct: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * pct / 100))]


async def _login(client: httpx.AsyncClient, email: str, password: str) -> dict:
    await client.post(
        "/auth/register",
        json={"name": "Load test", "email": email, "password": password},
    )  # 409 when it already exists: fine
    response = await client.post(
        "/auth/login", json={"email": email, "password": password}
    )
    response.raise_for_status()
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _post(client, headers, path, body):
    response = await client.post(path, json=body, headers=headers)
    response.raise_for_status()
    return response.json()


async def _setup(client, headers, tag: str):
    branches = []
    for index in range(BRANCHES):
        branch = await _post(
            client, headers, "/branches", {"name": f"Load {tag} {index}"}
        )
        location = await _post(
            client,
            headers,
            "/locations",
            {"branch_id": branch["id"], "name": "Deposito", "type": "STOCK"},
        )
        branches.append((branch["id"], location["id"]))
    product = await _post(client, headers, "/catalog/products", {"name": f"Load {tag}"})
    skus = [
        (
            await _post(
                client,
                headers,
                "/catalog/skus",
                {
                    "product_id": product["id"],
                    "sku_code": f"LOAD-{tag}-{i}",
                    "unit": "UN",
                },
            )
        )["id"]
        for i in range(SKUS)
    ]
    for branch_id, location_id in branches:  # opening stock
        for sku_id in skus:
            await _post(
                client,
                headers,
                "/stock/receipts",
                {
                    "branch_id": branch_id,
                    "location_id": location_id,
                    "sku_id": sku_id,
                    "qty": 500,
                },
            )
    return branches, skus


async def _worker(client, headers, branches, skus, deadline, samples, statuses):
    while time.monotonic() < deadline:
        branch_id, location_id = random.choice(branches)
        sku_id = random.choice(skus)
        roll = random.random()
        if roll < 0.30:
            op, method, path, body = (
                "receipt",
                "POST",
                "/stock/receipts",
                {"qty": random.randint(1, 5)},
            )
        elif roll < 0.60:
            op, method, path, body = (
                "issue",
                "POST",
                "/stock/issues",
                {"qty": random.randint(1, 3)},
            )
        elif roll < 0.85:
            op, method, path, body = (
                "balances",
                "GET",
                f"/stock/balances?branch_id={branch_id}",
                None,
            )
        else:
            op, method, path, body = (
                "moves",
                "GET",
                f"/stock/moves?branch_id={branch_id}&page_size=20",
                None,
            )
        if body is not None:
            body = {
                "branch_id": branch_id,
                "location_id": location_id,
                "sku_id": sku_id,
                **body,
            }
        started = time.perf_counter()
        response = await client.request(method, path, json=body, headers=headers)
        samples[op].append((time.perf_counter() - started) * 1000)
        statuses[op][response.status_code] += 1


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--email", default="load@example.com")
    parser.add_argument("--password", required=True)
    parser.add_argument("--workers", type=int, default=20)
    parser.add_argument("--seconds", type=int, default=30)
    args = parser.parse_args()

    limits = httpx.Limits(max_connections=args.workers * 2)
    async with httpx.AsyncClient(
        base_url=args.base_url, timeout=30, limits=limits
    ) as client:
        headers = await _login(client, args.email, args.password)
        tag = str(int(time.time()))
        print(f"setting up {BRANCHES} branches x {SKUS} SKUs...")
        branches, skus = await _setup(client, headers, tag)

        samples: dict[str, list[float]] = defaultdict(list)
        statuses: dict[str, Counter] = defaultdict(Counter)
        deadline = time.monotonic() + args.seconds
        started = time.monotonic()
        await asyncio.gather(
            *[
                _worker(client, headers, branches, skus, deadline, samples, statuses)
                for _ in range(args.workers)
            ]
        )
        elapsed = time.monotonic() - started

        balances = (
            await client.get("/stock/balances?page_size=200", headers=headers)
        ).json()
        negative = [b for b in balances["items"] if b["on_hand"] < 0]

    total = sum(len(v) for v in samples.values())
    print(
        f"\n{total} requests in {elapsed:.1f}s ({total / elapsed:.0f} req/s), "
        f"{args.workers} workers"
    )
    print(f"{'op':10} {'count':>7} {'p50 ms':>8} {'p95 ms':>8} {'p99 ms':>8}  statuses")
    for op, values in sorted(samples.items()):
        print(
            f"{op:10} {len(values):>7} {statistics.median(values):>8.0f} "
            f"{_percentile(values, 95):>8.0f} {_percentile(values, 99):>8.0f}  "
            f"{dict(statuses[op])}"
        )
    server_errors = sum(
        n for c in statuses.values() for code, n in c.items() if code >= 500
    )
    print(f"\n5xx responses: {server_errors}; negative balances: {len(negative)}")
    if server_errors or negative:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
