import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestServer } from "../helpers/setup.js";
import type { TestServerResult } from "../helpers/setup.js";

describe("Admin Keys API Integration", () => {
  let ctx: TestServerResult;

  beforeAll(async () => {
    ctx = await createTestServer();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("POST /admin/keys creates a key with gwk_ prefix", async () => {
    const response = await ctx.server.inject({
      method: "POST",
      url: "/api/admin/keys",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { name: "created-via-admin" },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.key).toMatch(/^gwk_/);
    expect(body.name).toBe("created-via-admin");
    expect(body.id).toBeDefined();
  });

  it("GET /admin/keys lists keys", async () => {
    await ctx.createKey("list-test-1");
    await ctx.createKey("list-test-2");
    const response = await ctx.server.inject({
      method: "GET",
      url: "/api/admin/keys",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.keys).toBeInstanceOf(Array);
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  it("GET /admin/keys/:id returns key details", async () => {
    const createRes = await ctx.server.inject({
      method: "POST",
      url: "/api/admin/keys",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { name: "detail-key" },
    });
    const created = createRes.json();
    const response = await ctx.server.inject({
      method: "GET",
      url: `/api/admin/keys/${created.id}`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe(created.id);
    expect(body.name).toBe("detail-key");
    expect(body.rateLimits).toBeDefined();
  });

  it("DELETE /admin/keys/:id revokes a key", async () => {
    const createRes = await ctx.server.inject({
      method: "POST",
      url: "/api/admin/keys",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { name: "delete-key" },
    });
    const created = createRes.json();
    const response = await ctx.server.inject({
      method: "DELETE",
      url: `/api/admin/keys/${created.id}`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
  });

  it("PATCH /admin/keys/:id updates rate limits", async () => {
    const createRes = await ctx.server.inject({
      method: "POST",
      url: "/api/admin/keys",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { name: "patch-key" },
    });
    const created = createRes.json();
    const response = await ctx.server.inject({
      method: "PATCH",
      url: `/api/admin/keys/${created.id}`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: { rateLimits: { rpm: 99, tpm: 9999, rpd: 999 } },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.rateLimits.rpm).toBe(99);
    expect(body.rateLimits.tpm).toBe(9999);
    expect(body.rateLimits.rpd).toBe(999);
  });

  it("returns 401 when admin token is missing", async () => {
    const response = await ctx.server.inject({
      method: "GET",
      url: "/api/admin/keys",
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 400 when name is missing on create", async () => {
    const response = await ctx.server.inject({
      method: "POST",
      url: "/api/admin/keys",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe("invalid_request");
  });

  it("key created via admin API can authenticate /v1/* requests", async () => {
    const createRes = await ctx.server.inject({
      method: "POST",
      url: "/api/admin/keys",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
      payload: {
        name: "usable-key",
        rateLimits: { rpm: 60, tpm: 100000, rpd: 1000 },
      },
    });
    expect(createRes.statusCode).toBe(201);
    const { key } = createRes.json();
    const response = await ctx.server.inject({
      method: "POST",
      url: "/api/v1/chat/completions",
      headers: { authorization: `Bearer ${key}` },
      payload: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe("chatcmpl-integration-test");
  });
});
