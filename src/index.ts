import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadConfig } from "./config/index.js";
import { chatCompletionsPlugin } from "./routes/v1/chat-completions.js";
import { embeddingsPlugin } from "./routes/v1/embeddings.js";
import { modelsPlugin } from "./routes/v1/models.js";
import createDbPlugin from "./db/index.js";
import { RateLimiter, createRateLimitMiddleware, createRateLimitResponseHook } from "./middleware/rate-limit.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { createSecurityMiddleware } from "./middleware/security.js";
import { adminKeysPlugin } from "./routes/admin/keys.js";
import { createAuditLogger } from "./audit/logger.js";
import { setupMetrics, createMetrics } from "./audit/metrics.js";
import { adminAuditPlugin } from "./routes/admin/audit.js";
import { adminConfigPlugin } from "./routes/admin/config.js";
import { HookManager } from "./hooks/index.js";
import { KeyHealthTracker } from "./proxy/health-tracker.js";
import { setupGracefulShutdown } from "./graceful-shutdown.js";
import { openapiPlugin } from "./plugins/openapi.js";
import serveAdminPlugin from "./plugins/serve-admin.js";
import "./types.js";

async function main() {
  const config = await loadConfig();

  const server = Fastify({
    logger: {
      level: config.log_level,
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname" } }
          : undefined,
    },
  });

  await server.register(cors, { origin: true });
  await server.register(openapiPlugin);

  server.get("/health", {
    schema: {
      summary: "Health check",
      description: "Returns the gateway health status and number of configured providers",
      tags: ["Health"],
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string", example: "ok" },
            providers: { type: "number", description: "Number of configured providers" },
          },
        },
      },
    },
  }, async () => {
    return { status: "ok", providers: config.providers.length };
  });

  server.decorate("config", config);

  await server.register(createDbPlugin, { databasePath: config.database_path });

  const rateLimiter = new RateLimiter({ rpm: config.default_rpm, tpm: config.default_tpm, rpd: config.default_rpd });
  server.decorate("rateLimiter", rateLimiter);

  const metrics = createMetrics();
  setupMetrics(server, metrics);

  const hookManager = new HookManager();
  server.decorate("hooks", hookManager);

  const healthTracker = new KeyHealthTracker();
  server.decorate("healthTracker", healthTracker);

  await server.register(
    async (v1Scope) => {
      v1Scope.addHook("onRequest", createAuthMiddleware(server.db));
      v1Scope.addHook("preHandler", createRateLimitMiddleware(rateLimiter));
      v1Scope.addHook("preHandler", createSecurityMiddleware(config.security));
      v1Scope.addHook("onSend", createRateLimitResponseHook(rateLimiter));
      v1Scope.addHook("onRequest", async (request, reply) => {
        await hookManager.execute("onRequest", { request, reply });
      });
      v1Scope.addHook("onSend", async (request, reply, payload) => {
        await hookManager.execute("onResponse", { request, reply, body: payload, status: reply.statusCode });
        return payload;
      });
      v1Scope.addHook("onError", async (request, reply, error) => {
        await hookManager.execute("onError", { request, reply, error: error as Error });
      });
      await v1Scope.register(createAuditLogger(server.db, config));
      await v1Scope.register(chatCompletionsPlugin);
      await v1Scope.register(embeddingsPlugin);
      await v1Scope.register(modelsPlugin);
    },
    { prefix: "/v1" },
  );

  await server.register(serveAdminPlugin);
  await server.register(adminKeysPlugin);
  await server.register(adminAuditPlugin);
  await server.register(adminConfigPlugin);

  await server.listen({ port: config.port, host: config.host });

  setupGracefulShutdown(server);
}

main().catch((err) => {
  if (err && typeof err === "object" && "issues" in err) {
    const issues = (err as { issues: Array<{ path: (string | number)[]; message: string }> }).issues;
    console.error("Configuration error:");
    for (const issue of issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
  } else {
    console.error("Failed to start server:", err);
  }
  process.exit(1);
});

export { main };
