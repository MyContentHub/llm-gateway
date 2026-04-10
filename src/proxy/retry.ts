export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

export const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export function isRetryable(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

export function calculateDelay(attempt: number, config: RetryConfig): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const jitter = delay * 0.1 * Math.random();
  return Math.min(delay + jitter, config.maxDelayMs);
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  isFailed: (result: T) => boolean,
  config: RetryConfig,
  onRetry?: (attempt: number, delay: number, result: T) => void,
): Promise<T> {
  let lastResult: T;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    lastResult = await fn();
    if (!isFailed(lastResult) || attempt >= config.maxRetries) {
      return lastResult;
    }
    const delay = calculateDelay(attempt, config);
    onRetry?.(attempt, delay, lastResult);
    await sleep(delay);
  }
  return lastResult!;
}
