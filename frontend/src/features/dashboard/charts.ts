import { palette } from "../../app/theme";
import type { Category, Product, Sku, StockBalance, StockMove } from "../../shared/types/stock";
import { filterByBranch } from "./kpis";

// Fixed-order categorical slots (blue, orange, aqua, yellow, magenta), validated for adjacent-pair CVD separation.
export const CATEGORY_COLORS = [palette.chartBlue, palette.chartOrange, "#1baf7a", "#eda100", "#e87ba4"];
export const OTHER_COLOR = "#8a97ad";
export const UNCATEGORIZED_LABEL = "Sem categoria";
const DAY_MS = 86_400_000;

export interface FlowPoint {
  label: string;
  entradas: number;
  saidas: number;
}

export interface CategorySlice {
  name: string;
  value: number;
  color: string;
}

function formatDay(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Receipts vs issues inside [from, to], split into at most `maxBuckets` equal day buckets. Transfers and adjustments are internal movements and are left out. */
export function flowByBucket(
  moves: StockMove[],
  range: { from: Date; to: Date },
  branchId: string,
  maxBuckets = 10
): FlowPoint[] {
  const totalDays = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / DAY_MS));
  const bucketDays = Math.max(1, Math.ceil(totalDays / maxBuckets));
  const bucketCount = Math.ceil(totalDays / bucketDays);

  const points: FlowPoint[] = Array.from({ length: bucketCount }, (_, index) => {
    const start = new Date(range.from.getTime() + index * bucketDays * DAY_MS);
    return { label: formatDay(start), entradas: 0, saidas: 0 };
  });

  for (const move of moves) {
    if (!filterByBranch(move, branchId)) continue;
    if (move.move_type !== "RECEIPT" && move.move_type !== "ISSUE") continue;
    const at = new Date(move.occurred_at).getTime();
    if (at < range.from.getTime() || at > range.to.getTime()) continue;
    const index = Math.min(bucketCount - 1, Math.floor((at - range.from.getTime()) / (bucketDays * DAY_MS)));
    if (move.move_type === "RECEIPT") points[index].entradas += Math.abs(move.qty);
    else points[index].saidas += Math.abs(move.qty);
  }
  return points;
}

/** On-hand per category. The first five categories (alphabetical) keep a stable color; the rest fold into "Outros". */
export function stockByCategory(
  balances: StockBalance[],
  skus: Sku[],
  products: Product[],
  categories: Category[],
  branchId: string
): CategorySlice[] {
  const productById = new Map(products.map((product) => [product.id, product]));
  const skuById = new Map(skus.map((sku) => [sku.id, sku]));
  const ordered = [...categories].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const colorByCategory = new Map(ordered.slice(0, CATEGORY_COLORS.length).map((c, i) => [c.id, CATEGORY_COLORS[i]]));
  const nameByCategory = new Map(categories.map((category) => [category.id, category.name]));

  const totals = new Map<number | null, number>();
  for (const balance of balances) {
    if (!filterByBranch(balance, branchId)) continue;
    const sku = skuById.get(balance.sku_id);
    const categoryId = sku ? (productById.get(sku.product_id)?.category_id ?? null) : null;
    totals.set(categoryId, (totals.get(categoryId) ?? 0) + Math.max(0, Number(balance.on_hand) || 0));
  }

  const slices: CategorySlice[] = [];
  let others = 0;
  for (const [categoryId, value] of totals) {
    if (value <= 0) continue;
    const color = categoryId == null ? undefined : colorByCategory.get(categoryId);
    if (!color) {
      others += value;
      continue;
    }
    slices.push({ name: nameByCategory.get(categoryId as number) ?? UNCATEGORIZED_LABEL, value, color });
  }
  slices.sort((a, b) => b.value - a.value);
  if (others > 0) slices.push({ name: "Outros", value: others, color: OTHER_COLOR });
  return slices;
}
