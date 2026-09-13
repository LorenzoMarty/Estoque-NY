import type { AbcRow, ValuationRow } from "./api";

export interface ValuationChartPoint {
  label: string;
  valuation: number;
}

export function topValuationByLabel(rows: ValuationRow[], labelFor: (skuId: number) => string, limit = 10): ValuationChartPoint[] {
  return [...rows]
    .sort((a, b) => Number(b.valuation) - Number(a.valuation))
    .slice(0, limit)
    .map((row) => ({ label: labelFor(row.sku_id), valuation: Number(row.valuation) }));
}

export interface AbcClassCount {
  class_name: "A" | "B" | "C";
  count: number;
  color: string;
}

const ABC_COLORS: Record<AbcRow["class_name"], string> = { A: "teal.6", B: "yellow.6", C: "red.6" };

export function countByAbcClass(rows: AbcRow[]): AbcClassCount[] {
  const counts: Record<string, number> = { A: 0, B: 0, C: 0 };
  rows.forEach((row) => {
    counts[row.class_name] = (counts[row.class_name] ?? 0) + 1;
  });
  return (["A", "B", "C"] as const).map((className) => ({
    class_name: className,
    count: counts[className] ?? 0,
    color: ABC_COLORS[className],
  }));
}
