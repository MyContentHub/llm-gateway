import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { chatCompletionsPlugin } from "./chat-completions.js";
import type { AppConfig } from "../../config/index.js";
import { DEFAULT_SECURITY_CONFIG } from "../../config/index.js";

const originalFetch = globalThis.fetch;
const encoder = new TextEncoder();

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
        keyStrategy: "round-robin",
        modelMappings: { "gpt-4o": "gpt-4o", "gpt-4o-mini": "gpt-4o-mini" },
        isDefault: true,
      },
      {
        name: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        apiKey: "sk-ant-key",
        keyStrategy: "round-robin",
        modelMappings: { "fast-chat": "claude-3-haiku" },
        isDefault: false,
      },
    ],
    admin_token: "admin-secret-key",
    default_rpm: 60,
    default_tpm: 100000,
    default_rpd: 1000,
    security: DEFAULT_SECURITY_CONFIG,
    retry: { max_retries: 2, initial_delay_ms: 1000, max_delay_ms: 10000, backoff_multiplier: 2 },
  } satisfies AppConfig);
  server.register(chatCompletionsPlugin);
  return server;
}

function mockFetchResponse(status: number, body: unknown, headers?: Record<string, string>) {
  globalThis.fetch = vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: headers ?? { "content-type": "application/json" },
      }),
    ),
  );
}

function mockStreamingFetchResponse(chunks: string[], status = 200) {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(stream, {
      status,
      headers: { "content-type": "text/event-stream" },
    }),
  );
}

describe("POST /v1/chat/completions", () => {
  it("returns 400 when model is missing", async () => {
    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { messages: [{ role: "user", content: "Hi" }] },
    });

    expect(response.statusCode).toBe(400);
    const json = response.json();
    expect(json.error.type).toBe("invalid_request_error");

    await server.close();
  });

  it("proxies a streaming request with SSE", async () => {
    const chunks = [
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant","content":""}}]}\n\n',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];

    mockStreamingFetchResponse(chunks);

    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
        stream: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/event-stream");
    expect(response.headers["cache-control"]).toBe("no-cache");
    expect(response.body).toContain("data: [DONE]");
    expect(response.body).toContain('"content":"Hello"');
    expect(response.body).toContain('"finish_reason":"stop"');

    await server.close();
  });

  it("handles streaming request with upstream error", async () => {
    const upstreamError = {
      error: {
        message: "Rate limited",
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
      },
    };

    mockFetchResponse(429, upstreamError);

    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
        stream: true,
      },
    });

    expect(response.statusCode).toBe(429);
    const json = response.json();
    expect(json.error.type).toBe("rate_limit_error");
    expect(json.error.code).toBe("rate_limit_exceeded");

    await server.close();
  });

  it("returns 502 when upstream is unreachable during streaming", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
        stream: true,
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("upstream_unreachable");

    await server.close();
  });

  it("proxies a successful non-streaming request", async () => {
    const upstreamBody = {
      id: "chatcmpl-abc",
      object: "chat.completion",
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Hello!" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
    };

    mockFetchResponse(200, upstreamBody);

    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(upstreamBody);
    expect(response.headers["content-type"]).toContain("application/json");

    await server.close();
  });

  it("resolves model alias and forwards resolved model name", async () => {
    const upstreamBody = {
      id: "chatcmpl-xyz",
      object: "chat.completion",
      model: "claude-3-haiku",
      choices: [{ index: 0, message: { role: "assistant", content: "Hey" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
    };

    mockFetchResponse(200, upstreamBody);

    const server = createServer();
    await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "fast-chat",
        messages: [{ role: "user", content: "Hey" }],
      },
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/chat/completions",
      expect.objectContaining({
        body: expect.stringContaining('"model":"claude-3-haiku"'),
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
      url: "/v1/chat/completions",
      payload: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
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
      default_rpd: 1000,
      security: DEFAULT_SECURITY_CONFIG,
      retry: { max_retries: 2, initial_delay_ms: 1000, max_delay_ms: 10000, backoff_multiplier: 2 },
    } satisfies AppConfig);
    server.register(chatCompletionsPlugin);

    const response = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "unknown-model",
        messages: [{ role: "user", content: "Hi" }],
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
      url: "/v1/chat/completions",
      payload: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("upstream_unreachable");

    await server.close();
  });

  it("passes X-Response-Time header through to client", async () => {
    mockFetchResponse(200, { id: "test", choices: [] });

    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
      },
    });

    expect(response.headers["x-response-time"]).toMatch(/^\d+ms$/);

    await server.close();
  });

  it("handles stream:false explicitly", async () => {
    mockFetchResponse(200, { id: "test", choices: [] });

    const server = createServer();
    const response = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
        stream: false,
      },
    });

    expect(response.statusCode).toBe(200);

    await server.close();
  });
});
