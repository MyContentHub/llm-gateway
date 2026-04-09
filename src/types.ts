import type { AppConfig } from "./config/index.js";
import type Database from "better-sqlite3";
import type { RateLimiter } from "./middleware/rate-limit.js";
import type { SecurityScanResult } from "./middleware/security.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
    db: Database.Database;
    rateLimiter: RateLimiter;
  }

  interface FastifyRequest {
    securityScan?: SecurityScanResult;
  }
}
