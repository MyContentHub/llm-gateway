import { cn } from "@/lib/utils";

interface InjectionScoreBarProps {
  score: number;
}

export function InjectionScoreBar({ score }: InjectionScoreBarProps) {
  const pct = Math.round(score * 100);
  const color =
    score > 0.7 ? "bg-red-500" : score > 0.3 ? "bg-orange-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}
