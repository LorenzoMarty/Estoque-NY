import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./httpClient";
import type { Paginated } from "../types/pagination";
import type { Branch, Brand, Category, Location, LocationType, Sku } from "../types/stock";

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

export function useCreateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: { name: string }) => apiClient.post<Branch>("/branches", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["branches"] }),
  });
}

export function useUpdateBranch(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: { name: string }) => apiClient.put<Branch>(`/branches/${id}`, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["branches"] }),
  });
}

export function useDeleteBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/branches/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["branches"] }),
  });
}

export function useCreateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: { branch_id: number; name: string; type: LocationType }) => apiClient.post<Location>("/locations", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["locations"] }),
  });
}

export function useUpdateLocation(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: { branch_id: number; name: string; type: LocationType }) =>
      apiClient.put<Location>(`/locations/${id}`, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["locations"] }),
  });
}

export function useDeleteLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/locations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["locations"] }),
  });
}

export function useCreateBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: { name: string }) => apiClient.post<Brand>("/catalog/brands", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["brands"] }),
  });
}

export function useUpdateBrand(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: { name: string }) => apiClient.put<Brand>(`/catalog/brands/${id}`, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["brands"] }),
  });
}

export function useDeleteBrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/catalog/brands/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["brands"] }),
  });
}
