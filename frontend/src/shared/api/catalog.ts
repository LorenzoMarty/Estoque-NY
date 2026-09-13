import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./httpClient";
import type { Paginated } from "../types/pagination";
import type { Branch, Brand, Category, Location, Sku } from "../types/stock";

export function useBranchesQuery() {
  return useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const page = await apiClient.get<Paginated<Branch>>("/branches?page=1&page_size=200");
      return page.items;
    },
    staleTime: 60_000,
  });
}

export function useLocationsQuery(branchId?: number) {
  return useQuery({
    queryKey: ["locations", branchId ?? "all"],
    queryFn: async () => {
      const query = branchId ? `&branch_id=${branchId}` : "";
      const page = await apiClient.get<Paginated<Location>>(`/locations?page=1&page_size=200${query}`);
      return page.items;
    },
    staleTime: 60_000,
  });
}

export function useSkusQuery() {
  return useQuery({
    queryKey: ["skus"],
    queryFn: () => apiClient.get<Sku[]>("/catalog/skus?page=1&page_size=200&order=asc"),
    staleTime: 60_000,
  });
}

export function useCategoriesQuery() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const page = await apiClient.get<Paginated<Category>>("/catalog/categories?page=1&page_size=200");
      return page.items;
    },
    staleTime: 60_000,
  });
}

export function useBrandsQuery() {
  return useQuery({
    queryKey: ["brands"],
    queryFn: async () => {
      const page = await apiClient.get<Paginated<Brand>>("/catalog/brands?page=1&page_size=200");
      return page.items;
    },
    staleTime: 60_000,
  });
}
