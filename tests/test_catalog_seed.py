import json
from pathlib import Path

SEED = Path(__file__).parents[1] / "scripts" / "catalog_seed.json"


def test_catalog_seed_is_consistent():
    products = json.loads(SEED.read_text(encoding="utf-8"))["products"]

    assert len(products) == 20
    assert len({p["code"] for p in products}) == len(products)
    for product in products:
        assert product["price"] > 0
        assert product["name"] and product["brand"] and product["sector"]
        assert product["image_path"].startswith("assets/products/")
    assert any(p["featured"] for p in products)
