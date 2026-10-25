import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../shared/api/httpClient";
import type { Paginated } from "../../shared/types/pagination";

export interface Threshold {
  id: number;
  branch_id: number;
  sku_id: number;
  min_qty: number;
  max_qty: number | null;
}

export interface ThresholdInput {
  branch_id: number;
  sku_id: number;
  min_qty: number;
  max_qty: number | null;
}

export interface LowStockItem {
  threshold_id: number;
  branch_id: number;
  sku_id: number;
  sku_code: string;
  name: string | null;
  on_hand: number;
  min_qty: number;
  max_qty: number | null;
  missing: number;
}

export function useThresholdsQuery() {
  return useQuery({
    queryKey: ["thresholds"],
    queryFn: async () => (await apiClient.get<Paginated<Threshold>>("/stock/thresholds?page=1&page_size=200")).items,
    staleTime: 30_000,
  });
}

export function useSetThreshold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ThresholdInput) => apiClient.put<Threshold>("/stock/thresholds", values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["thresholds"] });
      void queryClient.invalidateQueries({ queryKey: ["low-stock"] });
    },
  });
}

/** SKUs below their branch minimum, biggest gap first; `branchId` null means every branch the user can see. */
export function useLowStockQuery(branchId: number | null) {
  return useQuery({
    queryKey: ["low-stock", branchId],
    queryFn: async () => {
      const branch = branchId ? `&branch_id=${branchId}` : "";
      return (await apiClient.get<Paginated<LowStockItem>>(`/stock/low-stock?page=1&page_size=10${branch}`)).items;
    },
    staleTime: 30_000,
  });
}
