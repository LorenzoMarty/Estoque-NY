import type { StatusTone } from "../app/theme";

// Backend has no per-item reorder point yet, so every item shares this limit.
export const REORDER_POINT = 12;

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export function stockStatus(onHand: number, reorderPoint: number = REORDER_POINT): StockStatus {
  if (onHand <= 0) return "out_of_stock";
  if (onHand <= reorderPoint) return "low_stock";
  return "in_stock";
}

export interface StockSummary {
  total: number;
  in_stock: number;
  low_stock: number;
  out_of_stock: number;
}

export function summarizeStock(onHandByItem: number[], reorderPoint: number = REORDER_POINT): StockSummary {
  const summary: StockSummary = { total: onHandByItem.length, in_stock: 0, low_stock: 0, out_of_stock: 0 };
  for (const onHand of onHandByItem) summary[stockStatus(onHand, reorderPoint)] += 1;
  return summary;
}

export const STOCK_STATUS_META: Record<StockStatus, { label: string; tone: StatusTone }> = {
  in_stock: { label: "Em estoque", tone: "good" },
  low_stock: { label: "Estoque baixo", tone: "warning" },
  out_of_stock: { label: "Sem estoque", tone: "critical" },
};
