import { describe, expect, it } from "vitest";
import { transferCreateSchema } from "./schema";

const base = {
  from_branch_id: 1,
  from_location_id: 1,
  to_branch_id: 2,
  to_location_id: 2,
};

describe("transferCreateSchema", () => {
  it("accepts a transfer with at least one item", () => {
    const result = transferCreateSchema.safeParse({ ...base, items: [{ sku_id: 1, qty: 5 }] });
    expect(result.success).toBe(true);
  });

  it("rejects a transfer with no items", () => {
    const result = transferCreateSchema.safeParse({ ...base, items: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an item with zero quantity", () => {
    const result = transferCreateSchema.safeParse({ ...base, items: [{ sku_id: 1, qty: 0 }] });
    expect(result.success).toBe(false);
  });
});
