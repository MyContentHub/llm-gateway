export interface RateLimits {
  rpm: number;
  tpm: number;
  rpd: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
  limit: number;
  remaining: number;
  resetAt: number;
}

interface TimestampedTokens {
  timestamp: number;
  count: number;
}

interface KeyUsage {
  requests: number[];
  tokens: TimestampedTokens[];
}

const WINDOW_RPM = 60_000;
const WINDOW_TPM = 60_000;
const WINDOW_RPD = 86_400_000;
const MAX_WINDOW = WINDOW_RPD;

export class RateLimiter {
  private storage = new Map<string, KeyUsage>();
  private defaultLimits: RateLimits;

  constructor(defaultLimits: RateLimits) {
    this.defaultLimits = defaultLimits;
  }

  check(keyId: string, tokenCount: number, limits?: RateLimits): RateLimitResult {
    this.pruneKey(keyId);

    const effectiveLimits = limits ?? this.defaultLimits;
    const usage = this.getOrCreate(keyId);
    const now = Date.now();

    const rpmResult = this.checkWindow(
      usage.requests.map((t) => ({ timestamp: t, count: 1 })),
      now,
      WINDOW_RPM,
      effectiveLimits.rpm,
      1,
    );

    const tpmResult = this.checkWindow(usage.tokens, now, WINDOW_TPM, effectiveLimits.tpm, tokenCount);

    const rpdResult = this.checkWindow(
      usage.requests.map((t) => ({ timestamp: t, count: 1 })),
      now,
      WINDOW_RPD,
      effectiveLimits.rpd,
      1,
    );

    const checks = [
      { ...rpmResult, type: "rpm" as const },
      { ...tpmResult, type: "tpm" as const },
      { ...rpdResult, type: "rpd" as const },
    ];

    const exceeded = checks.find((c) => !c.allowed);
    if (exceeded) {
      return {
        allowed: false,
        retryAfterMs: exceeded.retryAfterMs,
        limit: exceeded.limit,
        remaining: 0,
        resetAt: exceeded.resetAt,
      };
    }

    const mostRestrictive = checks.reduce((worst, c) => {
      const headroom = c.limit - c.current;
      const worstHeadroom = worst.limit - worst.current;
      return headroom < worstHeadroom ? c : worst;
    });

    return {
      allowed: true,
      limit: mostRestrictive.limit,
      remaining: mostRestrictive.limit - mostRestrictive.current,
      resetAt: mostRestrictive.resetAt,
    };
  }

  record(keyId: string, tokenCount: number): void {
    const usage = this.getOrCreate(keyId);
    const now = Date.now();
    usage.requests.push(now);
    usage.tokens.push({ timestamp: now, count: tokenCount });
  }

  cleanup(): void {
    const cutoff = Date.now() - MAX_WINDOW;
    for (const [key, usage] of this.storage) {
      usage.requests = usage.requests.filter((t) => t > cutoff);
      usage.tokens = usage.tokens.filter((e) => e.timestamp > cutoff);
      if (usage.requests.length === 0 && usage.tokens.length === 0) {
        this.storage.delete(key);
      }
    }
  }

  private getOrCreate(keyId: string): KeyUsage {
    let usage = this.storage.get(keyId);
    if (!usage) {
      usage = { requests: [], tokens: [] };
      this.storage.set(keyId, usage);
    }
    return usage;
  }

  private pruneKey(keyId: string): void {
    const usage = this.storage.get(keyId);
    if (!usage) return;
    const cutoff = Date.now() - MAX_WINDOW;
    usage.requests = usage.requests.filter((t) => t > cutoff);
    usage.tokens = usage.tokens.filter((e) => e.timestamp > cutoff);
  }

  private checkWindow(
    entries: TimestampedTokens[],
    now: number,
    windowMs: number,
    limit: number,
    pendingCount: number,
  ): { allowed: boolean; retryAfterMs?: number; limit: number; current: number; resetAt: number } {
    const windowStart = now - windowMs;
    const inWindow = entries.filter((e) => e.timestamp > windowStart);
    const current = inWindow.reduce((sum, e) => sum + e.count, 0) + pendingCount;

    if (current > limit) {
      const oldest = inWindow.length > 0 ? inWindow[0].timestamp : now;
      const resetAt = oldest + windowMs;
      const retryAfterMs = Math.max(1, resetAt - now);
      return { allowed: false, retryAfterMs, limit, current, resetAt };
    }

    const resetAt = inWindow.length > 0 ? inWindow[0].timestamp + windowMs : now + windowMs;
    return { allowed: true, limit, current, resetAt };
  }
}

import type { FastifyRequest, FastifyReply, preHandlerAsyncHookHandler, onSendAsyncHookHandler } from "fastify";
import type { ApiKeyInfo } from "./auth.js";

declare module "fastify" {
  interface FastifyRequest {
    rateLimitResult?: RateLimitResult;
  }
}

export function createRateLimitMiddleware(rateLimiter: RateLimiter): preHandlerAsyncHookHandler {
  return async function rateLimitPreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const apiKey = request.apiKey as ApiKeyInfo | undefined;
    if (!apiKey) {
      return;
    }

    const result = rateLimiter.check(apiKey.id, 0, apiKey.rateLimits);

    if (!result.allowed) {
      const retryAfterSec = Math.ceil(result.retryAfterMs! / 1000);
      reply.header("Retry-After", retryAfterSec);
      reply.code(429).send({
        error: {
          message: `Rate limit exceeded. Please retry after ${result.retryAfterMs}ms.`,
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
        },
      });
      return;
    }

    request.rateLimitResult = result;
  };
}

export function createRateLimitResponseHook(rateLimiter: RateLimiter): onSendAsyncHookHandler {
  return async function rateLimitOnSend(
    request: FastifyRequest,
    reply: FastifyReply,
    payload: unknown,
  ): Promise<unknown> {
    const apiKey = request.apiKey as ApiKeyInfo | undefined;
    if (!apiKey) {
      return payload;
    }

    let tokenCount = 0;

    const isStreaming = reply.getHeader("content-type") === "text/event-stream";

    if (!isStreaming && payload && typeof payload === "string") {
      try {
        const body = JSON.parse(payload);
        if (body && typeof body === "object" && body.usage) {
          const usage = body.usage as { prompt_tokens?: number; completion_tokens?: number };
          tokenCount = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
        }
      } catch {
        tokenCount = 0;
      }
    }

    rateLimiter.record(apiKey.id, tokenCount);

    const result = request.rateLimitResult;
    if (result) {
      reply.header("X-RateLimit-Limit", result.limit);
      reply.header("X-RateLimit-Remaining", result.remaining);
      reply.header("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000));
    }

    return payload;
  };
}
