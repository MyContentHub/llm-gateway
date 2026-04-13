import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { useCreateKey } from "@/hooks/use-keys";
import type { VirtualKey } from "@/hooks/use-keys";

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (key: VirtualKey) => void;
}

export function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateDialogProps) {
  const [name, setName] = useState("");
  const [rpm, setRpm] = useState("");
  const [tpm, setTpm] = useState("");
  const [rpd, setRpd] = useState("");
  const createKey = useCreateKey();

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const rateLimits =
      rpm || tpm || rpd
        ? {
            rpm: rpm ? Number(rpm) : 0,
            tpm: tpm ? Number(tpm) : 0,
            rpd: rpd ? Number(rpd) : 0,
          }
        : undefined;

    try {
      const result = await createKey.mutateAsync({
        name: name.trim(),
        rateLimits,
      });
      setName("");
      setRpm("");
      setTpm("");
      setRpd("");
      onCreated(result);
      onOpenChange(false);
    } catch {
      // error handled by mutation state
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-50 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            Create API Key
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production API"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Rate Limits{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">RPM</label>
                <input
                  type="number"
                  value={rpm}
                  onChange={(e) => setRpm(e.target.value)}
                  placeholder="0"
                  min={0}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">TPM</label>
                <input
                  type="number"
                  value={tpm}
                  onChange={(e) => setTpm(e.target.value)}
                  placeholder="0"
                  min={0}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">RPD</label>
                <input
                  type="number"
                  value={rpd}
                  onChange={(e) => setRpd(e.target.value)}
                  placeholder="0"
                  min={0}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>
          {createKey.isError && (
            <p className="text-sm text-red-500">
              {(createKey.error as Error)?.message || "Failed to create key"}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createKey.isPending || !name.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {createKey.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              ) : (
                "Create Key"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
