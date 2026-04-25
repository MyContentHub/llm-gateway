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

export interface ExportResult {
  truncated: boolean;
  maxRows: number;
}

const MAX_ROWS = 50000;

export async function exportAuditCsv(
  filters: Record<string, string | number | undefined>,
): Promise<ExportResult> {
  const PAGE_SIZE = 200;
  let offset = 0;
  let hasMore = true;
  let totalRows = 0;
  const parts: string[] = [COLUMNS.join(",") + "\n"];

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

    const remaining = MAX_ROWS - totalRows;
    const pageRows = remaining < res.logs.length
      ? res.logs.slice(0, remaining)
      : res.logs;

    if (pageRows.length > 0) {
      parts.push(pageRows.map(rowToCsv).join("\n"));
    }

    totalRows += pageRows.length;
    offset += res.logs.length;

    if (totalRows >= MAX_ROWS) {
      hasMore = false;
    } else if (offset >= res.total || res.logs.length === 0) {
      hasMore = false;
    }
  }

  const truncated = totalRows >= MAX_ROWS;

  const blob = new Blob(parts, { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { truncated, maxRows: MAX_ROWS };
}
