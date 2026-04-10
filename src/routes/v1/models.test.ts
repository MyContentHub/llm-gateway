import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { modelsPlugin } from "./models.js";
import "../../types.js";
import type { ProviderConfig } from "../../config/providers.js";
import { DEFAULT_SECURITY_CONFIG } from "../../config/index.js";

const originalFetch = globalThis.fetch;

function createServer(providers: ProviderConfig[] = []) {
  const server = Fastify({ logger: false });
  server.decorate("config", {
    providers: providers,
    port: 3000,
    host: "0.0.0.0",
    log_level: "silent",
    database_path: "./test.db",
    encryption_key: "",
    admin_token: "admin-secret-key",
    default_rpm: 60,
    default_tpm: 100000,
    default_rpd: 1000,
    security: DEFAULT_SECURITY_CONFIG,
    retry: { max_retries: 2, initial_delay_ms: 1000, max_delay_ms: 10000, backoff_multiplier: 2 },
  });
  server.register(modelsPlugin);
  return server;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("GET /v1/models", () => {
  it("returns empty list when no providers configured", async () => {
    const server = createServer();
    const res = await server.inject({ method: "GET", url: "/v1/models" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ object: "list", data: [] });

    await server.close();
  });

  it("returns models from a single provider", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        object: "list",
        data: [
          { id: "gpt-4o", object: "model", created: 1686935002, owned_by: "openai" },
          { id: "gpt-4o-mini", object: "model", created: 1686935003, owned_by: "openai" },
        ],
      }),
    });

    const server = createServer([
      { name: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "sk-test", keyStrategy: "round-robin", modelMappings: {}, isDefault: true },
    ]);

    const res = await server.inject({ method: "GET", url: "/v1/models" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.object).toBe("list");
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({
      id: "openai/gpt-4o",
      object: "model",
      created: 1686935002,
      owned_by: "openai",
    });
    expect(body.data[1]).toEqual({
      id: "openai/gpt-4o-mini",
      object: "model",
      created: 1686935003,
      owned_by: "openai",
    });

    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { Authorization: "Bearer sk-test" },
    });

    await server.close();
  });

  it("aggregates models from multiple providers", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            object: "list",
            data: [{ id: "gpt-4o", object: "model", created: 1, owned_by: "openai" }],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          object: "list",
          data: [{ id: "claude-3", object: "model", created: 2, owned_by: "anthropic" }],
        }),
      };
    });

    const server = createServer([
      { name: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "sk-oai", keyStrategy: "round-robin", modelMappings: {}, isDefault: true },
      { name: "anthropic", baseUrl: "https://api.anthropic.com/v1", apiKey: "sk-ant", keyStrategy: "round-robin", modelMappings: {}, isDefault: false },
    ]);

    const res = await server.inject({ method: "GET", url: "/v1/models" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe("openai/gpt-4o");
    expect(body.data[1].id).toBe("anthropic/claude-3");

    await server.close();
  });

  it("continues when one provider fails", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 500, statusText: "Internal Server Error" };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          object: "list",
          data: [{ id: "deepseek-chat", object: "model", created: 3, owned_by: "deepseek" }],
        }),
      };
    });

    const server = createServer([
      { name: "bad", baseUrl: "https://bad.example.com/v1", apiKey: "sk-bad", keyStrategy: "round-robin", modelMappings: {}, isDefault: false },
      { name: "deepseek", baseUrl: "https://api.deepseek.com/v1", apiKey: "sk-ds", keyStrategy: "round-robin", modelMappings: {}, isDefault: false },
    ]);

    const res = await server.inject({ method: "GET", url: "/v1/models" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("deepseek/deepseek-chat");

    await server.close();
  });

  it("returns empty data when all providers fail", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });

    const server = createServer([
      { name: "a", baseUrl: "https://a.com/v1", apiKey: "k1", keyStrategy: "round-robin", modelMappings: {}, isDefault: false },
      { name: "b", baseUrl: "https://b.com/v1", apiKey: "k2", keyStrategy: "round-robin", modelMappings: {}, isDefault: false },
    ]);

    const res = await server.inject({ method: "GET", url: "/v1/models" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.object).toBe("list");
    expect(body.data).toEqual([]);

    await server.close();
  });

  it("handles network errors gracefully", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const server = createServer([
      { name: "unreachable", baseUrl: "https://unreachable.com/v1", apiKey: "sk-key", keyStrategy: "round-robin", modelMappings: {}, isDefault: false },
    ]);

    const res = await server.inject({ method: "GET", url: "/v1/models" });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);

    await server.close();
  });

  it("prefixes model ids with provider name", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        object: "list",
        data: [{ id: "my-model", object: "model", created: 100, owned_by: "test-owner" }],
      }),
    });

    const server = createServer([
      { name: "custom-provider", baseUrl: "https://custom.com/v1", apiKey: "key", keyStrategy: "round-robin", modelMappings: {}, isDefault: false },
    ]);

    const res = await server.inject({ method: "GET", url: "/v1/models" });

    const body = res.json();
    expect(body.data[0].id).toBe("custom-provider/my-model");

    await server.close();
  });
});
