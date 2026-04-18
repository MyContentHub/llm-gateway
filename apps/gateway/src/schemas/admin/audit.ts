export const listAuditLogsQuerySchema = {
  type: "object",
  properties: {
    startDate: { type: "string" },
    endDate: { type: "string" },
    model: { type: "string" },
    endpoint: { type: "string" },
    status: { type: "string" },
    api_key_id: { type: "string" },
    limit: { type: "number", default: 50 },
    offset: { type: "number", default: 0 },
  },
};

export const auditStatsQuerySchema = {
  type: "object",
  properties: {
    startDate: { type: "string" },
    endDate: { type: "string" },
  },
};

export const securityStatsQuerySchema = {
  type: "object",
  properties: {
    startDate: { type: "string" },
    endDate: { type: "string" },
  },
};

export const auditLogResponseSchema = {
  type: "object",
  properties: {
    id: { type: "number" },
    requestId: { type: "string" },
    apiKeyId: { type: "string" },
    model: { type: ["string", "null"] },
    endpoint: { type: ["string", "null"] },
    statusCode: { type: "number" },
    promptTokens: { type: "number" },
    completionTokens: { type: "number" },
    costUsd: { type: "number" },
    latencyMs: { type: "number" },
    piiDetected: { type: "number" },
    timestamp: { type: "string" },
  },
  required: ["id", "requestId", "apiKeyId", "model", "endpoint", "statusCode", "promptTokens", "completionTokens", "costUsd", "latencyMs", "piiDetected", "timestamp"],
};

export const auditLogListResponseSchema = {
  type: "object",
  properties: {
    logs: {
      type: "array",
      items: auditLogResponseSchema,
    },
    total: { type: "number" },
    limit: { type: "number" },
    offset: { type: "number" },
  },
  required: ["logs", "total", "limit", "offset"],
};

export const auditStatsResponseSchema = {
  type: "object",
  properties: {
    totalRequests: { type: "number" },
    totalTokens: { type: "number" },
    totalCostUsd: { type: "number" },
    avgLatencyMs: { type: "number" },
    byModel: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          count: { type: "number" },
          tokens: { type: "number" },
          costUsd: { type: "number" },
        },
        required: ["count", "tokens", "costUsd"],
      },
    },
    byStatus: {
      type: "object",
      additionalProperties: { type: "number" },
    },
    piiDetectionRate: { type: "number" },
  },
  required: ["totalRequests", "totalTokens", "totalCostUsd", "avgLatencyMs", "byModel", "byStatus", "piiDetectionRate"],
};
