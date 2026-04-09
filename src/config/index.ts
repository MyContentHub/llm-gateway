import { z } from "zod";
import { ProviderSchema } from "./providers.js";
import type { ProviderConfig } from "./providers.js";

export const AppConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_PATH: z.string().default("./data/gateway.db"),
  ENCRYPTION_KEY: z.string().optional().default(""),
  PROVIDERS: z.preprocess(
    (val) => {
      const str = typeof val === "string" ? val : "[]";
      try {
        return JSON.parse(str);
      } catch {
        throw new Error("PROVIDERS must be a valid JSON string");
      }
    },
    z.array(ProviderSchema),
  ),
  DEFAULT_RPM: z.coerce.number().int().positive().default(60),
  DEFAULT_TPM: z.coerce.number().int().positive().default(100000),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export function loadConfig(env?: Record<string, string | undefined>): AppConfig {
  return AppConfigSchema.parse(env ?? process.env);
}

export function getDefaultProvider(config: AppConfig): ProviderConfig | undefined {
  return config.PROVIDERS.find((p) => p.isDefault) ?? config.PROVIDERS[0];
}

export function resolveModel(provider: ProviderConfig, model: string): string {
  return provider.modelMappings[model] ?? model;
}
