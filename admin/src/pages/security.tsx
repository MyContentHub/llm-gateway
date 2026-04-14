import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Shield, Eye, AlertTriangle, Filter, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Histogram } from "@/components/charts/histogram";
import {
  useSecurityStats,
  useBlockedLogs,
  type BlockedLog,
} from "@/hooks/use-audit-security";
import { formatNumber, formatDate, cn } from "@/lib/utils";
import { InjectionScoreBar } from "@/components/injection-score-bar";

const PII_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#c084fc",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#fb923c",
  "#fbbf24",
  "#34d399",
];

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 flex items-start gap-4">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          color,
        )}
      >
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {sub && (
          <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
        )}
      </div>
    </div>
  );
}

function PiiBarChart({ byType }: { byType: Record<string, number> }) {
  const data = useMemo(() => {
    const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
    return entries.map(([name, value]) => ({ name, value }));
  }, [byType]);

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No PII detection data
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36 + 40)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
      >
        <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={100}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--card))",
            fontSize: 12,
          }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={PII_COLORS[i % PII_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ThreatFeedTable({ logs }: { logs: BlockedLog[] }) {
  if (logs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No blocked events
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
              Time
            </th>
            <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
              Request ID
            </th>
            <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
              Model
            </th>
            <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
              PII
            </th>
            <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
              Injection Score
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr
              key={log.id}
              className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
            >
              <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                {formatDate(log.timestamp)}
              </td>
              <td className="px-4 py-2.5">
                <code className="text-xs" title={log.request_id}>
                  {log.request_id.slice(0, 8)}...
                </code>
              </td>
              <td className="px-4 py-2.5 text-sm font-medium">{log.model}</td>
              <td className="px-4 py-2.5">
                {log.pii_detected ? (
                  <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">
                    PII
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">-</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <InjectionScoreBar score={log.prompt_injection_score} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SecurityPage() {
  const { data: stats, isLoading } = useSecurityStats();
  const { data: blockedData, isLoading: blockedLoading } = useBlockedLogs();

  const scoreData = useMemo(() => {
    if (!stats?.injectionAttempts.scoreDistribution) return [];
    return Object.entries(stats.injectionAttempts.scoreDistribution)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => ({ name, value }));
  }, [stats?.injectionAttempts.scoreDistribution]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Security Monitor" />
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={Shield}
            label="Blocked Requests"
            value={formatNumber(stats?.blockedRequests ?? 0)}
            color="bg-red-500"
          />
          <KpiCard
            icon={Eye}
            label="PII Detections"
            value={formatNumber(stats?.piiDetections.total ?? 0)}
            sub={`${Object.keys(stats?.piiDetections.byType ?? {}).length} types`}
            color="bg-amber-500"
          />
          <KpiCard
            icon={AlertTriangle}
            label="Injection Attempts"
            value={formatNumber(stats?.injectionAttempts.total ?? 0)}
            sub={`avg score ${((stats?.injectionAttempts.avgScore ?? 0) * 100).toFixed(0)}%`}
            color="bg-orange-500"
          />
          <KpiCard
            icon={Filter}
            label="Content Filter"
            value={formatNumber(stats?.contentFilter.blocked ?? 0)}
            sub={`${formatNumber(stats?.contentFilter.flagged ?? 0)} flagged · ${formatNumber(stats?.contentFilter.allowed ?? 0)} allowed`}
            color="bg-purple-500"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold mb-4">PII Detection by Type</h2>
            <PiiBarChart byType={stats?.piiDetections.byType ?? {}} />
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold mb-4">
              Injection Score Distribution
            </h2>
            {scoreData.length > 0 ? (
              <Histogram data={scoreData} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No injection data
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="p-5 border-b border-border">
            <h2 className="text-lg font-semibold">Threat Feed</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Recent blocked events
            </p>
          </div>
          {blockedLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ThreatFeedTable logs={blockedData?.logs ?? []} />
          )}
        </div>
      </div>
    </div>
  );
}
