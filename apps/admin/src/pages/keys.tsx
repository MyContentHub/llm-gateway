import { useState, useRef } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2, Copy, Check, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/data-table";
import {
  useKeys,
  useRevokeKey,
} from "@/hooks/use-keys";
import type { VirtualKey } from "@/hooks/use-keys";
import { formatRelativeDate } from "@/lib/utils";
import { CreateKeyDialog } from "./keys/create-dialog";
import { EditKeySheet } from "./keys/edit-sheet";
import { useFocusTrap } from "@/hooks/use-focus-trap";

function KeyDisplayDialog({
  keyValue,
  onClose,
}: {
  keyValue: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true, onClose);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(keyValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silently fail
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div ref={dialogRef} className="relative z-50 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            {t("keys.dialogs.display.title")}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          {t("keys.dialogs.display.copyInstruction")}
        </p>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 p-3">
          <code className="flex-1 text-sm font-mono text-foreground break-all">
            {keyValue}
          </code>
          <button
            onClick={handleCopy}
            aria-label={t("keys.dialogs.display.copyButton")}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {t("common.done")}
          </button>
        </div>
      </div>
    </div>
  );
}

function RevokeDialog({
  open,
  onOpenChange,
  virtualKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  virtualKey: VirtualKey | null;
}) {
  const { t } = useTranslation();
  const revokeKey = useRevokeKey();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, () => onOpenChange(false));

  if (!open || !virtualKey) return null;

  const handleRevoke = async () => {
    try {
      await revokeKey.mutateAsync(virtualKey.id);
      onOpenChange(false);
    } catch {
      // error handled by mutation state
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div ref={dialogRef} className="relative z-50 w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-foreground mb-2">
          {t("keys.dialogs.revoke.title")}
        </h2>
        <p className="text-sm text-muted-foreground mb-1">
          {t("keys.dialogs.revoke.confirmMessage", { name: virtualKey.name }).split(virtualKey.name).map((part, i, arr) => (
            i < arr.length - 1 ? (
              <span key={i}>
                {part}<span className="font-medium text-foreground">{virtualKey.name}</span>
              </span>
            ) : part
          ))}
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          {t("keys.dialogs.revoke.cannotUndo")}
        </p>
        {revokeKey.isError && (
          <p className="text-sm text-red-500 mb-4">
            {(revokeKey.error as Error)?.message || t("keys.dialogs.revoke.error")}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleRevoke}
            disabled={revokeKey.isPending}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {revokeKey.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
            ) : (
              t("keys.dialogs.revoke.revokeButton")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function KeysPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const { data, isLoading } = useKeys(page * pageSize, pageSize);

  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<VirtualKey | null>(null);
  const [revokeKey, setRevokeKey] = useState<VirtualKey | null>(null);

  const columns: ColumnDef<VirtualKey>[] = [
    {
      accessorKey: "name",
      header: t("keys.table.name"),
      cell: ({ getValue }) => (
        <span className="font-medium text-foreground">{getValue() as string}</span>
      ),
    },
    {
      accessorKey: "key_prefix",
      header: t("keys.table.prefix"),
      cell: ({ getValue }) => {
        const prefix = getValue() as string | undefined;
        return (
          <span className="font-mono text-xs text-muted-foreground">
            {prefix ?? "gwk_****"}
          </span>
        );
      },
    },
    {
      id: "rateLimits",
      header: t("keys.table.rateLimits"),
      cell: ({ row }) => {
        const rl = row.original.rateLimits;
        if (!rl || (!rl.rpm && !rl.tpm && !rl.rpd)) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex gap-1.5">
            {rl.rpm ? (
              <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {rl.rpm} RPM
              </span>
            ) : null}
            {rl.tpm ? (
              <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {rl.tpm} TPM
              </span>
            ) : null}
            {rl.rpd ? (
              <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {rl.rpd} RPD
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: t("keys.table.created"),
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">
          {formatRelativeDate(getValue() as string)}
        </span>
      ),
    },
    {
      id: "status",
      header: t("keys.table.status"),
      cell: ({ row }) => {
        const revoked = row.original.revokedAt;
        return revoked ? (
          <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
            {t("keys.status.revoked")}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
            {t("keys.status.active")}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const k = row.original;
        const revoked = !!k.revokedAt;
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditKey(k)}
              disabled={revoked}
              aria-label={t("keys.actions.edit")}
              className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={t("keys.actions.edit")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {!revoked && (
              <button
                onClick={() => setRevokeKey(k)}
                aria-label={t("keys.actions.revoke")}
                className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                title={t("keys.actions.revoke")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title={t("keys.title")} />
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("keys.createButton")}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable<VirtualKey>
          data={data?.keys ?? []}
          columns={columns}
          total={data?.total ?? 0}
          pageSize={pageSize}
          page={page}
          onPageChange={setPage}
          emptyMessage={t("keys.empty")}
        />
      )}

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(k) => {
          if (k.key) setCreatedKey(k.key);
        }}
      />

      <EditKeySheet
        open={!!editKey}
        onOpenChange={(open) => {
          if (!open) setEditKey(null);
        }}
        virtualKey={editKey}
      />

      <RevokeDialog
        open={!!revokeKey}
        onOpenChange={(open) => {
          if (!open) setRevokeKey(null);
        }}
        virtualKey={revokeKey}
      />

      {createdKey ? (
        <KeyDisplayDialog
          keyValue={createdKey}
          onClose={() => setCreatedKey(null)}
        />
      ) : null}
    </div>
  );
}
