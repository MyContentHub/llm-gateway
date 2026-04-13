import { PageHeader } from "@/components/layout/page-header";
import { useConfig } from "@/hooks/use-config";
import { useProviders } from "@/hooks/use-providers";
import { Shield, RefreshCw, Server, FileText, Settings } from "lucide-react";

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2 flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground font-mono">{value}</dd>
    </div>
  );
}

function Badge({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: "red" | "amber";
}) {
  const colors =
    variant === "red"
      ? "bg-red-500/10 text-red-500 border-red-500/20"
      : "bg-amber-500/10 text-amber-500 border-amber-500/20";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors}`}
    >
      {children}
    </span>
  );
}

function generateTomlPreview(
  config: {
    port: number;
    host: string;
    log_level: string;
    default_rpm: number;
    default_tpm: number;
    default_rpd: number;
    security: {
      injection_threshold: number;
      blocked_pii_types: string[];
      flagged_pii_types: string[];
    };
    retry: {
      max_retries: number;
      initial_delay_ms: number;
      max_delay_ms: number;
      backoff_multiplier: number;
    };
  },
  providers: {
    name: string;
    baseUrl: string;
    keyStrategy: string;
    keyCount: number;
    isDefault: boolean;
    modelMappings: Record<string, string>;
  }[],
): string {
  const lines: string[] = [];
  lines.push("[general]");
  lines.push(`port = ${config.port}`);
  lines.push(`host = "${config.host}"`);
  lines.push(`log_level = "${config.log_level}"`);
  lines.push(`default_rpm = ${config.default_rpm}`);
  lines.push(`default_tpm = ${config.default_tpm}`);
  lines.push(`default_rpd = ${config.default_rpd}`);
  lines.push("");
  lines.push("[security]");
  lines.push(`injection_threshold = ${config.security.injection_threshold}`);
  lines.push(
    `blocked_pii_types = [${config.security.blocked_pii_types.map((t) => `"${t}"`).join(", ")}]`,
  );
  lines.push(
    `flagged_pii_types = [${config.security.flagged_pii_types.map((t) => `"${t}"`).join(", ")}]`,
  );
  lines.push("");
  lines.push("[retry]");
  lines.push(`max_retries = ${config.retry.max_retries}`);
  lines.push(`initial_delay_ms = ${config.retry.initial_delay_ms}`);
  lines.push(`max_delay_ms = ${config.retry.max_delay_ms}`);
  lines.push(`backoff_multiplier = ${config.retry.backoff_multiplier}`);
  for (const p of providers) {
    lines.push("");
    lines.push(`[providers.${p.name}]`);
    lines.push(`base_url = "${p.baseUrl}"`);
    lines.push(`key_strategy = "${p.keyStrategy}"`);
    lines.push(`key_count = ${p.keyCount}`);
    lines.push(`is_default = ${p.isDefault}`);
    const mappings = Object.entries(p.modelMappings);
    if (mappings.length > 0) {
      lines.push(
        `model_mappings = { ${mappings.map(([k, v]) => `${k} = "${v}"`).join(", ")} }`,
      );
    }
  }
  return lines.join("\n");
}

export function SettingsPage() {
  const { data: config, isLoading: configLoading } = useConfig();
  const { data: providersData, isLoading: providersLoading } = useProviders();

  if (configLoading || providersLoading) {
    return (
      <div>
        <PageHeader title="Settings" />
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (!config) return null;

  const providers = providersData?.providers ?? [];

  return (
    <div>
      <PageHeader title="Settings" />
      <div className="grid gap-4">
        <Card title="General" icon={Settings}>
          <dl className="space-y-2">
            <Row label="Port" value={config.port} />
            <Row label="Host" value={config.host} />
            <Row label="Log Level" value={config.log_level} />
            <Row label="Default RPM" value={config.default_rpm} />
            <Row label="Default TPM" value={config.default_tpm} />
            <Row label="Default RPD" value={config.default_rpd} />
          </dl>
        </Card>

        <Card title="Security Rules" icon={Shield}>
          <dl className="space-y-2">
            <Row label="Injection Threshold" value={config.security.injection_threshold} />
          </dl>
          <div className="space-y-2 pt-2">
            <div>
              <p className="text-sm text-muted-foreground mb-1.5">Blocked PII Types</p>
              <div className="flex flex-wrap gap-1.5">
                {config.security.blocked_pii_types.length > 0 ? (
                  config.security.blocked_pii_types.map((t) => (
                    <Badge key={t} variant="red">
                      {t}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">None</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1.5">Flagged PII Types</p>
              <div className="flex flex-wrap gap-1.5">
                {config.security.flagged_pii_types.length > 0 ? (
                  config.security.flagged_pii_types.map((t) => (
                    <Badge key={t} variant="amber">
                      {t}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">None</span>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Retry Policy" icon={RefreshCw}>
          <dl className="space-y-2">
            <Row label="Max Retries" value={config.retry.max_retries} />
            <Row label="Initial Delay" value={`${config.retry.initial_delay_ms}ms`} />
            <Row label="Max Delay" value={`${config.retry.max_delay_ms}ms`} />
            <Row label="Backoff Multiplier" value={config.retry.backoff_multiplier} />
          </dl>
        </Card>

        <Card title="Provider Config" icon={Server}>
          {providers.length > 0 ? (
            <div className="space-y-3">
              {providers.map((p) => (
                <div
                  key={p.name}
                  className="rounded-md border border-border bg-background p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      {p.name}
                    </span>
                    {p.isDefault && (
                      <span className="text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
                        default
                      </span>
                    )}
                  </div>
                  <dl className="space-y-1.5">
                    <Row label="Base URL" value={p.baseUrl} />
                    <Row label="Key Strategy" value={p.keyStrategy} />
                    <Row label="Key Count" value={p.keyCount} />
                  </dl>
                  {Object.keys(p.modelMappings).length > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Model Mappings</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(p.modelMappings).map(([from, to]) => (
                          <span
                            key={from}
                            className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-xs font-mono"
                          >
                            {from} → {to}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No providers configured</p>
          )}
        </Card>

        <Card title="TOML Preview" icon={FileText}>
          <pre className="rounded-md bg-zinc-900 text-zinc-100 p-4 text-xs font-mono overflow-x-auto whitespace-pre">
            {generateTomlPreview(config, providers)}
          </pre>
        </Card>
      </div>
    </div>
  );
}
