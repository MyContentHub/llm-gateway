export interface KeyHealth {
  avgLatency: number;
  consecutiveErrors: number;
  isHealthy: boolean;
}

export class KeyHealthTracker {
  private latencies = new Map<string, number[]>();
  private consecutiveErrors = new Map<string, number>();
  private readonly maxSamples: number;

  constructor(maxSamples = 10) {
    this.maxSamples = maxSamples;
  }

  recordSuccess(key: string, latencyMs: number): void {
    const samples = this.latencies.get(key) ?? [];
    samples.push(latencyMs);
    if (samples.length > this.maxSamples) samples.shift();
    this.latencies.set(key, samples);
    this.consecutiveErrors.set(key, 0);
  }

  recordError(key: string): void {
    const current = this.consecutiveErrors.get(key) ?? 0;
    this.consecutiveErrors.set(key, current + 1);
  }

  getHealth(key: string): KeyHealth {
    const samples = this.latencies.get(key) ?? [];
    const avgLatency =
      samples.length > 0
        ? samples.reduce((a, b) => a + b, 0) / samples.length
        : 0;
    const consecutiveErrors = this.consecutiveErrors.get(key) ?? 0;
    return {
      avgLatency,
      consecutiveErrors,
      isHealthy: consecutiveErrors < 3,
    };
  }
}
