import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../shared/api/httpClient";
import type { Paginated } from "../../shared/types/pagination";
import type { StockMove } from "../../shared/types/stock";
import type { AdjustmentFormValues, IssueFormValues, ReceiptFormValues } from "./schema";

export interface MovementsFilters {
  branchId?: number;
  locationId?: number;
  type?: string;
}

export function useMovesQuery(filters: MovementsFilters) {
  return useQuery({
    queryKey: ["moves", filters],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", page_size: "200", sort: "occurred_at", order: "desc" });
      if (filters.branchId) params.set("branch_id", String(filters.branchId));
      if (filters.locationId) params.set("location_id", String(filters.locationId));
      if (filters.type) params.set("type", filters.type);
      const page = await apiClient.get<Paginated<StockMove>>(`/stock/moves?${params.toString()}`);
      return page.items;
    },
    staleTime: 10_000,
  });
}

export function useCreateReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ReceiptFormValues) => apiClient.post<StockMove>("/stock/receipts", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["moves"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useCreateIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: IssueFormValues) => apiClient.post<StockMove>("/stock/issues", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["moves"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useCreateAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: AdjustmentFormValues) => apiClient.post<StockMove>("/stock/adjustments", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["moves"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
