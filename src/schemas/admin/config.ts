export const configResponseSchema = {
  type: "object",
  properties: {
    port: { type: "number" },
    host: { type: "string" },
    log_level: { type: "string" },
    default_rpm: { type: "number" },
    default_tpm: { type: "number" },
    default_rpd: { type: "number" },
    security: {
      type: "object",
      properties: {
        injection_threshold: { type: "number" },
        blocked_pii_types: { type: "array", items: { type: "string" } },
        flagged_pii_types: { type: "array", items: { type: "string" } },
      },
    },
    retry: {
      type: "object",
      properties: {
        max_retries: { type: "number" },
        initial_delay_ms: { type: "number" },
        max_delay_ms: { type: "number" },
        backoff_multiplier: { type: "number" },
      },
    },
  },
};

export const providersResponseSchema = {
  type: "object",
  properties: {
    providers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          baseUrl: { type: "string" },
          keyStrategy: { type: "string" },
          keyCount: { type: "number" },
          modelMappings: { type: "object", additionalProperties: true },
          isDefault: { type: "boolean" },
        },
      },
    },
  },
};

export const providersHealthResponseSchema = {
  type: "object",
  properties: {
    providers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          keys: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                avgLatency: { type: "number" },
                consecutiveErrors: { type: "number" },
                isHealthy: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  },
};
