import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adminAuditPlugin } from "./audit.js";
import "../../types.js";
import type { AppConfig } from "../../config/index.js";
import { DEFAULT_SECURITY_CONFIG } from "../../config/index.js";
import { AuditStore } from "../../db/audit-store.js";

const ADMIN_TOKEN = "test-admin-token";

function initDb(db: Database.Database): void {
  const sql = readFileSync(resolve(import.meta.dirname, "../../../migrations/001-init.sql"), "utf-8");
  db.exec(sql);
}

function createServer(): Fastify.FastifyInstance {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initDb(db);

  const server = Fastify({ logger: false });
  const config: AppConfig = {
    port: 3000,
    host: "0.0.0.0",
    log_level: "silent",
    database_path: ":memory:",
    encryption_key: "test-encryption-key-32-bytes!!",
    providers: [],
    admin_token: ADMIN_TOKEN,
    default_rpm: 60,
    default_tpm: 100000,
    default_rpd: 1000,
    security: DEFAULT_SECURITY_CONFIG,
    retry: { max_retries: 2, initial_delay_ms: 1000, max_delay_ms: 10000, backoff_multiplier: 2 },
  };

  server.decorate("config", config);
  server.decorate("db", db);

  server.addHook("onClose", () => {
    db.close();
  });

  server.register(adminAuditPlugin);
  return server;
}

const authHeaders = (token: string = ADMIN_TOKEN) => ({
  authorization: `Bearer ${token}`,
});

function insertTestLog(db: Database.Database, overrides: Partial<{
  request_id: string;
  timestamp: string;
  api_key_id: string | null;
  model: string | null;
  endpoint: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  latency_ms: number;
  status: string;
  pii_detected: boolean;
  pii_types_found: string | null;
  prompt_injection_score: number;
  content_hash_sha256: string | null;
}> = {}) {
  const store = new AuditStore(db);
  store.insertAuditLog({
    request_id: overrides.request_id ?? crypto.randomUUID(),
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    api_key_id: overrides.api_key_id ?? null,
    model: overrides.model ?? "gpt-4o",
    endpoint: overrides.endpoint ?? "/v1/chat/completions",
    prompt_tokens: overrides.prompt_tokens ?? 100,
    completion_tokens: overrides.completion_tokens ?? 50,
    cost_usd: overrides.cost_usd ?? 0.005,
    latency_ms: overrides.latency_ms ?? 500,
    status: overrides.status ?? "success",
    pii_detected: overrides.pii_detected ?? false,
    pii_types_found: overrides.pii_types_found ?? null,
    prompt_injection_score: overrides.prompt_injection_score ?? 0,
    content_hash_sha256: overrides.content_hash_sha256 ?? null,
  });
}

describe("Admin Audit Routes", () => {
  let server: Fastify.FastifyInstance;

  beforeEach(() => {
    server = createServer();
  });

  afterEach(async () => {
    await server.close();
  });

  describe("GET /admin/audit/logs", () => {
    it("returns empty list when no logs exist", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/logs",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.logs).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.limit).toBe(50);
      expect(body.offset).toBe(0);
    });

    it("returns paginated audit logs sorted by timestamp descending", async () => {
      const db = (server as any).db as Database.Database;

      insertTestLog(db, { request_id: "req-1", timestamp: "2025-01-01T00:00:00.000Z", model: "gpt-4o" });
      insertTestLog(db, { request_id: "req-2", timestamp: "2025-01-02T00:00:00.000Z", model: "gpt-3.5-turbo" });
      insertTestLog(db, { request_id: "req-3", timestamp: "2025-01-03T00:00:00.000Z", model: "gpt-4o" });

      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/logs",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(3);
      expect(body.logs).toHaveLength(3);
      expect(body.logs[0].request_id).toBe("req-3");
      expect(body.logs[1].request_id).toBe("req-2");
      expect(body.logs[2].request_id).toBe("req-1");
    });

    it("supports limit and offset pagination", async () => {
      const db = (server as any).db as Database.Database;

      for (let i = 0; i < 5; i++) {
        insertTestLog(db, { request_id: `req-${i}`, timestamp: `2025-01-0${i + 1}T00:00:00.000Z` });
      }

      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/logs?limit=2&offset=1",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(5);
      expect(body.logs).toHaveLength(2);
      expect(body.limit).toBe(2);
      expect(body.offset).toBe(1);
    });

    it("filters by model", async () => {
      const db = (server as any).db as Database.Database;

      insertTestLog(db, { request_id: "req-1", model: "gpt-4o" });
      insertTestLog(db, { request_id: "req-2", model: "gpt-3.5-turbo" });
      insertTestLog(db, { request_id: "req-3", model: "gpt-4o" });

      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/logs?model=gpt-4o",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(2);
      expect(body.logs).toHaveLength(2);
      expect(body.logs.every((l: any) => l.model === "gpt-4o")).toBe(true);
    });

    it("filters by endpoint", async () => {
      const db = (server as any).db as Database.Database;

      insertTestLog(db, { request_id: "req-1", endpoint: "/v1/chat/completions" });
      insertTestLog(db, { request_id: "req-2", endpoint: "/v1/embeddings" });

      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/logs?endpoint=/v1/chat/completions",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(1);
      expect(body.logs[0].request_id).toBe("req-1");
    });

    it("filters by status", async () => {
      const db = (server as any).db as Database.Database;

      insertTestLog(db, { request_id: "req-1", status: "success" });
      insertTestLog(db, { request_id: "req-2", status: "error" });

      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/logs?status=error",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(1);
      expect(body.logs[0].request_id).toBe("req-2");
    });

    it("filters by api_key_id", async () => {
      const db = (server as any).db as Database.Database;

      insertTestLog(db, { request_id: "req-1", api_key_id: "key-abc" });
      insertTestLog(db, { request_id: "req-2", api_key_id: "key-xyz" });

      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/logs?api_key_id=key-abc",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(1);
      expect(body.logs[0].request_id).toBe("req-1");
    });

    it("filters by date range", async () => {
      const db = (server as any).db as Database.Database;

      insertTestLog(db, { request_id: "req-1", timestamp: "2025-01-01T00:00:00.000Z" });
      insertTestLog(db, { request_id: "req-2", timestamp: "2025-01-15T00:00:00.000Z" });
      insertTestLog(db, { request_id: "req-3", timestamp: "2025-01-30T00:00:00.000Z" });

      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/logs?startDate=2025-01-10T00:00:00.000Z&endDate=2025-01-20T00:00:00.000Z",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(1);
      expect(body.logs[0].request_id).toBe("req-2");
    });

    it("combines multiple filters", async () => {
      const db = (server as any).db as Database.Database;

      insertTestLog(db, { request_id: "req-1", model: "gpt-4o", status: "success", timestamp: "2025-01-10T00:00:00.000Z" });
      insertTestLog(db, { request_id: "req-2", model: "gpt-4o", status: "error", timestamp: "2025-01-10T00:00:00.000Z" });
      insertTestLog(db, { request_id: "req-3", model: "gpt-3.5-turbo", status: "success", timestamp: "2025-01-10T00:00:00.000Z" });

      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/logs?model=gpt-4o&status=success",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(1);
      expect(body.logs[0].request_id).toBe("req-1");
    });

    it("returns 401 without auth token", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/logs",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 401 with wrong token", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/logs",
        headers: authHeaders("wrong-token"),
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 400 with invalid limit", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/logs?limit=-1",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 with invalid offset", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/logs?offset=-5",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /admin/audit/logs/:requestId", () => {
    it("returns a single audit log by requestId", async () => {
      const db = (server as any).db as Database.Database;

      insertTestLog(db, {
        request_id: "req-specific",
        model: "gpt-4o",
        prompt_tokens: 200,
        completion_tokens: 100,
        cost_usd: 0.015,
        latency_ms: 1200,
        status: "success",
        pii_detected: true,
        pii_types_found: "EMAIL,PHONE",
      });

      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/logs/req-specific",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.request_id).toBe("req-specific");
      expect(body.model).toBe("gpt-4o");
      expect(body.prompt_tokens).toBe(200);
      expect(body.completion_tokens).toBe(100);
      expect(body.cost_usd).toBe(0.015);
      expect(body.latency_ms).toBe(1200);
      expect(body.status).toBe("success");
      expect(body.pii_detected).toBe(1);
      expect(body.pii_types_found).toBe("EMAIL,PHONE");
    });

    it("returns 404 for nonexistent requestId", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/logs/nonexistent-id",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("audit_log_not_found");
    });

    it("returns 401 without auth token", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/logs/some-id",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 401 with wrong token", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/logs/some-id",
        headers: authHeaders("wrong-token"),
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /admin/audit/stats", () => {
    it("returns zero stats when no logs exist", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/stats",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalRequests).toBe(0);
      expect(body.totalTokens).toBe(0);
      expect(body.totalCostUsd).toBe(0);
      expect(body.avgLatencyMs).toBe(0);
      expect(body.piiDetectionRate).toBe(0);
      expect(body.byModel).toEqual({});
      expect(body.byStatus).toEqual({});
    });

    it("returns aggregate statistics", async () => {
      const db = (server as any).db as Database.Database;

      insertTestLog(db, {
        request_id: "req-1",
        model: "gpt-4o",
        prompt_tokens: 100,
        completion_tokens: 50,
        cost_usd: 0.01,
        latency_ms: 500,
        status: "success",
        pii_detected: true,
      });
      insertTestLog(db, {
        request_id: "req-2",
        model: "gpt-4o",
        prompt_tokens: 200,
        completion_tokens: 100,
        cost_usd: 0.02,
        latency_ms: 1500,
        status: "success",
        pii_detected: false,
      });
      insertTestLog(db, {
        request_id: "req-3",
        model: "gpt-3.5-turbo",
        prompt_tokens: 50,
        completion_tokens: 25,
        cost_usd: 0.002,
        latency_ms: 300,
        status: "error",
        pii_detected: false,
      });

      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/stats",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalRequests).toBe(3);
      expect(body.totalTokens).toBe(525);
      expect(body.totalCostUsd).toBeCloseTo(0.032, 4);
      expect(body.avgLatencyMs).toBeCloseTo(766.67, 0);
      expect(body.piiDetectionRate).toBeCloseTo(1 / 3, 2);

      expect(body.byModel["gpt-4o"]).toBeDefined();
      expect(body.byModel["gpt-4o"].count).toBe(2);
      expect(body.byModel["gpt-4o"].tokens).toBe(450);
      expect(body.byModel["gpt-3.5-turbo"].count).toBe(1);
      expect(body.byModel["gpt-3.5-turbo"].tokens).toBe(75);

      expect(body.byStatus["success"]).toBe(2);
      expect(body.byStatus["error"]).toBe(1);
    });

    it("respects date range filters", async () => {
      const db = (server as any).db as Database.Database;

      insertTestLog(db, {
        request_id: "req-1",
        timestamp: "2025-01-01T00:00:00.000Z",
        prompt_tokens: 100,
        completion_tokens: 50,
      });
      insertTestLog(db, {
        request_id: "req-2",
        timestamp: "2025-01-15T00:00:00.000Z",
        prompt_tokens: 200,
        completion_tokens: 100,
      });
      insertTestLog(db, {
        request_id: "req-3",
        timestamp: "2025-01-30T00:00:00.000Z",
        prompt_tokens: 300,
        completion_tokens: 150,
      });

      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/stats?startDate=2025-01-10T00:00:00.000Z&endDate=2025-01-20T00:00:00.000Z",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalRequests).toBe(1);
      expect(body.totalTokens).toBe(300);
    });

    it("filters by startDate only", async () => {
      const db = (server as any).db as Database.Database;

      insertTestLog(db, { request_id: "req-1", timestamp: "2025-01-01T00:00:00.000Z" });
      insertTestLog(db, { request_id: "req-2", timestamp: "2025-01-15T00:00:00.000Z" });
      insertTestLog(db, { request_id: "req-3", timestamp: "2025-01-30T00:00:00.000Z" });

      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/stats?startDate=2025-01-15T00:00:00.000Z",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalRequests).toBe(2);
    });

    it("returns 401 without auth token", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/stats",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 401 with wrong token", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/admin/audit/stats",
        headers: authHeaders("wrong-token"),
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
