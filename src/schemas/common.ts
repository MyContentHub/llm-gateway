const errorSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        message: { type: "string" },
        type: { type: "string" },
        code: { type: "string" },
      },
      required: ["message", "type", "code"],
    },
  },
  required: ["error"],
};

const error400 = {
  400: {
    ...errorSchema,
    description: "Invalid request",
  },
};

const error401 = {
  401: {
    ...errorSchema,
    description: "Authentication required",
  },
};

const error404 = {
  404: {
    ...errorSchema,
    description: "Resource not found",
  },
};

const error429 = {
  429: {
    ...errorSchema,
    description: "Rate limit exceeded",
  },
};

const error500 = {
  500: {
    ...errorSchema,
    description: "Internal server error",
  },
};

const virtualKeySecurity = [{ VirtualKey: [] }];
const adminTokenSecurity = [{ AdminToken: [] }];

export { errorSchema, error400, error401, error404, error429, error500, virtualKeySecurity, adminTokenSecurity };
