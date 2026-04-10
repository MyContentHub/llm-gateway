import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { createAuditLogger } from "./logger.js";
import { AuditStore } from "../db/audit-store.js";
import type { AppConfig } from "../config/index.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  api_key_id TEXT,
  model TEXT,
  endpoint TEXT,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  pii_detected INTEGER DEFAULT 0,
  pii_types_found TEXT,
  prompt_injection_score REAL DEFAULT 0,
  content_hash_sha256 TEXT
);
`;

function makeConfig(): AppConfig {
  return {
    port: 3000,
    host: "0.0.0.0",
    log_level: "silent",
    database_path: ":memory:",
    encryption_key: "",
    providers: [],
    admin_token: "test-token",
    default_rpm: 60,
    default_tpm: 100000,
    default_rpd: 1000,
    security: {
      injection_threshold: 0.5,
      blocked_pii_types: [],
      flagged_pii_types: [],
    },
    retry: { max_retries: 2, initial_delay_ms: 1000, max_delay_ms: 10000, backoff_multiplier: 2 },
  };
}

function getLastAuditRow(store: AuditStore) {
  const result = store.queryAuditLogs({ limit: 1, offset: 0 });
  return result.rows[0] ?? null;
}

describe("createAuditLogger", () => {
  let server: Fastify.FastifyInstance;
  let db: Database.Database;
  let auditStore: AuditStore;
  let config: AppConfig;

  beforeEach(async () => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    auditStore = new AuditStore(db);
    config = makeConfig();

    server = Fastify({ logger: false });
    await server.register(createAuditLogger(db, config));
  });

  afterEach(async () => {
    await server.close();
    db.close();
  });

  describe("successful non-streaming request", () => {
    beforeEach(() => {
      server.post("/v1/chat/completions", async (request, reply) => {
        return reply.code(200).send({
          id: "chatcmpl-123",
          model: "gpt-4o",
          usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
        });
      });
    });

    it("writes an audit log record with correct model, tokens, cost, latency, and status", async () => {
      const payload = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      };

      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload,
      });

      const row = getLastAuditRow(auditStore);
      expect(row).not.toBeNull();
      expect(row!.model).toBe("gpt-4o");
      expect(row!.prompt_tokens).toBe(50);
      expect(row!.completion_tokens).toBe(100);
      expect(row!.cost_usd).toBeGreaterThan(0);
      expect(row!.latency_ms).toBeGreaterThanOrEqual(0);
      expect(row!.status).toBe("success");
    });

    it("records the correct endpoint", async () => {
      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "gpt-4o", messages: [] },
      });

      const row = getLastAuditRow(auditStore);
      expect(row!.endpoint).toBe("/v1/chat/completions");
    });

    it("computes cost from token usage", async () => {
      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "gpt-4o", messages: [] },
      });

      const row = getLastAuditRow(auditStore);
      const expectedCost = (50 / 1_000_000) * 2.5 + (100 / 1_000_000) * 10.0;
      expect(row!.cost_usd).toBeCloseTo(expectedCost, 8);
    });

    it("computes SHA-256 content hash of request body", async () => {
      const payload = { model: "gpt-4o", messages: [{ role: "user", content: "Hello" }] };

      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload,
      });

      const row = getLastAuditRow(auditStore);
      const expectedHash = createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex");
      expect(row!.content_hash_sha256).toBe(expectedHash);
    });

    it("captures api_key_id from request.apiKey", async () => {
      server.addHook("preHandler", (request, _reply, done) => {
        (request as any).apiKey = { id: "key-test-123", name: "test", rateLimits: { rpm: 60, tpm: 100000, rpd: 1000 } };
        done();
      });

      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "gpt-4o", messages: [] },
      });

      const row = getLastAuditRow(auditStore);
      expect(row!.api_key_id).toBe("key-test-123");
    });

    it("sets request_id to a valid UUID", async () => {
      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "gpt-4o", messages: [] },
      });

      const row = getLastAuditRow(auditStore);
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      expect(row!.request_id).toMatch(uuidRegex);
    });

    it("records a valid ISO timestamp", async () => {
      const before = new Date().toISOString();

      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "gpt-4o", messages: [] },
      });

      const after = new Date().toISOString();
      const row = getLastAuditRow(auditStore);
      expect(row!.timestamp >= before).toBe(true);
      expect(row!.timestamp <= after).toBe(true);
    });
  });

  describe("streaming request", () => {
    beforeEach(() => {
      server.post("/v1/chat/completions", async (request, reply) => {
        const body = request.body as { stream?: boolean };
        if (body?.stream) {
          return reply
            .code(200)
            .header("content-type", "text/event-stream")
            .send("data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\ndata: [DONE]\n\n");
        }
        return reply.code(200).send({});
      });
    });

    it("writes audit log with prompt tokens estimated from request messages", async () => {
      const payload = {
        model: "gpt-4o",
        stream: true,
        messages: [
          { role: "user", content: "Hello, how are you?" },
          { role: "assistant", content: "I'm doing well, thanks!" },
        ],
      };

      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload,
      });

      const row = getLastAuditRow(auditStore);
      expect(row).not.toBeNull();
      expect(row!.prompt_tokens).toBeGreaterThan(0);
      expect(row!.completion_tokens).toBe(0);
      expect(row!.status).toBe("success");
    });

    it("sets completion tokens to 0 for streaming", async () => {
      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "gpt-4o",
          stream: true,
          messages: [{ role: "user", content: "Hi" }],
        },
      });

      const row = getLastAuditRow(auditStore);
      expect(row!.completion_tokens).toBe(0);
    });
  });

  describe("blocked request", () => {
    beforeEach(() => {
      server.addHook("preHandler", (request, _reply, done) => {
        request.securityScan = {
          action: "block",
          piiDetected: false,
          piiTypesFound: [],
          injectionScore: 0.85,
          piiMapping: new Map(),
          redactedMessages: [],
        };
        done();
      });

      server.post("/v1/chat/completions", async (_request, reply) => {
        return reply.code(400).send({
          error: { message: "Blocked by content filter", type: "content_filter_error" },
        });
      });
    });

    it("writes audit log with status=blocked and injection score", async () => {
      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "gpt-4o", messages: [{ role: "user", content: "inject prompt" }] },
      });

      const row = getLastAuditRow(auditStore);
      expect(row).not.toBeNull();
      expect(row!.status).toBe("blocked");
      expect(row!.prompt_injection_score).toBe(0.85);
    });
  });

  describe("upstream error", () => {
    beforeEach(() => {
      server.post("/v1/chat/completions", async (_request, reply) => {
        return reply.code(502).send({
          error: { message: "Upstream connection error", type: "upstream_error" },
        });
      });
    });

    it("writes audit log with status=error for 502 response", async () => {
      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "gpt-4o", messages: [] },
      });

      const row = getLastAuditRow(auditStore);
      expect(row).not.toBeNull();
      expect(row!.status).toBe("error");
    });

    it("writes audit log with status=error for 500 response", async () => {
      server.post("/v1/chat/completions-error", async (_request, reply) => {
        return reply.code(500).send({ error: "Internal error" });
      });

      await server.inject({
        method: "POST",
        url: "/v1/chat/completions-error",
        payload: { model: "gpt-4o", messages: [] },
      });

      const result = auditStore.queryAuditLogs({});
      const errorRows = result.rows.filter((r) => r.status === "error");
      expect(errorRows.length).toBeGreaterThanOrEqual(1);
    });

    it("writes audit log with status=error for 401 response", async () => {
      server.post("/v1/chat/completions-unauth", async (_request, reply) => {
        return reply.code(401).send({ error: { message: "Unauthorized" } });
      });

      await server.inject({
        method: "POST",
        url: "/v1/chat/completions-unauth",
        payload: { model: "gpt-4o", messages: [] },
      });

      const result = auditStore.queryAuditLogs({});
      const errorRows = result.rows.filter((r) => r.status === "error");
      expect(errorRows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("PII detection", () => {
    beforeEach(() => {
      server.addHook("preHandler", (request, _reply, done) => {
        request.securityScan = {
          action: "allow",
          piiDetected: true,
          piiTypesFound: ["EMAIL", "PHONE"],
          injectionScore: 0.1,
          piiMapping: new Map([["<PII_EMAIL_1>", "test@example.com"]]),
          redactedMessages: [],
        };
        done();
      });

      server.post("/v1/chat/completions", async (_request, reply) => {
        return reply.code(200).send({
          id: "chatcmpl-123",
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        });
      });
    });

    it("writes pii_detected=true when PII is detected", async () => {
      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "gpt-4o", messages: [{ role: "user", content: "My email is test@example.com" }] },
      });

      const row = getLastAuditRow(auditStore);
      expect(row!.pii_detected).toBe(1);
    });

    it("writes pii_types_found as JSON array of detected types", async () => {
      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "gpt-4o", messages: [] },
      });

      const row = getLastAuditRow(auditStore);
      expect(row!.pii_types_found).not.toBeNull();
      const types = JSON.parse(row!.pii_types_found!);
      expect(types).toEqual(["EMAIL", "PHONE"]);
    });

    it("writes injection score from security scan", async () => {
      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "gpt-4o", messages: [] },
      });

      const row = getLastAuditRow(auditStore);
      expect(row!.prompt_injection_score).toBe(0.1);
    });
  });

  describe("no PII detected", () => {
    beforeEach(() => {
      server.post("/v1/chat/completions", async (_request, reply) => {
        return reply.code(200).send({
          id: "chatcmpl-123",
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        });
      });
    });

    it("writes pii_detected=false and null pii_types_found when no security scan", async () => {
      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "gpt-4o", messages: [] },
      });

      const row = getLastAuditRow(auditStore);
      expect(row!.pii_detected).toBe(0);
      expect(row!.pii_types_found).toBeNull();
    });
  });

  describe("content hash", () => {
    beforeEach(() => {
      server.post("/v1/chat/completions", async (_request, reply) => {
        return reply.code(200).send({ usage: { prompt_tokens: 5, completion_tokens: 5 } });
      });
    });

    it("computes SHA-256 hex digest of request body JSON", async () => {
      const payload = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "test" }],
        temperature: 0.7,
      };

      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload,
      });

      const row = getLastAuditRow(auditStore);
      const expectedHash = createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex");
      expect(row!.content_hash_sha256).toBe(expectedHash);
      expect(row!.content_hash_sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it("produces different hashes for different request bodies", async () => {
      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "gpt-4o", messages: [{ role: "user", content: "first" }] },
      });

      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "gpt-4o", messages: [{ role: "user", content: "second" }] },
      });

      const result = auditStore.queryAuditLogs({ limit: 2 });
      const hashes = result.rows.map((r) => r.content_hash_sha256);
      expect(hashes[0]).not.toBe(hashes[1]);
    });
  });

  describe("non-v1 routes", () => {
    it("does not write audit logs for non-v1 routes", async () => {
      server.get("/health", async () => ({ status: "ok" }));

      await server.inject({ method: "GET", url: "/health" });

      const row = getLastAuditRow(auditStore);
      expect(row).toBeNull();
    });
  });

  describe("request without body", () => {
    it("handles GET requests with no body", async () => {
      server.get("/v1/models", async () => ({ data: [] }));

      await server.inject({ method: "GET", url: "/v1/models" });

      const row = getLastAuditRow(auditStore);
      expect(row).not.toBeNull();
      expect(row!.model).toBe("unknown");
      expect(row!.prompt_tokens).toBe(0);
      expect(row!.completion_tokens).toBe(0);
      expect(row!.content_hash_sha256).toBeNull();
    });
  });

  describe("model not in pricing table", () => {
    it("records cost_usd as 0 for unknown models", async () => {
      server.post("/v1/chat/completions", async (_request, reply) => {
        return reply.code(200).send({
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        });
      });

      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "unknown-model-xyz", messages: [] },
      });

      const row = getLastAuditRow(auditStore);
      expect(row!.cost_usd).toBe(0);
    });
  });

  describe("multiple requests", () => {
    it("writes separate audit records for each request", async () => {
      server.post("/v1/chat/completions", async (_request, reply) => {
        return reply.code(200).send({ usage: { prompt_tokens: 10, completion_tokens: 5 } });
      });

      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "gpt-4o", messages: [{ role: "user", content: "one" }] },
      });
      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "gpt-3.5-turbo", messages: [{ role: "user", content: "two" }] },
      });
      await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "gpt-4", messages: [{ role: "user", content: "three" }] },
      });

      const result = auditStore.queryAuditLogs({});
      expect(result.total).toBe(3);

      const models = result.rows.map((r) => r.model).sort();
      expect(models).toEqual(["gpt-3.5-turbo", "gpt-4", "gpt-4o"]);
    });
  });
});
