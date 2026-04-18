const modelObjectSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    object: { type: "string", const: "model" },
    created: { type: "integer" },
    owned_by: { type: "string" },
  },
  required: ["id", "object", "created", "owned_by"],
};

const ModelsListResponseSchema = {
  type: "object",
  properties: {
    object: { type: "string", const: "list" },
    data: {
      type: "array",
      items: modelObjectSchema,
    },
  },
  required: ["object", "data"],
};

const ModelResponseSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    object: { type: "string", const: "model" },
    created: { type: "integer" },
    owned_by: { type: "string" },
  },
  required: ["id", "object", "created", "owned_by"],
};

export {
  ModelsListResponseSchema,
  ModelResponseSchema,
  modelObjectSchema,
};
