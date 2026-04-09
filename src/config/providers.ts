import { z } from "zod";

export const ProviderSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  modelMappings: z.record(z.string(), z.string()).optional().default({}),
  isDefault: z.boolean().optional().default(false),
});

export type ProviderConfig = z.infer<typeof ProviderSchema>;
