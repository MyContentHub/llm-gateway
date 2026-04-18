import type { FastifyPluginCallback } from "fastify";
import fp from "fastify-plugin";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";

const openapiPlugin: FastifyPluginCallback = async (server, _opts) => {
  await server.register(fastifySwagger, {
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "LLM Gateway API",
        version: "1.0.0",
        description:
          "LLM API security proxy gateway — intercepts, scans, and audits all OpenAI-compatible API requests. Supports chat completions, embeddings, and model listing with PII redaction, rate limiting, and audit logging.",
      },
      components: {
        securitySchemes: {
          VirtualKey: {
            type: "http",
            scheme: "bearer",
            description: "Virtual API key for /api/v1/* endpoints",
          },
          AdminToken: {
            type: "http",
            scheme: "bearer",
            description: "Admin token for /api/admin/* endpoints",
          },
        },
      },
    },
  });

  await server.register(fastifySwaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
    staticCSP: true,
  });
};

export default fp(openapiPlugin);
export { openapiPlugin };
