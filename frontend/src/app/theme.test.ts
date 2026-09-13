import { describe, expect, it } from "vitest";
import { theme } from "./theme";

describe("theme", () => {
  it("uses the app.css blue accent (light theme override) as the primary color", () => {
    expect(theme.primaryColor).toBe("brand");
    expect(theme.colors?.brand?.[6]).toBe("#3b82f6");
  });

  it("uses the app.css light-theme surface as the base zinc shade", () => {
    expect(theme.colors?.zinc?.[2]).toBe("#f5f9ff");
  });

  it("maps the app.css radius scale", () => {
    expect(theme.radius?.md).toBe("14px");
  });
});
