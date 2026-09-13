import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../shared/api/httpClient";
import type { Paginated } from "../../shared/types/pagination";

export interface AuditLog {
  id: number;
  user_id: number | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  meta_json: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditFilters {
  q?: string;
  action?: string;
  resourceType?: string;
}

export function useAuditLogsQuery(filters: AuditFilters) {
  return useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", page_size: "100", sort: "created_at", order: "desc" });
      if (filters.q) params.set("q", filters.q);
      if (filters.action) params.set("action", filters.action);
      if (filters.resourceType) params.set("resource_type", filters.resourceType);
      const page = await apiClient.get<Paginated<AuditLog>>(`/admin/audit-logs?${params.toString()}`);
      return page.items;
    },
    staleTime: 10_000,
  });
}
