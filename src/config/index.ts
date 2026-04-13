import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import TOML from "smol-toml";
import { z } from "zod";
import { ProviderSchema } from "./providers.js";
import type { ProviderConfig } from "./providers.js";

export const SecuritySchema = z.object({
  injection_threshold: z.number().min(0).max(1).default(0.5),
  blocked_pii_types: z.array(z.string()).default(["SSN", "CREDIT_CARD"]),
  flagged_pii_types: z.array(z.string()).default(["EMAIL", "PHONE", "CN_ID", "BANK_CARD", "IP_ADDRESS", "DATE_OF_BIRTH", "PERSON", "PLACE", "ORGANIZATION"]),
});

export type SecurityConfig = z.infer<typeof SecuritySchema>;

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = SecuritySchema.parse({});

export const RetrySchema = z.object({
  max_retries: z.number().int().min(0).default(2),
  initial_delay_ms: z.number().int().positive().default(1000),
  max_delay_ms: z.number().int().positive().default(10000),
  backoff_multiplier: z.number().positive().default(2),
});

export type RetryConfig = z.infer<typeof RetrySchema>;

export const DEFAULT_RETRY_CONFIG: RetryConfig = RetrySchema.parse({});

export const AppConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  host: z.string().default("0.0.0.0"),
  log_level: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  database_path: z.string().default("./data/gateway.db"),
  encryption_key: z.string().optional().default(""),
  providers: z.array(ProviderSchema).default([]),
  admin_token: z.string().min(1),
  default_rpm: z.number().int().positive().default(60),
  default_tpm: z.number().int().positive().default(100000),
  default_rpd: z.number().int().positive().default(1000),
  security: SecuritySchema.default(() => SecuritySchema.parse({})),
  retry: RetrySchema.default(() => RetrySchema.parse({})),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

const DEFAULT_CONFIG_PATH = "config.toml";

export async function loadConfig(configPath?: string): Promise<AppConfig> {
  const resolvedPath = resolve(configPath ?? DEFAULT_CONFIG_PATH);

  let raw: string;
  try {
    raw = await readFile(resolvedPath, "utf-8");
  } catch {
    raw = "";
  }

  const parsed = raw ? TOML.parse(raw) : {};
  return AppConfigSchema.parse(parsed);
}

export function getDefaultProvider(config: AppConfig): ProviderConfig | undefined {
  return config.providers.find((p) => p.isDefault) ?? config.providers[0];
}

export function resolveModel(provider: ProviderConfig, model: string): string {
  return provider.modelMappings[model] ?? model;
}
