import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../shared/api/httpClient";
import type { Paginated } from "../../shared/types/pagination";
import type { Product } from "../../shared/types/stock";
import type { ProductFormValues } from "./schema";

export interface ProductsFilters {
  q?: string;
  active?: boolean;
}

export function useProductsQuery(filters: ProductsFilters) {
  return useQuery({
    queryKey: ["products", filters],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", page_size: "200", sort: "name", order: "asc" });
      if (filters.q) params.set("q", filters.q);
      if (filters.active != null) params.set("active", String(filters.active));
      const page = await apiClient.get<Paginated<Product>>(`/catalog/products?${params.toString()}`);
      return page.items;
    },
    staleTime: 10_000,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ProductFormValues) => apiClient.post<Product>("/catalog/products", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useUpdateProduct(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: ProductFormValues) => apiClient.patch<Product>(`/catalog/products/${id}`, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}
