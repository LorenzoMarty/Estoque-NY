import pytest

from tests.helpers import register_and_login
from tests.test_public_catalog import _product, _publish, _sku

pytestmark = pytest.mark.asyncio

V1 = "/public/v1/catalog"


async def _publish_products(client, names):
    headers = await register_and_login(client)
    ids = []
    for name in names:
        product_id = await _product(client, headers, name)
        await _sku(client, headers, product_id, f"S-{name}", price="10.00")
        await _publish(client, headers, product_id)
        ids.append(product_id)
    return headers, ids


def _names(body):
    return [p["name"] for s in body["sectors"] for p in s["products"]]


async def test_v1_is_open_and_the_old_path_is_the_same_feed(client):
    await _publish_products(client, ["Alfa"])

    v1 = await client.get(V1)
    old = await client.get("/public/catalog")
    prefixed = await client.get(f"/api{V1}")

    assert v1.status_code == old.status_code == prefixed.status_code == 200
    assert v1.json() == old.json() == prefixed.json()
    assert v1.headers["etag"] == old.headers["etag"]


async def test_response_carries_cache_headers_and_an_etag(client):
    await _publish_products(client, ["Alfa"])

    response = await client.get(V1)

    assert response.headers["cache-control"] == (
        "public, max-age=60, stale-while-revalidate=300"
    )
    assert response.headers["etag"].startswith('"')


async def test_matching_if_none_match_gets_304_without_a_body(client):
    await _publish_products(client, ["Alfa"])
    first = await client.get(V1)
    etag = first.headers["etag"]

    second = await client.get(V1, headers={"If-None-Match": etag})

    assert second.status_code == 304
    assert second.content == b""
    assert second.headers["etag"] == etag
    assert "max-age=60" in second.headers["cache-control"]


@pytest.mark.parametrize("wrap", ["W/{}", "x, {}", "*"])
async def test_if_none_match_accepts_weak_tags_lists_and_star(client, wrap):
    await _publish_products(client, ["Alfa"])
    etag = (await client.get(V1)).headers["etag"]

    response = await client.get(V1, headers={"If-None-Match": wrap.format(etag)})

    assert response.status_code == 304


async def test_changed_content_changes_the_etag(client):
    headers, _ = await _publish_products(client, ["Alfa"])
    before = await client.get(V1)

    product_id = await _product(client, headers, "Beta")
    await _publish(client, headers, product_id)
    after = await client.get(V1, headers={"If-None-Match": before.headers["etag"]})

    assert after.status_code == 200
    assert after.headers["etag"] != before.headers["etag"]
    assert _names(after.json()) == ["Alfa", "Beta"]


async def test_stale_etag_gets_the_full_body(client):
    await _publish_products(client, ["Alfa"])

    response = await client.get(V1, headers={"If-None-Match": '"outdated"'})

    assert response.status_code == 200
    assert _names(response.json()) == ["Alfa"]


async def test_pagination_splits_products_and_reports_meta(client):
    await _publish_products(client, ["Alfa", "Beta", "Gama"])

    page1 = (await client.get(f"{V1}?page=1&page_size=2")).json()
    page2 = (await client.get(f"{V1}?page=2&page_size=2")).json()
    beyond = (await client.get(f"{V1}?page=3&page_size=2")).json()

    assert _names(page1) == ["Alfa", "Beta"]
    assert page1["meta"] == {
        "page": 1,
        "page_size": 2,
        "total_products": 3,
        "has_more": True,
    }
    assert _names(page2) == ["Gama"]
    assert page2["meta"]["has_more"] is False
    assert beyond["sectors"] == []
    assert beyond["meta"]["total_products"] == 3


async def test_default_returns_everything_in_one_page(client):
    await _publish_products(client, ["Alfa", "Beta", "Gama"])

    body = (await client.get(V1)).json()

    assert _names(body) == ["Alfa", "Beta", "Gama"]
    assert body["meta"]["has_more"] is False
    assert body["meta"]["page_size"] == 500


@pytest.mark.parametrize("query", ["page=0", "page_size=0", "page_size=501"])
async def test_invalid_paging_is_rejected(client, query):
    assert (await client.get(f"{V1}?{query}")).status_code == 400


async def test_each_page_has_its_own_etag(client):
    await _publish_products(client, ["Alfa", "Beta"])

    one = await client.get(f"{V1}?page=1&page_size=1")
    two = await client.get(f"{V1}?page=2&page_size=1")

    assert one.headers["etag"] != two.headers["etag"]
    cross = await client.get(
        f"{V1}?page=2&page_size=1", headers={"If-None-Match": one.headers["etag"]}
    )
    assert cross.status_code == 200
