import { useState, useMemo } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type CellContext,
  type AccessorFn,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Download, Loader2, CalendarIcon, AlertCircle, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { PageHeader } from "@/components/layout/page-header";
import {
  useAuditLogs,
  useAuditModels,
  type AuditLogRow,
  type AuditFilters,
} from "@/hooks/use-audit-logs";
import { formatDate, formatUsd, formatMs, cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { InjectionScoreBar } from "@/components/injection-score-bar";
import { DetailDrawer } from "./audit/detail-drawer";
import { exportAuditCsv } from "./audit/export";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export function AuditPage() {
  const [page, setPage] = useState(0);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
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
      startDate: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
      endDate: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
      model: modelFilter || undefined,
      status: statusFilter || undefined,
    }),
    [page, startDate, endDate, modelFilter, statusFilter],
  );

  const { data, isLoading } = useAuditLogs(filters);
  const { data: modelsData } = useAuditModels(
    startDate ? format(startDate, "yyyy-MM-dd") : undefined,
    endDate ? format(endDate, "yyyy-MM-dd") : undefined,
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
        cell: (info: CellContext<AuditLogRow, string>) => {
          const val = info.getValue();
          return (
            <code className="text-xs" title={val}>
              {val ? `${val.slice(0, 8)}...` : "—"}
            </code>
          );
        },
      }),
      columnHelper.accessor("api_key_id", {
        header: "Key",
        cell: (info: CellContext<AuditLogRow, string>) => {
          const val = info.getValue();
          return (
            <code className="text-xs" title={val}>
              {val ? `${val.slice(0, 8)}...` : "—"}
            </code>
          );
        },
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
      startDate: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
      endDate: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
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
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-9 w-[180px] justify-start text-left font-normal",
                    !startDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "MMM dd, yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => {
                    setStartDate(date);
                    setPage(0);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">End Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-9 w-[180px] justify-start text-left font-normal",
                    !endDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "MMM dd, yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(date) => {
                    setEndDate(date);
                    setPage(0);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Model</label>
            <Select
              value={modelFilter || "__all__"}
              onValueChange={(value) => {
                setModelFilter(value === "__all__" ? "" : value);
                setPage(0);
              }}
            >
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="All models" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All models</SelectItem>
                {modelsData?.models?.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select
              value={statusFilter || "__all__"}
              onValueChange={(value) => {
                setStatusFilter(value === "__all__" ? "" : value);
                setPage(0);
              }}
            >
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All statuses</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>
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
