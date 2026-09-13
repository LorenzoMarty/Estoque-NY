export type MoveType = "RECEIPT" | "ISSUE" | "ADJUSTMENT" | "TRANSFER_SHIP" | "TRANSFER_RECEIVE";
export type TransferStatus = "DRAFT" | "SHIPPED" | "RECEIVED" | "CANCELLED";
export type InventoryCountStatus = "OPEN" | "CLOSED" | "POSTED" | "CANCELLED";
export type LocationType = "STORE" | "WAREHOUSE" | "OTHER";

export interface Branch {
  id: number;
  name: string;
  created_at: string;
}

export interface Location {
  id: number;
  branch_id: number;
  name: string;
  type: LocationType;
}

export interface Category {
  id: number;
  name: string;
  created_at: string;
}

export interface Brand {
  id: number;
  name: string;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  category_id: number | null;
  brand_id: number | null;
  brand: string | null;
  active: boolean;
  created_at: string;
}

export interface Sku {
  id: number;
  product_id: number;
  sku_code: string;
  name: string | null;
  barcode: string | null;
  unit: string;
  attributes: Record<string, unknown> | null;
  cost: string;
  price: string;
  tax_code: string | null;
  active: boolean;
}

export interface StockBalance {
  id: number;
  branch_id: number;
  sku_id: number;
  location_id: number | null;
  on_hand: number;
  updated_at: string;
}

export interface StockMove {
  id: number;
  branch_id: number;
  sku_id: number;
  location_id: number | null;
  transfer_id: number | null;
  inventory_count_id: number | null;
  created_by: number | null;
  move_type: MoveType;
  qty: number;
  occurred_at: string;
  created_at: string;
  reason: string | null;
  reference_id: string | null;
  balance_after: number;
}

export interface TransferItem {
  sku_id: number;
  qty: number;
}

export interface Transfer {
  id: number;
  from_branch_id: number;
  from_location_id: number;
  to_branch_id: number;
  to_location_id: number;
  status: TransferStatus;
  note: string | null;
  created_by: number | null;
  created_at: string;
  shipped_at: string | null;
  received_at: string | null;
  items: TransferItem[];
}

export interface InventoryCountLine {
  id: number;
  count_id: number;
  sku_id: number;
  system_qty: number;
  counted_qty: number | null;
  diff_qty: number;
  posted: boolean;
}

export interface InventoryCount {
  id: number;
  branch_id: number;
  location_id: number;
  status: InventoryCountStatus;
  started_at: string;
  closed_at: string | null;
  posted_at: string | null;
  cancelled_at: string | null;
  created_by: number | null;
  lines: InventoryCountLine[];
}
