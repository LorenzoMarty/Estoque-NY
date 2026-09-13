import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../shared/api/httpClient";
import type { Paginated } from "../../shared/types/pagination";
import type { InventoryCount } from "../../shared/types/stock";
import type { InventoryCountCreateFormValues } from "./schema";

export function useInventoryCountsQuery() {
  return useQuery({
    queryKey: ["inventory-counts"],
    queryFn: async () => {
      const page = await apiClient.get<Paginated<InventoryCount>>("/stock/inventory-counts?page=1&page_size=100&order=desc");
      return page.items;
    },
    staleTime: 10_000,
  });
}

export function useInventoryCountQuery(countId: number | null) {
  return useQuery({
    queryKey: ["inventory-counts", countId],
    queryFn: () => apiClient.get<InventoryCount>(`/stock/inventory-counts/${countId}`),
    enabled: countId != null,
  });
}

function invalidateCounts(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["inventory-counts"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
}

export function useCreateInventoryCount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: InventoryCountCreateFormValues) =>
      apiClient.post<InventoryCount>("/stock/inventory-counts", { ...values, scope: "ALL" }),
    onSuccess: () => invalidateCounts(queryClient),
  });
}

export function usePatchCountLines(countId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lines: { sku_id: number; counted_qty: number }[]) =>
      apiClient.patch<InventoryCount>(`/stock/inventory-counts/${countId}/lines`, { lines }),
    onSuccess: () => {
      invalidateCounts(queryClient);
      queryClient.invalidateQueries({ queryKey: ["inventory-counts", countId] });
    },
  });
}

function useCountAction(action: "close" | "post" | "cancel") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (countId: number) => apiClient.post<InventoryCount>(`/stock/inventory-counts/${countId}/${action}`),
    onSuccess: (_, countId) => {
      invalidateCounts(queryClient);
      queryClient.invalidateQueries({ queryKey: ["inventory-counts", countId] });
    },
  });
}

export const useCloseCount = () => useCountAction("close");
export const usePostCount = () => useCountAction("post");
export const useCancelCount = () => useCountAction("cancel");
