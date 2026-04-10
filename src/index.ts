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

  server.get("/health", async () => {
    return { status: "ok", providers: config.providers.length };
  });

  server.decorate("config", config);

  await server.register(createDbPlugin, { databasePath: config.database_path });

  const rateLimiter = new RateLimiter({ rpm: config.default_rpm, tpm: config.default_tpm, rpd: config.default_rpd });
  server.decorate("rateLimiter", rateLimiter);

  const metrics = createMetrics();
  setupMetrics(server, metrics);

  await server.register(
    async (v1Scope) => {
      v1Scope.addHook("onRequest", createAuthMiddleware(server.db));
      v1Scope.addHook("preHandler", createRateLimitMiddleware(rateLimiter));
      v1Scope.addHook("preHandler", createSecurityMiddleware(config.security));
      v1Scope.addHook("onSend", createRateLimitResponseHook(rateLimiter));
      await v1Scope.register(createAuditLogger(server.db, config));
      await v1Scope.register(chatCompletionsPlugin);
      await v1Scope.register(embeddingsPlugin);
      await v1Scope.register(modelsPlugin);
    },
    { prefix: "/v1" },
  );

  await server.register(adminKeysPlugin);
  await server.register(adminAuditPlugin);

  await server.listen({ port: config.port, host: config.host });
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
