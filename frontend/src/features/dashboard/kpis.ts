import type { InventoryCount, StockBalance, StockMove, Transfer } from "../../shared/types/stock";

export interface DashboardItem {
  id: number;
  reorder_point: number;
  active: boolean;
}

export interface DashboardFilters {
  branchId: string;
  period: "7" | "30" | "90" | "custom";
  customFrom?: string;
  customTo?: string;
}

export interface DashboardData {
  balances: StockBalance[];
  moves: StockMove[];
  transfers: Transfer[];
  counts: InventoryCount[];
  itemsById: Map<number, DashboardItem>;
}

export interface Trend {
  direction: "up" | "down" | "flat";
  value: number;
}

export interface Kpi {
  key: "stock_total" | "active_variations" | "stockout" | "low_stock" | "pending_transfers" | "open_counts";
  value: number;
  trend: Trend;
}

function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function utcDayEnd(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

export function resolvePeriodRange(filters: DashboardFilters, now: Date = new Date()): { from: Date; to: Date } {
  if (filters.period === "custom" && filters.customFrom && filters.customTo) {
    const from = utcDayStart(new Date(`${filters.customFrom}T00:00:00Z`));
    const to = utcDayEnd(new Date(`${filters.customTo}T00:00:00Z`));
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
      return { from, to };
    }
  }

  const days = Number(filters.period) || 30;
  const to = utcDayEnd(now);
  const from = utcDayStart(new Date(to.getTime() - (days - 1) * 86_400_000));
  return { from, to };
}

export function filterByBranch<T extends { branch_id?: number; from_branch_id?: number; to_branch_id?: number }>(
  row: T,
  branchFilter: string
): boolean {
  if (branchFilter === "all") return true;
  const branchId = Number(branchFilter);
  if (row.branch_id != null) return Number(row.branch_id) === branchId;
  if (row.from_branch_id != null || row.to_branch_id != null) {
    return Number(row.from_branch_id) === branchId || Number(row.to_branch_id) === branchId;
  }
  return false;
}

export function computeTrend(current: number, previous: number, invert = false): Trend {
  const safePrevious = Math.max(Math.abs(previous || 0), 1);
  let raw = ((current || 0) - (previous || 0)) / safePrevious * 100;
  if (invert) raw *= -1;
  const direction = raw > 1 ? "up" : raw < -1 ? "down" : "flat";
  return { direction, value: Math.abs(raw) };
}

export function computeDashboardKpis(data: DashboardData, filters: DashboardFilters, now: Date = new Date()): Kpi[] {
  const periodRange = resolvePeriodRange(filters, now);
  const balances = data.balances.filter((balance) => filterByBranch(balance, filters.branchId));
  const allMovesInBranch = data.moves.filter((move) => filterByBranch(move, filters.branchId));

  const movesInPeriod = allMovesInBranch.filter((move) => {
    const date = new Date(move.occurred_at);
    return date >= periodRange.from && date <= periodRange.to;
  });

  const periodDays = Math.max(1, Math.round((periodRange.to.getTime() - periodRange.from.getTime()) / 86_400_000) + 1);
  const previousTo = new Date(periodRange.from.getTime() - 1000);
  const previousFrom = new Date(periodRange.from.getTime() - periodDays * 86_400_000);

  const movesInPreviousPeriod = allMovesInBranch.filter((move) => {
    const date = new Date(move.occurred_at);
    return date >= previousFrom && date <= previousTo;
  });

  const totalStock = balances.reduce((acc, balance) => acc + Number(balance.on_hand || 0), 0);

  const uniqueActiveItems = new Set(
    balances.filter((balance) => data.itemsById.get(balance.sku_id)?.active !== false).map((balance) => balance.sku_id)
  );

  const ruptures = balances.filter((balance) => Number(balance.on_hand) <= 0).length;
  const lowStock = balances.filter((balance) => {
    const item = data.itemsById.get(balance.sku_id);
    const point = Number(item?.reorder_point || 0);
    return Number(balance.on_hand) > 0 && Number(balance.on_hand) <= point;
  }).length;

  const pendingTransfers = data.transfers.filter(
    (transfer) => filterByBranch(transfer, filters.branchId) && ["DRAFT", "SHIPPED"].includes(transfer.status)
  ).length;

  const openCounts = data.counts.filter(
    (count) => filterByBranch(count, filters.branchId) && count.status === "OPEN"
  ).length;

  const netFlowCurrent = movesInPeriod.reduce((acc, move) => acc + Number(move.qty || 0), 0);
  const netFlowPrevious = movesInPreviousPeriod.reduce((acc, move) => acc + Number(move.qty || 0), 0);
  const previousStock = totalStock - netFlowCurrent + netFlowPrevious;

  const currentVarMoved = new Set(movesInPeriod.map((move) => move.sku_id)).size;
  const previousVarMoved = new Set(movesInPreviousPeriod.map((move) => move.sku_id)).size;

  const issuePressureCurrent = movesInPeriod.filter((move) => ["ISSUE", "TRANSFER_SHIP"].includes(move.move_type)).length;
  const issuePressurePrevious = movesInPreviousPeriod.filter((move) =>
    ["ISSUE", "TRANSFER_SHIP"].includes(move.move_type)
  ).length;

  const previousRuptureEstimate = Math.max(1, Math.round(ruptures + (issuePressurePrevious - issuePressureCurrent) / 8));
  const previousLowStockEstimate = Math.max(1, Math.round(lowStock + (issuePressurePrevious - issuePressureCurrent) / 10));

  const currentPendingCreated = data.transfers.filter((transfer) => {
    const created = new Date(transfer.created_at);
    return created >= periodRange.from && created <= periodRange.to;
  }).length;
  const previousPendingCreated = data.transfers.filter((transfer) => {
    const created = new Date(transfer.created_at);
    return created >= previousFrom && created <= previousTo;
  }).length;
  const pendingPreviousEstimate = Math.max(0, pendingTransfers + (previousPendingCreated - currentPendingCreated));

  const currentOpenCountCreated = data.counts.filter((count) => {
    const started = new Date(count.started_at);
    return started >= periodRange.from && started <= periodRange.to;
  }).length;
  const previousOpenCountCreated = data.counts.filter((count) => {
    const started = new Date(count.started_at);
    return started >= previousFrom && started <= previousTo;
  }).length;
  const openCountPreviousEstimate = Math.max(0, openCounts + (previousOpenCountCreated - currentOpenCountCreated));

  return [
    { key: "stock_total", value: totalStock, trend: computeTrend(totalStock, previousStock) },
    { key: "active_variations", value: uniqueActiveItems.size, trend: computeTrend(currentVarMoved, previousVarMoved) },
    { key: "stockout", value: ruptures, trend: computeTrend(ruptures, previousRuptureEstimate, true) },
    { key: "low_stock", value: lowStock, trend: computeTrend(lowStock, previousLowStockEstimate, true) },
    { key: "pending_transfers", value: pendingTransfers, trend: computeTrend(pendingTransfers, pendingPreviousEstimate, true) },
    { key: "open_counts", value: openCounts, trend: computeTrend(openCounts, openCountPreviousEstimate, true) },
  ];
}
