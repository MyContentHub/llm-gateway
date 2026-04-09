import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { embeddingsPlugin } from "./embeddings.js";
import type { AppConfig } from "../../config/index.js";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createServer(): Fastify.FastifyInstance {
  const server = Fastify({ logger: false });
  server.decorate("config", {
    port: 3000,
    host: "0.0.0.0",
    log_level: "silent",
    database_path: "./data/gateway.db",
    encryption_key: "",
    providers: [
      {
        name: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-openai-key",
        modelMappings: { "text-embedding-3-small": "text-embedding-3-small" },
        isDefault: true,
      },
      {
        name: "other",
        baseUrl: "https://api.other.com/v1",
        apiKey: "sk-other-key",
        modelMappings: { "embed-fast": "embed-v3-small" },
        isDefault: false,
      },
    ],
    admin_token: "admin-secret-key",
    default_rpm: 60,
    default_tpm: 100000,
  } satisfies AppConfig);
  server.register(embeddingsPlugin);
  return server;
}

function mockFetchResponse(status: number, body: unknown, headers?: Record<string, string>) {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: headers ?? { "content-type": "application/json" },
    }),
  );
}

describe("POST /v1/embeddings", () => {
  it("returns 400 when model is missing", async () => {
    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/v1/embeddings",
      payload: { input: "Hello world" },
    });

    expect(response.statusCode).toBe(400);
    const json = response.json();
    expect(json.error.type).toBe("invalid_request_error");

    await server.close();
  });

  it("returns 400 when model is not a string", async () => {
    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/v1/embeddings",
      payload: { model: 123, input: "Hello" },
    });

    expect(response.statusCode).toBe(400);

    await server.close();
  });

  it("proxies a successful embeddings request", async () => {
    const upstreamBody = {
      object: "list",
      data: [
        {
          object: "embedding",
          index: 0,
          embedding: [0.0023, -0.0094, 0.0112],
        },
      ],
      model: "text-embedding-3-small",
      usage: { prompt_tokens: 5, total_tokens: 5 },
    };

    mockFetchResponse(200, upstreamBody);

    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/v1/embeddings",
      payload: {
        model: "text-embedding-3-small",
        input: "Hello world",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(upstreamBody);
    expect(response.headers["content-type"]).toContain("application/json");

    await server.close();
  });

  it("resolves model alias and forwards resolved model name", async () => {
    const upstreamBody = {
      object: "list",
      data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
      model: "embed-v3-small",
      usage: { prompt_tokens: 3, total_tokens: 3 },
    };

    mockFetchResponse(200, upstreamBody);

    const server = createServer();
    await server.inject({
      method: "POST",
      url: "/v1/embeddings",
      payload: {
        model: "embed-fast",
        input: "test",
      },
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.other.com/v1/embeddings",
      expect.objectContaining({
        body: expect.stringContaining('"model":"embed-v3-small"'),
      }),
    );

    await server.close();
  });

  it("forwards upstream error with correct status code", async () => {
    const upstreamError = {
      error: {
        message: "Rate limit exceeded",
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
      },
    };

    mockFetchResponse(429, upstreamError);

    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/v1/embeddings",
      payload: {
        model: "text-embedding-3-small",
        input: "Hello",
      },
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual(upstreamError);

    await server.close();
  });

  it("returns 404 when no provider matches and no default exists", async () => {
    const server = Fastify({ logger: false });
    server.decorate("config", {
      port: 3000,
      host: "0.0.0.0",
      log_level: "silent",
      database_path: "./data/gateway.db",
      encryption_key: "",
      providers: [],
      admin_token: "admin-secret-key",
      default_rpm: 60,
      default_tpm: 100000,
    } satisfies AppConfig);
    server.register(embeddingsPlugin);

    const response = await server.inject({
      method: "POST",
      url: "/v1/embeddings",
      payload: {
        model: "unknown-model",
        input: "Hello",
      },
    });

    expect(response.statusCode).toBe(404);
    const json = response.json();
    expect(json.error.message).toContain("No provider found");

    await server.close();
  });

  it("returns 502 when upstream is unreachable", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/v1/embeddings",
      payload: {
        model: "text-embedding-3-small",
        input: "Hello",
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("upstream_unreachable");

    await server.close();
  });

  it("passes X-Response-Time header through to client", async () => {
    mockFetchResponse(200, { object: "list", data: [], model: "test", usage: {} });

    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/v1/embeddings",
      payload: {
        model: "text-embedding-3-small",
        input: "Hello",
      },
    });

    expect(response.headers["x-response-time"]).toMatch(/^\d+ms$/);

    await server.close();
  });

  it("proxies request with array input", async () => {
    const upstreamBody = {
      object: "list",
      data: [
        { object: "embedding", index: 0, embedding: [0.1, 0.2] },
        { object: "embedding", index: 1, embedding: [0.3, 0.4] },
      ],
      model: "text-embedding-3-small",
      usage: { prompt_tokens: 10, total_tokens: 10 },
    };

    mockFetchResponse(200, upstreamBody);

    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/v1/embeddings",
      payload: {
        model: "text-embedding-3-small",
        input: ["Hello", "World"],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(2);

    await server.close();
  });
});
