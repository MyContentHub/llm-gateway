import { describe, it, expect, vi, beforeEach } from "vitest";
import { RateLimiter, createRateLimitMiddleware, createRateLimitResponseHook } from "./rate-limit.js";
import type { RateLimits } from "./rate-limit.js";
import Fastify, { type FastifyInstance } from "fastify";
import type { ApiKeyInfo } from "./auth.js";

const DEFAULT_LIMITS: RateLimits = { rpm: 60, tpm: 100000, rpd: 1000 };
const NO_RPM_LIMIT: RateLimits = { rpm: 100000, tpm: 10000000, rpd: 1000 };
const NO_RPD_LIMIT: RateLimits = { rpm: 60, tpm: 100000, rpd: 100000 };

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(DEFAULT_LIMITS);
  });

  describe("RPM enforcement", () => {
    it("allows requests up to the RPM limit", () => {
      for (let i = 0; i < 59; i++) {
        limiter.record("key1", 10);
      }
      const result = limiter.check("key1", 0, NO_RPD_LIMIT);
      expect(result.allowed).toBe(true);
    });

    it("rejects the request that would exceed RPM", () => {
      for (let i = 0; i < 60; i++) {
        limiter.record("key1", 10);
      }
      const result = limiter.check("key1", 0, NO_RPD_LIMIT);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });
  });

  describe("TPM enforcement", () => {
    it("allows requests within TPM limit", () => {
      limiter.record("key1", 50000);
      const result = limiter.check("key1", 49999);
      expect(result.allowed).toBe(true);
    });

    it("rejects requests exceeding TPM limit", () => {
      limiter.record("key1", 100000);
      const result = limiter.check("key1", 1);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });
  });

  describe("RPD enforcement", () => {
    it("allows requests up to RPD limit", () => {
      for (let i = 0; i < 999; i++) {
        limiter.record("key1", 10);
      }
      const result = limiter.check("key1", 0, NO_RPM_LIMIT);
      expect(result.allowed).toBe(true);
    });

    it("rejects requests exceeding RPD limit", () => {
      for (let i = 0; i < 1000; i++) {
        limiter.record("key1", 10);
      }
      const result = limiter.check("key1", 0, NO_RPM_LIMIT);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });
  });

  describe("sliding window", () => {
    it("excludes old requests outside the window", () => {
      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      for (let i = 0; i < 60; i++) {
        limiter.record("key1", 10);
      }

      vi.advanceTimersByTime(61_000);

      const result = limiter.check("key1", 0, NO_RPD_LIMIT);
      expect(result.allowed).toBe(true);

      vi.useRealTimers();
    });

    it("only counts requests within the sliding window", () => {
      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      for (let i = 0; i < 59; i++) {
        limiter.record("key1", 10);
      }

      const result = limiter.check("key1", 0, NO_RPD_LIMIT);
      expect(result.allowed).toBe(true);

      vi.advanceTimersByTime(61_000);

      const result2 = limiter.check("key1", 0, NO_RPD_LIMIT);
      expect(result2.allowed).toBe(true);

      vi.useRealTimers();
    });
  });

  describe("per-key custom limits", () => {
    it("overrides default limits", () => {
      const customLimits: RateLimits = { rpm: 5, tpm: 100000, rpd: 1000 };
      for (let i = 0; i < 5; i++) {
        limiter.record("key1", 10);
      }
      const result = limiter.check("key1", 0, customLimits);
      expect(result.allowed).toBe(false);
    });
  });

  describe("default limits", () => {
    it("uses default limits when no per-key limits provided", () => {
      for (let i = 0; i < 60; i++) {
        limiter.record("key1", 10);
      }
      const result = limiter.check("key1", 0);
      expect(result.allowed).toBe(false);
    });
  });

  describe("retryAfterMs", () => {
    it("is a positive integer when rejected", () => {
      for (let i = 0; i < 60; i++) {
        limiter.record("key1", 10);
      }
      const result = limiter.check("key1", 0, NO_RPD_LIMIT);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(Number.isInteger(result.retryAfterMs!)).toBe(true);
    });

    it("decreases as time passes", () => {
      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      for (let i = 0; i < 60; i++) {
        limiter.record("key1", 10);
      }

      const result1 = limiter.check("key1", 0, NO_RPD_LIMIT);

      vi.advanceTimersByTime(500);
      const result2 = limiter.check("key1", 0, NO_RPD_LIMIT);

      expect(result2.retryAfterMs!).toBeLessThan(result1.retryAfterMs!);

      vi.useRealTimers();
    });
  });

  describe("exactly at limit", () => {
    it("is allowed when exactly at the limit", () => {
      for (let i = 0; i < 59; i++) {
        limiter.record("key1", 10);
      }
      const result = limiter.check("key1", 0, NO_RPD_LIMIT);
      expect(result.allowed).toBe(true);
    });

    it("is rejected when one over the limit", () => {
      for (let i = 0; i < 60; i++) {
        limiter.record("key1", 10);
      }
      const result = limiter.check("key1", 0, NO_RPD_LIMIT);
      expect(result.allowed).toBe(false);
    });
  });

  describe("burst requests", () => {
    it("handles burst of requests at once", () => {
      const customLimits: RateLimits = { rpm: 10, tpm: 100000, rpd: 1000 };
      for (let i = 0; i < 10; i++) {
        limiter.record("key1", 10);
      }
      const result = limiter.check("key1", 0, customLimits);
      expect(result.allowed).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("removes old entries", () => {
      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      limiter.record("key1", 10);
      limiter.record("key2", 20);

      vi.advanceTimersByTime(86_400_001);

      limiter.cleanup();

      const result = limiter.check("key1", 0);
      expect(result.allowed).toBe(true);

      vi.useRealTimers();
    });

    it("removes keys with no entries after cleanup", () => {
      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      limiter.record("key1", 10);

      vi.advanceTimersByTime(86_400_001);

      limiter.cleanup();

      const result = limiter.check("key1", 0);
      expect(result.allowed).toBe(true);

      vi.useRealTimers();
    });
  });

  describe("multiple keys", () => {
    it("tracks keys independently", () => {
      const customLimits: RateLimits = { rpm: 5, tpm: 100000, rpd: 1000 };

      for (let i = 0; i < 5; i++) {
        limiter.record("key1", 10);
      }

      const result1 = limiter.check("key1", 0, customLimits);
      expect(result1.allowed).toBe(false);

      const result2 = limiter.check("key2", 0, customLimits);
      expect(result2.allowed).toBe(true);
    });

    it("one key hitting limit does not affect another", () => {
      const customLimits: RateLimits = { rpm: 5, tpm: 100000, rpd: 1000 };

      for (let i = 0; i < 5; i++) {
        limiter.record("key1", 10);
      }

      const result = limiter.check("key1", 0, customLimits);
      expect(result.allowed).toBe(false);

      const result2 = limiter.check("key2", 0, customLimits);
      expect(result2.allowed).toBe(true);
    });
  });

  describe("check without prior record", () => {
    it("allows first request", () => {
      const result = limiter.check("newkey", 100);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });
  });

  describe("remaining count", () => {
    it("decreases as requests are recorded", () => {
      const customLimits: RateLimits = { rpm: 10, tpm: 100000, rpd: 1000 };

      const r0 = limiter.check("key1", 0, customLimits);
      expect(r0.remaining).toBe(9);

      limiter.record("key1", 10);

      const r1 = limiter.check("key1", 0, customLimits);
      expect(r1.remaining).toBe(8);

      limiter.record("key1", 10);

      const r2 = limiter.check("key1", 0, customLimits);
      expect(r2.remaining).toBe(7);
    });
  });
});

function buildRateLimitApp(limiter: RateLimiter, limits?: RateLimits): FastifyInstance {
  const app = Fastify({ logger: false });
  const apiKey: ApiKeyInfo = {
    id: "test-key-id",
    name: "test-key",
    rateLimits: limits ?? DEFAULT_LIMITS,
  };

  app.addHook("onRequest", async (request) => {
    (request as any).apiKey = apiKey;
  });
  app.addHook("preHandler", createRateLimitMiddleware(limiter));
  app.addHook("onSend", createRateLimitResponseHook(limiter));
  app.get("/v1/test", async () => {
    return { ok: true };
  });
  app.post("/v1/usage", async () => {
    return {
      id: "resp-1",
      usage: { prompt_tokens: 50, completion_tokens: 100 },
    };
  });
  return app;
}

describe("createRateLimitMiddleware", () => {
  let limiter: RateLimiter;
  let app: FastifyInstance;

  beforeEach(() => {
    limiter = new RateLimiter(DEFAULT_LIMITS);
    app = buildRateLimitApp(limiter);
  });

  it("allows request when under rate limit", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/test",
    });

    expect(response.statusCode).toBe(200);
  });

  it("sets rate limit headers on successful response", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/test",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-ratelimit-limit"]).toBeDefined();
    expect(response.headers["x-ratelimit-remaining"]).toBeDefined();
    expect(response.headers["x-ratelimit-reset"]).toBeDefined();
  });

  it("rejects with 429 when RPM exceeded", async () => {
    const customLimits: RateLimits = { rpm: 2, tpm: 100000, rpd: 1000 };
    const strictLimiter = new RateLimiter(customLimits);
    const strictApp = buildRateLimitApp(strictLimiter, customLimits);

    await strictApp.inject({ method: "GET", url: "/v1/test" });
    await strictApp.inject({ method: "GET", url: "/v1/test" });

    const response = await strictApp.inject({
      method: "GET",
      url: "/v1/test",
    });

    expect(response.statusCode).toBe(429);
    const body = response.json();
    expect(body.error.type).toBe("rate_limit_error");
    expect(body.error.code).toBe("rate_limit_exceeded");
    expect(body.error.message).toContain("Rate limit exceeded");
    expect(response.headers["retry-after"]).toBeDefined();
  });

  it("skips rate limiting when no apiKey on request", async () => {
    const noAuthApp = Fastify({ logger: false });
    noAuthApp.addHook("preHandler", createRateLimitMiddleware(limiter));
    noAuthApp.addHook("onSend", createRateLimitResponseHook(limiter));
    noAuthApp.get("/v1/test", async () => ({ ok: true }));

    const response = await noAuthApp.inject({
      method: "GET",
      url: "/v1/test",
    });

    expect(response.statusCode).toBe(200);
  });

  it("records token count from response usage", async () => {
    const customLimits: RateLimits = { rpm: 60, tpm: 100000, rpd: 1000 };
    const tokenLimiter = new RateLimiter(customLimits);
    const tokenApp = buildRateLimitApp(tokenLimiter);

    const response = await tokenApp.inject({
      method: "POST",
      url: "/v1/usage",
    });

    expect(response.statusCode).toBe(200);

    const check = tokenLimiter.check("test-key-id", 0, customLimits);
    expect(check.allowed).toBe(true);
    expect(check.remaining).toBeLessThan(customLimits.rpm);
  });

  it("sets rate limit headers with numeric values", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/test",
    });

    expect(response.statusCode).toBe(200);
    expect(Number(response.headers["x-ratelimit-limit"])).toBeGreaterThan(0);
    expect(Number(response.headers["x-ratelimit-remaining"])).toBeGreaterThanOrEqual(0);
    expect(Number(response.headers["x-ratelimit-reset"])).toBeGreaterThan(0);
  });
});
