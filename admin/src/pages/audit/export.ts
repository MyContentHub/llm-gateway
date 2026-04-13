import { apiClient } from "@/lib/api-client";
import type { AuditLogRow } from "@/hooks/use-audit-logs";
import { formatDate, formatUsd, formatMs } from "@/lib/utils";

const COLUMNS = [
  "ID",
  "Request ID",
  "Timestamp",
  "API Key ID",
  "Model",
  "Endpoint",
  "Prompt Tokens",
  "Completion Tokens",
  "Cost (USD)",
  "Latency",
  "Status",
  "PII Detected",
  "PII Types",
  "Injection Score",
  "Content Hash",
] as const;

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowToCsv(row: AuditLogRow): string {
  const piiTypes = row.pii_types_found
    ? (() => {
        try {
          return JSON.parse(row.pii_types_found).join("; ");
        } catch {
          return row.pii_types_found;
        }
      })()
    : "";
  const values = [
    String(row.id),
    row.request_id,
    formatDate(row.timestamp),
    row.api_key_id,
    row.model,
    row.endpoint,
    String(row.prompt_tokens),
    String(row.completion_tokens),
    formatUsd(row.cost_usd),
    formatMs(row.latency_ms),
    row.status,
    row.pii_detected ? "Yes" : "No",
    piiTypes,
    String(row.prompt_injection_score),
    row.content_hash_sha256,
  ];
  return values.map(escapeCsv).join(",");
}

export async function exportAuditCsv(
  filters: Record<string, string | number | undefined>,
): Promise<void> {
  const PAGE_SIZE = 200;
  let offset = 0;
  let hasMore = true;
  const allRows: AuditLogRow[] = [];

  while (hasMore) {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== "") params.set(k, String(v));
    }
    const res = await apiClient.get<{
      logs: AuditLogRow[];
      total: number;
    }>(`/admin/audit/logs?${params.toString()}`);
    allRows.push(...res.logs);
    offset += res.logs.length;
    if (offset >= res.total || res.logs.length === 0) hasMore = false;
  }

  const header = COLUMNS.join(",");
  const rows = allRows.map(rowToCsv).join("\n");
  const csv = `${header}\n${rows}`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
