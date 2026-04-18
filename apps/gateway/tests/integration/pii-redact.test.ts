import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { getServerUrl } from "../helpers/mock-upstream.js";
import { createTestServer } from "../helpers/setup.js";

const REDACT_SECURITY = {
  injection_threshold: 0.5,
  blocked_pii_types: [] as string[],
  flagged_pii_types: ["SSN", "EMAIL", "PHONE"],
};

async function createEchoUpstream() {
  let capturedBody: Record<string, unknown> | null = null;
  const server: FastifyInstance = Fastify({ logger: false });

  server.post("/chat/completions", async (request, reply) => {
    capturedBody = request.body as Record<string, unknown>;
    const body = request.body as Record<string, unknown>;
    const messages = body.messages as Array<{ content?: string }> | undefined;
    const userContent = messages?.map((m) => m.content ?? "").join(" ") ?? "";

    if (body.stream === true) {
      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const escaped = JSON.stringify(userContent);
      raw.write(
        `data: {"id":"chatcmpl-echo","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant","content":""}}]}\n\n`,
      );
      raw.write(
        `data: {"id":"chatcmpl-echo","object":"chat.completion.chunk","choices":[{"delta":{"content":${escaped}}}]}\n\n`,
      );
      raw.write(
        `data: {"id":"chatcmpl-echo","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n`,
      );
      raw.write("data: [DONE]\n\n");
      raw.end();
      return;
    }

    return reply.code(200).header("Content-Type", "application/json").send({
      id: "chatcmpl-echo",
      object: "chat.completion",
      created: 1700000000,
      model: body.model ?? "gpt-4o",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: userContent },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
  });

  server.get("/models", async (_request, reply) => {
    return reply.code(200).header("Content-Type", "application/json").send({
      object: "list",
      data: [
        {
          id: "gpt-4o",
          object: "model",
          created: 1700000000,
          owned_by: "openai",
        },
      ],
    });
  });

  server.post("/embeddings", async (_request, reply) => {
    return reply.code(200).header("Content-Type", "application/json").send({
      object: "list",
      data: [{ object: "embedding", index: 0, embedding: [0.1] }],
      model: "text-embedding-3-small",
      usage: { prompt_tokens: 5, total_tokens: 5 },
    });
  });

  await server.listen({ port: 0, host: "127.0.0.1" });

  return {
    server,
    getCapturedBody: () => capturedBody,
    cleanup: async () => {
      await server.close();
    },
  };
}

describe("PII Redaction/Restoration Integration", () => {
  it("redacts SSN from request and restores in non-streaming response", async () => {
    const echo = await createEchoUpstream();
    const { server, cleanup, createKey } = await createTestServer({
      security: REDACT_SECURITY,
      upstreamUrl: getServerUrl(echo.server),
    });
    try {
      const key = await createKey();
      const ssn = "123-45-6789";
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/chat/completions",
        headers: { authorization: `Bearer ${key}` },
        payload: {
          model: "gpt-4o",
          messages: [{ role: "user", content: `My SSN is ${ssn}` }],
        },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.choices[0].message.content).toContain(ssn);
      const captured = echo.getCapturedBody();
      const upstreamContent = (captured!.messages as Array<{ content: string }>)[0].content;
      expect(upstreamContent).not.toContain(ssn);
      expect(upstreamContent).toMatch(/\[SSN_\d+\]/);
    } finally {
      await cleanup();
      await echo.cleanup();
    }
  });

  it("redacts email from streaming request and restores in SSE chunks", async () => {
    const echo = await createEchoUpstream();
    const { server, cleanup, createKey } = await createTestServer({
      security: REDACT_SECURITY,
      upstreamUrl: getServerUrl(echo.server),
    });
    try {
      const key = await createKey();
      const email = "user@example.com";
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/chat/completions",
        headers: { authorization: `Bearer ${key}` },
        payload: {
          model: "gpt-4o",
          messages: [{ role: "user", content: `Send to ${email}` }],
          stream: true,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("text/event-stream");
      const body = response.body;
      expect(body).toContain(email);
      const captured = echo.getCapturedBody();
      const upstreamContent = (captured!.messages as Array<{ content: string }>)[0].content;
      expect(upstreamContent).not.toContain(email);
      expect(upstreamContent).toMatch(/\[EMAIL_\d+\]/);
    } finally {
      await cleanup();
      await echo.cleanup();
    }
  });

  it("never sends PII to upstream in plaintext", async () => {
    const echo = await createEchoUpstream();
    const { server, cleanup, createKey } = await createTestServer({
      security: REDACT_SECURITY,
      upstreamUrl: getServerUrl(echo.server),
    });
    try {
      const key = await createKey();
      await server.inject({
        method: "POST",
        url: "/api/v1/chat/completions",
        headers: { authorization: `Bearer ${key}` },
        payload: {
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: "SSN: 123-45-6789 and email: test@domain.org",
            },
          ],
        },
      });
      const captured = echo.getCapturedBody();
      const upstreamContent = (captured!.messages as Array<{ content: string }>)[0].content;
      expect(upstreamContent).not.toContain("123-45-6789");
      expect(upstreamContent).not.toContain("test@domain.org");
    } finally {
      await cleanup();
      await echo.cleanup();
    }
  });

  it("handles multiple PII types in same request", async () => {
    const echo = await createEchoUpstream();
    const { server, cleanup, createKey } = await createTestServer({
      security: REDACT_SECURITY,
      upstreamUrl: getServerUrl(echo.server),
    });
    try {
      const key = await createKey();
      const ssn = "123-45-6789";
      const email = "multi@test.com";
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/chat/completions",
        headers: { authorization: `Bearer ${key}` },
        payload: {
          model: "gpt-4o",
          messages: [
            { role: "user", content: `SSN: ${ssn}, email: ${email}` },
          ],
        },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      const content = body.choices[0].message.content;
      expect(content).toContain(ssn);
      expect(content).toContain(email);
      const captured = echo.getCapturedBody();
      const upstreamContent = (captured!.messages as Array<{ content: string }>)[0].content;
      expect(upstreamContent).not.toContain(ssn);
      expect(upstreamContent).not.toContain(email);
      expect(upstreamContent).toMatch(/\[SSN_\d+\]/);
      expect(upstreamContent).toMatch(/\[EMAIL_\d+\]/);
    } finally {
      await cleanup();
      await echo.cleanup();
    }
  });
});
