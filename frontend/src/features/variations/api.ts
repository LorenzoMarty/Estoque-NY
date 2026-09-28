import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../shared/api/httpClient";
import type { Paginated } from "../../shared/types/pagination";
import type { Sku } from "../../shared/types/stock";
import type { SkuCreateFormValues, SkuUpdateFormValues } from "./schema";

export function useSkusListQuery() {
  return useQuery({
    queryKey: ["skus"],
    queryFn: async () => {
      const page = await apiClient.get<Paginated<Sku>>("/catalog/skus?page=1&page_size=200&order=asc");
      return page.items;
    },
    staleTime: 10_000,
  });
}

export function useCreateSku() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SkuCreateFormValues) => apiClient.post<Sku>("/catalog/skus", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skus"] }),
  });
}

export function useUpdateSku(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SkuUpdateFormValues) => apiClient.patch<Sku>(`/catalog/skus/${id}`, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["skus"] }),
  });
}
