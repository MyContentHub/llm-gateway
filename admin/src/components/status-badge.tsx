import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: "bg-green-100 text-green-800",
    error: "bg-red-100 text-red-800",
    blocked: "bg-orange-100 text-orange-800",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        styles[status] ?? "bg-gray-100 text-gray-800",
      )}
    >
      {status}
    </span>
  );
}
