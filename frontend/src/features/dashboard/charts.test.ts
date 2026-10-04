import { describe, expect, it } from "vitest";
import type { Category, Product, Sku, StockBalance, StockMove } from "../../shared/types/stock";
import { CATEGORY_COLORS, flowByBucket, OTHER_COLOR, stockByCategory } from "./charts";

const range = { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-07T23:59:59Z") };

function move(partial: Partial<StockMove>): StockMove {
  return {
    id: 1,
    branch_id: 1,
    sku_id: 1,
    location_id: 1,
    transfer_id: null,
    inventory_count_id: null,
    created_by: null,
    move_type: "RECEIPT",
    qty: 1,
    occurred_at: "2026-10-01T10:00:00Z",
    created_at: "2026-10-01T10:00:00Z",
    reason: null,
    reference_id: null,
    balance_after: 0,
    ...partial,
  };
}

describe("flowByBucket", () => {
  it("sums receipts and issues per day and ignores transfers, adjustments and out-of-range moves", () => {
    const points = flowByBucket(
      [
        move({ qty: 10 }),
        move({ qty: 4, occurred_at: "2026-10-01T18:00:00Z" }),
        move({ move_type: "ISSUE", qty: -3, occurred_at: "2026-10-03T09:00:00Z" }),
        move({ move_type: "TRANSFER_SHIP", qty: -50 }),
        move({ move_type: "ADJUSTMENT", qty: 99 }),
        move({ qty: 500, occurred_at: "2026-09-01T10:00:00Z" }),
      ],
      range,
      "all"
    );
    expect(points).toHaveLength(7);
    expect(points[0]).toEqual({ label: "01/10", entradas: 14, saidas: 0 });
    expect(points[2]).toEqual({ label: "03/10", entradas: 0, saidas: 3 });
  });

  it("filters by branch", () => {
    const points = flowByBucket([move({ branch_id: 1, qty: 5 }), move({ branch_id: 2, qty: 7 })], range, "2");
    expect(points.reduce((sum, point) => sum + point.entradas, 0)).toBe(7);
  });

  it("groups long periods into at most ten buckets", () => {
    const longRange = { from: new Date("2026-07-10T00:00:00Z"), to: new Date("2026-10-07T23:59:59Z") };
    const points = flowByBucket([move({ occurred_at: "2026-10-07T10:00:00Z", qty: 2 })], longRange, "all");
    expect(points.length).toBeLessThanOrEqual(10);
    expect(points[points.length - 1].entradas).toBe(2);
  });
});

describe("stockByCategory", () => {
  const categories: Category[] = ["Bebidas", "Chocolates", "Eletronicos", "Perfumes", "Relogios", "Utilidades"].map(
    (name, index) => ({ id: index + 1, name, created_at: "" })
  );
  const products = categories.map((category) => ({ id: category.id * 10, category_id: category.id }) as Product);
  const skus = products.map((product) => ({ id: product.id + 1, product_id: product.id }) as Sku);
  const balance = (skuId: number, onHand: number, branchId = 1) =>
    ({ id: skuId, branch_id: branchId, sku_id: skuId, location_id: 1, on_hand: onHand }) as StockBalance;

  it("keeps stable colors by alphabetical order and folds the rest into Outros", () => {
    const slices = stockByCategory(
      skus.map((sku, index) => balance(sku.id, (index + 1) * 10)),
      skus,
      products,
      categories,
      "all"
    );
    const bebidas = slices.find((slice) => slice.name === "Bebidas");
    expect(bebidas?.color).toBe(CATEGORY_COLORS[0]);
    expect(slices.find((slice) => slice.name === "Outros")).toEqual({ name: "Outros", value: 60, color: OTHER_COLOR });
    expect(slices.map((slice) => slice.value)).toEqual([50, 40, 30, 20, 10, 60]);
  });

  it("does not repaint categories when the branch filter removes others", () => {
    const all = stockByCategory([balance(11, 5), balance(21, 5, 2)], skus, products, categories, "all");
    const onlyBranch2 = stockByCategory([balance(11, 5), balance(21, 5, 2)], skus, products, categories, "2");
    expect(onlyBranch2).toEqual([all.find((slice) => slice.name === "Chocolates")]);
  });

  it("puts products without a category in Outros and ignores empty or negative balances", () => {
    const orphanProducts = [{ id: 99, category_id: null } as Product];
    const orphanSkus = [{ id: 100, product_id: 99 } as Sku];
    const slices = stockByCategory([balance(100, 8), balance(101, -4)], orphanSkus, orphanProducts, categories, "all");
    expect(slices).toEqual([{ name: "Outros", value: 8, color: OTHER_COLOR }]);
  });
});
