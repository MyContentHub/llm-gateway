import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export interface AuditLogRow {
  id: number;
  request_id: string;
  timestamp: string;
  api_key_id: string;
  model: string;
  endpoint: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  latency_ms: number;
  status: "success" | "error" | "blocked";
  pii_detected: 0 | 1;
  pii_types_found: string | null;
  prompt_injection_score: number;
  content_hash_sha256: string;
  request_body?: string | null;
  response_body?: string | null;
  request_body_truncated?: number;
  response_body_truncated?: number;
}

interface AuditLogsResponse {
  logs: AuditLogRow[];
  total: number;
  limit: number;
  offset: number;
}

interface AuditStatsResponse {
  models: string[];
}

export interface AuditFilters {
  offset?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  model?: string;
  status?: string;
  endpoint?: string;
  api_key_id?: string;
}

export function useAuditLogs(filters: AuditFilters) {
  const params = new URLSearchParams();
  const entries: [string, string | number | undefined][] = Object.entries(filters);
  for (const [k, v] of entries) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  return useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: () =>
      apiClient.get<AuditLogsResponse>(`/admin/audit/logs?${params.toString()}`),
  });
}

export function useAuditLogDetail(requestId: string | null) {
  return useQuery({
    queryKey: ["audit-log-detail", requestId],
    queryFn: () =>
      apiClient.get<AuditLogRow>(`/admin/audit/logs/${requestId}`),
    enabled: !!requestId,
  });
}

export function useAuditModels(startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  return useQuery({
    queryKey: ["audit-models", startDate, endDate],
    queryFn: () =>
      apiClient.get<AuditStatsResponse>(`/admin/audit/stats?${params.toString()}`),
  });
}
