import { describe, expect, it } from "vitest";
import { adjustmentSchema, issueSchema, receiptSchema } from "./schema";

describe("receiptSchema", () => {
  it("accepts a positive quantity", () => {
    const result = receiptSchema.safeParse({ branch_id: "1", sku_id: "2", qty: "5" });
    expect(result.success).toBe(true);
  });

  it("rejects a zero or negative quantity", () => {
    expect(receiptSchema.safeParse({ branch_id: 1, sku_id: 2, qty: 0 }).success).toBe(false);
    expect(receiptSchema.safeParse({ branch_id: 1, sku_id: 2, qty: -3 }).success).toBe(false);
  });

  it("requires branch_id and sku_id", () => {
    expect(receiptSchema.safeParse({ qty: 5 }).success).toBe(false);
  });
});

describe("issueSchema", () => {
  it("rejects a zero quantity", () => {
    expect(issueSchema.safeParse({ branch_id: 1, sku_id: 2, qty: 0 }).success).toBe(false);
  });
});

describe("adjustmentSchema", () => {
  it("accepts a negative delta", () => {
    expect(adjustmentSchema.safeParse({ branch_id: 1, sku_id: 2, qty_delta: -4 }).success).toBe(true);
  });

  it("rejects a zero delta", () => {
    expect(adjustmentSchema.safeParse({ branch_id: 1, sku_id: 2, qty_delta: 0 }).success).toBe(false);
  });
});
