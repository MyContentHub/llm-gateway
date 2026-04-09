import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { chatCompletionsPlugin } from "../../src/routes/v1/chat-completions.js";
import { embeddingsPlugin } from "../../src/routes/v1/embeddings.js";
import { modelsPlugin } from "../../src/routes/v1/models.js";
import type { AppConfig } from "../../src/config/index.js";
import "../../src/types.js";

export const CANNED_CHAT_RESPONSE = {
  id: "chatcmpl-integration-test",
  object: "chat.completion",
  created: 1700000000,
  model: "gpt-4o",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Hello from integration test!" },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

export const SSE_CHUNKS = [
  'data: {"id":"chatcmpl-stream-1","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant","content":""}}]}\n\n',
  'data: {"id":"chatcmpl-stream-1","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}\n\n',
  'data: {"id":"chatcmpl-stream-1","object":"chat.completion.chunk","choices":[{"delta":{"content":" world"}}]}\n\n',
  'data: {"id":"chatcmpl-stream-1","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
  "data: [DONE]\n\n",
];

export const CANNED_MODELS_RESPONSE = {
  object: "list",
  data: [
    { id: "gpt-4o", object: "model", created: 1700000000, owned_by: "openai" },
    { id: "gpt-4o-mini", object: "model", created: 1700000001, owned_by: "openai" },
  ],
};

export const CANNED_EMBEDDINGS_RESPONSE = {
  object: "list",
  data: [
    {
      object: "embedding",
      index: 0,
      embedding: [0.0023, -0.0094, 0.0156],
    },
  ],
  model: "text-embedding-3-small",
  usage: { prompt_tokens: 5, total_tokens: 5 },
};

export function getServerUrl(server: FastifyInstance): string {
  const addr = server.addresses()[0];
  return `http://${addr.address}:${addr.port}`;
}

export async function createMockUpstream(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });

  server.post("/chat/completions", async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    if (body.model === "error-429") {
      return reply.code(429).send({
        error: {
          message: "Rate limit exceeded",
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
        },
      });
    }

    if (body.model === "error-500") {
      return reply.code(500).send({
        error: {
          message: "Internal server error",
          type: "server_error",
          code: "internal_error",
        },
      });
    }

    if (body.stream === true) {
      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      for (const chunk of SSE_CHUNKS) {
        raw.write(chunk);
      }
      raw.end();
      return;
    }

    return reply.code(200).header("Content-Type", "application/json").send({
      ...CANNED_CHAT_RESPONSE,
      model: body.model ?? "gpt-4o",
    });
  });

  server.get("/models", async (_request, reply) => {
    return reply.code(200).header("Content-Type", "application/json").send(CANNED_MODELS_RESPONSE);
  });

  server.post("/embeddings", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    return reply.code(200).header("Content-Type", "application/json").send({
      ...CANNED_EMBEDDINGS_RESPONSE,
      model: body.model ?? "text-embedding-3-small",
    });
  });

  await server.listen({ port: 0, host: "127.0.0.1" });
  return server;
}

export async function createGateway(
  upstreamUrl: string,
  options?: {
    modelMappings?: Record<string, string>;
    extraProviders?: Array<{
      name: string;
      baseUrl: string;
      apiKey: string;
      modelMappings?: Record<string, string>;
      isDefault?: boolean;
    }>;
  },
): Promise<FastifyInstance> {
  const providers = [
    {
      name: "test-provider",
      baseUrl: upstreamUrl,
      apiKey: "sk-test-key",
      modelMappings: options?.modelMappings ?? { "gpt-4o": "gpt-4o", "fast-chat": "gpt-4o-mini" },
      isDefault: true,
    },
    ...(options?.extraProviders ?? []),
  ];

  const config = {
    PORT: 3000,
    HOST: "127.0.0.1",
    LOG_LEVEL: "silent",
    DATABASE_PATH: "./data/gateway.db",
    ENCRYPTION_KEY: "",
    PROVIDERS: providers,
    DEFAULT_RPM: 60,
    DEFAULT_TPM: 100000,
  } satisfies AppConfig;

  const gateway = Fastify({ logger: false });
  gateway.decorate("config", config);
  await gateway.register(chatCompletionsPlugin);
  await gateway.register(embeddingsPlugin);
  await gateway.register(modelsPlugin);
  return gateway;
}
