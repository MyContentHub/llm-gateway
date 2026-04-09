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
