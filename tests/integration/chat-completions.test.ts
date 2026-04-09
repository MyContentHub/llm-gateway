import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createMockUpstream, createGateway, getServerUrl, CANNED_CHAT_RESPONSE } from "../helpers/mock-upstream.js";

describe("Chat Completions Integration", () => {
  let upstream: FastifyInstance;
  let gateway: FastifyInstance;

  beforeAll(async () => {
    upstream = await createMockUpstream();
    gateway = await createGateway(getServerUrl(upstream));
  });

  afterAll(async () => {
    await gateway.close();
    await upstream.close();
  });

  it("proxies a non-streaming chat completion request", async () => {
    const response = await gateway.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");

    const body = response.json();
    expect(body.id).toBe("chatcmpl-integration-test");
    expect(body.object).toBe("chat.completion");
    expect(body.choices).toHaveLength(1);
    expect(body.choices[0].message.content).toBe("Hello from integration test!");
    expect(body.choices[0].finish_reason).toBe("stop");
    expect(body.usage.total_tokens).toBe(15);
  });

  it("relays streaming SSE chunks in order with [DONE] termination", async () => {
    const response = await gateway.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/event-stream");
    expect(response.headers["cache-control"]).toBe("no-cache");

    const body = response.body;

    expect(body).toContain('"role":"assistant"');
    expect(body).toContain('"content":"Hello"');
    expect(body).toContain('"content":" world"');
    expect(body).toContain('"finish_reason":"stop"');
    expect(body).toContain("data: [DONE]");

    const helloIdx = body.indexOf('"content":"Hello"');
    const worldIdx = body.indexOf('"content":" world"');
    const stopIdx = body.indexOf('"finish_reason":"stop"');
    const doneIdx = body.indexOf("data: [DONE]");

    expect(helloIdx).toBeGreaterThan(-1);
    expect(worldIdx).toBeGreaterThan(helloIdx);
    expect(stopIdx).toBeGreaterThan(worldIdx);
    expect(doneIdx).toBeGreaterThan(stopIdx);
  });

  it("forwards upstream 429 errors", async () => {
    const response = await gateway.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "error-429",
        messages: [{ role: "user", content: "test" }],
      },
    });

    expect(response.statusCode).toBe(429);
    const body = response.json();
    expect(body.error.type).toBe("rate_limit_error");
    expect(body.error.code).toBe("rate_limit_exceeded");
  });

  it("forwards upstream 500 errors", async () => {
    const response = await gateway.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "error-500",
        messages: [{ role: "user", content: "test" }],
      },
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.error.type).toBe("server_error");
    expect(body.error.code).toBe("internal_error");
  });

  it("resolves model alias and returns successful response", async () => {
    const response = await gateway.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "fast-chat",
        messages: [{ role: "user", content: "Hello" }],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.choices).toHaveLength(1);
  });

  it("returns 400 when model is missing", async () => {
    const response = await gateway.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        messages: [{ role: "user", content: "Hello" }],
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.type).toBe("invalid_request_error");
  });

  it("forwards upstream 429 errors for streaming requests", async () => {
    const response = await gateway.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "error-429",
        messages: [{ role: "user", content: "test" }],
        stream: true,
      },
    });

    expect(response.statusCode).toBe(429);
    const body = response.json();
    expect(body.error.type).toBe("rate_limit_error");
  });
});
