import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../shared/api/httpClient";
import type { Paginated } from "../../shared/types/pagination";
import { useSkusQuery } from "../../shared/api/catalog";
import type { Product, StockBalance } from "../../shared/types/stock";
import { onHandByProduct } from "./stock";
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

export function useProductStockQuery() {
  const { data: skus } = useSkusQuery();
  const balances = useQuery({
    queryKey: ["stock-balances", "all"],
    queryFn: async () => {
      const page = await apiClient.get<Paginated<StockBalance>>("/stock/balances?page=1&page_size=200");
      return page.items;
    },
    staleTime: 30_000,
  });
  const data = skus && balances.data ? onHandByProduct(balances.data, skus) : undefined;
  return { data, isLoading: balances.isLoading || !skus };
}
