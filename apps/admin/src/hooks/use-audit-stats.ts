import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export interface AuditStats {
  totalRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  byModel: Record<string, { count: number; tokens: number; costUsd: number }>;
  byStatus: Record<string, number>;
  piiDetectionRate: number;
}

export function useAuditStats(startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  const qs = params.toString();
  return useQuery({
    queryKey: ["audit-stats", startDate, endDate],
    queryFn: () =>
      apiClient.get<AuditStats>(`/admin/audit/stats${qs ? `?${qs}` : ""}`),
    refetchOnMount: "always",
  });
}
