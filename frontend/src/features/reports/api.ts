import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../shared/api/httpClient";
import type { Paginated } from "../../shared/types/pagination";

export interface ValuationRow {
  branch_id: number;
  location_id: number | null;
  sku_id: number;
  on_hand: number;
  cost: string;
  valuation: string;
}

export interface TurnoverRow {
  branch_id: number;
  location_id: number | null;
  sku_id: number;
  issued_qty: number;
  average_stock: number;
  turnover: number;
}

export interface AbcRow {
  sku_id: number;
  movement_value: string;
  cumulative_percent: number;
  class_name: "A" | "B" | "C";
}

export function useValuationReport(branchId?: number) {
  return useQuery({
    queryKey: ["reports", "valuation", branchId ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", page_size: "200" });
      if (branchId) params.set("branch_id", String(branchId));
      const page = await apiClient.get<Paginated<ValuationRow>>(`/reports/stock/valuation?${params.toString()}`);
      return page.items;
    },
    staleTime: 30_000,
  });
}

export function useTurnoverReport(branchId?: number) {
  return useQuery({
    queryKey: ["reports", "turnover", branchId ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", page_size: "200" });
      if (branchId) params.set("branch_id", String(branchId));
      const page = await apiClient.get<Paginated<TurnoverRow>>(`/reports/stock/turnover?${params.toString()}`);
      return page.items;
    },
    staleTime: 30_000,
  });
}

export function useAbcReport(branchId?: number) {
  return useQuery({
    queryKey: ["reports", "abc", branchId ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", page_size: "200" });
      if (branchId) params.set("branch_id", String(branchId));
      const page = await apiClient.get<Paginated<AbcRow>>(`/reports/stock/abc?${params.toString()}`);
      return page.items;
    },
    staleTime: 30_000,
  });
}
