import { useState, useCallback } from "react";
import { X, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

interface JsonModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string | null;
}

function tryParseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function JsonKey({ name }: { name: string }) {
  return <span className="text-purple-700 dark:text-purple-400">{name}</span>;
}

function JsonString({ value }: { value: string }) {
  const truncated = value.length > 300;
  const [expanded, setExpanded] = useState(!truncated);
  if (!truncated) {
    return <span className="text-green-700 dark:text-green-400">{JSON.stringify(value)}</span>;
  }
  return (
    <span>
      <span className="text-green-700 dark:text-green-400">
        {expanded ? JSON.stringify(value) : `"${value.slice(0, 200)}…"`}
      </span>
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="ml-1 text-xs text-primary hover:underline"
        >
          +{value.length - 200}
        </button>
      )}
    </span>
  );
}

function JsonNumber({ value }: { value: number }) {
  return <span className="text-blue-700 dark:text-blue-400">{String(value)}</span>;
}

function JsonBool({ value }: { value: boolean }) {
  return <span className="text-orange-700 dark:text-orange-400">{String(value)}</span>;
}

function JsonNull() {
  return <span className="text-gray-500 dark:text-gray-400">null</span>;
}

function JsonArray({ value }: { value: unknown[] }) {
  const [collapsed, setCollapsed] = useState(value.length > 5);

  if (collapsed) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          onClick={() => setCollapsed(false)}
          className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="h-3 w-3" />
          <span className="text-xs text-muted-foreground">[{value.length}]</span>
        </button>
      </span>
    );
  }

  if (value.length === 0) {
    return (
      <span>
        <span className="text-muted-foreground">[</span>
        <span className="text-muted-foreground">]</span>
      </span>
    );
  }

  return (
    <span>
      <button
        onClick={() => setCollapsed(true)}
        className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className="h-3 w-3" />
        <span className="text-muted-foreground">[</span>
      </button>
      <div className="ml-4 border-l border-border">
        {value.map((item, i) => (
          <div key={i} className="pl-2">
            <JsonValue value={item} />
            {i < value.length - 1 && <span className="text-muted-foreground">,</span>}
          </div>
        ))}
      </div>
      <span className="text-muted-foreground">]</span>
    </span>
  );
}

function JsonObject({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value);
  const [collapsed, setCollapsed] = useState(entries.length > 8);

  if (collapsed) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          onClick={() => setCollapsed(false)}
          className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="h-3 w-3" />
          <span className="text-xs text-muted-foreground">{`{${entries.length}}`}</span>
        </button>
      </span>
    );
  }

  if (entries.length === 0) {
    return (
      <span>
        <span className="text-muted-foreground">{}</span>
        <span className="text-muted-foreground">{}</span>
      </span>
    );
  }

  return (
    <span>
      <button
        onClick={() => setCollapsed(true)}
        className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className="h-3 w-3" />
        <span className="text-muted-foreground">{}</span>
      </button>
      <div className="ml-4 border-l border-border">
        {entries.map(([key, val], i) => (
          <div key={key} className="pl-2">
            <JsonKey name={key} />
            <span className="text-muted-foreground">: </span>
            <JsonValue value={val} />
            {i < entries.length - 1 && <span className="text-muted-foreground">,</span>}
          </div>
        ))}
      </div>
      <span className="text-muted-foreground">{}</span>
    </span>
  );
}

function JsonValue({ value }: { value: unknown }) {
  if (value === null) return <JsonNull />;
  if (typeof value === "string") return <JsonString value={value} />;
  if (typeof value === "number") return <JsonNumber value={value} />;
  if (typeof value === "boolean") return <JsonBool value={value} />;
  if (Array.isArray(value)) return <JsonArray value={value} />;
  if (typeof value === "object") return <JsonObject value={value as Record<string, unknown>} />;
  return <span>{String(value)}</span>;
}

function PlainText({ content }: { content: string }) {
  return <span className="text-foreground">{content}</span>;
}

export function JsonModal({ open, onClose, title, content }: JsonModalProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);

  const parsed = content ? tryParseJson(content) : null;
  const isJson = parsed !== null;

  const handleCopy = useCallback(async () => {
    if (!content) return;
    const text = isJson ? JSON.stringify(parsed, null, 2) : content;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content, isJson, parsed]);

  if (!open || content === null) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed inset-4 z-50 flex flex-col rounded-lg bg-card shadow-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <div className="flex items-center gap-2">
            {isJson && (
              <button
                onClick={() => setWrap(!wrap)}
                className={`inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${wrap ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                {t("audit.jsonModal.wrap")}
              </button>
            )}
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-600" />
                  {t("audit.jsonModal.copied")}
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  {t("audit.jsonModal.copy")}
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-muted text-muted-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {isJson ? (
            <pre className={`font-mono text-sm leading-relaxed ${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}>
              <JsonValue value={parsed} />
            </pre>
          ) : (
            <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap break-all">
              <PlainText content={content} />
            </pre>
          )}
        </div>
      </div>
    </>
  );
}
