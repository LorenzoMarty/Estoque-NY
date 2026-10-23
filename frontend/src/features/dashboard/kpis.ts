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

export type KpiKey = "stock_total" | "active_variations" | "stockout" | "low_stock" | "pending_transfers" | "open_counts";

export interface Kpi {
  key: KpiKey;
  value: number;
  trend: Trend;
  /** One point per day of the selected period, oldest first (feeds the sparkline). */
  series: number[];
}

/** KPIs where a lower value is better: computeTrend flips their sign, so `direction` means better/worse, not up/down. */
const LOWER_IS_BETTER: ReadonlySet<KpiKey> = new Set(["stockout", "low_stock", "pending_transfers", "open_counts"]);

/** Arrow for the real change of the value: for "lower is better" KPIs the trend direction is inverted back. */
export function trendArrow(key: KpiKey, direction: Trend["direction"]): "↑" | "↓" | "→" {
  if (direction === "flat") return "→";
  const valueWentUp = LOWER_IS_BETTER.has(key) ? direction === "down" : direction === "up";
  return valueWentUp ? "↑" : "↓";
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

/** Index of the UTC day of `date` within [from, from + days), or -1 when outside. */
function dayIndex(date: Date, from: Date, days: number): number {
  const index = Math.floor((utcDayStart(date).getTime() - from.getTime()) / 86_400_000);
  return index >= 0 && index < days ? index : -1;
}

function dailySeries<T>(rows: T[], dateOf: (row: T) => string, from: Date, days: number, count: (bucket: T[]) => number): number[] {
  const buckets: T[][] = Array.from({ length: days }, () => []);
  for (const row of rows) {
    const index = dayIndex(new Date(dateOf(row)), from, days);
    if (index >= 0) buckets[index].push(row);
  }
  return buckets.map(count);
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

  // Sparkline series, one point per day of the period (oldest first).
  const { from } = periodRange;
  // periodDays above rounds up (31 for a 30-day period); the series needs exactly one point per calendar day.
  const seriesDays = Math.floor((periodRange.to.getTime() - from.getTime()) / 86_400_000) + 1;
  const flowPerDay = dailySeries(movesInPeriod, (move) => move.occurred_at, from, seriesDays, (bucket) =>
    bucket.reduce((acc, move) => acc + Number(move.qty || 0), 0)
  );
  // Closing balance per day: today's balance minus the net flow of every later day. ponytail: assumes no moves after the period end.
  const stockSeries = new Array<number>(seriesDays);
  let running = totalStock;
  for (let i = seriesDays - 1; i >= 0; i--) {
    stockSeries[i] = running;
    running -= flowPerDay[i];
  }
  const variationsSeries = dailySeries(movesInPeriod, (move) => move.occurred_at, from, seriesDays, (bucket) =>
    new Set(bucket.map((move) => move.sku_id)).size
  );
  // No per-SKU balance history: approximate stockout/low stock pressure by the daily issue/ship moves.
  const pressureSeries = dailySeries(
    movesInPeriod.filter((move) => ["ISSUE", "TRANSFER_SHIP"].includes(move.move_type)),
    (move) => move.occurred_at,
    from,
    seriesDays,
    (bucket) => bucket.length
  );
  const transfersSeries = dailySeries(
    data.transfers.filter((transfer) => filterByBranch(transfer, filters.branchId)),
    (transfer) => transfer.created_at,
    from,
    seriesDays,
    (bucket) => bucket.length
  );
  const countsSeries = dailySeries(
    data.counts.filter((count) => filterByBranch(count, filters.branchId)),
    (count) => count.started_at,
    from,
    seriesDays,
    (bucket) => bucket.length
  );

  return [
    { key: "stock_total", value: totalStock, trend: computeTrend(totalStock, previousStock), series: stockSeries },
    { key: "active_variations", value: uniqueActiveItems.size, trend: computeTrend(currentVarMoved, previousVarMoved), series: variationsSeries },
    { key: "stockout", value: ruptures, trend: computeTrend(ruptures, previousRuptureEstimate, true), series: pressureSeries },
    { key: "low_stock", value: lowStock, trend: computeTrend(lowStock, previousLowStockEstimate, true), series: pressureSeries },
    { key: "pending_transfers", value: pendingTransfers, trend: computeTrend(pendingTransfers, pendingPreviousEstimate, true), series: transfersSeries },
    { key: "open_counts", value: openCounts, trend: computeTrend(openCounts, openCountPreviousEstimate, true), series: countsSeries },
  ];
}
