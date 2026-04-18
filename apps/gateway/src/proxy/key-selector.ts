import type { ProviderConfig, KeyStrategy } from "../config/providers.js";
import { KeyHealthTracker } from "./health-tracker.js";

export class KeySelector {
  private strategy: KeyStrategy;
  private healthTracker: KeyHealthTracker;
  private roundRobinCounters = new Map<string, number>();

  constructor(strategy: KeyStrategy, healthTracker: KeyHealthTracker) {
    this.strategy = strategy;
    this.healthTracker = healthTracker;
  }

  selectKey(provider: ProviderConfig): string {
    const keys = this.getKeys(provider);
    if (keys.length === 1) return keys[0];

    const healthyKeys = keys.filter(
      (k) => this.healthTracker.getHealth(k).isHealthy,
    );
    const pool = healthyKeys.length > 0 ? healthyKeys : keys;

    switch (this.strategy) {
      case "round-robin":
        return this.roundRobinSelect(provider.name, pool);
      case "random":
        return this.randomSelect(pool);
      case "least-latency":
        return this.leastLatencySelect(pool);
      default:
        return this.roundRobinSelect(provider.name, pool);
    }
  }

  private getKeys(provider: ProviderConfig): string[] {
    if (provider.apiKeys && provider.apiKeys.length > 0) {
      return provider.apiKeys;
    }
    return [provider.apiKey];
  }

  private roundRobinSelect(providerName: string, keys: string[]): string {
    const idx = this.roundRobinCounters.get(providerName) ?? 0;
    const key = keys[idx % keys.length];
    this.roundRobinCounters.set(providerName, idx + 1);
    return key;
  }

  private randomSelect(keys: string[]): string {
    return keys[Math.floor(Math.random() * keys.length)];
  }

  private leastLatencySelect(keys: string[]): string {
    let best = keys[0];
    let bestLatency = Infinity;
    for (const key of keys) {
      const health = this.healthTracker.getHealth(key);
      if (health.avgLatency < bestLatency) {
        bestLatency = health.avgLatency;
        best = key;
      }
    }
    return best;
  }
}
