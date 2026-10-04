import { describe, expect, it } from "vitest";
import type { Sku, StockBalance } from "../../shared/types/stock";
import { onHandByProduct } from "./stock";

const skus = [
  { id: 1, product_id: 10 },
  { id: 2, product_id: 10 },
  { id: 3, product_id: 20 },
] as Sku[];

const balance = (sku_id: number, on_hand: number) => ({ sku_id, on_hand }) as StockBalance;

describe("onHandByProduct", () => {
  it("sums balances of every SKU of the same product", () => {
    const totals = onHandByProduct([balance(1, 5), balance(2, 7), balance(1, 3), balance(3, 4)], skus);
    expect(totals.get(10)).toBe(15);
    expect(totals.get(20)).toBe(4);
  });

  it("ignores balances of unknown SKUs", () => {
    expect(onHandByProduct([balance(99, 50)], skus).size).toBe(0);
  });
});
