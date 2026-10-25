import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../shared/api/httpClient";
import type { Paginated } from "../../shared/types/pagination";

export interface Supplier {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
}

export function useSuppliersQuery() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await apiClient.get<Paginated<Supplier>>("/stock/suppliers?page=1&page_size=200&order=asc&sort=name")).items,
    staleTime: 60_000,
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: { name: string }) => apiClient.post<Supplier>("/stock/suppliers", values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

/** The API only changes the fields sent, so editing the name keeps phone, e-mail and the rest. */
export function useUpdateSupplier(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: { name: string }) => apiClient.put<Supplier>(`/stock/suppliers/${id}`, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.delete(`/stock/suppliers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}
