import { describe, expect, it } from "vitest";
import { skuCreateSchema } from "./schema";

const base = { product_id: 1, sku_code: "VAR-0001", unit: "UN", cost: 1, price: 2, active: true };

describe("skuCreateSchema", () => {
  it("accepts a valid new SKU", () => {
    const result = skuCreateSchema.safeParse({
      product_id: 1,
      sku_code: "VAR-0001",
      unit: "UN",
      cost: 1.5,
      price: 3,
      restricted: false,
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
      restricted: false,
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it("requires a product", () => {
    const result = skuCreateSchema.safeParse({ sku_code: "VAR-0001", unit: "UN", cost: 1, price: 1, active: true });
    expect(result.success).toBe(false);
  });

  it("accepts a valid NCM and origin", () => {
    const result = skuCreateSchema.safeParse({ ...base, ncm: "22083020", origin: "FOREIGN", restricted: false });
    expect(result.success).toBe(true);
  });

  it("accepts a SKU without fiscal data", () => {
    expect(skuCreateSchema.safeParse({ ...base, ncm: null, origin: null, restricted: false }).success).toBe(true);
  });

  it.each(["2208302", "220830201", "2208302a", "22.08.30"])("rejects NCM %s", (ncm) => {
    expect(skuCreateSchema.safeParse({ ...base, ncm, restricted: false }).success).toBe(false);
  });

  it("rejects an unknown origin", () => {
    expect(skuCreateSchema.safeParse({ ...base, origin: "MOON", restricted: false }).success).toBe(false);
  });
});
