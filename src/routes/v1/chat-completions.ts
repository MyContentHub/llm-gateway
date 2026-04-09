import type { FastifyPluginCallback } from "fastify";
import "../../types.js";
import { resolveRoute, RouteError } from "../../proxy/router.js";
import { forwardRequest } from "../../proxy/forwarder.js";

interface ChatCompletionRequest {
  model: string;
  messages: unknown[];
  stream?: boolean;
  [key: string]: unknown;
}

const chatCompletionsPlugin: FastifyPluginCallback = (server, _opts, done) => {
  server.post<{
    Body: ChatCompletionRequest;
  }>("/v1/chat/completions", async (request, reply) => {
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

    if (body.stream === true) {
      return reply.code(400).send({
        error: {
          message: "Streaming is not yet supported. Set stream to false or omit it.",
          type: "invalid_request_error",
          code: "streaming_not_supported",
        },
      });
    }

    let route;
    try {
      route = resolveRoute(body.model, config.PROVIDERS);
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

    const upstreamBody = { ...body, model: route.resolvedModel };
    const upstreamUrl = `${route.baseUrl.replace(/\/+$/, "")}/chat/completions`;

    const result = await forwardRequest({
      upstreamUrl,
      apiKey: route.apiKey,
      body: upstreamBody,
    });

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
