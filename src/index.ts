import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";
import { loadConfig } from "./config/index.js";

async function main() {
  const config = loadConfig();

  const server = Fastify({
    logger: {
      level: config.LOG_LEVEL,
    },
  });

  await server.register(cors, { origin: true });

  server.get("/health", async () => {
    return { status: "ok", providers: config.PROVIDERS.length };
  });

  server.decorate("config", config);

  await server.listen({ port: config.PORT, host: config.HOST });
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
