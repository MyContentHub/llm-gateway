import { useRef, useState, useCallback } from "react";
import { X, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import type { AuditLogRow } from "@/hooks/use-audit-logs";
import { formatDate, formatUsd, formatMs } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { InjectionScoreBar } from "@/components/injection-score-bar";
import { JsonModal } from "./json-modal";

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

const PII_TYPE_COLORS: Record<string, string> = {
  EMAIL: "bg-blue-100 text-blue-800",
  PHONE: "bg-purple-100 text-purple-800",
  SSN: "bg-red-100 text-red-800",
  CREDIT_CARD: "bg-orange-100 text-orange-800",
  IP_ADDRESS: "bg-cyan-100 text-cyan-800",
  DATE: "bg-green-100 text-green-800",
  ADDRESS: "bg-amber-100 text-amber-800",
  NAME: "bg-pink-100 text-pink-800",
  URL: "bg-indigo-100 text-indigo-800",
};

function PIITypeBadge({ type }: { type: string }) {
  const colorClass = PII_TYPE_COLORS[type] ?? "bg-gray-100 text-gray-800";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        colorClass,
      )}
    >
      {type}
    </span>
  );
}

function PIIDetectedDisplay({ piiTypes }: { piiTypes: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const typeCounts = piiTypes.reduce(
    (acc, type) => {
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const uniqueTypes = Object.keys(typeCounts);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">
          Yes
        </span>
        {uniqueTypes.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {uniqueTypes.length} type{uniqueTypes.length !== 1 ? "s" : ""} found
          </span>
        )}
      </div>
      {uniqueTypes.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {uniqueTypes.map((type) => (
              <PIITypeBadge key={type} type={type} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {expanded ? "Hide details" : "Show details"}
          </button>
          {expanded && (
            <div className="bg-muted/50 rounded-md p-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Type breakdown
              </p>
              <div className="space-y-1">
                {uniqueTypes.map((type) => (
                  <div
                    key={type}
                    className="flex items-center justify-between text-xs"
                  >
                    <PIITypeBadge type={type} />
                    <span className="text-muted-foreground">
                      {typeCounts[type]} occurrence{typeCounts[type] !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/70 italic mt-2">
                Note: Actual PII values are not stored for security reasons.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const PREVIEW_CAP = 2000;

function BodySection({
  title,
  body,
  truncated,
  endpoint,
  nullMessage,
  onOpenModal,
}: {
  title: string;
  body: string | null | undefined;
  truncated: number | undefined;
  endpoint?: string;
  nullMessage: string;
  onOpenModal: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (body === null || body === undefined) {
    return (
      <div className="space-y-1">
        <dt className="text-xs font-medium text-muted-foreground">{title}</dt>
        <dd className="text-sm text-muted-foreground/60 italic">{nullMessage}</dd>
      </div>
    );
  }

  let preview = body;
  try {
    preview = JSON.stringify(JSON.parse(body), null, 2);
  } catch {}
  const isOverCap = preview.length > PREVIEW_CAP;
  const displayPreview = isOverCap ? preview.slice(0, PREVIEW_CAP) : preview;

  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium text-muted-foreground">{title}</dt>
      <dd className="text-sm text-foreground space-y-2">
        {endpoint && (
          <div className="flex items-center gap-2">
            <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{endpoint}</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {expanded ? "收起" : "展开预览"}
        </button>
        {expanded && (
          <div className="space-y-2">
            {truncated === 1 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                <span>内容已被截断（超过 128KB）</span>
              </div>
            )}
            <pre className="bg-muted/50 rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
              {displayPreview}
              {isOverCap && <span className="text-muted-foreground">...</span>}
            </pre>
          </div>
        )}
        <button
          type="button"
          onClick={onOpenModal}
          className="text-xs text-primary hover:underline"
        >
          查看完整内容
        </button>
      </dd>
    </div>
  );
}

type ModalTarget = "request" | "response" | null;

export function DetailDrawer({ log, open, onClose }: DetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(drawerRef, open, onClose);
  const [modalTarget, setModalTarget] = useState<ModalTarget>(null);

  const openModal = useCallback((target: ModalTarget) => setModalTarget(target), []);
  const closeModal = useCallback(() => setModalTarget(null), []);

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

  const responseBodyNullMessage =
    log.status === "blocked"
      ? "请求被拦截，无响应内容"
      : "Content expired (retained for 7 days)";

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
              <PIIDetectedDisplay piiTypes={piiTypes} />
            ) : (
              <span className="text-muted-foreground">No</span>
            )}
          </Field>
          <Field label="Injection Score">
            <InjectionScoreBar score={log.prompt_injection_score} />
          </Field>
          <BodySection
            title="Request Body"
            body={log.request_body}
            truncated={log.request_body_truncated}
            endpoint={log.endpoint}
            nullMessage="Content expired (retained for 7 days)"
            onOpenModal={() => openModal("request")}
          />
          <BodySection
            title="Response Body"
            body={log.response_body}
            truncated={log.response_body_truncated}
            nullMessage={responseBodyNullMessage}
            onOpenModal={() => openModal("response")}
          />
          <Field label="Content Hash">
            <code className="text-xs bg-muted px-1 py-0.5 rounded break-all">
              {log.content_hash_sha256}
            </code>
          </Field>
        </dl>
      </div>
      <JsonModal
        open={modalTarget === "request"}
        onClose={closeModal}
        title="Request Body"
        content={log.request_body ?? null}
      />
      <JsonModal
        open={modalTarget === "response"}
        onClose={closeModal}
        title="Response Body"
        content={log.response_body ?? null}
      />
    </>
  );
}
