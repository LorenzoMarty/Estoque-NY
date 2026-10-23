import { describe, expect, it } from "vitest";
import { REORDER_POINT, stockStatus, summarizeStock } from "./stock";

describe("stockStatus", () => {
  it("classifies zero and negative balances as out of stock", () => {
    expect(stockStatus(0)).toBe("out_of_stock");
    expect(stockStatus(-3)).toBe("out_of_stock");
  });

  it("treats the reorder point itself as low stock", () => {
    expect(stockStatus(1)).toBe("low_stock");
    expect(stockStatus(REORDER_POINT)).toBe("low_stock");
    expect(stockStatus(REORDER_POINT + 1)).toBe("in_stock");
  });

  it("accepts a custom reorder point", () => {
    expect(stockStatus(5, 5)).toBe("low_stock");
    expect(stockStatus(6, 5)).toBe("in_stock");
  });
});

describe("summarizeStock", () => {
  it("counts items per status", () => {
    expect(summarizeStock([0, 3, 12, 13, 400])).toEqual({
      total: 5,
      in_stock: 2,
      low_stock: 2,
      out_of_stock: 1,
    });
  });

  it("handles an empty list", () => {
    expect(summarizeStock([])).toEqual({ total: 0, in_stock: 0, low_stock: 0, out_of_stock: 0 });
  });
});
