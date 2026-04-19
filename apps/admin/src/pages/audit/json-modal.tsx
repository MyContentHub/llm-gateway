import { useState, useCallback } from "react";
import { X, Copy, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

interface JsonModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string | null;
}

function highlightJson(json: string): string {
  return json.replace(
    /("(?:\\.|[^"\\])*")\s*:/g,
    '<span class="text-purple-700 dark:text-purple-400">$1</span>:',
  ).replace(
    /:\s*("(?:\\.|[^"\\])*")/g,
    ': <span class="text-green-700 dark:text-green-400">$1</span>',
  ).replace(
    /:\s*(\d+(?:\.\d+)?)/g,
    ': <span class="text-blue-700 dark:text-blue-400">$1</span>',
  ).replace(
    /:\s*(true|false)/g,
    ': <span class="text-orange-700 dark:text-orange-400">$1</span>',
  ).replace(
    /:\s*(null)/g,
    ': <span class="text-gray-500 dark:text-gray-400">$1</span>',
  );
}

function formatContent(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

export function JsonModal({ open, onClose, title, content }: JsonModalProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!content) return;
    const formatted = formatContent(content);
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  if (!open || content === null) return null;

  const formatted = formatContent(content);
  const highlighted = highlightJson(formatted);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />
      <div className="fixed inset-4 z-50 flex flex-col rounded-lg bg-card shadow-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <div className="flex items-center gap-2">
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
          <pre className="font-mono text-sm leading-relaxed whitespace-pre">
            <code dangerouslySetInnerHTML={{ __html: highlighted }} />
          </pre>
        </div>
      </div>
    </>
  );
}
