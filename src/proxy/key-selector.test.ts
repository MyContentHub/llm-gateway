import { describe, it, expect, beforeEach } from "vitest";
import { KeySelector } from "./key-selector.js";
import { KeyHealthTracker } from "./health-tracker.js";
import type { ProviderConfig } from "../config/providers.js";

describe("KeySelector", () => {
  let healthTracker: KeyHealthTracker;

  beforeEach(() => {
    healthTracker = new KeyHealthTracker(10);
  });

  function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
    return {
      name: "test-provider",
      baseUrl: "https://api.test.com/v1",
      apiKey: "sk-fallback",
      keyStrategy: "round-robin",
      modelMappings: {},
      isDefault: true,
      ...overrides,
    };
  }

  describe("backward compatibility - single apiKey", () => {
    it("returns the single apiKey when no apiKeys array", () => {
      const selector = new KeySelector("round-robin", healthTracker);
      const provider = makeProvider({ apiKey: "sk-single" });
      expect(selector.selectKey(provider)).toBe("sk-single");
    });

    it("returns the single apiKey regardless of strategy", () => {
      const selector = new KeySelector("random", healthTracker);
      const provider = makeProvider({ apiKey: "sk-single" });
      expect(selector.selectKey(provider)).toBe("sk-single");
    });

    it("returns the single apiKey when apiKeys is empty array", () => {
      const selector = new KeySelector("round-robin", healthTracker);
      const provider = makeProvider({ apiKey: "sk-fallback", apiKeys: [] });
      expect(selector.selectKey(provider)).toBe("sk-fallback");
    });
  });

  describe("round-robin strategy", () => {
    it("cycles through keys in order", () => {
      const selector = new KeySelector("round-robin", healthTracker);
      const provider = makeProvider({
        apiKeys: ["key-a", "key-b", "key-c"],
      });
      expect(selector.selectKey(provider)).toBe("key-a");
      expect(selector.selectKey(provider)).toBe("key-b");
      expect(selector.selectKey(provider)).toBe("key-c");
    });

    it("wraps around after reaching the end", () => {
      const selector = new KeySelector("round-robin", healthTracker);
      const provider = makeProvider({
        apiKeys: ["key-a", "key-b"],
      });
      expect(selector.selectKey(provider)).toBe("key-a");
      expect(selector.selectKey(provider)).toBe("key-b");
      expect(selector.selectKey(provider)).toBe("key-a");
      expect(selector.selectKey(provider)).toBe("key-b");
    });

    it("maintains independent counters per provider", () => {
      const selector = new KeySelector("round-robin", healthTracker);
      const providerA = makeProvider({
        name: "provider-a",
        apiKeys: ["a1", "a2"],
      });
      const providerB = makeProvider({
        name: "provider-b",
        apiKeys: ["b1", "b2", "b3"],
      });
      expect(selector.selectKey(providerA)).toBe("a1");
      expect(selector.selectKey(providerB)).toBe("b1");
      expect(selector.selectKey(providerA)).toBe("a2");
      expect(selector.selectKey(providerB)).toBe("b2");
    });

    it("skips unhealthy keys and cycles through healthy ones", () => {
      const selector = new KeySelector("round-robin", healthTracker);
      const provider = makeProvider({
        apiKeys: ["key-a", "key-b", "key-c"],
      });
      healthTracker.recordError("key-b");
      healthTracker.recordError("key-b");
      healthTracker.recordError("key-b");
      expect(selector.selectKey(provider)).toBe("key-a");
      expect(selector.selectKey(provider)).toBe("key-c");
      expect(selector.selectKey(provider)).toBe("key-a");
    });

    it("falls back to all keys when all are unhealthy", () => {
      const selector = new KeySelector("round-robin", healthTracker);
      const provider = makeProvider({
        apiKeys: ["key-a", "key-b"],
      });
      healthTracker.recordError("key-a");
      healthTracker.recordError("key-a");
      healthTracker.recordError("key-a");
      healthTracker.recordError("key-b");
      healthTracker.recordError("key-b");
      healthTracker.recordError("key-b");
      const key = selector.selectKey(provider);
      expect(["key-a", "key-b"]).toContain(key);
    });
  });

  describe("random strategy", () => {
    it("selects from available keys", () => {
      const selector = new KeySelector("random", healthTracker);
      const provider = makeProvider({
        apiKeys: ["key-a", "key-b", "key-c"],
      });
      for (let i = 0; i < 100; i++) {
        const key = selector.selectKey(provider);
        expect(["key-a", "key-b", "key-c"]).toContain(key);
      }
    });

    it("distributes approximately evenly", () => {
      const selector = new KeySelector("random", healthTracker);
      const provider = makeProvider({
        apiKeys: ["key-a", "key-b", "key-c"],
      });
      const counts: Record<string, number> = { "key-a": 0, "key-b": 0, "key-c": 0 };
      const iterations = 3000;
      for (let i = 0; i < iterations; i++) {
        counts[selector.selectKey(provider)]++;
      }
      const expectedPerKey = iterations / 3;
      for (const key of ["key-a", "key-b", "key-c"]) {
        expect(counts[key]).toBeGreaterThan(expectedPerKey * 0.6);
        expect(counts[key]).toBeLessThan(expectedPerKey * 1.4);
      }
    });

    it("skips unhealthy keys", () => {
      const selector = new KeySelector("random", healthTracker);
      const provider = makeProvider({
        apiKeys: ["key-a", "key-b", "key-c"],
      });
      healthTracker.recordError("key-a");
      healthTracker.recordError("key-a");
      healthTracker.recordError("key-a");
      for (let i = 0; i < 100; i++) {
        const key = selector.selectKey(provider);
        expect(key).not.toBe("key-a");
        expect(["key-b", "key-c"]).toContain(key);
      }
    });
  });

  describe("least-latency strategy", () => {
    it("selects the key with lowest average latency", () => {
      const selector = new KeySelector("least-latency", healthTracker);
      const provider = makeProvider({
        apiKeys: ["key-a", "key-b", "key-c"],
      });
      healthTracker.recordSuccess("key-a", 300);
      healthTracker.recordSuccess("key-b", 100);
      healthTracker.recordSuccess("key-c", 200);
      expect(selector.selectKey(provider)).toBe("key-b");
    });

    it("selects first key when no latency data", () => {
      const selector = new KeySelector("least-latency", healthTracker);
      const provider = makeProvider({
        apiKeys: ["key-a", "key-b", "key-c"],
      });
      expect(selector.selectKey(provider)).toBe("key-a");
    });

    it("skips unhealthy keys", () => {
      const selector = new KeySelector("least-latency", healthTracker);
      const provider = makeProvider({
        apiKeys: ["key-a", "key-b"],
      });
      healthTracker.recordSuccess("key-a", 50);
      healthTracker.recordSuccess("key-b", 200);
      healthTracker.recordError("key-a");
      healthTracker.recordError("key-a");
      healthTracker.recordError("key-a");
      expect(selector.selectKey(provider)).toBe("key-b");
    });

    it("updates preference as latency changes", () => {
      const selector = new KeySelector("least-latency", healthTracker);
      const provider = makeProvider({
        apiKeys: ["key-a", "key-b"],
      });
      healthTracker.recordSuccess("key-a", 100);
      healthTracker.recordSuccess("key-b", 200);
      expect(selector.selectKey(provider)).toBe("key-a");
      healthTracker.recordSuccess("key-a", 500);
      healthTracker.recordSuccess("key-a", 500);
      healthTracker.recordSuccess("key-b", 50);
      expect(selector.selectKey(provider)).toBe("key-b");
    });
  });

  describe("health-based deprioritization", () => {
    it("deprioritizes key with 3 consecutive errors", () => {
      const selector = new KeySelector("round-robin", healthTracker);
      const provider = makeProvider({
        apiKeys: ["key-a", "key-b", "key-c"],
      });
      healthTracker.recordError("key-b");
      healthTracker.recordError("key-b");
      healthTracker.recordError("key-b");
      for (let i = 0; i < 10; i++) {
        const key = selector.selectKey(provider);
        expect(key).not.toBe("key-b");
      }
    });

    it("uses all keys again after recovery", () => {
      const selector = new KeySelector("round-robin", healthTracker);
      const provider = makeProvider({
        apiKeys: ["key-a", "key-b"],
      });
      healthTracker.recordError("key-b");
      healthTracker.recordError("key-b");
      healthTracker.recordError("key-b");
      expect(selector.selectKey(provider)).toBe("key-a");
      healthTracker.recordSuccess("key-b", 100);
      expect(selector.selectKey(provider)).toBe("key-b");
    });
  });
});
