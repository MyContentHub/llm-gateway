import { describe, it, expect } from "vitest";
import { createTestServer } from "../helpers/setup.js";
import { recordLlmTokens, recordLlmCost } from "../../src/audit/metrics.js";

describe("Metrics Integration", () => {
  it("GET /metrics returns Prometheus text format", async () => {
    const { server, cleanup, createKey } = await createTestServer();
    try {
      const res = await server.inject({
        method: "GET",
        url: "/metrics",
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/plain");
      const body = res.body;
      expect(body).toContain("# HELP");
      expect(body).toContain("# TYPE");
    } finally {
      await cleanup();
    }
  });

  it("records llm_request_total after LLM requests", async () => {
    const { server, cleanup, createKey } = await createTestServer();
    try {
      const key = await createKey();
      await server.inject({
        method: "POST",
        url: "/api/v1/chat/completions",
        headers: { authorization: `Bearer ${key}` },
        payload: {
          model: "gpt-4o",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      const res = await server.inject({
        method: "GET",
        url: "/metrics",
      });
      expect(res.statusCode).toBe(200);
      const body = res.body;
      expect(body).toContain("llm_request_total");
      const match = body.match(/llm_request_total\{[^}]*model="gpt-4o"[^}]*\}\s+(\d+)/);
      expect(match).toBeTruthy();
      expect(Number(match![1])).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanup();
    }
  });

  it("records llm_tokens_total when token metrics are recorded", async () => {
    const { server, cleanup, createKey } = await createTestServer();
    try {
      const key = await createKey();
      await server.inject({
        method: "POST",
        url: "/api/v1/chat/completions",
        headers: { authorization: `Bearer ${key}` },
        payload: {
          model: "gpt-4o",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      recordLlmTokens("prompt", "gpt-4o", 10);
      recordLlmTokens("completion", "gpt-4o", 5);

      const res = await server.inject({
        method: "GET",
        url: "/metrics",
      });
      expect(res.statusCode).toBe(200);
      const body = res.body;
      expect(body).toContain("llm_tokens_total");
      const promptMatch = body.match(/llm_tokens_total\{[^}]*type="prompt"[^}]*model="gpt-4o"[^}]*\}\s+(\d+)/);
      expect(promptMatch).toBeTruthy();
      expect(Number(promptMatch![1])).toBeGreaterThanOrEqual(10);
      const completionMatch = body.match(/llm_tokens_total\{[^}]*type="completion"[^}]*model="gpt-4o"[^}]*\}\s+(\d+)/);
      expect(completionMatch).toBeTruthy();
      expect(Number(completionMatch![1])).toBeGreaterThanOrEqual(5);
    } finally {
      await cleanup();
    }
  });

  it("records llm_request_duration_seconds after requests", async () => {
    const { server, cleanup, createKey } = await createTestServer();
    try {
      const key = await createKey();
      await server.inject({
        method: "POST",
        url: "/api/v1/chat/completions",
        headers: { authorization: `Bearer ${key}` },
        payload: {
          model: "gpt-4o",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      const res = await server.inject({
        method: "GET",
        url: "/metrics",
      });
      expect(res.statusCode).toBe(200);
      const body = res.body;
      expect(body).toContain("llm_request_duration_seconds");
      expect(body).toContain("llm_request_duration_seconds_bucket");
      const match = body.match(/llm_request_duration_seconds_count\{[^}]*model="gpt-4o"[^}]*\}\s+(\d+)/);
      expect(match).toBeTruthy();
      expect(Number(match![1])).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanup();
    }
  });

  it("records llm_request_cost_usd when cost metrics are recorded", async () => {
    const { server, cleanup, createKey } = await createTestServer();
    try {
      const key = await createKey();
      await server.inject({
        method: "POST",
        url: "/api/v1/chat/completions",
        headers: { authorization: `Bearer ${key}` },
        payload: {
          model: "gpt-4o",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      recordLlmCost("gpt-4o", 0.000075);

      const res = await server.inject({
        method: "GET",
        url: "/metrics",
      });
      expect(res.statusCode).toBe(200);
      const body = res.body;
      expect(body).toContain("llm_request_cost_usd");
      expect(body).toContain("llm_request_cost_usd_bucket");
      const match = body.match(/llm_request_cost_usd_count\{[^}]*model="gpt-4o"[^}]*\}\s+(\d+)/);
      expect(match).toBeTruthy();
      expect(Number(match![1])).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanup();
    }
  });

  it("records http_request_total for all requests including admin", async () => {
    const { server, cleanup, createKey, adminToken } = await createTestServer();
    try {
      const key = await createKey();
      await server.inject({
        method: "POST",
        url: "/api/v1/chat/completions",
        headers: { authorization: `Bearer ${key}` },
        payload: {
          model: "gpt-4o",
          messages: [{ role: "user", content: "Hello" }],
        },
      });
      await server.inject({
        method: "GET",
        url: "/api/admin/audit/logs",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const res = await server.inject({
        method: "GET",
        url: "/metrics",
      });
      expect(res.statusCode).toBe(200);
      const body = res.body;
      expect(body).toContain("http_request_total");
    } finally {
      await cleanup();
    }
  });
});
