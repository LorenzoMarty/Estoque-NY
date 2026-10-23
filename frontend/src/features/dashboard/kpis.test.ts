import { describe, expect, it } from "vitest";
import type { InventoryCount, StockBalance, StockMove, Transfer } from "../../shared/types/stock";
import { computeDashboardKpis, computeTrend, filterByBranch, resolvePeriodRange, trendArrow } from "./kpis";

const NOW = new Date("2026-09-13T12:00:00.000Z");

function balance(overrides: Partial<StockBalance>): StockBalance {
  return {
    id: 1,
    branch_id: 1,
    sku_id: 1,
    location_id: null,
    on_hand: 10,
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

describe("resolvePeriodRange", () => {
  it("defaults to the last 30 days ending today", () => {
    const { from, to } = resolvePeriodRange({ branchId: "all", period: "30" }, NOW);
    expect(to.toISOString().slice(0, 10)).toBe("2026-09-13");
    expect(from.toISOString().slice(0, 10)).toBe("2026-08-15");
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    expect(days).toBe(30);
  });

  it("falls back to 30 days when a custom range is invalid", () => {
    const { from, to } = resolvePeriodRange(
      { branchId: "all", period: "custom", customFrom: "2026-09-10", customTo: "2026-09-01" },
      NOW
    );
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    expect(days).toBe(30);
  });
});

describe("filterByBranch", () => {
  it("matches by branch_id", () => {
    expect(filterByBranch({ branch_id: 2 }, "2")).toBe(true);
    expect(filterByBranch({ branch_id: 2 }, "3")).toBe(false);
  });

  it("matches transfers by from_branch_id or to_branch_id", () => {
    expect(filterByBranch({ from_branch_id: 1, to_branch_id: 2 }, "2")).toBe(true);
    expect(filterByBranch({ from_branch_id: 1, to_branch_id: 2 }, "3")).toBe(false);
  });

  it("always matches when filter is 'all'", () => {
    expect(filterByBranch({ branch_id: 5 }, "all")).toBe(true);
  });
});

describe("computeTrend", () => {
  it("reports up when current exceeds previous", () => {
    expect(computeTrend(120, 100).direction).toBe("up");
  });

  it("inverts direction when invert is true (fewer alerts is 'up')", () => {
    expect(computeTrend(5, 10, true).direction).toBe("up");
  });

  it("reports flat for negligible change", () => {
    expect(computeTrend(100, 100).direction).toBe("flat");
  });
});

describe("computeDashboardKpis", () => {
  it("computes stock_total as the sum of on_hand for the filtered branch", () => {
    const kpis = computeDashboardKpis(
      {
        balances: [balance({ branch_id: 1, on_hand: 10 }), balance({ branch_id: 2, on_hand: 999 })],
        moves: [],
        transfers: [],
        counts: [],
        itemsById: new Map(),
      },
      { branchId: "1", period: "30" },
      NOW
    );
    expect(kpis.find((k) => k.key === "stock_total")?.value).toBe(10);
  });

  it("counts stockout as balances with on_hand <= 0", () => {
    const kpis = computeDashboardKpis(
      {
        balances: [balance({ sku_id: 1, on_hand: 0 }), balance({ sku_id: 2, on_hand: 5 })],
        moves: [],
        transfers: [],
        counts: [],
        itemsById: new Map([
          [1, { id: 1, reorder_point: 3, active: true }],
          [2, { id: 2, reorder_point: 3, active: true }],
        ]),
      },
      { branchId: "all", period: "30" },
      NOW
    );
    expect(kpis.find((k) => k.key === "stockout")?.value).toBe(1);
  });

  it("counts low_stock as balances above zero but at or below the reorder point", () => {
    const kpis = computeDashboardKpis(
      {
        balances: [balance({ sku_id: 1, on_hand: 2 })],
        moves: [],
        transfers: [],
        counts: [],
        itemsById: new Map([[1, { id: 1, reorder_point: 5, active: true }]]),
      },
      { branchId: "all", period: "30" },
      NOW
    );
    expect(kpis.find((k) => k.key === "low_stock")?.value).toBe(1);
  });

  it("counts pending_transfers as DRAFT/SHIPPED only", () => {
    const transfers: Transfer[] = [
      { ...emptyTransfer(), id: 1, status: "DRAFT" },
      { ...emptyTransfer(), id: 2, status: "SHIPPED" },
      { ...emptyTransfer(), id: 3, status: "RECEIVED" },
    ];
    const kpis = computeDashboardKpis(
      { balances: [], moves: [], transfers, counts: [], itemsById: new Map() },
      { branchId: "all", period: "30" },
      NOW
    );
    expect(kpis.find((k) => k.key === "pending_transfers")?.value).toBe(2);
  });

  it("counts open_counts as status OPEN only", () => {
    const counts: InventoryCount[] = [
      { ...emptyCount(), id: 1, status: "OPEN" },
      { ...emptyCount(), id: 2, status: "CLOSED" },
    ];
    const kpis = computeDashboardKpis(
      { balances: [], moves: [], transfers: [], counts, itemsById: new Map() },
      { branchId: "all", period: "30" },
      NOW
    );
    expect(kpis.find((k) => k.key === "open_counts")?.value).toBe(1);
  });
});

function emptyTransfer(): Transfer {
  return {
    id: 0,
    from_branch_id: 1,
    from_location_id: 1,
    to_branch_id: 2,
    to_location_id: 2,
    status: "DRAFT",
    note: null,
    created_by: null,
    created_at: NOW.toISOString(),
    shipped_at: null,
    received_at: null,
    items: [],
  };
}

function emptyCount(): InventoryCount {
  return {
    id: 0,
    branch_id: 1,
    location_id: 1,
    status: "OPEN",
    started_at: NOW.toISOString(),
    closed_at: null,
    posted_at: null,
    cancelled_at: null,
    created_by: null,
    lines: [],
  };
}

describe("trendArrow", () => {
  it("follows the direction for KPIs where higher is better", () => {
    expect(trendArrow("stock_total", "up")).toBe("↑");
    expect(trendArrow("active_variations", "down")).toBe("↓");
  });

  it("flips the direction back for lower-is-better KPIs (up = fewer = value went down)", () => {
    expect(trendArrow("stockout", "up")).toBe("↓");
    expect(trendArrow("open_counts", "down")).toBe("↑");
  });

  it("is a flat arrow for flat trends", () => {
    expect(trendArrow("low_stock", "flat")).toBe("→");
  });
});

describe("computeDashboardKpis series", () => {
  const day = (n: number) => `2026-09-${String(n).padStart(2, "0")}T10:00:00.000Z`;
  function move(overrides: Partial<StockMove>): StockMove {
    return {
      id: 1, branch_id: 1, sku_id: 1, location_id: null, transfer_id: null, inventory_count_id: null, created_by: null,
      move_type: "RECEIPT", qty: 1, occurred_at: day(13), created_at: day(13), reason: null, reference_id: null, balance_after: 0,
      ...overrides,
    };
  }
  const base = { balances: [balance({ on_hand: 100 })], transfers: [] as Transfer[], counts: [] as InventoryCount[], itemsById: new Map() };
  const get = (moves: StockMove[], key: string, period: "7" | "30" = "7", extra: Partial<typeof base> = {}) =>
    computeDashboardKpis({ ...base, ...extra, moves }, { branchId: "all", period }, NOW).find((k) => k.key === key)!;

  it("has one point per day of the period on every KPI", () => {
    for (const period of ["7", "30"] as const) {
      const kpis = computeDashboardKpis({ ...base, moves: [] }, { branchId: "all", period }, NOW);
      for (const kpi of kpis) expect(kpi.series).toHaveLength(Number(period));
    }
  });

  it("rebuilds the daily balance backwards from today's stock", () => {
    // 7 days: 09-07 .. 09-13. +20 on 09-12, -5 on 09-13, balance today = 100.
    const series = get([move({ qty: 20, occurred_at: day(12) }), move({ id: 2, qty: -5, occurred_at: day(13) })], "stock_total").series;
    expect(series).toEqual([85, 85, 85, 85, 85, 105, 100]);
  });

  it("counts distinct SKUs moved per day for active_variations", () => {
    const series = get(
      [move({ sku_id: 1, occurred_at: day(13) }), move({ id: 2, sku_id: 1, occurred_at: day(13) }), move({ id: 3, sku_id: 2, occurred_at: day(13) })],
      "active_variations"
    ).series;
    expect(series[6]).toBe(2);
    expect(series.slice(0, 6).every((n) => n === 0)).toBe(true);
  });

  it("approximates stockout and low_stock by daily ISSUE/TRANSFER_SHIP moves", () => {
    const moves = [
      move({ move_type: "ISSUE", occurred_at: day(12) }),
      move({ id: 2, move_type: "TRANSFER_SHIP", occurred_at: day(12) }),
      move({ id: 3, move_type: "RECEIPT", occurred_at: day(12) }),
    ];
    expect(get(moves, "stockout").series[5]).toBe(2);
    expect(get(moves, "low_stock").series).toEqual(get(moves, "stockout").series);
  });

  it("counts transfers and inventory counts created per day", () => {
    const transfers: Transfer[] = [
      { ...emptyTransfer(), id: 1, created_at: day(11) },
      { ...emptyTransfer(), id: 2, created_at: day(11) },
    ];
    const counts: InventoryCount[] = [{ ...emptyCount(), id: 1, started_at: day(13) }];
    expect(get([], "pending_transfers", "7", { transfers }).series[4]).toBe(2);
    expect(get([], "open_counts", "7", { counts }).series[6]).toBe(1);
  });
});
