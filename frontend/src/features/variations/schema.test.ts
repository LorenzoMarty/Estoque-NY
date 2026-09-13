import { describe, expect, it } from "vitest";
import { skuCreateSchema } from "./schema";

describe("skuCreateSchema", () => {
  it("accepts a valid new SKU", () => {
    const result = skuCreateSchema.safeParse({
      product_id: 1,
      sku_code: "VAR-0001",
      unit: "UN",
      cost: 1.5,
      price: 3,
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative price", () => {
    const result = skuCreateSchema.safeParse({
      product_id: 1,
      sku_code: "VAR-0001",
      unit: "UN",
      cost: 1,
      price: -1,
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it("requires a product", () => {
    const result = skuCreateSchema.safeParse({ sku_code: "VAR-0001", unit: "UN", cost: 1, price: 1, active: true });
    expect(result.success).toBe(false);
  });
});
