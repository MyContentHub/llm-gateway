import { describe, it, expect } from "vitest";
import { KeySelector } from "../../src/proxy/key-selector.js";
import { KeyHealthTracker } from "../../src/proxy/health-tracker.js";
import { resolveRoute } from "../../src/proxy/router.js";
import type { ProviderConfig } from "../../src/config/providers.js";

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    name: "test-provider",
    baseUrl: "http://localhost:9999",
    apiKey: "sk-default",
    keyStrategy: "round-robin",
    modelMappings: { "gpt-4o": "gpt-4o" },
    isDefault: true,
    ...overrides,
  };
}

describe("Key Rotation Integration", () => {
  describe("round-robin strategy", () => {
    it("rotates across 3 API keys sequentially", () => {
      const tracker = new KeyHealthTracker();
      const selector = new KeySelector("round-robin", tracker);
      const provider = makeProvider({
        apiKeys: ["sk-key-1", "sk-key-2", "sk-key-3"],
      });

      expect(selector.selectKey(provider)).toBe("sk-key-1");
      expect(selector.selectKey(provider)).toBe("sk-key-2");
      expect(selector.selectKey(provider)).toBe("sk-key-3");
      expect(selector.selectKey(provider)).toBe("sk-key-1");
    });

    it("integrates with resolveRoute for rotating API keys", () => {
      const tracker = new KeyHealthTracker();
      const selector = new KeySelector("round-robin", tracker);
      const provider = makeProvider({
        apiKeys: ["sk-alpha", "sk-beta"],
      });

      const route1 = resolveRoute("gpt-4o", [provider], selector);
      const route2 = resolveRoute("gpt-4o", [provider], selector);

      expect(route1.apiKey).toBe("sk-alpha");
      expect(route2.apiKey).toBe("sk-beta");
      expect(route1.baseUrl).toBe(provider.baseUrl);
      expect(route1.resolvedModel).toBe("gpt-4o");
    });

    it("falls back to provider.apiKey when no apiKeys array", () => {
      const tracker = new KeyHealthTracker();
      const selector = new KeySelector("round-robin", tracker);
      const provider = makeProvider({ apiKey: "sk-single" });

      expect(selector.selectKey(provider)).toBe("sk-single");
      expect(selector.selectKey(provider)).toBe("sk-single");
    });
  });

  describe("health-based selection", () => {
    it("excludes keys with 3+ consecutive errors from rotation", () => {
      const tracker = new KeyHealthTracker();
      const selector = new KeySelector("round-robin", tracker);
      const provider = makeProvider({
        apiKeys: ["sk-a", "sk-b", "sk-c"],
      });

      tracker.recordError("sk-a");
      tracker.recordError("sk-a");
      tracker.recordError("sk-a");

      const selected = new Set<string>();
      for (let i = 0; i < 6; i++) {
        selected.add(selector.selectKey(provider));
      }

      expect(selected.has("sk-a")).toBe(false);
      expect(selected.has("sk-b")).toBe(true);
      expect(selected.has("sk-c")).toBe(true);
    });

    it("restores key after successful request resets error count", () => {
      const tracker = new KeyHealthTracker();
      const selector = new KeySelector("round-robin", tracker);
      const provider = makeProvider({
        apiKeys: ["sk-x", "sk-y"],
      });

      tracker.recordError("sk-x");
      tracker.recordError("sk-x");
      tracker.recordError("sk-x");
      expect(tracker.getHealth("sk-x").isHealthy).toBe(false);

      tracker.recordSuccess("sk-x", 50);
      expect(tracker.getHealth("sk-x").isHealthy).toBe(true);

      const selected = new Set<string>();
      for (let i = 0; i < 4; i++) {
        selected.add(selector.selectKey(provider));
      }
      expect(selected.has("sk-x")).toBe(true);
    });

    it("falls back to all keys when every key is unhealthy", () => {
      const tracker = new KeyHealthTracker();
      const selector = new KeySelector("round-robin", tracker);
      const provider = makeProvider({
        apiKeys: ["sk-1", "sk-2"],
      });

      for (const key of ["sk-1", "sk-2"]) {
        tracker.recordError(key);
        tracker.recordError(key);
        tracker.recordError(key);
      }

      const key = selector.selectKey(provider);
      expect(["sk-1", "sk-2"]).toContain(key);
    });
  });

  describe("least-latency strategy", () => {
    it("selects key with lowest average latency", () => {
      const tracker = new KeyHealthTracker();
      const selector = new KeySelector("least-latency", tracker);
      const provider = makeProvider({
        apiKeys: ["sk-fast", "sk-medium", "sk-slow"],
        keyStrategy: "least-latency",
      });

      tracker.recordSuccess("sk-fast", 30);
      tracker.recordSuccess("sk-fast", 40);
      tracker.recordSuccess("sk-medium", 100);
      tracker.recordSuccess("sk-medium", 120);
      tracker.recordSuccess("sk-slow", 300);
      tracker.recordSuccess("sk-slow", 350);

      expect(selector.selectKey(provider)).toBe("sk-fast");
    });

    it("picks first key when no latency data exists", () => {
      const tracker = new KeyHealthTracker();
      const selector = new KeySelector("least-latency", tracker);
      const provider = makeProvider({
        apiKeys: ["sk-no-data-1", "sk-no-data-2"],
        keyStrategy: "least-latency",
      });

      const key = selector.selectKey(provider);
      expect(key).toBe("sk-no-data-1");
    });
  });

  describe("multi-provider routing", () => {
    it("routes to correct provider and uses key rotation per provider", () => {
      const tracker = new KeyHealthTracker();
      const selector = new KeySelector("round-robin", tracker);

      const primary = makeProvider({
        name: "primary",
        apiKeys: ["sk-p1", "sk-p2"],
        modelMappings: { "gpt-4o": "gpt-4o" },
        isDefault: true,
      });
      const secondary = makeProvider({
        name: "secondary",
        baseUrl: "http://localhost:8888",
        apiKeys: ["sk-s1", "sk-s2"],
        modelMappings: { "claude-3": "claude-3-opus" },
        isDefault: false,
      });

      const r1 = resolveRoute("gpt-4o", [primary, secondary], selector);
      expect(r1.providerName).toBe("primary");
      expect(r1.apiKey).toBe("sk-p1");

      const r2 = resolveRoute("gpt-4o", [primary, secondary], selector);
      expect(r2.providerName).toBe("primary");
      expect(r2.apiKey).toBe("sk-p2");

      const r3 = resolveRoute("claude-3", [primary, secondary], selector);
      expect(r3.providerName).toBe("secondary");
      expect(r3.apiKey).toBe("sk-s1");
    });

    it("falls back to default provider for unmapped models", () => {
      const tracker = new KeyHealthTracker();
      const selector = new KeySelector("round-robin", tracker);

      const primary = makeProvider({
        name: "primary",
        apiKeys: ["sk-p1"],
        modelMappings: { "gpt-4o": "gpt-4o" },
        isDefault: true,
      });
      const secondary = makeProvider({
        name: "secondary",
        baseUrl: "http://localhost:8888",
        apiKeys: ["sk-s1"],
        modelMappings: { "claude-3": "claude-3-opus" },
        isDefault: false,
      });

      const route = resolveRoute("unknown-model", [primary, secondary], selector);
      expect(route.providerName).toBe("primary");
      expect(route.apiKey).toBe("sk-p1");
      expect(route.resolvedModel).toBe("unknown-model");
    });
  });
});
