import { describe, expect, it } from "vitest";
import type { AbcRow, ValuationRow } from "./api";
import { countByAbcClass, topValuationByLabel } from "./chartData";

function valuationRow(overrides: Partial<ValuationRow>): ValuationRow {
  return { branch_id: 1, location_id: null, sku_id: 1, on_hand: 10, cost: "1", valuation: "10", ...overrides };
}

describe("topValuationByLabel", () => {
  it("sorts descending by valuation and limits results", () => {
    const rows = [
      valuationRow({ sku_id: 1, valuation: "50" }),
      valuationRow({ sku_id: 2, valuation: "200" }),
      valuationRow({ sku_id: 3, valuation: "100" }),
    ];
    const result = topValuationByLabel(rows, (id) => `SKU-${id}`, 2);
    expect(result).toEqual([
      { label: "SKU-2", valuation: 200 },
      { label: "SKU-3", valuation: 100 },
    ]);
  });
});

describe("countByAbcClass", () => {
  it("counts rows per ABC class, always including all three classes", () => {
    const rows: AbcRow[] = [
      { sku_id: 1, movement_value: "10", cumulative_percent: 10, class_name: "A" },
      { sku_id: 2, movement_value: "5", cumulative_percent: 60, class_name: "A" },
      { sku_id: 3, movement_value: "2", cumulative_percent: 90, class_name: "B" },
    ];
    const result = countByAbcClass(rows);
    expect(result).toEqual([
      { class_name: "A", count: 2, color: "teal.6" },
      { class_name: "B", count: 1, color: "yellow.6" },
      { class_name: "C", count: 0, color: "red.6" },
    ]);
  });
});
