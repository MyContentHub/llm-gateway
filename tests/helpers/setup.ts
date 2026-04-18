import Fastify from "fastify";
import Database from "better-sqlite3";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "../../src/db/migrations.js";
import { KeyStore } from "../../src/db/keys.js";
import type { RateLimits } from "../../src/db/keys.js";
import { RateLimiter, createRateLimitMiddleware, createRateLimitResponseHook } from "../../src/middleware/rate-limit.js";
import { createAuthMiddleware } from "../../src/middleware/auth.js";
import { createSecurityMiddleware } from "../../src/middleware/security.js";
import { adminKeysPlugin } from "../../src/routes/admin/keys.js";
import { adminAuditPlugin } from "../../src/routes/admin/audit.js";
import { adminConfigPlugin } from "../../src/routes/admin/config.js";
import { KeyHealthTracker } from "../../src/proxy/health-tracker.js";
import { createAuditLogger } from "../../src/audit/logger.js";
import { setupMetrics } from "../../src/audit/metrics.js";
import { chatCompletionsPlugin } from "../../src/routes/v1/chat-completions.js";
import { embeddingsPlugin } from "../../src/routes/v1/embeddings.js";
import { modelsPlugin } from "../../src/routes/v1/models.js";
import { openapiPlugin } from "../../src/plugins/openapi.js";
import "../../src/types.js";
import type { AppConfig, SecurityConfig } from "../../src/config/index.js";
import type { FastifyInstance } from "fastify";
import { createMockUpstream, getServerUrl } from "./mock-upstream.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_ADMIN_TOKEN = "test-admin-token";
const DEFAULT_ENCRYPTION_KEY = "test-encryption-key-32ch";

export interface TestServerOptions {
  adminToken?: string;
  encryptionKey?: string;
  defaultRpm?: number;
  defaultTpm?: number;
  defaultRpd?: number;
  security?: SecurityConfig;
  upstreamUrl?: string;
}

export interface TestServerResult {
  server: FastifyInstance;
  upstream?: FastifyInstance;
  adminToken: string;
  cleanup: () => Promise<void>;
  createKey: (name?: string, rateLimits?: RateLimits) => Promise<string>;
}

export async function createTestServer(options?: TestServerOptions): Promise<TestServerResult> {
  let upstream: FastifyInstance | undefined;
  let upstreamUrl: string;
  if (options?.upstreamUrl) {
    upstreamUrl = options.upstreamUrl;
  } else {
    upstream = await createMockUpstream();
    upstreamUrl = getServerUrl(upstream);
  }

  const adminToken = options?.adminToken ?? DEFAULT_ADMIN_TOKEN;
  const encryptionKey = options?.encryptionKey ?? DEFAULT_ENCRYPTION_KEY;
  const defaultRpm = options?.defaultRpm ?? 60;
  const defaultTpm = options?.defaultTpm ?? 100000;
  const defaultRpd = options?.defaultRpd ?? 1000;

  const config: AppConfig = {
    port: 0,
    host: "127.0.0.1",
    log_level: "silent",
    database_path: ":memory:",
    encryption_key: encryptionKey,
    providers: [
      {
        name: "test-provider",
        baseUrl: upstreamUrl,
        apiKey: "sk-test-key",
        keyStrategy: "round-robin",
        modelMappings: { "gpt-4o": "gpt-4o", "gpt-4o-mini": "gpt-4o-mini" },
        isDefault: true,
      },
    ],
    admin_token: adminToken,
    default_rpm: defaultRpm,
    default_tpm: defaultTpm,
    default_rpd: defaultRpd,
    security: options?.security ?? {
      injection_threshold: 0.5,
      blocked_pii_types: ["SSN", "CREDIT_CARD"],
      flagged_pii_types: ["EMAIL", "PHONE", "CN_ID", "BANK_CARD", "IP_ADDRESS", "DATE_OF_BIRTH", "PERSON", "PLACE", "ORGANIZATION"],
    },
    retry: {
      max_retries: 2,
      initial_delay_ms: 1000,
      max_delay_ms: 10000,
      backoff_multiplier: 2,
    },
  };

  const server = Fastify({ logger: false });
  server.decorate("config", config);

  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const migrationsDir = resolve(__dirname, "../../migrations");
  runMigrations(db, migrationsDir);
  server.decorate("db", db);

  const rateLimiter = new RateLimiter({ rpm: defaultRpm, tpm: defaultTpm, rpd: defaultRpd });
  server.decorate("rateLimiter", rateLimiter);

  await server.register(openapiPlugin);

  server.get("/health", async () => {
    return { status: "ok", providers: config.providers.length };
  });

  await server.register(async (apiScope) => {
    await apiScope.register(async (v1Scope) => {
      v1Scope.addHook("onRequest", createAuthMiddleware(db));
      v1Scope.addHook("preHandler", createRateLimitMiddleware(rateLimiter));
      v1Scope.addHook("onSend", createRateLimitResponseHook(rateLimiter));
      if (options?.security) {
        v1Scope.addHook("preHandler", createSecurityMiddleware(options.security));
      }
      await v1Scope.register(createAuditLogger(db, config));
      await v1Scope.register(chatCompletionsPlugin);
      await v1Scope.register(embeddingsPlugin);
      await v1Scope.register(modelsPlugin);
    });

    await apiScope.register(adminKeysPlugin);
    await apiScope.register(adminAuditPlugin);
    await apiScope.register(adminConfigPlugin);
  }, { prefix: "/api" });

  server.decorate("healthTracker", new KeyHealthTracker());

  setupMetrics(server);

  await server.ready();

  const keyStore = new KeyStore(db, encryptionKey);

  async function createKey(name = "test-key", rateLimits?: RateLimits): Promise<string> {
    const result = await keyStore.createKey({
      name,
      rateLimits: rateLimits ?? { rpm: defaultRpm, tpm: defaultTpm, rpd: defaultRpd },
    });
    return result.key;
  }

  const cleanup = async () => {
    await server.close();
    if (upstream) await upstream.close();
    db.close();
  };

  return { server, upstream, adminToken, cleanup, createKey };
}
