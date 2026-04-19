import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  total?: number;
  pageSize?: number;
  page: number;
  onPageChange: (page: number) => void;
  emptyMessage?: string;
}

export function DataTable<T>({
  data,
  columns,
  total = 0,
  pageSize = 20,
  page,
  onPageChange,
  emptyMessage,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr
                key={hg.id}
                className="border-b border-border bg-muted/50"
              >
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                  >
                    {h.isPlaceholder
                      ? null
                      : flexRender(
                          h.column.columnDef.header,
                          h.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border hover:bg-muted/30 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-4 py-3 text-sm text-foreground"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage ?? t("dataTable.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-4">
          <span className="text-sm text-muted-foreground">
            {t("dataTable.page", { page: page + 1, total: totalPages })}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
              className={cn(
                "inline-flex items-center justify-center rounded-md border border-border bg-background px-2 py-1 text-sm hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
              )}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
              className={cn(
                "inline-flex items-center justify-center rounded-md border border-border bg-background px-2 py-1 text-sm hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
