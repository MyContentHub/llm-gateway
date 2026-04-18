import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

interface SecurityStats {
  blockedRequests: number;
  piiDetections: { total: number; byType: Record<string, number> };
  injectionAttempts: { total: number; avgScore: number; scoreDistribution: Record<string, number> };
  contentFilter: { allowed: number; flagged: number; blocked: number };
}

export function useSecurityStats(startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  const qs = params.toString();
  return useQuery({
    queryKey: ["security-stats", startDate, endDate],
    queryFn: () => apiClient.get<SecurityStats>(`/admin/audit/security${qs ? `?${qs}` : ""}`),
  });
}

export function useBlockedLogs() {
  return useQuery({
    queryKey: ["blocked-logs"],
    queryFn: () =>
      apiClient.get<{ logs: BlockedLog[] }>(
        "/admin/audit/logs?status=blocked&limit=20",
      ),
  });
}

export interface BlockedLog {
  id: number;
  request_id: string;
  timestamp: string;
  model: string;
  status: string;
  pii_detected: 0 | 1;
  pii_types_found: string | null;
  prompt_injection_score: number;
}

export type { SecurityStats };
