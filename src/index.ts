import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";

async function main() {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
    },
  });

  await server.register(cors, { origin: true });

  server.get("/health", async () => {
    return { status: "ok" };
  });

  await server.listen({ port, host });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

export { main };
