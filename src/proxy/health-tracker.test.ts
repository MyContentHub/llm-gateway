import { describe, it, expect, beforeEach } from "vitest";
import { KeyHealthTracker } from "./health-tracker.js";

describe("KeyHealthTracker", () => {
  let tracker: KeyHealthTracker;

  beforeEach(() => {
    tracker = new KeyHealthTracker(10);
  });

  describe("recordSuccess", () => {
    it("records latency for a key", () => {
      tracker.recordSuccess("key-a", 100);
      const health = tracker.getHealth("key-a");
      expect(health.avgLatency).toBe(100);
    });

    it("calculates average latency from multiple samples", () => {
      tracker.recordSuccess("key-a", 100);
      tracker.recordSuccess("key-a", 200);
      tracker.recordSuccess("key-a", 300);
      const health = tracker.getHealth("key-a");
      expect(health.avgLatency).toBe(200);
    });

    it("resets consecutive errors on success", () => {
      tracker.recordError("key-a");
      tracker.recordError("key-a");
      tracker.recordSuccess("key-a", 100);
      const health = tracker.getHealth("key-a");
      expect(health.consecutiveErrors).toBe(0);
      expect(health.isHealthy).toBe(true);
    });

    it("keeps only last N samples", () => {
      const smallTracker = new KeyHealthTracker(3);
      smallTracker.recordSuccess("key-a", 100);
      smallTracker.recordSuccess("key-a", 200);
      smallTracker.recordSuccess("key-a", 300);
      smallTracker.recordSuccess("key-a", 400);
      const health = smallTracker.getHealth("key-a");
      expect(health.avgLatency).toBe(300);
    });
  });

  describe("recordError", () => {
    it("increments consecutive error count", () => {
      tracker.recordError("key-a");
      tracker.recordError("key-a");
      const health = tracker.getHealth("key-a");
      expect(health.consecutiveErrors).toBe(2);
    });

    it("marks key as unhealthy after 3 consecutive errors", () => {
      tracker.recordError("key-a");
      expect(tracker.getHealth("key-a").isHealthy).toBe(true);
      tracker.recordError("key-a");
      expect(tracker.getHealth("key-a").isHealthy).toBe(true);
      tracker.recordError("key-a");
      expect(tracker.getHealth("key-a").isHealthy).toBe(false);
    });

    it("tracks errors independently per key", () => {
      tracker.recordError("key-a");
      tracker.recordError("key-a");
      tracker.recordError("key-a");
      expect(tracker.getHealth("key-a").isHealthy).toBe(false);
      expect(tracker.getHealth("key-b").isHealthy).toBe(true);
    });
  });

  describe("getHealth", () => {
    it("returns default health for unknown key", () => {
      const health = tracker.getHealth("unknown-key");
      expect(health.avgLatency).toBe(0);
      expect(health.consecutiveErrors).toBe(0);
      expect(health.isHealthy).toBe(true);
    });

    it("returns full health info for a tracked key", () => {
      tracker.recordSuccess("key-a", 150);
      tracker.recordSuccess("key-a", 250);
      tracker.recordError("key-a");
      const health = tracker.getHealth("key-a");
      expect(health.avgLatency).toBe(200);
      expect(health.consecutiveErrors).toBe(1);
      expect(health.isHealthy).toBe(true);
    });

    it("reports unhealthy when consecutive errors >= 3", () => {
      tracker.recordError("key-a");
      tracker.recordError("key-a");
      tracker.recordError("key-a");
      const health = tracker.getHealth("key-a");
      expect(health.isHealthy).toBe(false);
      expect(health.consecutiveErrors).toBe(3);
    });

    it("key can recover from unhealthy state", () => {
      tracker.recordError("key-a");
      tracker.recordError("key-a");
      tracker.recordError("key-a");
      expect(tracker.getHealth("key-a").isHealthy).toBe(false);
      tracker.recordSuccess("key-a", 100);
      expect(tracker.getHealth("key-a").isHealthy).toBe(true);
      expect(tracker.getHealth("key-a").consecutiveErrors).toBe(0);
    });
  });
});
