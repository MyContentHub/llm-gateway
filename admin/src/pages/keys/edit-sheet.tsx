import { useState, useEffect } from "react";
import { Loader2, X } from "lucide-react";
import { useUpdateKey } from "@/hooks/use-keys";
import type { VirtualKey } from "@/hooks/use-keys";

interface EditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  virtualKey: VirtualKey | null;
}

export function EditKeySheet({ open, onOpenChange, virtualKey }: EditSheetProps) {
  const [name, setName] = useState("");
  const [rpm, setRpm] = useState("");
  const [tpm, setTpm] = useState("");
  const [rpd, setRpd] = useState("");
  const updateKey = useUpdateKey();

  useEffect(() => {
    if (virtualKey) {
      setName(virtualKey.name);
      setRpm(virtualKey.rateLimits?.rpm?.toString() ?? "");
      setTpm(virtualKey.rateLimits?.tpm?.toString() ?? "");
      setRpd(virtualKey.rateLimits?.rpd?.toString() ?? "");
    }
  }, [virtualKey]);

  if (!open || !virtualKey) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const rateLimits = {
      rpm: rpm ? Number(rpm) : 0,
      tpm: tpm ? Number(tpm) : 0,
      rpd: rpd ? Number(rpd) : 0,
    };

    try {
      await updateKey.mutateAsync({
        id: virtualKey.id,
        name: name.trim() || undefined,
        rateLimits,
      });
      onOpenChange(false);
    } catch {
      // error handled by mutation state
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-50 w-full max-w-md h-full border-l border-border bg-card p-6 shadow-lg overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Edit Key</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-4">
          <p className="text-sm text-muted-foreground">
            Prefix:{" "}
            <span className="font-mono text-foreground">
              {virtualKey.key_prefix}
            </span>
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Rate Limits
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
          {updateKey.isError && (
            <p className="text-sm text-red-500">
              {(updateKey.error as Error)?.message || "Failed to update key"}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateKey.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {updateKey.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
