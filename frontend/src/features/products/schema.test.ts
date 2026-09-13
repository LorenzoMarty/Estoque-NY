import { describe, expect, it } from "vitest";
import { productSchema } from "./schema";

describe("productSchema", () => {
  it("accepts a minimal valid product", () => {
    expect(productSchema.safeParse({ name: "Agua 500ml", active: true }).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(productSchema.safeParse({ name: "", active: true }).success).toBe(false);
  });

  it("requires the active flag to be present", () => {
    expect(productSchema.safeParse({ name: "Agua 500ml" }).success).toBe(false);
  });
});
