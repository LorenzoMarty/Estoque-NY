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

describe("reason_code", () => {
  const base = { branch_id: 1, sku_id: 2, qty: 3 };

  it("is accepted on issues and adjustments, rejected when unknown", () => {
    expect(issueSchema.parse({ ...base, reason_code: "BREAKAGE" }).reason_code).toBe("BREAKAGE");
    expect(adjustmentSchema.parse({ ...base, qty_delta: -1, reason_code: "THEFT" }).reason_code).toBe("THEFT");
    expect(issueSchema.safeParse({ ...base, reason_code: "BOGUS" }).success).toBe(false);
  });

  it("is dropped from receipts, which are not losses", () => {
    expect(receiptSchema.parse({ ...base, reason_code: "THEFT" })).not.toHaveProperty("reason_code");
  });
});
