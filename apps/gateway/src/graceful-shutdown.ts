import type { FastifyInstance } from "fastify";

interface GracefulShutdownOptions {
  timeoutMs: number;
  logger?: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

export function setupGracefulShutdown(
  server: FastifyInstance,
  options?: Partial<GracefulShutdownOptions>,
): void {
  const timeoutMs = options?.timeoutMs ?? 30000;
  const logger = options?.logger ?? server.log;
  let isShuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    const timer = setTimeout(() => {
      logger.error("Shutdown timeout exceeded, forcing exit");
      process.exit(1);
    }, timeoutMs);

    try {
      await server.close();
      clearTimeout(timer);
      logger.info("Graceful shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error("Error during shutdown:", err);
      process.exit(1);
    }
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception:", err);
    shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection:", reason);
    shutdown("unhandledRejection");
  });
}
