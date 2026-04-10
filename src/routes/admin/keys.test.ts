import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adminKeysPlugin } from "./keys.js";
import "../../types.js";
import type { AppConfig } from "../../config/index.js";
import { DEFAULT_SECURITY_CONFIG } from "../../config/index.js";

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

  server.register(adminKeysPlugin);
  return server;
}

const authHeaders = (token: string = ADMIN_TOKEN) => ({
  authorization: `Bearer ${token}`,
});

describe("Admin Keys CRUD", () => {
  let server: Fastify.FastifyInstance;

  beforeEach(() => {
    server = createServer();
  });

  afterEach(async () => {
    await server.close();
  });

  describe("POST /admin/keys", () => {
    it("creates a key with default rate limits", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/admin/keys",
        headers: authHeaders(),
        payload: { name: "test-key" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.name).toBe("test-key");
      expect(body.key).toMatch(/^gwk_/);
      expect(body.createdAt).toBeDefined();
    });

    it("creates a key with custom rate limits", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/admin/keys",
        headers: authHeaders(),
        payload: {
          name: "custom-key",
          rateLimits: { rpm: 100, tpm: 200000, rpd: 5000 },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.name).toBe("custom-key");
      expect(body.key).toMatch(/^gwk_/);
    });

    it("returns 400 when name is missing", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/admin/keys",
        headers: authHeaders(),
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBeDefined();
    });

    it("returns 400 when name is empty", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/admin/keys",
        headers: authHeaders(),
        payload: { name: "" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 401 without auth token", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/admin/keys",
        payload: { name: "test-key" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 401 with wrong token", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/admin/keys",
        headers: authHeaders("wrong-token"),
        payload: { name: "test-key" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /admin/keys", () => {
    it("returns empty list initially", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/admin/keys",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.keys).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("returns created keys", async () => {
      await server.inject({
        method: "POST",
        url: "/admin/keys",
        headers: authHeaders(),
        payload: { name: "key-1" },
      });
      await server.inject({
        method: "POST",
        url: "/admin/keys",
        headers: authHeaders(),
        payload: { name: "key-2" },
      });

      const res = await server.inject({
        method: "GET",
        url: "/admin/keys",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(2);
      expect(body.keys).toHaveLength(2);
    });

    it("respects pagination", async () => {
      for (let i = 0; i < 5; i++) {
        await server.inject({
          method: "POST",
          url: "/admin/keys",
          headers: authHeaders(),
          payload: { name: `key-${i}` },
        });
      }

      const res = await server.inject({
        method: "GET",
        url: "/admin/keys?offset=2&limit=2",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(5);
      expect(body.keys).toHaveLength(2);
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/admin/keys",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /admin/keys/:id", () => {
    it("returns key details", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/admin/keys",
        headers: authHeaders(),
        payload: { name: "detail-key" },
      });
      const { id } = createRes.json();

      const res = await server.inject({
        method: "GET",
        url: `/admin/keys/${id}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(id);
      expect(body.name).toBe("detail-key");
      expect(body.rateLimits).toBeDefined();
      expect(body.createdAt).toBeDefined();
    });

    it("returns 404 for nonexistent key", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/admin/keys/nonexistent-id",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/admin/keys/some-id",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("DELETE /admin/keys/:id", () => {
    it("revokes a key", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/admin/keys",
        headers: authHeaders(),
        payload: { name: "to-revoke" },
      });
      const { id } = createRes.json();

      const res = await server.inject({
        method: "DELETE",
        url: `/admin/keys/${id}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it("returns 404 for already revoked key", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/admin/keys",
        headers: authHeaders(),
        payload: { name: "double-revoke" },
      });
      const { id } = createRes.json();

      await server.inject({
        method: "DELETE",
        url: `/admin/keys/${id}`,
        headers: authHeaders(),
      });

      const res = await server.inject({
        method: "DELETE",
        url: `/admin/keys/${id}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 404 for nonexistent key", async () => {
      const res = await server.inject({
        method: "DELETE",
        url: "/admin/keys/nonexistent",
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "DELETE",
        url: "/admin/keys/some-id",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("PATCH /admin/keys/:id", () => {
    it("updates rate limits", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/admin/keys",
        headers: authHeaders(),
        payload: { name: "to-update" },
      });
      const { id } = createRes.json();

      const res = await server.inject({
        method: "PATCH",
        url: `/admin/keys/${id}`,
        headers: authHeaders(),
        payload: {
          rateLimits: { rpm: 10, tpm: 5000, rpd: 100 },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.rateLimits).toEqual({ rpm: 10, tpm: 5000, rpd: 100 });
    });

    it("updates name", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/admin/keys",
        headers: authHeaders(),
        payload: { name: "old-name" },
      });
      const { id } = createRes.json();

      const res = await server.inject({
        method: "PATCH",
        url: `/admin/keys/${id}`,
        headers: authHeaders(),
        payload: { name: "new-name" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe("new-name");
    });

    it("updates both name and rate limits", async () => {
      const createRes = await server.inject({
        method: "POST",
        url: "/admin/keys",
        headers: authHeaders(),
        payload: { name: "original" },
      });
      const { id } = createRes.json();

      const res = await server.inject({
        method: "PATCH",
        url: `/admin/keys/${id}`,
        headers: authHeaders(),
        payload: {
          name: "updated",
          rateLimits: { rpm: 50, tpm: 80000, rpd: 2000 },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.name).toBe("updated");
      expect(body.rateLimits).toEqual({ rpm: 50, tpm: 80000, rpd: 2000 });
    });

    it("returns 404 for nonexistent key", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: "/admin/keys/nonexistent",
        headers: authHeaders(),
        payload: { name: "doesnt-matter" },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 401 without auth", async () => {
      const res = await server.inject({
        method: "PATCH",
        url: "/admin/keys/some-id",
        payload: { name: "test" },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
