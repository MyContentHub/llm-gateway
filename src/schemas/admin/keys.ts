const rateLimitsSchema = {
  type: "object",
  properties: {
    rpm: { type: "number" },
    tpm: { type: "number" },
    rpd: { type: "number" },
  },
  required: ["rpm", "tpm", "rpd"],
};

export const createKeyBodySchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    rateLimits: rateLimitsSchema,
  },
  required: ["name"],
};

export const updateKeyBodySchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    rateLimits: rateLimitsSchema,
  },
};

export const listKeysQuerySchema = {
  type: "object",
  properties: {
    offset: { type: "number", default: 0 },
    limit: { type: "number", default: 20 },
  },
};

export const keyResponseSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    key: { type: "string" },
    rateLimits: rateLimitsSchema,
    status: { type: "string" },
    createdAt: { type: "string" },
    revokedAt: { type: ["string", "null"] },
  },
  required: ["id", "name", "key", "rateLimits", "status", "createdAt", "revokedAt"],
};

export const keyListResponseSchema = {
  type: "object",
  properties: {
    keys: {
      type: "array",
      items: keyResponseSchema,
    },
    total: { type: "number" },
    offset: { type: "number" },
    limit: { type: "number" },
  },
  required: ["keys", "total", "offset", "limit"],
};

export const successResponseSchema = {
  type: "object",
  properties: {
    success: { type: "boolean" },
  },
  required: ["success"],
};
