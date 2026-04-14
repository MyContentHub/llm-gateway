import { useRef } from "react";
import { X } from "lucide-react";
import type { AuditLogRow } from "@/hooks/use-audit-logs";
import { formatDate, formatUsd, formatMs } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/hooks/use-focus-trap";

interface DetailDrawerProps {
  log: AuditLogRow | null;
  open: boolean;
  onClose: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

function ScoreBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value > 0.7 ? "bg-red-500" : value > 0.3 ? "bg-orange-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function DetailDrawer({ log, open, onClose }: DetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(drawerRef, open, onClose);

  if (!log || !open) return null;

  let piiTypes: string[] = [];
  if (log.pii_types_found) {
    try {
      piiTypes = JSON.parse(log.pii_types_found);
    } catch {
      piiTypes = [];
    }
  }

  const statusColors: Record<string, string> = {
    success: "bg-green-100 text-green-800",
    error: "bg-red-100 text-red-800",
    blocked: "bg-orange-100 text-orange-800",
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />
      <div ref={drawerRef} className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-card shadow-xl border-l border-border overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-border bg-card">
          <h2 className="text-lg font-semibold text-foreground">Log Detail</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <dl className="p-4 space-y-4">
          <Field label="Request ID">
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{log.request_id}</code>
          </Field>
          <Field label="Timestamp">{formatDate(log.timestamp)}</Field>
          <Field label="Status">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                statusColors[log.status] ?? "bg-gray-100 text-gray-800",
              )}
            >
              {log.status}
            </span>
          </Field>
          <Field label="API Key ID">
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{log.api_key_id}</code>
          </Field>
          <Field label="Model">{log.model}</Field>
          <Field label="Endpoint">{log.endpoint}</Field>
          <Field label="Prompt Tokens">{log.prompt_tokens.toLocaleString()}</Field>
          <Field label="Completion Tokens">{log.completion_tokens.toLocaleString()}</Field>
          <Field label="Cost">{formatUsd(log.cost_usd)}</Field>
          <Field label="Latency">{formatMs(log.latency_ms)}</Field>
          <Field label="PII Detected">
            {log.pii_detected ? (
              <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">
                Yes {piiTypes.length > 0 && `(${piiTypes.join(", ")})`}
              </span>
            ) : (
              <span className="text-muted-foreground">No</span>
            )}
          </Field>
          <Field label="Injection Score">
            <ScoreBar value={log.prompt_injection_score} />
          </Field>
          <Field label="Content Hash">
            <code className="text-xs bg-muted px-1 py-0.5 rounded break-all">
              {log.content_hash_sha256}
            </code>
          </Field>
        </dl>
      </div>
    </>
  );
}
