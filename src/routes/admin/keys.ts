import { z } from "zod";
import type { FastifyPluginCallback } from "fastify";
import { KeyStore } from "../../db/keys.js";
import { adminTokenSecurity, error400, error401, error404 } from "../../schemas/common.js";
import {
  createKeyBodySchema,
  keyResponseSchema,
  listKeysQuerySchema,
  keyListResponseSchema,
  successResponseSchema,
  updateKeyBodySchema,
} from "../../schemas/admin/keys.js";
import "../../types.js";

const CreateKeyBodySchema = z.object({
  name: z.string().min(1),
  rateLimits: z.object({
    rpm: z.number().int().positive(),
    tpm: z.number().int().positive(),
    rpd: z.number().int().positive(),
  }).optional(),
});

const UpdateKeyBodySchema = z.object({
  name: z.string().min(1).optional(),
  rateLimits: z.object({
    rpm: z.number().int().positive(),
    tpm: z.number().int().positive(),
    rpd: z.number().int().positive(),
  }).optional(),
});

const ListKeysQuerySchema = z.object({
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().default(20),
});

export const adminKeysPlugin: FastifyPluginCallback = (server, _opts, done) => {
  const keyStore = new KeyStore(server.db, server.config.encryption_key);
  const adminToken = server.config.admin_token;

  server.addHook("onRequest", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.code(401).send({
        error: {
          message: "Missing or invalid authorization header",
          type: "authentication_error",
          code: "invalid_api_key",
        },
      });
    }

    const token = authHeader.slice(7);
    if (token !== adminToken) {
      return reply.code(401).send({
        error: {
          message: "Invalid admin token",
          type: "authentication_error",
          code: "invalid_api_key",
        },
      });
    }
  });

  server.post("/admin/keys", {
    schema: {
      summary: "Create a new virtual API key",
      description: "Generates a new virtual API key with optional rate limit configuration",
      tags: ["Admin - Key Management"],
      security: adminTokenSecurity,
      body: createKeyBodySchema,
      response: {
        201: keyResponseSchema,
        ...error400,
        ...error401,
      },
    },
  }, async (request, reply) => {
    const parsed = CreateKeyBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          message: parsed.error.issues.map((i) => i.message).join(", "),
          type: "invalid_request_error",
          code: "invalid_request",
        },
      });
    }

    const { name, rateLimits } = parsed.data;
    const effectiveRateLimits = rateLimits ?? {
      rpm: server.config.default_rpm,
      tpm: server.config.default_tpm,
      rpd: 1000,
    };

    const result = await keyStore.createKey({ name, rateLimits: effectiveRateLimits });
    return reply.code(201).send(result);
  });

  server.get("/admin/keys", {
    schema: {
      summary: "List virtual API keys",
      description: "Returns a paginated list of virtual API keys",
      tags: ["Admin - Key Management"],
      security: adminTokenSecurity,
      querystring: listKeysQuerySchema,
      response: {
        200: keyListResponseSchema,
        ...error400,
        ...error401,
      },
    },
  }, async (request, reply) => {
    const parsed = ListKeysQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          message: parsed.error.issues.map((i) => i.message).join(", "),
          type: "invalid_request_error",
          code: "invalid_request",
        },
      });
    }

    const { offset, limit } = parsed.data;
    const result = keyStore.listKeys(offset, limit);
    return reply.send(result);
  });

  server.get<{ Params: { id: string } }>("/admin/keys/:id", {
    schema: {
      summary: "Get a virtual API key",
      description: "Retrieves a single virtual API key by its ID",
      tags: ["Admin - Key Management"],
      security: adminTokenSecurity,
      params: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
      response: {
        200: keyResponseSchema,
        ...error401,
        ...error404,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const key = keyStore.getKeyById(id);
    if (!key) {
      return reply.code(404).send({
        error: {
          message: "Key not found",
          type: "invalid_request_error",
          code: "key_not_found",
        },
      });
    }
    return reply.send(key);
  });

  server.delete<{ Params: { id: string } }>("/admin/keys/:id", {
    schema: {
      summary: "Revoke a virtual API key",
      description: "Revokes a virtual API key by its ID, making it unusable",
      tags: ["Admin - Key Management"],
      security: adminTokenSecurity,
      params: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
      response: {
        200: successResponseSchema,
        ...error401,
        ...error404,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const success = keyStore.revokeKey(id);
    if (!success) {
      return reply.code(404).send({
        error: {
          message: "Key not found or already revoked",
          type: "invalid_request_error",
          code: "key_not_found",
        },
      });
    }
    return reply.send({ success: true });
  });

  server.patch<{ Params: { id: string } }>("/admin/keys/:id", {
    schema: {
      summary: "Update a virtual API key",
      description: "Updates a virtual API key's name and/or rate limit configuration",
      tags: ["Admin - Key Management"],
      security: adminTokenSecurity,
      params: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
      body: updateKeyBodySchema,
      response: {
        200: keyResponseSchema,
        ...error400,
        ...error401,
        ...error404,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const parsed = UpdateKeyBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          message: parsed.error.issues.map((i) => i.message).join(", "),
          type: "invalid_request_error",
          code: "invalid_request",
        },
      });
    }

    const { name, rateLimits } = parsed.data;

    const existing = keyStore.getKeyById(id);
    if (!existing) {
      return reply.code(404).send({
        error: {
          message: "Key not found",
          type: "invalid_request_error",
          code: "key_not_found",
        },
      });
    }

    const effectiveLimits = rateLimits ?? existing.rateLimits;

    if (rateLimits) {
      keyStore.updateRateLimits(id, rateLimits);
    }

    if (name) {
      server.db.prepare("UPDATE virtual_keys SET name = ? WHERE id = ?").run(name, id);
      keyStore.updateRateLimits(id, effectiveLimits);
    }

    const updated = keyStore.getKeyById(id);
    return reply.send(updated ?? existing);
  });

  done();
};
