const EmbeddingsRequestSchema = {
  type: "object",
  properties: {
    model: { type: "string" },
    input: {
      oneOf: [
        { type: "string" },
        {
          type: "array",
          items: {
            oneOf: [
              { type: "string" },
              { type: "array", items: { type: "integer" } },
            ],
          },
          maxItems: 2048,
        },
      ],
    },
    encoding_format: { type: "string", enum: ["float", "base64"], default: "float" },
    dimensions: { type: "integer" },
    user: { type: "string" },
  },
  required: ["model", "input"],
};

const embeddingDataSchema = {
  type: "object",
  properties: {
    object: { type: "string", const: "embedding" },
    embedding: {
      oneOf: [
        { type: "array", items: { type: "number" } },
        { type: "string" },
      ],
    },
    index: { type: "integer" },
  },
  required: ["object", "embedding", "index"],
};

const embeddingsUsageSchema = {
  type: "object",
  properties: {
    prompt_tokens: { type: "integer" },
    total_tokens: { type: "integer" },
  },
  required: ["prompt_tokens", "total_tokens"],
};

const EmbeddingsResponseSchema = {
  type: "object",
  properties: {
    object: { type: "string", const: "list" },
    data: {
      type: "array",
      items: embeddingDataSchema,
    },
    model: { type: "string" },
    usage: embeddingsUsageSchema,
  },
  required: ["object", "data", "model", "usage"],
};

export {
  EmbeddingsRequestSchema,
  EmbeddingsResponseSchema,
  embeddingDataSchema,
  embeddingsUsageSchema,
};
