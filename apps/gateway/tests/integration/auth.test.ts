import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestServer } from "../helpers/setup.js";
import type { TestServerResult } from "../helpers/setup.js";

describe("Authentication Integration", () => {
  let ctx: TestServerResult;

  beforeAll(async () => {
    ctx = await createTestServer();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("allows access to /v1/chat/completions with a valid virtual key", async () => {
    const key = await ctx.createKey("auth-valid");
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
    expect(body.object).toBe("chat.completion");
  });

  it("returns 401 when Authorization header is missing", async () => {
    const response = await ctx.server.inject({
      method: "POST",
      url: "/api/v1/chat/completions",
      payload: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.message).toContain("Missing Authorization header");
    expect(body.error.code).toBe("invalid_api_key");
  });

  it("returns 401 for an invalid Bearer token", async () => {
    const response = await ctx.server.inject({
      method: "POST",
      url: "/api/v1/chat/completions",
      headers: { authorization: "Bearer invalid-token-xyz" },
      payload: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe("invalid_api_key");
  });

  it("returns 401 for a revoked key", async () => {
    const key = await ctx.createKey("to-revoke");
    const listRes = await ctx.server.inject({
      method: "GET",
      url: "/api/admin/keys",
      headers: { authorization: `Bearer ${ctx.adminToken}` },
    });
    const keys = listRes.json();
    const createdKey = keys.keys.find((k: { name: string }) => k.name === "to-revoke");
    await ctx.server.inject({
      method: "DELETE",
      url: `/api/admin/keys/${createdKey.id}`,
      headers: { authorization: `Bearer ${ctx.adminToken}` },
    });
    const response = await ctx.server.inject({
      method: "POST",
      url: "/api/v1/chat/completions",
      headers: { authorization: `Bearer ${key}` },
      payload: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe("invalid_api_key");
  });

  it("serves /health without authentication", async () => {
    const response = await ctx.server.inject({
      method: "GET",
      url: "/health",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
  });

  it("admin routes reject virtual keys and require admin token", async () => {
    const key = await ctx.createKey("not-admin");
    const response = await ctx.server.inject({
      method: "GET",
      url: "/api/admin/keys",
      headers: { authorization: `Bearer ${key}` },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe("invalid_api_key");
  });
});
