import { useRef, useState, useCallback } from "react";
import { X, ChevronDown, ChevronRight, AlertTriangle, Loader2 } from "lucide-react";
import type { AuditLogRow } from "@/hooks/use-audit-logs";
import { useAuditLogDetail } from "@/hooks/use-audit-logs";
import { formatDate, formatUsd, formatMs } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { InjectionScoreBar } from "@/components/injection-score-bar";
import { JsonModal, JsonValue } from "./json-modal";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
          {t("audit.detail.pii.yes")}
        </span>
        {uniqueTypes.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {t("audit.detail.pii.typesFound", { count: uniqueTypes.length })}
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
            {expanded ? t("audit.detail.pii.hideDetails") : t("audit.detail.pii.showDetails")}
          </button>
          {expanded && (
            <div className="bg-muted/50 rounded-md p-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {t("audit.detail.pii.typeBreakdown")}
              </p>
              <div className="space-y-1">
                {uniqueTypes.map((type) => (
                  <div
                    key={type}
                    className="flex items-center justify-between text-xs"
                  >
                    <PIITypeBadge type={type} />
                    <span className="text-muted-foreground">
                      {t("audit.detail.pii.occurrence", { count: typeCounts[type] })}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/70 italic mt-2">
                {t("audit.detail.pii.securityNote")}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

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
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (body === null || body === undefined) {
    return (
      <div className="space-y-1">
        <dt className="text-xs font-medium text-muted-foreground">{title}</dt>
        <dd className="text-sm text-muted-foreground/60 italic">{nullMessage}</dd>
      </div>
    );
  }

  let parsed: unknown = null;
  try { parsed = JSON.parse(body); } catch {}

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
          {expanded ? t("audit.detail.body.collapse") : t("audit.detail.body.expandPreview")}
        </button>
        {expanded && (
          <div className="space-y-2">
            {truncated === 1 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                <span>{t("audit.detail.body.truncationWarning")}</span>
              </div>
            )}
            <div className="bg-muted/50 rounded-md p-3 overflow-x-auto max-h-64 overflow-y-auto">
              <pre className="font-mono text-xs leading-relaxed whitespace-pre">
                {parsed !== null ? <JsonValue value={parsed} /> : body}
              </pre>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onOpenModal}
          className="text-xs text-primary hover:underline"
        >
          {t("audit.detail.body.viewFull")}
        </button>
      </dd>
    </div>
  );
}

type ModalTarget = "request" | "response" | null;

export function DetailDrawer({ log, open, onClose }: DetailDrawerProps) {
  const { t } = useTranslation();
  const drawerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(drawerRef, open, onClose);
  const [modalTarget, setModalTarget] = useState<ModalTarget>(null);

  const { data: detail } = useAuditLogDetail(open ? log?.request_id ?? null : null);

  const openModal = useCallback((target: ModalTarget) => setModalTarget(target), []);
  const closeModal = useCallback(() => setModalTarget(null), []);

  if (!log || !open) return null;

  const fullLog = detail ?? log;
  const loadingBody = open && !detail;

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
      ? t("audit.detail.body.requestBlocked")
      : t("audit.detail.body.contentExpired");

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />
      <div ref={drawerRef} className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-card shadow-xl border-l border-border overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-border bg-card">
          <h2 className="text-lg font-semibold text-foreground">{t("audit.detail.title")}</h2>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <dl className="p-4 space-y-4">
          <Field label={t("audit.detail.field.requestId")}>
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{log.request_id}</code>
          </Field>
          <Field label={t("audit.detail.field.timestamp")}>{formatDate(log.timestamp)}</Field>
          <Field label={t("audit.detail.field.status")}>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                statusColors[log.status] ?? "bg-gray-100 text-gray-800",
              )}
            >
              {log.status}
            </span>
          </Field>
          <Field label={t("audit.detail.field.apiKeyId")}>
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{log.api_key_id}</code>
          </Field>
          <Field label={t("audit.detail.field.model")}>{log.model}</Field>
          <Field label={t("audit.detail.field.endpoint")}>{log.endpoint}</Field>
          <Field label={t("audit.detail.field.promptTokens")}>{log.prompt_tokens.toLocaleString()}</Field>
          <Field label={t("audit.detail.field.completionTokens")}>{log.completion_tokens.toLocaleString()}</Field>
          <Field label={t("audit.detail.field.cost")}>{formatUsd(log.cost_usd)}</Field>
          <Field label={t("audit.detail.field.latency")}>{formatMs(log.latency_ms)}</Field>
          <Field label={t("audit.detail.field.piiDetected")}>
            {log.pii_detected ? (
              <PIIDetectedDisplay piiTypes={piiTypes} />
            ) : (
              <span className="text-muted-foreground">{t("audit.detail.pii.no")}</span>
            )}
          </Field>
          <Field label={t("audit.detail.field.injectionScore")}>
            <InjectionScoreBar score={log.prompt_injection_score} />
          </Field>
          {loadingBody ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <BodySection
                title={t("audit.detail.body.requestBody")}
                body={fullLog.request_body}
                truncated={fullLog.request_body_truncated}
                endpoint={fullLog.endpoint}
                nullMessage={t("audit.detail.body.contentExpired")}
                onOpenModal={() => openModal("request")}
              />
              <BodySection
                title={t("audit.detail.body.responseBody")}
                body={fullLog.response_body}
                truncated={fullLog.response_body_truncated}
                nullMessage={responseBodyNullMessage}
                onOpenModal={() => openModal("response")}
              />
            </>
          )}
          <Field label={t("audit.detail.field.contentHash")}>
            <code className="text-xs bg-muted px-1 py-0.5 rounded break-all">
              {log.content_hash_sha256}
            </code>
          </Field>
        </dl>
      </div>
      <JsonModal
        open={modalTarget === "request"}
        onClose={closeModal}
        title={t("audit.detail.body.requestBody")}
        content={fullLog.request_body ?? null}
      />
      <JsonModal
        open={modalTarget === "response"}
        onClose={closeModal}
        title={t("audit.detail.body.responseBody")}
        content={fullLog.response_body ?? null}
      />
    </>
  );
}
