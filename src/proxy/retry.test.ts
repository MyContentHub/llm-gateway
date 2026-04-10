import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isRetryable,
  calculateDelay,
  retryWithBackoff,
  sleep,
  DEFAULT_RETRY_CONFIG,
  RETRYABLE_STATUS_CODES,
} from "./retry.js";
import type { RetryConfig } from "./retry.js";

describe("isRetryable", () => {
  it("returns true for 429", () => {
    expect(isRetryable(429)).toBe(true);
  });

  it("returns true for 500", () => {
    expect(isRetryable(500)).toBe(true);
  });

  it("returns true for 502", () => {
    expect(isRetryable(502)).toBe(true);
  });

  it("returns true for 503", () => {
    expect(isRetryable(503)).toBe(true);
  });

  it("returns true for 504", () => {
    expect(isRetryable(504)).toBe(true);
  });

  it("returns false for 400", () => {
    expect(isRetryable(400)).toBe(false);
  });

  it("returns false for 401", () => {
    expect(isRetryable(401)).toBe(false);
  });

  it("returns false for 403", () => {
    expect(isRetryable(403)).toBe(false);
  });

  it("returns false for 404", () => {
    expect(isRetryable(404)).toBe(false);
  });

  it("returns false for 200", () => {
    expect(isRetryable(200)).toBe(false);
  });

  it("returns false for 201", () => {
    expect(isRetryable(201)).toBe(false);
  });

  it("RETRYABLE_STATUS_CODES contains exactly 429, 500, 502, 503, 504", () => {
    expect(RETRYABLE_STATUS_CODES).toEqual(new Set([429, 500, 502, 503, 504]));
  });
});

describe("calculateDelay", () => {
  const config: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  };

  it("returns initialDelayMs for attempt 0 (plus jitter)", () => {
    const delay = calculateDelay(0, config);
    expect(delay).toBeGreaterThanOrEqual(1000);
    expect(delay).toBeLessThanOrEqual(1100);
  });

  it("doubles delay for attempt 1", () => {
    const delay = calculateDelay(1, config);
    expect(delay).toBeGreaterThanOrEqual(2000);
    expect(delay).toBeLessThanOrEqual(2200);
  });

  it("quadruples delay for attempt 2", () => {
    const delay = calculateDelay(2, config);
    expect(delay).toBeGreaterThanOrEqual(4000);
    expect(delay).toBeLessThanOrEqual(4400);
  });

  it("is capped at maxDelayMs", () => {
    const delay = calculateDelay(10, config);
    expect(delay).toBeLessThanOrEqual(10000);
  });

  it("respects maxDelayMs even with large exponent", () => {
    const smallMaxConfig: RetryConfig = {
      ...config,
      maxDelayMs: 500,
    };
    const delay = calculateDelay(5, smallMaxConfig);
    expect(delay).toBeLessThanOrEqual(500);
  });

  it("adds jitter (non-deterministic)", () => {
    const delays = new Set<number>();
    for (let i = 0; i < 20; i++) {
      delays.add(calculateDelay(0, config));
    }
    expect(delays.size).toBeGreaterThan(1);
  });

  it("uses backoffMultiplier correctly", () => {
    const tripleConfig: RetryConfig = {
      ...config,
      backoffMultiplier: 3,
    };
    const delay = calculateDelay(1, tripleConfig);
    expect(delay).toBeGreaterThanOrEqual(3000);
    expect(delay).toBeLessThanOrEqual(3300);
  });
});

describe("sleep", () => {
  it("resolves after the specified duration", async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});

describe("retryWithBackoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns immediately on first success", async () => {
    const fn = vi.fn().mockResolvedValue({ status: 200, data: "ok" });
    const result = await retryWithBackoff(fn, (r) => r.status !== 200, DEFAULT_RETRY_CONFIG);
    expect(result.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and returns when successful", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ status: 502 })
      .mockResolvedValueOnce({ status: 200, data: "ok" });

    const promise = retryWithBackoff(fn, (r) => r.status !== 200, {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });

    await vi.advanceTimersByTimeAsync(150);

    const result = await promise;
    expect(result.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries multiple times with exponential backoff", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ status: 502 })
      .mockResolvedValueOnce({ status: 502 })
      .mockResolvedValueOnce({ status: 200, data: "ok" });

    const promise = retryWithBackoff(fn, (r) => r.status !== 200, {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
    });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(10);

    const result = await promise;
    expect(result.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("returns last error when all retries exhausted", async () => {
    const fn = vi.fn().mockResolvedValue({ status: 502 });

    const promise = retryWithBackoff(fn, (r) => r.status !== 200, {
      maxRetries: 2,
      initialDelayMs: 50,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });

    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(10);

    const result = await promise;
    expect(result.status).toBe(502);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry when maxRetries is 0", async () => {
    const fn = vi.fn().mockResolvedValue({ status: 502 });

    const result = await retryWithBackoff(fn, (r) => r.status !== 200, {
      maxRetries: 0,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });

    expect(result.status).toBe(502);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry on non-retryable (client error) status", async () => {
    const fn = vi.fn().mockResolvedValue({ status: 400 });

    const result = await retryWithBackoff(fn, (r) => isRetryable(r.status), {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });

    expect(result.status).toBe(400);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 401", async () => {
    const fn = vi.fn().mockResolvedValue({ status: 401 });

    const result = await retryWithBackoff(fn, (r) => isRetryable(r.status), {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });

    expect(result.status).toBe(401);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 403", async () => {
    const fn = vi.fn().mockResolvedValue({ status: 403 });

    const result = await retryWithBackoff(fn, (r) => isRetryable(r.status), {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });

    expect(result.status).toBe(403);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls onRetry callback with attempt and delay", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ status: 502 })
      .mockResolvedValueOnce({ status: 200 });

    const onRetry = vi.fn();

    const promise = retryWithBackoff(
      fn,
      (r) => r.status !== 200,
      {
        maxRetries: 3,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
      },
      onRetry,
    );

    await vi.advanceTimersByTimeAsync(150);

    await promise;
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(0, expect.any(Number), { status: 502 });
  });

  it("retries on 429 (rate limit)", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ status: 429 })
      .mockResolvedValueOnce({ status: 200, data: "ok" });

    const promise = retryWithBackoff(fn, (r) => isRetryable(r.status), {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });

    await vi.advanceTimersByTimeAsync(150);

    const result = await promise;
    expect(result.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 500", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({ status: 200 });

    const promise = retryWithBackoff(fn, (r) => isRetryable(r.status), {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });

    await vi.advanceTimersByTimeAsync(150);

    const result = await promise;
    expect(result.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 503", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 200 });

    const promise = retryWithBackoff(fn, (r) => isRetryable(r.status), {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });

    await vi.advanceTimersByTimeAsync(150);

    const result = await promise;
    expect(result.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 504", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ status: 504 })
      .mockResolvedValueOnce({ status: 200 });

    const promise = retryWithBackoff(fn, (r) => isRetryable(r.status), {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });

    await vi.advanceTimersByTimeAsync(150);

    const result = await promise;
    expect(result.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on connection error (502)", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ status: 502, body: { error: { message: "ECONNREFUSED" } } })
      .mockResolvedValueOnce({ status: 200, data: "ok" });

    const promise = retryWithBackoff(fn, (r) => isRetryable(r.status), {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });

    await vi.advanceTimersByTimeAsync(150);

    const result = await promise;
    expect(result.status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("exhausts all retries and returns last error", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ status: 502 })
      .mockResolvedValueOnce({ status: 502 })
      .mockResolvedValueOnce({ status: 502 });

    const promise = retryWithBackoff(fn, (r) => isRetryable(r.status), {
      maxRetries: 2,
      initialDelayMs: 50,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });

    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(10);

    const result = await promise;
    expect(result.status).toBe(502);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("DEFAULT_RETRY_CONFIG", () => {
  it("has correct default values", () => {
    expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(2);
    expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBe(1000);
    expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(10000);
    expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
  });
});
