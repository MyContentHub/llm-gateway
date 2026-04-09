import type { AppConfig } from "./config/index.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
  }
}
