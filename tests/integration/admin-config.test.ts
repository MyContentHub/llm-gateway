import { describe, it, expect } from "vitest";
import { createTestServer } from "../helpers/setup.js";

describe("Admin Config Endpoints", () => {
  describe("GET /admin/config", () => {
    it("returns sanitized config without secrets", async () => {
      const { server, cleanup, adminToken } = await createTestServer();
      try {
        const res = await server.inject({
          method: "GET",
          url: "/admin/config",
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).toHaveProperty("port");
        expect(body).toHaveProperty("host");
        expect(body).toHaveProperty("log_level");
        expect(body).toHaveProperty("default_rpm");
        expect(body).toHaveProperty("default_tpm");
        expect(body).toHaveProperty("default_rpd");
        expect(body).toHaveProperty("security");
        expect(body).toHaveProperty("retry");
        expect(body).not.toHaveProperty("admin_token");
        expect(body).not.toHaveProperty("encryption_key");
        expect(body).not.toHaveProperty("providers");
        expect(body).not.toHaveProperty("database_path");
        expect(body.security).toHaveProperty("injection_threshold");
        expect(body.security).toHaveProperty("blocked_pii_types");
        expect(body.security).toHaveProperty("flagged_pii_types");
        expect(body.retry).toHaveProperty("max_retries");
        expect(body.retry).toHaveProperty("initial_delay_ms");
        expect(body.retry).toHaveProperty("max_delay_ms");
        expect(body.retry).toHaveProperty("backoff_multiplier");
      } finally {
        await cleanup();
      }
    });

    it("rejects unauthenticated requests", async () => {
      const { server, cleanup } = await createTestServer();
      try {
        const res = await server.inject({
          method: "GET",
          url: "/admin/config",
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await cleanup();
      }
    });

    it("rejects wrong admin token", async () => {
      const { server, cleanup } = await createTestServer();
      try {
        const res = await server.inject({
          method: "GET",
          url: "/admin/config",
          headers: { authorization: "Bearer wrong-token" },
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await cleanup();
      }
    });
  });

  describe("GET /admin/providers", () => {
    it("returns provider list with keyCount", async () => {
      const { server, cleanup, adminToken } = await createTestServer();
      try {
        const res = await server.inject({
          method: "GET",
          url: "/admin/providers",
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).toHaveProperty("providers");
        expect(Array.isArray(body.providers)).toBe(true);
        expect(body.providers.length).toBeGreaterThanOrEqual(1);
        const provider = body.providers[0];
        expect(provider).toHaveProperty("name");
        expect(provider).toHaveProperty("baseUrl");
        expect(provider).toHaveProperty("keyStrategy");
        expect(provider).toHaveProperty("keyCount");
        expect(provider).toHaveProperty("modelMappings");
        expect(provider).toHaveProperty("isDefault");
        expect(provider).not.toHaveProperty("apiKey");
        expect(provider).not.toHaveProperty("apiKeys");
        expect(provider.keyCount).toBe(1);
        expect(provider.name).toBe("test-provider");
        expect(provider.isDefault).toBe(true);
      } finally {
        await cleanup();
      }
    });

    it("returns correct keyCount for multi-key provider", async () => {
      const { server, cleanup, adminToken } = await createTestServer();
      try {
        server.config.providers.push({
          name: "multi-key-provider",
          baseUrl: "http://localhost:9999",
          apiKey: "sk-fallback",
          apiKeys: ["sk-key-1", "sk-key-2", "sk-key-3"],
          keyStrategy: "round-robin",
          modelMappings: {},
        });
        const res = await server.inject({
          method: "GET",
          url: "/admin/providers",
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        const multiProvider = body.providers.find(
          (p: Record<string, unknown>) => p.name === "multi-key-provider",
        );
        expect(multiProvider).toBeDefined();
        expect(multiProvider.keyCount).toBe(3);
      } finally {
        await cleanup();
      }
    });

    it("rejects unauthenticated requests", async () => {
      const { server, cleanup } = await createTestServer();
      try {
        const res = await server.inject({
          method: "GET",
          url: "/admin/providers",
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await cleanup();
      }
    });
  });

  describe("GET /admin/providers/health", () => {
    it("returns health data for provider keys", async () => {
      const { server, cleanup, adminToken } = await createTestServer();
      try {
        const res = await server.inject({
          method: "GET",
          url: "/admin/providers/health",
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).toHaveProperty("providers");
        expect(Array.isArray(body.providers)).toBe(true);
        expect(body.providers.length).toBeGreaterThanOrEqual(1);
        const provider = body.providers[0];
        expect(provider).toHaveProperty("name");
        expect(provider).toHaveProperty("keys");
        expect(Array.isArray(provider.keys)).toBe(true);
        expect(provider.keys.length).toBeGreaterThanOrEqual(1);
        const key = provider.keys[0];
        expect(key).toHaveProperty("id");
        expect(key).toHaveProperty("avgLatency");
        expect(key).toHaveProperty("consecutiveErrors");
        expect(key).toHaveProperty("isHealthy");
        expect(typeof key.avgLatency).toBe("number");
        expect(typeof key.consecutiveErrors).toBe("number");
        expect(typeof key.isHealthy).toBe("boolean");
      } finally {
        await cleanup();
      }
    });

    it("reflects recorded health data", async () => {
      const { server, cleanup, adminToken } = await createTestServer();
      try {
        server.healthTracker.recordSuccess("sk-test-key", 150);
        server.healthTracker.recordSuccess("sk-test-key", 250);
        const res = await server.inject({
          method: "GET",
          url: "/admin/providers/health",
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        const provider = body.providers[0];
        const key = provider.keys[0];
        expect(key.avgLatency).toBe(200);
        expect(key.consecutiveErrors).toBe(0);
        expect(key.isHealthy).toBe(true);
      } finally {
        await cleanup();
      }
    });

    it("marks key unhealthy after consecutive errors", async () => {
      const { server, cleanup, adminToken } = await createTestServer();
      try {
        server.healthTracker.recordError("sk-test-key");
        server.healthTracker.recordError("sk-test-key");
        server.healthTracker.recordError("sk-test-key");
        const res = await server.inject({
          method: "GET",
          url: "/admin/providers/health",
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        const key = body.providers[0].keys[0];
        expect(key.consecutiveErrors).toBe(3);
        expect(key.isHealthy).toBe(false);
      } finally {
        await cleanup();
      }
    });

    it("rejects unauthenticated requests", async () => {
      const { server, cleanup } = await createTestServer();
      try {
        const res = await server.inject({
          method: "GET",
          url: "/admin/providers/health",
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await cleanup();
      }
    });
  });

  describe("GET /admin/audit/security", () => {
    it("returns aggregated security stats with correct structure", async () => {
      const { server, cleanup, adminToken } = await createTestServer();
      try {
        const res = await server.inject({
          method: "GET",
          url: "/admin/audit/security",
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).toHaveProperty("blockedRequests");
        expect(body).toHaveProperty("piiDetections");
        expect(body).toHaveProperty("injectionAttempts");
        expect(body).toHaveProperty("contentFilter");
        expect(typeof body.blockedRequests).toBe("number");
        expect(body.piiDetections).toHaveProperty("total");
        expect(body.piiDetections).toHaveProperty("byType");
        expect(typeof body.piiDetections.total).toBe("number");
        expect(typeof body.piiDetections.byType).toBe("object");
        expect(body.injectionAttempts).toHaveProperty("total");
        expect(body.injectionAttempts).toHaveProperty("avgScore");
        expect(body.injectionAttempts).toHaveProperty("scoreDistribution");
        expect(body.injectionAttempts.scoreDistribution).toHaveProperty("0-0.2");
        expect(body.injectionAttempts.scoreDistribution).toHaveProperty("0.2-0.4");
        expect(body.injectionAttempts.scoreDistribution).toHaveProperty("0.4-0.6");
        expect(body.injectionAttempts.scoreDistribution).toHaveProperty("0.6-0.8");
        expect(body.injectionAttempts.scoreDistribution).toHaveProperty("0.8-1.0");
        expect(body.contentFilter).toHaveProperty("allowed");
        expect(body.contentFilter).toHaveProperty("flagged");
        expect(body.contentFilter).toHaveProperty("blocked");
      } finally {
        await cleanup();
      }
    });

    it("returns zero stats for empty database", async () => {
      const { server, cleanup, adminToken } = await createTestServer();
      try {
        const res = await server.inject({
          method: "GET",
          url: "/admin/audit/security",
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.blockedRequests).toBe(0);
        expect(body.piiDetections.total).toBe(0);
        expect(body.injectionAttempts.total).toBe(0);
        expect(body.contentFilter.allowed).toBe(0);
        expect(body.contentFilter.flagged).toBe(0);
        expect(body.contentFilter.blocked).toBe(0);
      } finally {
        await cleanup();
      }
    });

    it("reflects security stats after requests", async () => {
      const SECURITY_CONFIG = {
        injection_threshold: 0.5,
        blocked_pii_types: ["SSN", "CREDIT_CARD"],
        flagged_pii_types: [
          "EMAIL", "PHONE", "CN_ID", "BANK_CARD", "IP_ADDRESS",
          "DATE_OF_BIRTH", "PERSON", "PLACE", "ORGANIZATION",
        ],
      };
      const { server, cleanup, createKey, adminToken } = await createTestServer({
        security: SECURITY_CONFIG,
      });
      try {
        const key = await createKey();
        await server.inject({
          method: "POST",
          url: "/v1/chat/completions",
          headers: { authorization: `Bearer ${key}` },
          payload: {
            model: "gpt-4o",
            messages: [{ role: "user", content: "Hello" }],
          },
        });
        const res = await server.inject({
          method: "GET",
          url: "/admin/audit/security",
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.contentFilter.allowed).toBeGreaterThanOrEqual(1);
      } finally {
        await cleanup();
      }
    });

    it("rejects unauthenticated requests", async () => {
      const { server, cleanup } = await createTestServer();
      try {
        const res = await server.inject({
          method: "GET",
          url: "/admin/audit/security",
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await cleanup();
      }
    });
  });
});
