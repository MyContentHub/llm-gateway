import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

interface KeyRateLimits {
  rpm: number;
  tpm: number;
  rpd: number;
}

interface VirtualKey {
  id: string;
  name: string;
  key_prefix?: string;
  rateLimits: KeyRateLimits;
  createdAt: string;
  revokedAt: string | null;
  key?: string;
}

interface KeysResponse {
  keys: VirtualKey[];
  total: number;
  offset?: number;
  limit?: number;
}

export type { VirtualKey, KeyRateLimits, KeysResponse };

export function useKeys(offset = 0, limit = 20) {
  return useQuery({
    queryKey: ["keys", offset, limit],
    queryFn: () =>
      apiClient.get<KeysResponse>(`/admin/keys?offset=${offset}&limit=${limit}`),
  });
}

export function useCreateKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; rateLimits?: KeyRateLimits }) =>
      apiClient.post<VirtualKey>("/admin/keys", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["keys"] });
    },
  });
}

export function useUpdateKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      rateLimits?: KeyRateLimits;
    }) => apiClient.patch<VirtualKey>(`/admin/keys/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["keys"] });
    },
  });
}

export function useRevokeKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.del(`/admin/keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["keys"] });
    },
  });
}
