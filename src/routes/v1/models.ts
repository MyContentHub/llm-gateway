import type { FastifyPluginCallback } from "fastify";
import "../../types.js";
import type { ProviderConfig } from "../../config/providers.js";
import { ModelsListResponseSchema } from "../../schemas/v1/models.js";
import { error401, error429, error500, virtualKeySecurity } from "../../schemas/common.js";

interface UpstreamModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

interface UpstreamModelsResponse {
  object: string;
  data: UpstreamModel[];
}

async function fetchProviderModels(
  provider: ProviderConfig,
): Promise<UpstreamModel[]> {
  const url = `${provider.baseUrl}/models`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Provider ${provider.name} returned ${response.status}: ${response.statusText}`,
    );
  }

  const body = (await response.json()) as UpstreamModelsResponse;
  return body.data ?? [];
}

const modelsPlugin: FastifyPluginCallback = (server, _opts, done) => {
  server.get("/v1/models", {
    schema: {
      summary: "List models",
      description: "Lists the currently available models from all configured providers.",
      tags: ["V1 - OpenAI Compatible"],
      security: virtualKeySecurity,
      response: {
        200: ModelsListResponseSchema,
        ...error401,
        ...error429,
        ...error500,
      },
    },
  }, async (_request, reply) => {
    const config = server.config;
    const providers = config.providers;

    if (providers.length === 0) {
      return reply.send({
        object: "list",
        data: [],
      });
    }

    const results = await Promise.allSettled(
      providers.map((p) => fetchProviderModels(p)),
    );

    const data: UpstreamModel[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        for (const model of result.value) {
          data.push({
            id: `${providers[i].name}/${model.id}`,
            object: "model",
            created: model.created,
            owned_by: model.owned_by,
          });
        }
      } else {
        server.log.warn(
          { provider: providers[i].name, err: result.reason },
          "Failed to fetch models from provider",
        );
      }
    }

    return reply.send({
      object: "list",
      data,
    });
  });

  done();
};

export { modelsPlugin };
export default modelsPlugin;
