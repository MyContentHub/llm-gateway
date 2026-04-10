import { z } from "zod";

export const KeyStrategySchema = z.enum(["round-robin", "random", "least-latency"]);

export type KeyStrategy = z.infer<typeof KeyStrategySchema>;

export const ProviderSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  apiKeys: z.array(z.string().min(1)).optional(),
  keyStrategy: KeyStrategySchema.default("round-robin"),
  modelMappings: z.record(z.string(), z.string()).optional().default({}),
  isDefault: z.boolean().optional().default(false),
});

export type ProviderConfig = z.infer<typeof ProviderSchema>;
