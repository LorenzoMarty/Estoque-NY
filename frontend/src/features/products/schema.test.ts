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

  it("accepts the storefront fields", () => {
    const result = productSchema.safeParse({
      name: "Agua 500ml",
      active: true,
      published: true,
      featured: false,
      image_url: "https://cdn.example.com/agua.webp",
    });
    expect(result.success).toBe(true);
  });

  it("allows an empty image url so the field can be cleared", () => {
    expect(productSchema.safeParse({ name: "Agua", active: true, image_url: "" }).success).toBe(true);
  });

  it.each(["javascript:alert(1)", "ftp://x/y.png", "//cdn/x.png", "not a url", "data:image/png;base64,AAAA"])(
    "rejects %s as image url",
    (image_url) => {
      expect(productSchema.safeParse({ name: "Agua", active: true, image_url }).success).toBe(false);
    },
  );
});
