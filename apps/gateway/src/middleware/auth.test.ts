import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrations.js";
import { KeyStore } from "../db/keys.js";
import { createAuthMiddleware } from "./auth.js";
import type { ApiKeyInfo } from "./auth.js";
import { resolve } from "node:path";

function buildApp(db: Database.Database): FastifyInstance {
  const app = Fastify();
  const auth = createAuthMiddleware(db);
  app.addHook("onRequest", auth);
  app.get("/v1/test", async (request) => {
    return { apiKey: request.apiKey };
  });
  app.get("/admin/test", async (request) => {
    return { ok: true };
  });
  return app;
}

describe("Auth Middleware", () => {
  let db: Database.Database;
  let keyStore: KeyStore;
  let app: FastifyInstance;
  let validKey: string;
  let validKeyId: string;

  beforeAll(async () => {
    db = new Database(":memory:");
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    const migrationsDir = resolve(import.meta.dirname, "../../migrations");
    runMigrations(db, migrationsDir);

    keyStore = new KeyStore(db, "test-encryption-key");
    const result = await keyStore.createKey({
      name: "test-key",
      rateLimits: { rpm: 60, tpm: 100000, rpd: 1000 },
    });
    validKey = result.key;
    validKeyId = result.id;

    app = buildApp(db);
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  it("populates request.apiKey with valid Bearer token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/test",
      headers: { authorization: `Bearer ${validKey}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.apiKey).toBeDefined();
    expect(body.apiKey.id).toBe(validKeyId);
    expect(body.apiKey.name).toBe("test-key");
    expect(body.apiKey.rateLimits).toEqual({ rpm: 60, tpm: 100000, rpd: 1000 });
  });

  it("returns 401 for invalid Bearer token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/test",
      headers: { authorization: "Bearer gwk_invalidkey1234567890" },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.code).toBe("invalid_api_key");
    expect(body.error.message).toBeDefined();
  });

  it("returns 401 for missing Authorization header", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/test",
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.code).toBe("invalid_api_key");
  });

  it("returns 401 for revoked key", async () => {
    const revoked = await keyStore.createKey({
      name: "revoked-key",
      rateLimits: { rpm: 10, tpm: 1000, rpd: 100 },
    });
    keyStore.revokeKey(revoked.id);

    const response = await app.inject({
      method: "GET",
      url: "/v1/test",
      headers: { authorization: `Bearer ${revoked.key}` },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.code).toBe("invalid_api_key");
  });

  it("uses cache on repeated valid requests", async () => {
    const response1 = await app.inject({
      method: "GET",
      url: "/v1/test",
      headers: { authorization: `Bearer ${validKey}` },
    });
    expect(response1.statusCode).toBe(200);

    const response2 = await app.inject({
      method: "GET",
      url: "/v1/test",
      headers: { authorization: `Bearer ${validKey}` },
    });
    expect(response2.statusCode).toBe(200);

    const body1 = response1.json();
    const body2 = response2.json();
    expect(body1.apiKey.id).toBe(body2.apiKey.id);
  });

  it("returns 401 for malformed Authorization header", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/test",
      headers: { authorization: "Basic somebase64" },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe("invalid_api_key");
  });

  it("returns 401 for Bearer with empty token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/test",
      headers: { authorization: "Bearer " },
    });

    expect(response.statusCode).toBe(401);
  });
});
