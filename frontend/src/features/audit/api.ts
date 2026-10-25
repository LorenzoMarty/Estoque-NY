import { useQuery } from "@tanstack/react-query";
import { apiClient, requestText } from "../../shared/api/httpClient";
import type { Paginated } from "../../shared/types/pagination";

export interface AuditLog {
  id: number;
  user_id: number | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  branch_id: number | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  meta_json: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditFilters {
  q?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  userId?: string;
  branchId?: string;
  /** yyyy-mm-dd, local day */
  fromDate?: string;
  toDate?: string;
}

/** Day boundaries in the user's time zone, as the instants the API compares against. */
function startOfDay(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}
function endOfDay(day: string): string {
  return new Date(`${day}T23:59:59.999`).toISOString();
}

/** The filter part of the query, shared by the table and the CSV export so they always match. */
export function auditFilterParams(filters: AuditFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.action) params.set("action", filters.action);
  if (filters.resourceType) params.set("resource_type", filters.resourceType);
  if (filters.resourceId) params.set("resource_id", filters.resourceId);
  if (filters.userId) params.set("user_id", filters.userId);
  if (filters.branchId) params.set("branch_id", filters.branchId);
  if (filters.fromDate) params.set("from_date", startOfDay(filters.fromDate));
  if (filters.toDate) params.set("to_date", endOfDay(filters.toDate));
  return params;
}

export function useAuditLogsQuery(filters: AuditFilters) {
  return useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: async () => {
      const params = auditFilterParams(filters);
      params.set("page", "1");
      params.set("page_size", "100");
      params.set("sort", "created_at");
      params.set("order", "desc");
      const page = await apiClient.get<Paginated<AuditLog>>(`/admin/audit-logs?${params.toString()}`);
      return page.items;
    },
    staleTime: 10_000,
  });
}

export async function downloadAuditCsv(filters: AuditFilters): Promise<void> {
  const params = auditFilterParams(filters);
  params.set("export", "csv");
  const text = await requestText(`/admin/audit-logs?${params.toString()}`);
  const url = URL.createObjectURL(new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "auditoria.csv";
  link.click();
  URL.revokeObjectURL(url);
}
