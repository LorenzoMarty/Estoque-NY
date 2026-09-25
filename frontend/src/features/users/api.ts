import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../shared/api/httpClient";
import type { Paginated } from "../../shared/types/pagination";

export interface UserWithRoles {
  id: number;
  name: string;
  email: string;
  active: boolean;
  created_at: string;
  roles: string[];
}

export interface Role {
  id: number;
  name: string;
}

export interface Permission {
  id: number;
  key: string;
}

export interface UsersFilters {
  q?: string;
}

export function useUsersQuery(filters: UsersFilters) {
  return useQuery({
    queryKey: ["users", filters],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", page_size: "100" });
      if (filters.q) params.set("q", filters.q);
      const page = await apiClient.get<Paginated<UserWithRoles>>(`/auth/users?${params.toString()}`);
      return page.items;
    },
    staleTime: 10_000,
  });
}

export function useRolesQuery() {
  return useQuery({
    queryKey: ["roles"],
    queryFn: () => apiClient.get<Role[]>("/auth/roles"),
    staleTime: 60_000,
  });
}

export function usePermissionsQuery() {
  return useQuery({
    queryKey: ["permissions"],
    queryFn: () => apiClient.get<Permission[]>("/auth/permissions"),
    staleTime: 60_000,
  });
}

export function useSetUserActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, active }: { userId: number; active: boolean }) =>
      apiClient.patch<UserWithRoles>(`/auth/users/${userId}`, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useAssignRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleName }: { userId: number; roleName: string }) =>
      apiClient.post<void>("/auth/roles/assign", { user_id: userId, role_name: roleName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
