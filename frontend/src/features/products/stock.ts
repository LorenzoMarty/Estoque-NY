import type { Sku, StockBalance } from "../../shared/types/stock";

/** Total on-hand per product, summing every SKU balance across branches and locations. */
export function onHandByProduct(balances: StockBalance[], skus: Sku[]): Map<number, number> {
  const productBySku = new Map(skus.map((sku) => [sku.id, sku.product_id]));
  const totals = new Map<number, number>();
  for (const balance of balances) {
    const productId = productBySku.get(balance.sku_id);
    if (productId == null) continue;
    totals.set(productId, (totals.get(productId) ?? 0) + (Number(balance.on_hand) || 0));
  }
  return totals;
}
