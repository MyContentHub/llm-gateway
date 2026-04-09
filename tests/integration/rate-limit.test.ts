import { describe, it, expect } from "vitest";
import { createTestServer } from "../helpers/setup.js";

describe("Rate Limiting Integration", () => {
  it("allows requests under the rate limit and returns rate limit headers", async () => {
    const { server, cleanup, createKey } = await createTestServer();
    try {
      const key = await createKey("rl-ok", { rpm: 10, tpm: 100000, rpd: 100 });
      const response = await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: { authorization: `Bearer ${key}` },
        payload: {
          model: "gpt-4o",
          messages: [{ role: "user", content: "Hello" }],
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["x-ratelimit-limit"]).toBeDefined();
      expect(response.headers["x-ratelimit-remaining"]).toBeDefined();
      expect(response.headers["x-ratelimit-reset"]).toBeDefined();
      const limit = parseInt(response.headers["x-ratelimit-limit"] as string, 10);
      const remaining = parseInt(response.headers["x-ratelimit-remaining"] as string, 10);
      const reset = parseInt(response.headers["x-ratelimit-reset"] as string, 10);
      expect(limit).toBeGreaterThan(0);
      expect(remaining).toBeGreaterThanOrEqual(0);
      expect(reset).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  });

  it("returns 429 with Retry-After header when RPM is exceeded", async () => {
    const { server, cleanup, createKey } = await createTestServer();
    try {
      const key = await createKey("rl-exceed", { rpm: 2, tpm: 100000, rpd: 100 });
      for (let i = 0; i < 2; i++) {
        const res = await server.inject({
          method: "POST",
          url: "/v1/chat/completions",
          headers: { authorization: `Bearer ${key}` },
          payload: {
            model: "gpt-4o",
            messages: [{ role: "user", content: "Hello" }],
          },
        });
        expect(res.statusCode).toBe(200);
      }
      const response = await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: { authorization: `Bearer ${key}` },
        payload: {
          model: "gpt-4o",
          messages: [{ role: "user", content: "Hello" }],
        },
      });
      expect(response.statusCode).toBe(429);
      expect(response.headers["retry-after"]).toBeDefined();
      const retryAfter = parseInt(response.headers["retry-after"] as string, 10);
      expect(retryAfter).toBeGreaterThan(0);
      const body = response.json();
      expect(body.error.type).toBe("rate_limit_error");
      expect(body.error.code).toBe("rate_limit_exceeded");
    } finally {
      await cleanup();
    }
  });

  it("includes X-RateLimit headers on every successful response", async () => {
    const { server, cleanup, createKey } = await createTestServer();
    try {
      const key = await createKey("rl-headers", { rpm: 10, tpm: 100000, rpd: 100 });
      const response = await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: { authorization: `Bearer ${key}` },
        payload: {
          model: "gpt-4o",
          messages: [{ role: "user", content: "Hello" }],
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["x-ratelimit-limit"]).toBeDefined();
      expect(response.headers["x-ratelimit-remaining"]).toBeDefined();
      expect(response.headers["x-ratelimit-reset"]).toBeDefined();
    } finally {
      await cleanup();
    }
  });

  it("enforces rate limits independently per key", async () => {
    const { server, cleanup, createKey } = await createTestServer();
    try {
      const key1 = await createKey("rl-key1", { rpm: 2, tpm: 100000, rpd: 100 });
      const key2 = await createKey("rl-key2", { rpm: 2, tpm: 100000, rpd: 100 });

      for (let i = 0; i < 2; i++) {
        const res = await server.inject({
          method: "POST",
          url: "/v1/chat/completions",
          headers: { authorization: `Bearer ${key1}` },
          payload: {
            model: "gpt-4o",
            messages: [{ role: "user", content: "Hello" }],
          },
        });
        expect(res.statusCode).toBe(200);
      }

      const rejected = await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: { authorization: `Bearer ${key1}` },
        payload: {
          model: "gpt-4o",
          messages: [{ role: "user", content: "Hello" }],
        },
      });
      expect(rejected.statusCode).toBe(429);

      const key2Response = await server.inject({
        method: "POST",
        url: "/v1/chat/completions",
        headers: { authorization: `Bearer ${key2}` },
        payload: {
          model: "gpt-4o",
          messages: [{ role: "user", content: "Hello" }],
        },
      });
      expect(key2Response.statusCode).toBe(200);
    } finally {
      await cleanup();
    }
  });
});
