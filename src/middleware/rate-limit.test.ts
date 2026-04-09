import { describe, it, expect, vi, beforeEach } from "vitest";
import { RateLimiter } from "./rate-limit.js";
import type { RateLimits } from "./rate-limit.js";

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
