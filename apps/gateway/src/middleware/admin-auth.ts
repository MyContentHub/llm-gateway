import type { FastifyPluginCallback } from "fastify";

export function createAdminAuthPlugin(adminToken: string): FastifyPluginCallback {
  return (server, _opts, done) => {
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
    done();
  };
}
