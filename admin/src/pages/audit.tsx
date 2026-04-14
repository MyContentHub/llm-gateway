import { useState, useMemo } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type CellContext,
  type AccessorFn,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  useAuditLogs,
  useAuditModels,
  type AuditLogRow,
  type AuditFilters,
} from "@/hooks/use-audit-logs";
import { formatDate, formatUsd, formatMs, cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { DetailDrawer } from "./audit/detail-drawer";
import { exportAuditCsv } from "./audit/export";
import { AlertCircle, AlertTriangle } from "lucide-react";

const PAGE_SIZE = 50;

function PiiBadge({ detected, types }: { detected: 0 | 1; types: string | null }) {
  if (!detected) return <span className="text-muted-foreground">-</span>;
  let parsed: string[] = [];
  if (types) {
    try {
      parsed = JSON.parse(types);
    } catch {
      parsed = [];
    }
  }
  return (
    <span
      className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium cursor-default"
      title={parsed.length > 0 ? parsed.join(", ") : "PII detected"}
    >
      PII{parsed.length > 0 && ` (${parsed.length})`}
    </span>
  );
}

function InjectionScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    score > 0.7 ? "bg-red-500" : score > 0.3 ? "bg-orange-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

export function AuditPage() {
  const [page, setPage] = useState(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportWarning, setExportWarning] = useState<string | null>(null);

  const filters: AuditFilters = useMemo(
    () => ({
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      model: modelFilter || undefined,
      status: statusFilter || undefined,
    }),
    [page, startDate, endDate, modelFilter, statusFilter],
  );

  const { data, isLoading } = useAuditLogs(filters);
  const { data: modelsData } = useAuditModels(
    startDate || undefined,
    endDate || undefined,
  );

  const columnHelper = createColumnHelper<AuditLogRow>();
  const columns = useMemo(
    () => [
      columnHelper.accessor("timestamp", {
        header: "Time",
        cell: (info: CellContext<AuditLogRow, string>) => (
          <span className="text-xs whitespace-nowrap">
            {formatDate(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("request_id", {
        header: "Request ID",
        cell: (info: CellContext<AuditLogRow, string>) => (
          <code className="text-xs" title={info.getValue()}>
            {info.getValue().slice(0, 8)}...
          </code>
        ),
      }),
      columnHelper.accessor("api_key_id", {
        header: "Key",
        cell: (info: CellContext<AuditLogRow, string>) => (
          <code className="text-xs" title={info.getValue()}>
            {info.getValue().slice(0, 8)}...
          </code>
        ),
      }),
      columnHelper.accessor("model", {
        header: "Model",
        cell: (info: CellContext<AuditLogRow, string>) => (
          <span className="text-sm font-medium">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor(
        ((row: AuditLogRow) => row.prompt_tokens + row.completion_tokens) as AccessorFn<AuditLogRow, number>,
        {
          id: "tokens",
          header: "Tokens",
          cell: (info: CellContext<AuditLogRow, number>) => (
            <span className="text-xs tabular-nums">{info.getValue().toLocaleString()}</span>
          ),
        },
      ),
      columnHelper.accessor("cost_usd", {
        header: "Cost",
        cell: (info: CellContext<AuditLogRow, number>) => (
          <span className="text-xs tabular-nums">{formatUsd(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor("latency_ms", {
        header: "Latency",
        cell: (info: CellContext<AuditLogRow, number>) => (
          <span className="text-xs tabular-nums">{formatMs(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info: CellContext<AuditLogRow, string>) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor("pii_detected", {
        header: "PII",
        cell: (info: CellContext<AuditLogRow, 0 | 1>) => (
          <PiiBadge
            detected={info.getValue()}
            types={info.row.original.pii_types_found}
          />
        ),
      }),
      columnHelper.accessor("prompt_injection_score", {
        header: "Injection",
        cell: (info: CellContext<AuditLogRow, number>) => <InjectionScoreBar score={info.getValue()} />,
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: data?.logs ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: data ? Math.ceil(data.total / PAGE_SIZE) : -1,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  function handleRowClick(log: AuditLogRow) {
    setSelectedLog(log);
    setDrawerOpen(true);
  }

  const exportFilters: Record<string, string | undefined> = useMemo(
    () => ({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      model: modelFilter || undefined,
      status: statusFilter || undefined,
    }),
    [startDate, endDate, modelFilter, statusFilter],
  );

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    setExportWarning(null);
    try {
      const result = await exportAuditCsv(exportFilters);
      if (result.truncated) {
        setExportWarning(
          `Export capped at ${result.maxRows.toLocaleString()} rows. Apply tighter filters to export all results.`,
        );
      }
    } catch {
      setExportError("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Audit Logs" />
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(0);
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(0);
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Model</label>
            <select
              value={modelFilter}
              onChange={(e) => {
                setModelFilter(e.target.value);
                setPage(0);
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">All models</option>
              {modelsData?.models?.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">All statuses</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 ml-auto"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export CSV
          </button>
        </div>
        {exportError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {exportError}
          </div>
        )}
        {exportWarning && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {exportWarning}
          </div>
        )}

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.logs.length ? (
            <div className="py-20 text-center text-muted-foreground">
              No audit logs found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b border-border bg-muted/50">
                      {hg.headers.map((header) => (
                        <th
                          key={header.id}
                          className="px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap"
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => handleRowClick(row.original)}
                      className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2.5">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}-
              {Math.min((page + 1) * PAGE_SIZE, data?.total ?? 0)} of{" "}
              {data?.total ?? 0}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <DetailDrawer
        log={selectedLog}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
