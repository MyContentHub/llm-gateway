import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import TOML from "smol-toml";
import { z } from "zod";
import { ProviderSchema } from "./providers.js";
import type { ProviderConfig } from "./providers.js";

export const AppConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  host: z.string().default("0.0.0.0"),
  log_level: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  database_path: z.string().default("./data/gateway.db"),
  encryption_key: z.string().optional().default(""),
  providers: z.array(ProviderSchema).default([]),
  admin_token: z.string().min(1).default("admin-secret-key"),
  default_rpm: z.number().int().positive().default(60),
  default_tpm: z.number().int().positive().default(100000),
  default_rpd: z.number().int().positive().default(1000),
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
