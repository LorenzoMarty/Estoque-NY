import { describe, expect, it } from "vitest";
import { cssVariablesResolver, palette, statusPalette, theme } from "./theme";

function contrastWithWhite(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return 1.05 / (luminance + 0.05);
}

describe("theme", () => {
  it("uses the deep blue primary color", () => {
    expect(theme.primaryColor).toBe("brand");
    expect(theme.colors?.brand?.[6]).toBe("#093B95");
  });

  it("uses the light page background as the base zinc shade", () => {
    expect(theme.colors?.zinc?.[2]).toBe("#f4f8ff");
  });

  it("keeps the radius scale", () => {
    expect(theme.radius?.md).toBe("14px");
  });

  it("exposes the reserved status palette to CSS as --status-* variables", () => {
    const resolved = cssVariablesResolver(theme as never);
    expect(resolved.variables["--status-good"]).toBe(statusPalette.good);
    expect(resolved.variables["--status-critical"]).toBe(statusPalette.critical);
    expect(Object.keys(resolved.variables).every((key) => /^--(status|rd)-/.test(key))).toBe(true);
  });

  it("exposes the brand palette to CSS and keeps the primary readable with white text", () => {
    const resolved = cssVariablesResolver(theme as never);
    expect(resolved.variables["--rd-primary"]).toBe(palette.primary);
    expect(resolved.variables["--rd-page"]).toBe(palette.page);
    expect(contrastWithWhite(palette.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastWithWhite(palette.primaryHover)).toBeGreaterThanOrEqual(4.5);
  });

  it("uses the company blue as primary and a lighter blue of the same family for chart series", () => {
    expect(palette.primary).toBe("#093B95");
    expect(palette.chartBlue).not.toBe(palette.primary);
    expect(palette.chartBlue).toBe("#1d57c7");
  });
});
