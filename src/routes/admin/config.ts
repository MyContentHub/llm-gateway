import type { FastifyPluginCallback } from "fastify";
import { adminTokenSecurity, error401 } from "../../schemas/common.js";
import {
  configResponseSchema,
  providersResponseSchema,
  providersHealthResponseSchema,
} from "../../schemas/admin/config.js";
import "../../types.js";

export const adminConfigPlugin: FastifyPluginCallback = (server, _opts, done) => {
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

  server.get("/admin/config", {
    schema: {
      summary: "Get runtime configuration",
      description: "Returns sanitized runtime configuration without sensitive fields",
      tags: ["Admin - Config"],
      security: adminTokenSecurity,
      response: {
        200: configResponseSchema,
        ...error401,
      },
    },
  }, async (_request, _reply) => {
    const { port, host, log_level, default_rpm, default_tpm, default_rpd, security, retry } = server.config;
    return { port, host, log_level, default_rpm, default_tpm, default_rpd, security, retry };
  });

  server.get("/admin/providers", {
    schema: {
      summary: "List providers",
      description: "Returns all configured providers with key counts instead of actual keys",
      tags: ["Admin - Config"],
      security: adminTokenSecurity,
      response: {
        200: providersResponseSchema,
        ...error401,
      },
    },
  }, async (_request, _reply) => {
    const providers = server.config.providers.map((p) => ({
      name: p.name,
      baseUrl: p.baseUrl,
      keyStrategy: p.keyStrategy,
      keyCount: p.apiKeys?.length ?? 1,
      modelMappings: p.modelMappings,
      isDefault: p.isDefault,
    }));
    return { providers };
  });

  server.get("/admin/providers/health", {
    schema: {
      summary: "Get provider key health",
      description: "Returns health status for each provider's keys",
      tags: ["Admin - Config"],
      security: adminTokenSecurity,
      response: {
        200: providersHealthResponseSchema,
        ...error401,
      },
    },
  }, async (_request, _reply) => {
    const providers = server.config.providers.map((p) => {
      const keys = (p.apiKeys?.length ? p.apiKeys : [p.apiKey]).map((key, i) => ({
        id: `key-${i}`,
        ...server.healthTracker.getHealth(key),
      }));
      return { name: p.name, keys };
    });
    return { providers };
  });

  done();
};
