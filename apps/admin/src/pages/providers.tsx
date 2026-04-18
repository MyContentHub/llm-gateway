import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { cn, formatMs } from "@/lib/utils";
import {
  useProviders,
  useProvidersHealth,
} from "@/hooks/use-providers";
import type { Provider, ProviderHealth } from "@/hooks/use-providers";

function getHealthStatus(health: ProviderHealth | undefined) {
  if (!health || health.keys.length === 0) return "unknown" as const;
  const healthy = health.keys.filter((k) => k.isHealthy).length;
  if (healthy === health.keys.length) return "healthy" as const;
  if (healthy === 0) return "unhealthy" as const;
  return "degraded" as const;
}

function getAvgLatency(health: ProviderHealth | undefined) {
  if (!health || health.keys.length === 0) return null;
  const total = health.keys.reduce((sum, k) => sum + k.avgLatency, 0);
  return total / health.keys.length;
}

function HealthDot({ status }: { status: ReturnType<typeof getHealthStatus> }) {
  return (
    <div
      className={cn(
        "h-2.5 w-2.5 rounded-full",
        status === "healthy" && "bg-green-500",
        status === "degraded" && "bg-yellow-500",
        status === "unhealthy" && "bg-red-500",
        status === "unknown" && "bg-muted-foreground/40",
      )}
    />
  );
}

function KeyHealthBars({ health }: { health: ProviderHealth | undefined }) {
  if (!health || health.keys.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">Key Health</span>
      {health.keys.map((key) => {
        const pct = key.isHealthy
          ? 100
          : key.consecutiveErrors > 0
            ? Math.max(15, 100 - key.consecutiveErrors * 25)
            : 60;
        return (
          <div key={key.id} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-10 shrink-0 truncate">
              {key.id}
            </span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  key.isHealthy
                    ? "bg-green-500"
                    : key.consecutiveErrors > 0
                      ? "bg-red-500"
                      : "bg-yellow-500",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-12 text-right shrink-0">
              {formatMs(key.avgLatency)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ModelMappingsTable({ mappings }: { mappings: Record<string, string> }) {
  const entries = Object.entries(mappings);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">Model Mappings</span>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-2 py-1 font-medium text-muted-foreground">Alias</th>
              <th className="text-left px-2 py-1 font-medium text-muted-foreground">Model</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([alias, model]) => (
              <tr key={alias} className="border-t border-border">
                <td className="px-2 py-1 font-mono text-foreground">{alias}</td>
                <td className="px-2 py-1 font-mono text-foreground">{model}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  health,
}: {
  provider: Provider;
  health: ProviderHealth | undefined;
}) {
  const status = getHealthStatus(health);
  const avgLatency = getAvgLatency(health);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HealthDot status={status} />
          <h3 className="font-semibold text-foreground">{provider.name}</h3>
        </div>
        {provider.isDefault && (
          <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded">
            Default
          </span>
        )}
      </div>

      <div className="text-xs font-mono text-muted-foreground truncate" title={provider.baseUrl}>
        {provider.baseUrl}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground capitalize">
          {provider.keyStrategy}
        </span>
        <span className="text-xs text-muted-foreground">
          {provider.keyCount} {provider.keyCount === 1 ? "key" : "keys"}
        </span>
        {avgLatency !== null && (
          <span className="text-xs text-muted-foreground">
            avg {formatMs(avgLatency)}
          </span>
        )}
      </div>

      <ModelMappingsTable mappings={provider.modelMappings} />

      <KeyHealthBars health={health} />
    </div>
  );
}

export function ProvidersPage() {
  const { data: providersData, isLoading: providersLoading } = useProviders();
  const { data: healthData } = useProvidersHealth();

  const providers = providersData?.providers ?? [];
  const healthMap = new Map<string, ProviderHealth>();
  for (const p of healthData?.providers ?? []) {
    healthMap.set(p.name, p);
  }

  return (
    <div>
      <PageHeader title="Providers" />

      {providersLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.name}
              provider={provider}
              health={healthMap.get(provider.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
