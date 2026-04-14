import Fastify from "fastify";
import Database from "better-sqlite3";
import { resolve } from "node:path";
import { runMigrations } from "../../../src/db/migrations.js";
import { KeyStore } from "../../../src/db/keys.js";
import type { RateLimits } from "../../../src/db/keys.js";
import { AuditStore } from "../../../src/db/audit-store.js";
import type { AuditLogEntry } from "../../../src/db/audit-store.js";
import { RateLimiter, createRateLimitMiddleware, createRateLimitResponseHook } from "../../../src/middleware/rate-limit.js";
import { createAuthMiddleware } from "../../../src/middleware/auth.js";
import { createAuditLogger } from "../../../src/audit/logger.js";
import { setupMetrics } from "../../../src/audit/metrics.js";
import { chatCompletionsPlugin } from "../../../src/routes/v1/chat-completions.js";
import { embeddingsPlugin } from "../../../src/routes/v1/embeddings.js";
import { modelsPlugin } from "../../../src/routes/v1/models.js";
import { openapiPlugin } from "../../../src/plugins/openapi.js";
import { adminKeysPlugin } from "../../../src/routes/admin/keys.js";
import { adminAuditPlugin } from "../../../src/routes/admin/audit.js";
import { adminConfigPlugin } from "../../../src/routes/admin/config.js";
import serveAdmin from "../../../src/plugins/serve-admin.js";
import { KeyHealthTracker } from "../../../src/proxy/health-tracker.js";
import { createMockUpstream, getServerUrl } from "../../../tests/helpers/mock-upstream.js";
import type { AppConfig } from "../../../src/config/index.js";
import type { FastifyInstance } from "fastify";

export const ADMIN_TOKEN = "test-admin-token-e2e";

export interface E2EServerResult {
  server: FastifyInstance;
  url: string;
  db: Database.Database;
  cleanup: () => Promise<void>;
  createKey: (name?: string, rateLimits?: RateLimits) => Promise<{ id: string; key: string }>;
  seedAuditLog: (entry: Partial<AuditLogEntry> & { request_id: string; timestamp: string }) => void;
  seedAuditLogs: (count: number, overrides?: Partial<AuditLogEntry>) => void;
}

export async function startE2EServer(): Promise<E2EServerResult> {
  const upstream = await createMockUpstream();
  const upstreamUrl = getServerUrl(upstream);

  const config: AppConfig = {
    port: 0,
    host: "127.0.0.1",
    log_level: "silent",
    database_path: ":memory:",
    encryption_key: "test-encryption-key-32ch",
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
    admin_token: ADMIN_TOKEN,
    default_rpm: 60,
    default_tpm: 100000,
    default_rpd: 1000,
    security: {
      injection_threshold: 0.5,
      blocked_pii_types: ["SSN", "CREDIT_CARD"],
      flagged_pii_types: ["EMAIL", "PHONE", "CN_ID"],
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
  const migrationsDir = resolve(import.meta.dirname, "../../../migrations");
  runMigrations(db, migrationsDir);
  server.decorate("db", db);

  const rateLimiter = new RateLimiter({ rpm: 60, tpm: 100000, rpd: 1000 });
  server.decorate("rateLimiter", rateLimiter);

  await server.register(openapiPlugin);

  server.get("/health", async () => ({ status: "ok" }));

  await server.register(async (v1Scope) => {
    v1Scope.addHook("onRequest", createAuthMiddleware(db));
    v1Scope.addHook("preHandler", createRateLimitMiddleware(rateLimiter));
    v1Scope.addHook("onSend", createRateLimitResponseHook(rateLimiter));
    await v1Scope.register(createAuditLogger(db, config));
    await v1Scope.register(chatCompletionsPlugin);
    await v1Scope.register(embeddingsPlugin);
    await v1Scope.register(modelsPlugin);
  });

  server.decorate("healthTracker", new KeyHealthTracker());

  await server.register(serveAdmin);
  await server.register(adminKeysPlugin);
  await server.register(adminAuditPlugin);
  await server.register(adminConfigPlugin);
  setupMetrics(server);

  await server.ready();
  await server.listen({ port: 0, host: "127.0.0.1" });

  const address = server.addresses()[0];
  const url = `http://${address.address}:${address.port}`;

  const keyStore = new KeyStore(db, config.encryption_key);
  const auditStore = new AuditStore(db);

  function createKey(name = "test-key", rateLimits?: RateLimits) {
    return keyStore.createKey({
      name,
      rateLimits: rateLimits ?? { rpm: 60, tpm: 100000, rpd: 1000 },
    });
  }

  function seedAuditLog(entry: Partial<AuditLogEntry> & { request_id: string; timestamp: string }) {
    auditStore.insertAuditLog({
      request_id: entry.request_id,
      timestamp: entry.timestamp,
      api_key_id: entry.api_key_id ?? "key-seed-00000000",
      model: entry.model ?? "gpt-4o",
      endpoint: entry.endpoint ?? "/v1/chat/completions",
      prompt_tokens: entry.prompt_tokens ?? 100,
      completion_tokens: entry.completion_tokens ?? 50,
      cost_usd: entry.cost_usd ?? 0.005,
      latency_ms: entry.latency_ms ?? 500,
      status: entry.status ?? "success",
      pii_detected: entry.pii_detected ?? false,
      pii_types_found: entry.pii_types_found ?? null,
      prompt_injection_score: entry.prompt_injection_score ?? 0,
      content_hash_sha256: entry.content_hash_sha256 ?? null,
    });
  }

  function seedAuditLogs(count: number, overrides?: Partial<AuditLogEntry>) {
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      const ts = new Date(now - i * 60000).toISOString();
      const models = ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"];
      const statuses = ["success", "success", "success", "error", "blocked"];
      seedAuditLog({
        request_id: `req-${i.toString().padStart(4, "0")}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: ts,
        model: overrides?.model ?? models[i % models.length],
        status: overrides?.status ?? statuses[i % statuses.length],
        prompt_tokens: overrides?.prompt_tokens ?? 50 + Math.floor(Math.random() * 200),
        completion_tokens: overrides?.completion_tokens ?? 20 + Math.floor(Math.random() * 100),
        cost_usd: overrides?.cost_usd ?? Math.round((0.001 + Math.random() * 0.05) * 10000) / 10000,
        latency_ms: overrides?.latency_ms ?? 100 + Math.floor(Math.random() * 2000),
        pii_detected: overrides?.pii_detected ?? i % 5 === 0,
        pii_types_found: overrides?.pii_types_found ?? (i % 5 === 0 ? '["EMAIL","PHONE"]' : null),
        prompt_injection_score: overrides?.prompt_injection_score ?? (i % 7 === 0 ? 0.8 : 0),
        ...overrides,
      });
    }
  }

  const cleanup = async () => {
    await server.close();
    await upstream.close();
    db.close();
  };

  return { server, url, db, cleanup, createKey, seedAuditLog, seedAuditLogs };
}
