import type { AppConfig } from "./config/index.js";
import type Database from "better-sqlite3";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
    db: Database.Database;
  }
}
