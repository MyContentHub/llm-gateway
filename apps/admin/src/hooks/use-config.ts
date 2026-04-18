import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

interface SecurityConfig {
  injection_threshold: number;
  blocked_pii_types: string[];
  flagged_pii_types: string[];
}

interface RetryConfig {
  max_retries: number;
  initial_delay_ms: number;
  max_delay_ms: number;
  backoff_multiplier: number;
}

interface Config {
  port: number;
  host: string;
  log_level: string;
  default_rpm: number;
  default_tpm: number;
  default_rpd: number;
  security: SecurityConfig;
  retry: RetryConfig;
}

export type { Config, SecurityConfig, RetryConfig };

export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => apiClient.get<Config>("/admin/config"),
  });
}
