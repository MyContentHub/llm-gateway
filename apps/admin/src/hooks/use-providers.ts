import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

interface Provider {
  name: string;
  baseUrl: string;
  keyStrategy: string;
  keyCount: number;
  modelMappings: Record<string, string>;
  isDefault: boolean;
}

interface ProviderHealthKey {
  id: string;
  avgLatency: number;
  consecutiveErrors: number;
  isHealthy: boolean;
}

interface ProviderHealth {
  name: string;
  keys: ProviderHealthKey[];
}

interface ProvidersResponse {
  providers: Provider[];
}

interface ProvidersHealthResponse {
  providers: ProviderHealth[];
}

export type { Provider, ProviderHealth, ProviderHealthKey, ProvidersResponse, ProvidersHealthResponse };

export function useProviders() {
  return useQuery({
    queryKey: ["providers"],
    queryFn: () => apiClient.get<ProvidersResponse>("/admin/providers"),
  });
}

export function useProvidersHealth() {
  return useQuery({
    queryKey: ["providers-health"],
    queryFn: () => apiClient.get<ProvidersHealthResponse>("/admin/providers/health"),
    refetchInterval: 30000,
  });
}
