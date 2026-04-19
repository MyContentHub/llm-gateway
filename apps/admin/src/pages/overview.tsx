import { useMemo } from "react";
import { Activity, Zap, DollarSign, Clock, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/layout/page-header";
import { useAuditStats } from "@/hooks/use-audit-stats";
import { useAuditLogs, type AuditLogRow } from "@/hooks/use-audit-logs";
import { BarChartComponent } from "@/components/charts/bar-chart";
import { PieChartComponent } from "@/components/charts/pie-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { cn, formatNumber, formatUsd, formatMs, formatRelativeDate } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  delta?: number;
  invertDelta?: boolean;
}

function KpiCard({ label, value, icon, delta, invertDelta }: KpiCardProps) {
  const isPositive = delta !== undefined && delta >= 0;
  const colorClass = invertDelta
    ? isPositive ? "text-red-500" : "text-green-500"
    : isPositive ? "text-green-500" : "text-red-500";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-foreground">{value}</span>
        {delta !== undefined && (
          <span className={cn("text-xs font-medium", colorClass)}>
            {isPositive ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

function computeDelta(current: number, previous: number): number | undefined {
  if (previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

export function OverviewPage() {
  const { t } = useTranslation();
  const now = useMemo(() => new Date(), []);
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  }, [now]);
  const sixtyDaysAgo = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 60);
    return d.toISOString().split("T")[0];
  }, [now]);
  const todayStr = useMemo(() => now.toISOString().split("T")[0], [now]);

  const { data: stats, isLoading: statsLoading } = useAuditStats(
    thirtyDaysAgo,
    todayStr,
  );
  const { data: prevStats } = useAuditStats(sixtyDaysAgo, thirtyDaysAgo);
  const { data: recentData, isLoading: logsLoading } = useAuditLogs({
    limit: 5,
    offset: 0,
  });

  const modelChartData = useMemo(() => {
    if (!stats?.byModel) return [];
    return Object.entries(stats.byModel).map(([name, v]) => ({
      name,
      value: v.count,
    }));
  }, [stats?.byModel]);

  const statusChartData = useMemo(() => {
    if (!stats?.byStatus) return [];
    return Object.entries(stats.byStatus).map(([name, value]) => ({
      name,
      value,
    }));
  }, [stats?.byStatus]);

  if (statsLoading) {
    return (
      <div>
        <PageHeader title={t("overview.title")} />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t("overview.title")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t("overview.kpis.totalRequests")}
          value={formatNumber(stats?.totalRequests ?? 0)}
          icon={<Activity className="h-4 w-4" />}
          delta={computeDelta(
            stats?.totalRequests ?? 0,
            prevStats?.totalRequests ?? 0,
          )}
        />
        <KpiCard
          label={t("overview.kpis.tokenUsage")}
          value={formatNumber(stats?.totalTokens ?? 0)}
          icon={<Zap className="h-4 w-4" />}
          delta={computeDelta(
            stats?.totalTokens ?? 0,
            prevStats?.totalTokens ?? 0,
          )}
        />
        <KpiCard
          label={t("overview.kpis.totalCost")}
          value={formatUsd(stats?.totalCostUsd ?? 0)}
          icon={<DollarSign className="h-4 w-4" />}
          delta={computeDelta(
            stats?.totalCostUsd ?? 0,
            prevStats?.totalCostUsd ?? 0,
          )}
        />
        <KpiCard
          label={t("overview.kpis.avgLatency")}
          value={formatMs(stats?.avgLatencyMs ?? 0)}
          icon={<Clock className="h-4 w-4" />}
          delta={computeDelta(
            stats?.avgLatencyMs ?? 0,
            prevStats?.avgLatencyMs ?? 0,
          )}
          invertDelta
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            {t("overview.charts.byModel")}
          </h2>
          <BarChartComponent data={modelChartData} />
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            {t("overview.charts.byStatus")}
          </h2>
          <PieChartComponent data={statusChartData} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            {t("overview.charts.recentActivity")}
          </h2>
          {logsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !recentData?.logs.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t("overview.noActivity")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {t("overview.table.time")}
                    </th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {t("overview.table.model")}
                    </th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {t("overview.table.tokens")}
                    </th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {t("overview.table.cost")}
                    </th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {t("overview.table.status")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentData.logs.map((log: AuditLogRow) => (
                    <tr
                      key={log.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">
                        {formatRelativeDate(log.timestamp)}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium">
                        {log.model}
                      </td>
                      <td className="px-3 py-2 text-xs tabular-nums">
                        {(log.prompt_tokens + log.completion_tokens).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-xs tabular-nums">
                        {formatUsd(log.cost_usd)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={log.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col items-center justify-center">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            {t("overview.charts.piiDetectionRate")}
          </h2>
          <DonutChart
            value={(stats?.piiDetectionRate ?? 0) * 100}
            label={t("overview.ofRequestsFlagged")}
          />
        </div>
      </div>
    </div>
  );
}
