import type { FastifyPluginCallback } from "fastify";
import { Readable } from "node:stream";
import "../../types.js";
import { resolveRoute, RouteError } from "../../proxy/router.js";
import { forwardRequest, forwardStreamRequest } from "../../proxy/forwarder.js";
import { createPiiContext } from "../../security/pii-redact.js";
import { ChatCompletionRequestSchema } from "../../schemas/v1/chat-completions.js";
import { error400, error401, error429, error500, virtualKeySecurity } from "../../schemas/common.js";

interface ChatCompletionRequest {
  model: string;
  messages: unknown[];
  stream?: boolean;
  [key: string]: unknown;
}

function restorePiiDeep(obj: unknown, restore: (text: string) => string): unknown {
  if (typeof obj === "string") return restore(obj);
  if (Array.isArray(obj)) return obj.map((item) => restorePiiDeep(item, restore));
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = restorePiiDeep(value, restore);
    }
    return result;
  }
  return obj;
}

const chatCompletionsPlugin: FastifyPluginCallback = (server, _opts, done) => {
  server.post<{
    Body: ChatCompletionRequest;
  }>("/v1/chat/completions", {
    validatorCompiler: () => () => true,
    schema: {
      summary: "Create chat completion",
      description: "Creates a model response for the given conversation. Supports both streaming and non-streaming responses.",
      tags: ["V1 - OpenAI Compatible"],
      security: virtualKeySecurity,
      body: ChatCompletionRequestSchema,
      response: {
        200: {},
        ...error400,
        ...error401,
        ...error429,
        ...error500,
      },
    },
  }, async (request, reply) => {
    const config = server.config;
    const body = request.body;

    if (!body?.model || typeof body.model !== "string") {
      return reply.code(400).send({
        error: {
          message: "Invalid request: 'model' field is required and must be a string",
          type: "invalid_request_error",
          code: "invalid_model",
        },
      });
    }

    let route;
    try {
      route = resolveRoute(body.model, config.providers);
    } catch (err) {
      if (err instanceof RouteError) {
        return reply.code(err.statusCode).send({
          error: {
            message: err.message,
            type: "route_error",
            code: "no_provider",
          },
        });
      }
      throw err;
    }

    const messages = request.securityScan?.redactedMessages ?? body.messages;
    const upstreamBody = { ...body, model: route.resolvedModel, messages };
    const upstreamUrl = `${route.baseUrl.replace(/\/+$/, "")}/chat/completions`;

    if (body.stream === true) {
      const mapping = request.securityScan?.piiMapping;
      const piiCtx = createPiiContext();

      const sseOptions = mapping && mapping.size > 0
        ? {
            onChunk: (data: string): string => {
              try {
                const parsed = JSON.parse(data);
                if (parsed.choices) {
                  for (const choice of parsed.choices) {
                    if (choice.delta?.content) {
                      choice.delta.content = piiCtx.restore(choice.delta.content, mapping);
                    }
                  }
                }
                return JSON.stringify(parsed);
              } catch {
                return data;
              }
            },
          }
        : undefined;

      const result = await forwardStreamRequest({
        upstreamUrl,
        apiKey: route.apiKey,
        body: upstreamBody,
        sseOptions,
      });

      if (!result.ok) {
        return reply.code(result.status).send(result.body);
      }

      const nodeStream = Readable.fromWeb(result.stream as import("node:stream/web").ReadableStream);

      return reply
        .code(result.status)
        .headers({
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Request-Id": result.headers["X-Request-Id"] ?? "",
        })
        .send(nodeStream);
    }

    const result = await forwardRequest({
      upstreamUrl,
      apiKey: route.apiKey,
      body: upstreamBody,
    });

    const mapping = request.securityScan?.piiMapping;
    if (mapping && mapping.size > 0) {
      const piiCtx = createPiiContext();
      result.body = restorePiiDeep(result.body, (text) => piiCtx.restore(text, mapping));
    }

    const responseHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (result.headers["X-Request-Id"]) {
      responseHeaders["X-Request-Id"] = result.headers["X-Request-Id"];
    }
    if (result.headers["X-Response-Time"]) {
      responseHeaders["X-Response-Time"] = result.headers["X-Response-Time"];
    }

    return reply.code(result.status).headers(responseHeaders).send(result.body);
  });

  done();
};

export default chatCompletionsPlugin;
export { chatCompletionsPlugin };
