import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { forwardRequest } from "./forwarder.js";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(response: {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}) {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(typeof response.body === "string" ? response.body : JSON.stringify(response.body), {
      status: response.status,
      headers: response.headers ?? { "content-type": "application/json" },
    }),
  );
}

describe("forwardRequest", () => {
  it("forwards a successful response with identical JSON", async () => {
    const upstreamBody = {
      id: "chatcmpl-abc123",
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

    mockFetch({ status: 200, body: upstreamBody });

    const result = await forwardRequest({
      upstreamUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: "sk-test",
      body: { model: "gpt-4o", messages: [{ role: "user", content: "Hi" }] },
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual(upstreamBody);
    expect(result.headers["Content-Type"]).toBe("application/json");
  });

  it("sends correct headers to upstream", async () => {
    mockFetch({ status: 200, body: {} });

    await forwardRequest({
      upstreamUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: "sk-test-key",
      body: { model: "gpt-4o", messages: [] },
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-test-key",
        },
      }),
    );
  });

  it("forwards upstream error with OpenAI error format when upstream returns 4xx", async () => {
    const upstreamError = {
      error: {
        message: "You exceeded your current quota",
        type: "insufficient_quota",
        code: "rate_limit_exceeded",
      },
    };

    mockFetch({ status: 429, body: upstreamError });

    const result = await forwardRequest({
      upstreamUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: "sk-test",
      body: { model: "gpt-4o", messages: [] },
    });

    expect(result.status).toBe(429);
    expect(result.body).toEqual(upstreamError);
  });

  it("wraps non-standard upstream error in OpenAI error format", async () => {
    mockFetch({ status: 500, body: "Internal Server Error" });

    const result = await forwardRequest({
      upstreamUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: "sk-test",
      body: { model: "gpt-4o", messages: [] },
    });

    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      error: {
        message: "Internal Server Error",
        type: "upstream_error",
        code: "upstream_500",
      },
    });
  });

  it("returns 502 when upstream is unreachable", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await forwardRequest({
      upstreamUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: "sk-test",
      body: { model: "gpt-4o", messages: [] },
    });

    expect(result.status).toBe(502);
    expect(result.body).toEqual({
      error: {
        message: "ECONNREFUSED",
        type: "upstream_connection_error",
        code: "upstream_unreachable",
      },
    });
  });

  it("includes X-Response-Time header on success", async () => {
    mockFetch({ status: 200, body: {} });

    const result = await forwardRequest({
      upstreamUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: "sk-test",
      body: { model: "gpt-4o", messages: [] },
    });

    expect(result.headers["X-Response-Time"]).toMatch(/^\d+ms$/);
  });

  it("passes through x-request-id from upstream", async () => {
    mockFetch({
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-xyz-789",
      },
      body: {},
    });

    const result = await forwardRequest({
      upstreamUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: "sk-test",
      body: { model: "gpt-4o", messages: [] },
    });

    expect(result.headers["X-Request-Id"]).toBe("req-xyz-789");
  });

  it("does not include X-Response-Time on error responses", async () => {
    mockFetch({ status: 400, body: { error: { message: "bad" } } });

    const result = await forwardRequest({
      upstreamUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: "sk-test",
      body: { model: "gpt-4o", messages: [] },
    });

    expect(result.headers["X-Response-Time"]).toBeUndefined();
  });
});
