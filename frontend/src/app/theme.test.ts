import { describe, expect, it } from "vitest";
import { theme } from "./theme";

describe("theme", () => {
  it("uses the app.css orange accent as the primary color", () => {
    expect(theme.primaryColor).toBe("orange");
    expect(theme.colors?.orange?.[6]).toBe("#f97316");
  });

  it("uses dark color scheme to match the current app background", () => {
    expect(theme.colors?.dark?.[7]).toBe("#18181b");
  });

  it("maps the app.css radius scale", () => {
    expect(theme.radius?.md).toBe("14px");
  });
});
