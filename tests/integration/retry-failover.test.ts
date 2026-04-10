import { describe, it, expect, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { forwardRequest } from "../../src/proxy/forwarder.js";
import { resolveRoute } from "../../src/proxy/router.js";
import { isRetryable, retryWithBackoff, sleep } from "../../src/proxy/retry.js";
import type { RetryConfig } from "../../src/proxy/retry.js";
import type { ProviderConfig } from "../../src/config/providers.js";
import { createMockUpstream, getServerUrl } from "../helpers/mock-upstream.js";
import { createTestServer } from "../helpers/setup.js";

const FAST_RETRY: RetryConfig = {
  maxRetries: 2,
  initialDelayMs: 10,
  maxDelayMs: 50,
  backoffMultiplier: 2,
};

describe("Retry & Failover Integration", () => {
  let servers: FastifyInstance[] = [];

  afterEach(async () => {
    for (const s of servers) await s.close();
    servers = [];
  });

  async function makeMockServer(
    handler: (req: unknown, reply: unknown, callCount: { n: number }) => Promise<void>,
  ): Promise<{ url: string; callCount: { n: number } }> {
    const callCount = { n: 0 };
    const server = Fastify({ logger: false });
    server.post("/chat/completions", async (request, reply) => {
      callCount.n++;
      await handler(request, reply, callCount);
    });
    await server.listen({ port: 0, host: "127.0.0.1" });
    servers.push(server);
    const addr = server.addresses()[0];
    return { url: `http://${addr.address}:${addr.port}`, callCount };
  }

  describe("retry with backoff", () => {
    it("retries on 502 then returns 200", async () => {
      const { url, callCount } = await makeMockServer(async (_req, reply, cc) => {
        if (cc.n === 1) {
          return (reply as any).code(502).send({ error: { message: "bad gateway" } });
        }
        return (reply as any).code(200).send({ id: "test", choices: [] });
      });

      const result = await forwardRequest({
        upstreamUrl: `${url}/chat/completions`,
        apiKey: "sk-test",
        body: { model: "gpt-4o", messages: [] },
        retryConfig: FAST_RETRY,
      });

      expect(result.status).toBe(200);
      expect((result.body as any).id).toBe("test");
      expect(callCount.n).toBe(2);
    });

    it("retries on 429 then returns 200", async () => {
      const { url, callCount } = await makeMockServer(async (_req, reply, cc) => {
        if (cc.n <= 2) {
          return (reply as any).code(429).send({ error: { message: "rate limited" } });
        }
        return (reply as any).code(200).send({ id: "retry-ok", choices: [] });
      });

      const result = await forwardRequest({
        upstreamUrl: `${url}/chat/completions`,
        apiKey: "sk-test",
        body: { model: "gpt-4o", messages: [] },
        retryConfig: FAST_RETRY,
      });

      expect(result.status).toBe(200);
      expect(callCount.n).toBe(3);
    });

    it("does not retry non-retryable errors (400)", async () => {
      const { url, callCount } = await makeMockServer(async (_req, reply) => {
        return (reply as any).code(400).send({ error: { message: "bad request" } });
      });

      const result = await forwardRequest({
        upstreamUrl: `${url}/chat/completions`,
        apiKey: "sk-test",
        body: { model: "gpt-4o", messages: [] },
        retryConfig: FAST_RETRY,
      });

      expect(result.status).toBe(400);
      expect(callCount.n).toBe(1);
    });

    it("does not retry 401 errors", async () => {
      const { url, callCount } = await makeMockServer(async (_req, reply) => {
        return (reply as any).code(401).send({ error: { message: "unauthorized" } });
      });

      const result = await forwardRequest({
        upstreamUrl: `${url}/chat/completions`,
        apiKey: "sk-bad",
        body: { model: "gpt-4o", messages: [] },
        retryConfig: FAST_RETRY,
      });

      expect(result.status).toBe(401);
      expect(callCount.n).toBe(1);
    });

    it("returns last error after max retries exhausted", async () => {
      const { url, callCount } = await makeMockServer(async (_req, reply) => {
        return (reply as any).code(503).send({ error: { message: "unavailable" } });
      });

      const result = await forwardRequest({
        upstreamUrl: `${url}/chat/completions`,
        apiKey: "sk-test",
        body: { model: "gpt-4o", messages: [] },
        retryConfig: FAST_RETRY,
      });

      expect(result.status).toBe(503);
      expect(callCount.n).toBe(3);
    });

    it("retries on 500 and 504 status codes", async () => {
      const { url, callCount } = await makeMockServer(async (_req, reply, cc) => {
        if (cc.n === 1) return (reply as any).code(500).send({ error: { message: "internal" } });
        if (cc.n === 2) return (reply as any).code(504).send({ error: { message: "timeout" } });
        return (reply as any).code(200).send({ id: "final", choices: [] });
      });

      const result = await forwardRequest({
        upstreamUrl: `${url}/chat/completions`,
        apiKey: "sk-test",
        body: { model: "gpt-4o", messages: [] },
        retryConfig: FAST_RETRY,
      });

      expect(result.status).toBe(200);
      expect(callCount.n).toBe(3);
    });
  });

  describe("isRetryable", () => {
    it("identifies retryable and non-retryable status codes", () => {
      expect(isRetryable(429)).toBe(true);
      expect(isRetryable(500)).toBe(true);
      expect(isRetryable(502)).toBe(true);
      expect(isRetryable(503)).toBe(true);
      expect(isRetryable(504)).toBe(true);
      expect(isRetryable(400)).toBe(false);
      expect(isRetryable(401)).toBe(false);
      expect(isRetryable(403)).toBe(false);
      expect(isRetryable(404)).toBe(false);
      expect(isRetryable(200)).toBe(false);
    });
  });

  describe("retryWithBackoff callback", () => {
    it("invokes onRetry callback on each retry attempt", async () => {
      const retryLog: Array<{ attempt: number; delay: number }> = [];
      let callCount = 0;

      await retryWithBackoff(
        async () => {
          callCount++;
          return callCount < 3 ? { status: 502 } : { status: 200 };
        },
        (res) => res.status >= 500,
        FAST_RETRY,
        (attempt, delay) => {
          retryLog.push({ attempt, delay });
        },
      );

      expect(retryLog.length).toBe(2);
      expect(retryLog[0].attempt).toBe(0);
      expect(retryLog[1].attempt).toBe(1);
    });
  });

  describe("failover routing", () => {
    it("routes to secondary provider when model only exists there", () => {
      const providers: ProviderConfig[] = [
        {
          name: "openai",
          baseUrl: "http://localhost:9001",
          apiKey: "sk-openai",
          keyStrategy: "round-robin",
          modelMappings: { "gpt-4o": "gpt-4o" },
          isDefault: true,
        },
        {
          name: "anthropic",
          baseUrl: "http://localhost:9002",
          apiKey: "sk-anthropic",
          keyStrategy: "round-robin",
          modelMappings: { "claude-3": "claude-3-opus" },
          isDefault: false,
        },
      ];

      const route = resolveRoute("claude-3", providers);
      expect(route.providerName).toBe("anthropic");
      expect(route.baseUrl).toBe("http://localhost:9002");
      expect(route.apiKey).toBe("sk-anthropic");
      expect(route.resolvedModel).toBe("claude-3-opus");
    });

    it("falls back to default provider for unmapped models", () => {
      const providers: ProviderConfig[] = [
        {
          name: "primary",
          baseUrl: "http://localhost:9001",
          apiKey: "sk-primary",
          keyStrategy: "round-robin",
          modelMappings: { "gpt-4o": "gpt-4o" },
          isDefault: true,
        },
        {
          name: "secondary",
          baseUrl: "http://localhost:9002",
          apiKey: "sk-secondary",
          keyStrategy: "round-robin",
          modelMappings: { "claude-3": "claude-3-opus" },
          isDefault: false,
        },
      ];

      const route = resolveRoute("llama-3", providers);
      expect(route.providerName).toBe("primary");
      expect(route.resolvedModel).toBe("llama-3");
    });

    it("routes to primary for mapped model even with multiple providers", () => {
      const providers: ProviderConfig[] = [
        {
          name: "provider-a",
          baseUrl: "http://localhost:9001",
          apiKey: "sk-a",
          keyStrategy: "round-robin",
          modelMappings: { "gpt-4o": "gpt-4o-a" },
          isDefault: false,
        },
        {
          name: "provider-b",
          baseUrl: "http://localhost:9002",
          apiKey: "sk-b",
          keyStrategy: "round-robin",
          modelMappings: { "gpt-4o": "gpt-4o-b" },
          isDefault: true,
        },
      ];

      const route = resolveRoute("gpt-4o", providers);
      expect(route.providerName).toBe("provider-a");
      expect(route.resolvedModel).toBe("gpt-4o-a");
    });
  });

  describe("end-to-end pipeline", () => {
    it("auth → rate limit → proxy → audit → metrics for chat completions", async () => {
      const { server, cleanup, createKey, adminToken } = await createTestServer();
      try {
        const key = await createKey("e2e-test");

        const noAuth = await server.inject({
          method: "POST",
          url: "/v1/chat/completions",
          payload: {
            model: "gpt-4o",
            messages: [{ role: "user", content: "Hello" }],
          },
        });
        expect(noAuth.statusCode).toBe(401);

        const response = await server.inject({
          method: "POST",
          url: "/v1/chat/completions",
          headers: { authorization: `Bearer ${key}` },
          payload: {
            model: "gpt-4o",
            messages: [{ role: "user", content: "Hello" }],
          },
        });
        expect(response.statusCode).toBe(200);

        const body = response.json();
        expect(body.id).toBe("chatcmpl-integration-test");
        expect(body.object).toBe("chat.completion");
        expect(body.choices[0].message.content).toBe("Hello from integration test!");

        expect(response.headers["x-ratelimit-limit"]).toBeDefined();
        expect(response.headers["x-ratelimit-remaining"]).toBeDefined();

        const auditRes = await server.inject({
          method: "GET",
          url: "/admin/audit/logs",
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(auditRes.statusCode).toBe(200);
        const auditBody = auditRes.json();
        const log = auditBody.logs.find(
          (l: Record<string, unknown>) => l.model === "gpt-4o" && l.status === "success",
        );
        expect(log).toBeDefined();
        expect(log.endpoint).toBe("/v1/chat/completions");

        const metricsRes = await server.inject({
          method: "GET",
          url: "/metrics",
        });
        expect(metricsRes.statusCode).toBe(200);
        expect(metricsRes.body).toContain("llm_request_total");
        const match = metricsRes.body.match(
          /llm_request_total\{[^}]*model="gpt-4o"[^}]*status="success"[^}]*\}\s+(\d+)/,
        );
        expect(match).toBeTruthy();
        expect(Number(match![1])).toBeGreaterThanOrEqual(1);
      } finally {
        await cleanup();
      }
    });

    it("end-to-end with security scanning and PII redaction", async () => {
      const { server, cleanup, createKey, adminToken } = await createTestServer({
        security: {
          injection_threshold: 0.5,
          blocked_pii_types: ["SSN", "CREDIT_CARD"],
          flagged_pii_types: [
            "EMAIL", "PHONE", "CN_ID", "BANK_CARD", "IP_ADDRESS",
            "DATE_OF_BIRTH", "PERSON", "PLACE", "ORGANIZATION",
          ],
        },
      });
      try {
        const key = await createKey("e2e-sec");

        const blockedRes = await server.inject({
          method: "POST",
          url: "/v1/chat/completions",
          headers: { authorization: `Bearer ${key}` },
          payload: {
            model: "gpt-4o",
            messages: [{ role: "user", content: "My SSN is 123-45-6789" }],
          },
        });
        expect(blockedRes.statusCode).toBe(400);
        expect(blockedRes.json().error.code).toBe("content_blocked");

        const allowedRes = await server.inject({
          method: "POST",
          url: "/v1/chat/completions",
          headers: { authorization: `Bearer ${key}` },
          payload: {
            model: "gpt-4o",
            messages: [{ role: "user", content: "Email me at test@example.com" }],
          },
        });
        expect(allowedRes.statusCode).toBe(200);

        const auditRes = await server.inject({
          method: "GET",
          url: "/admin/audit/logs",
          headers: { authorization: `Bearer ${adminToken}` },
        });
        const auditBody = auditRes.json();
        const piiLog = auditBody.logs.find(
          (l: Record<string, unknown>) => l.pii_detected === 1,
        );
        expect(piiLog).toBeDefined();
      } finally {
        await cleanup();
      }
    });

    it("end-to-end with embeddings and models endpoints", async () => {
      const { server, cleanup, createKey } = await createTestServer();
      try {
        const key = await createKey("e2e-multi");

        const embRes = await server.inject({
          method: "POST",
          url: "/v1/embeddings",
          headers: { authorization: `Bearer ${key}` },
          payload: {
            model: "text-embedding-3-small",
            input: "Hello world",
          },
        });
        expect(embRes.statusCode).toBe(200);
        const embBody = embRes.json();
        expect(embBody.object).toBe("list");
        expect(embBody.data).toHaveLength(1);

        const modelsRes = await server.inject({
          method: "GET",
          url: "/v1/models",
          headers: { authorization: `Bearer ${key}` },
        });
        expect(modelsRes.statusCode).toBe(200);
        const modelsBody = modelsRes.json();
        expect(modelsBody.object).toBe("list");
        expect(modelsBody.data.length).toBeGreaterThanOrEqual(1);
      } finally {
        await cleanup();
      }
    });

    it("end-to-end rate limiting returns 429 when exceeded", async () => {
      const { server, cleanup, createKey } = await createTestServer({
        defaultRpm: 2,
      });
      try {
        const key = await createKey("e2e-ratelimit", {
          rpm: 2,
          tpm: 100000,
          rpd: 1000,
        });

        const res1 = await server.inject({
          method: "POST",
          url: "/v1/chat/completions",
          headers: { authorization: `Bearer ${key}` },
          payload: {
            model: "gpt-4o",
            messages: [{ role: "user", content: "One" }],
          },
        });
        expect(res1.statusCode).toBe(200);

        const res2 = await server.inject({
          method: "POST",
          url: "/v1/chat/completions",
          headers: { authorization: `Bearer ${key}` },
          payload: {
            model: "gpt-4o",
            messages: [{ role: "user", content: "Two" }],
          },
        });
        expect(res2.statusCode).toBe(200);

        const res3 = await server.inject({
          method: "POST",
          url: "/v1/chat/completions",
          headers: { authorization: `Bearer ${key}` },
          payload: {
            model: "gpt-4o",
            messages: [{ role: "user", content: "Three" }],
          },
        });
        expect(res3.statusCode).toBe(429);
      } finally {
        await cleanup();
      }
    });
  });
});
